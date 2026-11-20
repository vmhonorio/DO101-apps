// Motor de análise determinístico: cada avanço, ponto de atenção e risco só é emitido quando há evidência
// numérica nos dados. Nada aqui é inventado; a IA (opcional) apenas reescreve a leitura a partir destes fatos.
import type { Enriched, Insight, Level, RowMetrics } from './types';
import type { ReportModel } from './metrics';
import { inList, lc } from './config';
import { fmtDate, fmtInt, fmtNum, fmtPct, plural } from './format';
import { isStale, macroLabel, UNLINKED } from './metrics';

export interface Insights {
  advances: Insight[];
  attention: Insight[];
  risks: Insight[];
  reading: string;
}

const LEVEL_W: Record<Level, number> = { 'CRÍTICO': 300, ALTO: 200, POTENCIAL: 100 };
const short = (s: string, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const open = (c: Enriched) => c.category !== 'done';

function topBy<T>(list: T[], key: (t: T) => string | undefined): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of list) {
    const k = key(x);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function buildInsights(m: ReportModel): Insights {
  const { cfg, kpi, period: p, comparison: cmp, rows, cards } = m;
  const advances: Insight[] = [];
  const attention: Insight[] = [];
  const risks: Insight[] = [];
  const linked = rows.filter((r) => r.situation !== 'unlinked');
  const openCards = cards.filter(open);
  const sprintName = p.sprint?.name ?? 'no período';

  // ---------------------------------------------------------------- AVANÇOS
  if (p.doneInPeriod !== null && p.doneInPeriod > 0) {
    const bugs = p.doneInPeriodBugs ?? 0;
    let t = `${p.doneInPeriod} ${plural(p.doneInPeriod, 'card concluído', 'cards concluídos')} ${p.sprint ? 'na ' + p.sprint.name : 'desde ' + (cmp?.label ?? 'o snapshot anterior')} (${p.doneInPeriod - bugs} PBIs e ${bugs} bugs)`;
    if (cmp) t += `; acumulado passou de ${cmp.done} para ${kpi.done}`;
    advances.push({ text: t + '.', weight: 100, evidence: p.doneInPeriodSource });
  } else if (cmp && kpi.done > cmp.done) {
    advances.push({ text: `Concluídos passaram de ${cmp.done} para ${kpi.done} desde ${cmp.label}.`, weight: 90 });
  }
  if (p.doneInPeriod !== null && p.doneInPrevPeriod !== null && p.doneInPeriod > p.doneInPrevPeriod) {
    advances.push({ text: `Vazão de entregas cresceu: ${p.doneInPeriod} concluídos x ${p.doneInPrevPeriod} na ${p.prevSprint?.name}.`, weight: 85 });
  }
  if (p.movedToHomolog && p.movedToHomolog.length) {
    const tot = p.movedToHomolog.reduce((s, x) => s + x.count, 0);
    const det = p.movedToHomolog.slice(0, 3).map((x) => `${x.count} ${x.state}`).join(', ');
    advances.push({ text: `${tot} ${plural(tot, 'card avançou', 'cards avançaram')} para homologação/implantação: ${det}.`, weight: 80 });
  }
  if (kpi.bugs > 0 && kpi.bugsDone > 0) {
    advances.push({
      text: `Bugs: ${kpi.bugsDone} de ${kpi.bugs} concluídos (${fmtPct((kpi.bugsDone / kpi.bugs) * 100)}); restam ${kpi.bugsOpen} abertos${kpi.bugsBlocked ? `, sendo ${kpi.bugsBlocked} bloqueados` : ''}.`,
      weight: 70,
    });
  }
  const doneRows = linked.filter((r) => r.situation === 'done');
  if (doneRows.length) {
    advances.push({
      text: `${doneRows.length} ${plural(doneRows.length, 'épico 100% concluído', 'épicos 100% concluídos')}: ${doneRows.slice(0, 3).map((r) => `${short(r.title, 30)} (${r.done}/${r.total})`).join('; ')}${doneRows.length > 3 ? '…' : ''}.`,
      weight: 60,
    });
  }
  const mature = linked
    .filter((r) => r.situation !== 'done' && r.pctDone >= cfg.insight.highMaturityPct && r.total >= 3)
    .sort((a, b) => b.pctDone - a.pctDone)
    .slice(0, 3);
  if (mature.length) advances.push({ text: `Alta maturidade: ${mature.map((r) => `${short(r.title, 28)} ${fmtPct(r.pctDone)}`).join(' · ')}.`, weight: 50 });
  if (p.sprint && p.doneInPeriod) {
    const done = cards.filter((c) => c.category === 'done' && c.closedDate && c.closedDate >= p.sprint!.start && c.closedDate.slice(0, 10) <= p.sprint!.end);
    const team = topBy(done, (c) => (c.frente === UNLINKED ? undefined : c.frente))[0];
    if (team && team.count >= 3) advances.push({ text: `Frente com mais entregas na ${sprintName}: ${team.key} (${team.count} cards).`, weight: 40 });
  }

  // ---------------------------------------------------------------- PONTOS DE ATENÇÃO
  const homolog = openCards.filter((c) => c.macro === 'homologacao');
  if (homolog.length && (homolog.length / Math.max(1, openCards.length)) * 100 >= cfg.insight.homologAccumulationPct) {
    const staleH = homolog.filter((c) => isStale(c, cfg)).length;
    const top = topBy(homolog, (c) => (c.rowKey === UNLINKED ? undefined : m.h.byId.get(Number(c.rowKey))?.title)).slice(0, 3);
    attention.push({
      text: `Represamento em homologação: ${homolog.length} cards abertos (${fmtPct((homolog.length / openCards.length) * 100)} do aberto)${staleH ? `, ${staleH} há >${cfg.staleDays} dias` : ''}${top.length ? ` (${top.map((t) => `${short(t.key, 18)}: ${t.count}`).join(' · ')})` : ''}.`,
      impact: 'Entregas prontas não chegam à produção.',
      weight: 100,
    });
  }
  if (kpi.stale !== null && kpi.stale > 0) {
    const longDev = openCards.filter((c) => c.macro === 'desenvolvimento' && c.category === 'inProgress' && (c.idleDays ?? 0) > cfg.longDevDays).length;
    attention.push({
      text: `Cards parados: ${kpi.stale} abertos sem mudança de estado há >${cfg.staleDays} dias${longDev ? `; ${longDev} em desenvolvimento há >${cfg.longDevDays} dias` : ''}.`,
      impact: 'Indica fila oculta ou trabalho abandonado.',
      weight: 90,
    });
  }
  if (p.createdInPeriod !== null && p.doneInPeriod !== null && p.createdInPeriod > p.doneInPeriod) {
    const prev = p.createdInPrevPeriod !== null && p.doneInPrevPeriod !== null ? ` (${p.prevSprint?.name}: ${p.createdInPrevPeriod} x ${p.doneInPrevPeriod})` : '';
    attention.push({
      text: `Escopo cresce mais que a entrega: ${p.createdInPeriod} cards criados x ${p.doneInPeriod} concluídos ${p.sprint ? 'na ' + p.sprint.name : 'no período'}${prev}.`,
      impact: 'Percentual de conclusão tende a cair.',
      weight: 85,
    });
  }
  const imp = kpi.blocked + kpi.blockedTagOpen;
  if (imp > 0) {
    const fr = topBy(openCards.filter((c) => c.category === 'blocked' || c.blockedTag), (c) => c.frente)[0];
    attention.push({
      text: `Impedimentos: ${kpi.blocked} em estado de bloqueio e ${kpi.blockedTagOpen} abertos com tag de bloqueio${fr && fr.count > 1 ? `; maior concentração em ${fr.key} (${fr.count})` : ''}.`,
      impact: 'Trabalho parado aguardando terceiros/decisão.',
      weight: 80,
    });
  }
  // acúmulo em etapa (fora backlog e homologação, já tratados)
  const byMacro = topBy(openCards.filter((c) => !['backlog', 'homologacao', 'bloqueado'].includes(c.macro)), (c) => c.macro)[0];
  if (byMacro && openCards.length && (byMacro.count / openCards.length) * 100 >= cfg.insight.homologAccumulationPct) {
    attention.push({ text: `Acúmulo em ${macroLabel(cfg, byMacro.key)}: ${byMacro.count} cards (${fmtPct((byMacro.count / openCards.length) * 100)} do aberto).`, weight: 70 });
  }
  if (openCards.length >= cfg.insight.concentrationMinItems && m.snapshot.availableFields.includes('assignedTo')) {
    const top = topBy(openCards, (c) => c.assignedTo)[0];
    if (top && top.count >= cfg.insight.concentrationMinItems && (top.count / openCards.length) * 100 >= cfg.insight.concentrationPct)
      attention.push({ text: `Concentração: ${top.count} cards abertos (${fmtPct((top.count / openCards.length) * 100)}) atribuídos a ${top.key}.`, impact: 'Gargalo e risco de dependência de uma pessoa.', weight: 60 });
  }
  const unassigned = m.snapshot.availableFields.includes('assignedTo') ? openCards.filter((c) => !c.assignedTo && c.category === 'inProgress').length : 0;
  if (unassigned > 0) attention.push({ text: `${unassigned} cards em execução sem responsável atribuído.`, weight: 30 });

  // ---------------------------------------------------------------- RISCOS
  const goal = cfg.goalDate;
  if (goal) {
    const openN = openCards.length;
    if (new Date(goal).getTime() < m.refDate.getTime() && openN > 0) {
      risks.push({ level: 'CRÍTICO', text: `Meta ${fmtDate(goal)} vencida com ${openN} cards abertos.`, evidence: `${openN} abertos`, impact: 'Prazo comprometido.', action: 'Repactuar escopo e nova data com patrocinador.', weight: 0 });
    } else if (p.projectionRatio !== null && p.projectionRatio > 1) {
      const lvl: Level = p.projectionRatio >= 2 ? 'CRÍTICO' : p.projectionRatio >= cfg.health.criticalProjectionRatio ? 'ALTO' : 'POTENCIAL';
      risks.push({
        level: lvl,
        text: `Meta ${fmtDate(goal)}: ${openN} cards abertos x ritmo de ${fmtNum(p.throughput)} concluídos/sprint (${p.throughputSource}).`,
        evidence: `${fmtNum(p.sprintsNeeded)} sprints necessárias x ${fmtNum(p.sprintsToGoal)} disponíveis`,
        impact: 'Não cumprimento da meta.',
        action: 'Priorizar escopo mínimo.',
        weight: 0,
      });
    }
  }
  const homologAll = openCards.filter((c) => c.macro === 'homologacao' || c.macro === 'implantacao');
  if (homologAll.length && (homologAll.length / Math.max(1, openCards.length)) * 100 >= cfg.insight.homologAccumulationPct) {
    const staleH = homologAll.filter((c) => isStale(c, cfg)).length;
    const lvl: Level = staleH / homologAll.length >= 0.5 ? 'ALTO' : 'POTENCIAL';
    risks.push({ level: lvl, text: `${homologAll.length} cards em homologação/implantação podem adiar a ida à produção.`, evidence: `${staleH} parados >${cfg.staleDays}d`, impact: 'Atraso no go-live.', action: 'Mutirão de homologação com PO.', weight: 0 });
  }
  const critBugs = openCards.filter((c) => c.isBug && (inList(cfg.criticalBugSeverities, c.severity) || c.priority === 1));
  if (critBugs.length) {
    risks.push({ level: critBugs.length >= 5 ? 'CRÍTICO' : 'ALTO', text: `${critBugs.length} ${plural(critBugs.length, 'bug crítico/prioridade 1 pendente', 'bugs críticos/prioridade 1 pendentes')}.`, evidence: critBugs.slice(0, 4).map((c) => '#' + c.id).join(', '), impact: 'Qualidade da entrega e retrabalho.', action: 'Força-tarefa de correção antes de novas entregas.', weight: 0 });
  }
  if (kpi.blocked > 0) {
    const lvl: Level = (kpi.blockedPct ?? 0) >= cfg.health.criticalBlockedPct ? 'CRÍTICO' : (kpi.blockedPct ?? 0) >= cfg.health.criticalBlockedPct / 2 ? 'ALTO' : 'POTENCIAL';
    const rowsB = linked.filter((r) => r.blocked > 0).sort((a, b) => b.blocked - a.blocked).slice(0, 2);
    risks.push({ level: lvl, text: `${kpi.blocked} cards bloqueados (${fmtPct(kpi.blockedPct)})${rowsB.length ? `, principalmente em ${rowsB.map((r) => short(r.title, 26)).join(' e ')}` : ''}.`, impact: 'Interrupção do fluxo.', action: 'Escalar impedimentos no comitê.', weight: 0 });
  }
  const depTags = cfg.dependencyTags.map(lc);
  const deps = openCards.filter((c) => c.tags.some((t) => depTags.includes(lc(t))));
  if (deps.length) {
    const fr = topBy(deps, (c) => c.frente)[0];
    risks.push({ level: deps.length >= 5 ? 'ALTO' : 'POTENCIAL', text: `Dependências externas: ${deps.length} cards abertos marcados com tag de dependência${fr ? ` (${fr.key}: ${fr.count})` : ''}.`, impact: 'Prazo sujeito a terceiros.', action: 'Escalar com fornecedores.', weight: 0 });
  }
  const goalSoon = (r: RowMetrics) => {
    const t = r.targetDate ?? goal;
    if (!t) return false;
    const days = (new Date(t).getTime() - m.refDate.getTime()) / 86400000;
    return days <= 30;
  };
  const low = linked.filter((r) => r.situation !== 'done' && r.total >= 3 && r.pctDone < cfg.insight.lowEvolutionPct && goalSoon(r));
  if (low.length) {
    risks.push({ level: low.length >= 3 ? 'ALTO' : 'POTENCIAL', text: `${low.length} ${plural(low.length, 'épico', 'épicos')} com <${cfg.insight.lowEvolutionPct}% de conclusão a ≤30 dias da data-alvo: ${low.slice(0, 3).map((r) => `${short(r.title, 24)} (${fmtPct(r.pctDone)})`).join('; ')}.`, impact: 'Entregas críticas em risco.', action: 'Plano dedicado e revisão de escopo.', weight: 0 });
  }

  for (const r of risks) r.weight = LEVEL_W[r.level!];
  const sort = (l: Insight[]) => l.sort((a, b) => b.weight - a.weight).slice(0, cfg.insight.maxPerPanel);

  return { advances: sort(advances), attention: sort(attention), risks: sort(risks), reading: buildReading(m, attention, risks) };
}

function buildReading(m: ReportModel, attention: Insight[], risks: Insight[]): string {
  const { kpi, rowSummary: s, cfg } = m;
  if (!kpi.total) return 'Sem cards no recorte selecionado.';
  const parts: string[] = [];
  parts.push(`${fmtPct(kpi.donePct)} dos ${fmtInt(kpi.total)} cards concluídos; ${kpi.inProgress} em andamento, ${kpi.waiting} aguardando etapa e ${kpi.blocked} bloqueados.`);
  if (s.total) {
    const goal = cfg.goalDate ? `Para a meta ${fmtDate(cfg.goalDate)}, ` : '';
    const w = cfg.rowLevel === 'epic' ? ['épico', 'épicos'] : ['feature', 'features'];
    parts.push(`${goal}${s.onTrack} ${plural(s.onTrack, w[0], w[1])} no prazo, ${s.attention} em atenção, ${s.critical} ${plural(s.critical, 'crítico', 'críticos')} e ${s.done} ${plural(s.done, 'concluído', 'concluídos')}.`);
  }
  const topAtt = attention.sort((a, b) => b.weight - a.weight)[0];
  if (topAtt) parts.push(`Maior atenção: ${topAtt.text.split(':')[0].toLowerCase()}.`);
  const topRisk = risks.sort((a, b) => b.weight - a.weight)[0];
  const focus: string[] = [];
  if (kpi.blocked + kpi.blockedTagOpen > 0) focus.push('destravar impedimentos');
  if (attention.some((a) => a.text.startsWith('Represamento'))) focus.push('acelerar homologações');
  if (topRisk && /Meta/.test(topRisk.text)) focus.push('priorizar o escopo da meta');
  if (!focus.length && kpi.stale) focus.push('reativar cards parados');
  if (focus.length) parts.push(`Próximo foco: ${focus.join(', ')}${m.period.sprint ? '' : ''}.`);
  return parts.join(' ');
}
