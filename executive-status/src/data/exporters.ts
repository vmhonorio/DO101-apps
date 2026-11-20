import type { Insights } from '../domain/insights';
import { macroLabel, type ReportModel } from '../domain/metrics';
import { CATEGORY_LABEL, type Enriched, type ProjectConfig, type WorkItem } from '../domain/types';
import { fmtDate } from '../domain/format';
import { downloadWorkbook } from './excel';

export function itemRows(items: Enriched[], cfg: ProjectConfig, byId: Map<number, WorkItem>) {
  return items.map((i) => ({
    ID: i.id, Tipo: i.type, Título: i.title, Estado: i.state, Macroetapa: macroLabel(cfg, i.macro), Categoria: CATEGORY_LABEL[i.category],
    Frente: i.frente, Épico: i.epicId ? byId.get(i.epicId)?.title ?? i.epicId : '', Feature: i.featureId ? byId.get(i.featureId)?.title ?? i.featureId : '',
    Pai: i.parentId ?? '', 'Origem do vínculo': i.parentSource ?? '', Responsável: i.assignedTo ?? '', 'Area Path': i.areaPath ?? '', 'Iteration Path': i.iterationPath ?? '',
    Prioridade: i.priority ?? '', Tags: i.tags.join('; '), 'Tag de bloqueio': i.blockedTag ? 'Sim' : '', 'Dias sem mudança': i.idleDays ?? '',
    Criado: fmtDate(i.createdDate), Alterado: fmtDate(i.changedDate), Fechado: fmtDate(i.closedDate),
  }));
}

export function exportConsolidated(m: ReportModel, ins: Insights, reading: string) {
  const k = m.kpi;
  const kv = (Indicador: string, Valor: unknown, Regra: string) => ({ Indicador, Valor: Valor ?? 'N/D', Regra });
  downloadWorkbook(
    [
      {
        name: 'Indicadores',
        rows: [
          kv('Projeto', m.cfg.project, ''), kv('Período', m.snapshot.label, ''), kv('Consolidação', fmtDate(m.snapshot.referenceDate, true), ''),
          kv('Saúde geral', m.health.value, m.health.reasons.join('; ')),
          kv('Features monitoradas', k.features, 'Features da exportação com ao menos 1 card no recorte'), kv('Épicos', k.epics, ''), kv('Cards sem vínculo', k.unlinked, 'Sem Épico/Feature ancestral presente na exportação'),
          kv('Total de cards', k.total, 'Registros únicos dos tipos de card, exceto estados excluídos'), kv('PBIs', k.pbis, ''), kv('Bugs', k.bugs, ''),
          kv('Concluídos', k.done, 'Estados de categoria "Concluído"'), kv('% concluído', k.donePct, 'Concluídos / Total × 100'),
          kv('Em andamento', k.inProgress, 'Categoria "Em andamento"'), kv('Aguardando etapa', k.waiting, 'Categoria "Aguardando etapa"'),
          kv('Bloqueados', k.blocked, 'Categoria "Bloqueado" (estado)'), kv('Abertos com tag de bloqueio', k.blockedTagOpen, 'Não somado aos bloqueados'),
          kv('Parados', k.stale, `Sem mudança de estado há > ${m.cfg.staleDays} dias`), kv('Concluídos no período', m.period.doneInPeriod, m.period.doneInPeriodSource),
          kv('Criados no período', m.period.createdInPeriod, m.period.createdSource), kv('Vazão por sprint', m.period.throughput, m.period.throughputSource),
          kv('Leitura executiva', reading, ''),
        ],
      },
      { name: 'Status', rows: m.states.map((s) => ({ Estado: s.state, Macroetapa: macroLabel(m.cfg, s.macro), Categoria: CATEGORY_LABEL[s.category], Cards: s.count, '%': +s.pct.toFixed(2) })) },
      {
        name: 'Por Épico',
        rows: m.groups.flatMap((g) => g.rows.map((r) => ({
          Frente: g.frente, ID: r.id ?? '', 'Épico/Feature': r.title, Total: r.total, PBIs: r.pbis, Bugs: r.bugs, 'Bugs abertos': r.bugsOpen, Concluídos: r.done,
          '% concl.': +r.pctDone.toFixed(2), Bloqueados: r.blocked, 'Tag bloqueio': r.blockedTag, Parados: r.stale, Situação: r.situation, Motivo: r.reasons.join('; '),
          ...Object.fromEntries(r.byMacro.map((x) => [macroLabel(m.cfg, x.macro), x.count])),
        }))),
      },
      { name: 'Cards', rows: itemRows(m.cards, m.cfg, m.h.byId) },
      {
        name: 'Análise',
        rows: [
          ...ins.advances.map((i) => ({ Quadro: 'Avanço', Nível: '', Texto: i.text, Evidência: i.evidence ?? '', Impacto: '', Ação: '' })),
          ...ins.attention.map((i) => ({ Quadro: 'Atenção', Nível: '', Texto: i.text, Evidência: i.evidence ?? '', Impacto: i.impact ?? '', Ação: '' })),
          ...ins.risks.map((i) => ({ Quadro: 'Risco', Nível: i.level ?? '', Texto: i.text, Evidência: i.evidence ?? '', Impacto: i.impact ?? '', Ação: i.action ?? '' })),
        ],
      },
    ],
    `status-executivo-${m.cfg.project}-${m.snapshot.label}.xlsx`.replace(/[^\w.-]+/g, '_'),
  );
}
