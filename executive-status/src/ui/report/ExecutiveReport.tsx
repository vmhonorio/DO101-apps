import { AlertTriangle, CheckSquare, ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Insights } from '../../domain/insights';
import { macroColor, macroLabel, UNLINKED, type ReportModel } from '../../domain/metrics';
import type { Enriched, GroupMetrics, Health, Insight, MacroCount, RowMetrics, Situation } from '../../domain/types';
import { fmtDate, fmtInt, fmtPct, fmtShortDate, fmtSigned, ND } from '../../domain/format';
import { cn } from '../cn';

export interface DrillSpec {
  title: string;
  subtitle?: string;
  items: Enriched[];
}
export type SortMode = 'alpha' | 'priority' | 'pct' | 'situation';

export interface ReportProps {
  m: ReportModel;
  ins: Insights;
  reading: { text: string; ai?: string };
  sort: SortMode;
  collapsed: Set<string>;
  highlightCritical: boolean;
  onToggleGroup: (frente: string) => void;
  onDrill: (d: DrillSpec) => void;
}

export const REPORT_WIDTH = 1920;

const HEALTH: Record<Health, { label: string; cls: string }> = {
  onTrack: { label: 'NO PRAZO', cls: 'bg-green-500 text-white' },
  attention: { label: 'ATENÇÃO', cls: 'bg-amber-400 text-navy-900' },
  critical: { label: 'CRÍTICO', cls: 'bg-red-600 text-white' },
  nd: { label: 'N/D', cls: 'bg-slate-400 text-white' },
};

export const SITUATION: Record<Situation, { label: string; cls: string }> = {
  done: { label: 'Concluído', cls: 'bg-slate-700 text-white' },
  onTrack: { label: 'No prazo', cls: 'bg-green-600 text-white' },
  attention: { label: 'Atenção', cls: 'bg-amber-400 text-navy-900' },
  critical: { label: 'Crítico', cls: 'bg-red-600 text-white' },
  unlinked: { label: 'Sem épico', cls: 'bg-slate-400 text-white' },
};

// ------------------------------------------------------------------------------------------------ header

function Header({ m }: { m: ReportModel }) {
  const s = m.snapshot;
  const p = m.period;
  const h = HEALTH[m.health.value];
  const range = (sp?: { name: string; start: string; end: string }) => (sp ? `${sp.name} (${fmtShortDate(sp.start)} a ${fmtDate(sp.end)})` : null);
  const periodo = range(p.sprint) ?? s.label;
  const comp = range(p.prevSprint) ?? m.comparison?.label;
  return (
    <header className="relative flex items-stretch justify-between bg-navy-900 px-11 pb-4 pt-4 text-white">
      <div className="min-w-0">
        <div className="flex items-baseline gap-4">
          <h1 className="text-[44px] font-bold leading-none tracking-tight">STATUS EXECUTIVO</h1>
          <span className="text-[32px] font-semibold leading-none text-sky-300">| {m.cfg.project}</span>
        </div>
        <p className="mt-2 text-[16px] text-slate-200">
          Consolidado de {m.kpi.pbis > 0 ? 'PBIs' : ''}{m.kpi.pbis > 0 && m.kpi.bugs > 0 ? ' e ' : ''}{m.kpi.bugs > 0 ? 'Bugs' : ''} da query exportada do Azure DevOps (“{s.fileName}”), agrupados por {m.cfg.rowLevel === 'epic' ? 'Épico' : 'Feature'}.
        </p>
        <p className="mt-0.5 text-[15px] text-slate-400">
          Período: {periodo}
          {comp ? ` · comparação: ${comp}` : ''} · Dados consultados em {fmtDate(s.referenceDate, true)}
        </p>
      </div>
      <div className="ml-6 flex shrink-0 flex-col justify-center rounded-lg border border-white/15 bg-white/5 px-5 py-2.5">
        <div className="text-[13px] font-bold uppercase tracking-wide text-slate-200">Saúde geral do projeto</div>
        <div className="mt-1.5 flex items-center gap-3">
          <span className={cn('inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-[19px] font-bold', h.cls)}>
            <span className="h-3 w-3 rounded-full bg-current opacity-70" />
            {h.label}
          </span>
          <span className="max-w-[260px] text-[12px] leading-tight text-slate-300">Regras: {m.health.reasons.join('; ')}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-400" />
    </header>
  );
}

// ------------------------------------------------------------------------------------------------ KPI cards

function Kpi({ label, color, value, pct, pctColor, sub, onClick }: {
  label: string; color: string; value: string; pct?: string; pctColor?: string; sub: ReactNode; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex min-w-0 flex-1 flex-col rounded-md border border-slate-200 bg-white px-5 pb-2 pt-2.5 text-left shadow-sm hover:shadow-md" style={{ borderLeft: `6px solid ${color}` }}>
      <span className="text-[16px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-2.5">
        <span className="tabular text-[48px] font-semibold leading-none" style={{ color: pctColor && color !== '#334155' ? color : '#0f172a' }}>{value}</span>
        {pct && <span className="tabular text-[24px] font-semibold" style={{ color: pctColor ?? '#0f172a' }}>{pct}</span>}
      </span>
      <span className="mt-1 truncate text-[13.5px] text-slate-500">{sub}</span>
    </button>
  );
}

const abbr = (s?: string) => (s ?? '').replace(/^sprint\s*/i, 'S');

function macroList(m: ReportModel, list: MacroCount[], n = 2) {
  if (!list.length) return '—';
  return list.slice(0, n).map((x) => `${x.count} em ${macroLabel(m.cfg, x.macro)}`).join(' · ');
}

function KpiRow({ m, onDrill }: { m: ReportModel; onDrill: (d: DrillSpec) => void }) {
  const k = m.kpi;
  const c = m.comparison;
  const p = m.period;
  const cards = m.cards;
  const cat = (c: string) => cards.filter((x) => x.category === c);
  const doneDelta = p.doneInPeriod !== null ? `▲ +${p.doneInPeriod} ${p.sprint ? 'na ' + abbr(p.sprint.name) : 'no período'}${p.doneInPrevPeriod !== null ? ` (${abbr(p.prevSprint?.name)}: +${p.doneInPrevPeriod})` : ''}` : 'Δ período: N/D';
  return (
    <div className="flex gap-4 px-11 pt-3">
      <Kpi label="Features monitoradas" color="#1d3a75" value={fmtInt(k.features)}
        sub={k.epics === null ? 'Hierarquia não disponível na exportação' : `em ${k.epics} épicos · ${k.unlinked} cards sem vínculo`}
        onClick={() => onDrill({ title: 'Cards sem vínculo com Épico/Feature', items: cards.filter((x) => x.rowKey === UNLINKED) })} />
      <Kpi label="Total de cards" color="#1d3a75" value={fmtInt(k.total)}
        sub={<>{k.pbis} PBIs · {k.bugs} Bugs{c ? <> | {k.total >= c.total ? '▲' : '▼'} {fmtSigned(k.total - c.total)} vs. {abbr(c.label)} ({c.total})</> : ' | comparação: N/D'}</>}
        onClick={() => onDrill({ title: 'Todos os cards', items: cards })} />
      <Kpi label="Concluídos" color="#334155" value={fmtInt(k.done)} pct={fmtPct(k.donePct)} pctColor="#334155"
        sub={<>{doneDelta}{c ? ` · ${fmtPct(c.pctDone)} → ${fmtPct(k.donePct)}` : ''}</>}
        onClick={() => onDrill({ title: 'Cards concluídos', items: cat('done') })} />
      <Kpi label="Em andamento" color="#16a34a" value={fmtInt(k.inProgress)} pct={fmtPct(k.inProgressPct)} pctColor="#16a34a"
        sub={macroList(m, k.inProgressByMacro)} onClick={() => onDrill({ title: 'Cards em andamento', items: cat('inProgress') })} />
      <Kpi label="Aguardando etapa" color="#2563eb" value={fmtInt(k.waiting)} pct={fmtPct(k.waitingPct)} pctColor="#2563eb"
        sub={macroList(m, k.waitingByMacro)} onClick={() => onDrill({ title: 'Cards aguardando etapa', items: cat('waiting') })} />
      <Kpi label="Bloqueados" color="#dc2626" value={fmtInt(k.blocked)} pct={fmtPct(k.blockedPct)} pctColor="#dc2626"
        sub={`+${k.blockedTagOpen} abertos com tag de bloqueio (à parte)`}
        onClick={() => onDrill({ title: 'Bloqueados (estado) + abertos com tag de bloqueio', items: cards.filter((x) => x.category === 'blocked' || (x.blockedTag && x.category !== 'done')) })} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ distribuição por status

function StatusSection({ m, onDrill }: { m: ReportModel; onDrill: (d: DrillSpec) => void }) {
  const total = m.kpi.total || 1;
  const autos = m.states.filter((s) => m.cfg.stateRules[s.state]?.auto);
  return (
    <section className="px-11 pt-3">
      <div className="flex items-center justify-between">
        <h2 className="shrink-0 whitespace-nowrap text-[19px] font-bold text-navy-900">DISTRIBUIÇÃO POR STATUS <span className="font-semibold">(estados reais do Azure DevOps)</span></h2>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 pl-6 text-[13.5px] text-slate-700">
          {m.macroTotals.map((x) => (
            <button key={x.macro} className="flex items-center gap-1.5 hover:underline" onClick={() => onDrill({ title: `Macroetapa: ${macroLabel(m.cfg, x.macro)}`, items: m.cards.filter((c) => c.macro === x.macro) })}>
              <span className="h-3.5 w-3.5 rounded-sm" style={{ background: macroColor(m.cfg, x.macro) }} />
              {macroLabel(m.cfg, x.macro)} {x.count} ({fmtPct((x.count / total) * 100)})
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex h-[30px] w-full overflow-hidden rounded-sm bg-slate-100">
        {m.states.map((s) => {
          const w = (s.count / total) * 100;
          const wpx = (w / 100) * (REPORT_WIDTH - 88);
          return (
            <button key={s.state} title={`${s.state}: ${s.count} (${fmtPct(s.pct)}) · ${macroLabel(m.cfg, s.macro)}`}
              onClick={() => onDrill({ title: `Estado: ${s.state}`, subtitle: `${s.count} cards · ${fmtPct(s.pct)}`, items: m.cards.filter((c) => c.state === s.state) })}
              className="flex h-full items-center justify-center overflow-hidden whitespace-nowrap border-r border-white text-[13.5px] font-semibold text-white hover:brightness-110"
              style={{ width: `${w}%`, background: macroColor(m.cfg, s.macro), color: s.macro === 'qualidade' ? '#0f172a' : '#fff' }}>
              {wpx > 150 ? `${s.state} ${s.count}` : wpx > 22 ? s.count : ''}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-slate-700">
        {m.states.map((s) => (
          <button key={s.state} className="flex items-center gap-1 hover:underline" onClick={() => onDrill({ title: `Estado: ${s.state}`, items: m.cards.filter((c) => c.state === s.state) })}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: macroColor(m.cfg, s.macro) }} />
            {s.state}: {s.count} <span className="text-slate-400">({fmtPct(s.pct)})</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[12px] text-slate-500">
        Mapeamento configurável estado → macroetapa → categoria. {autos.length ? `Estados classificados automaticamente, pendentes de revisão (${autos.length}): ${autos.map((a) => a.state).join(', ')}.` : 'Todos os estados revisados.'}
        {m.excluded ? ` ${m.excluded} card(s) em estados excluídos da contagem (ex.: Removed).` : ''}
      </p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ análise por épico

const SIT_ORDER: Record<Situation, number> = { critical: 0, attention: 1, onTrack: 2, done: 3, unlinked: 4 };

function sortRows(rows: RowMetrics[], sort: SortMode) {
  const r = rows.slice();
  const alpha = (a: RowMetrics, b: RowMetrics) => a.title.localeCompare(b.title, 'pt-BR', { numeric: true });
  if (sort === 'alpha') r.sort(alpha);
  if (sort === 'priority') r.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || alpha(a, b));
  if (sort === 'pct') r.sort((a, b) => b.pctDone - a.pctDone || alpha(a, b));
  if (sort === 'situation') r.sort((a, b) => SIT_ORDER[a.situation] - SIT_ORDER[b.situation] || alpha(a, b));
  return r;
}

type Line = { kind: 'group'; g: GroupMetrics; cont: boolean } | { kind: 'row'; r: RowMetrics };

function buildColumns(groups: GroupMetrics[], sort: SortMode, collapsed: Set<string>): [Line[], Line[]] {
  const lines: Line[] = [];
  for (const g of groups) {
    lines.push({ kind: 'group', g, cont: false });
    if (!collapsed.has(g.frente)) for (const r of sortRows(g.rows, sort)) lines.push({ kind: 'row', r });
  }
  const half = Math.ceil(lines.length / 2);
  const left = lines.slice(0, half);
  const right = lines.slice(half);
  // grupo dividido entre as colunas → repete o cabeçalho com "(CONT.)"
  if (right.length && right[0].kind === 'row') {
    const owner = [...left].reverse().find((l) => l.kind === 'group') as Extract<Line, { kind: 'group' }>;
    right.unshift({ kind: 'group', g: owner.g, cont: true });
  }
  if (left.length && left[left.length - 1].kind === 'group' && right.length) right.unshift(left.pop()!);
  return [left, right];
}

const COLS = 'grid grid-cols-[minmax(0,1fr)_46px_46px_68px_64px_208px_92px] items-center gap-x-2';

function RowBar({ m, r, onDrill }: { m: ReportModel; r: RowMetrics; onDrill: (d: DrillSpec) => void }) {
  return (
    <div className="flex h-[13px] w-full overflow-hidden rounded-[2px] bg-slate-100">
      {r.byMacro.map((x) => {
        const w = (x.count / r.total) * 100;
        return (
          <span key={x.macro} role="button" title={`${macroLabel(m.cfg, x.macro)}: ${x.count}`}
            onClick={(e) => { e.stopPropagation(); onDrill({ title: `${r.title} — ${macroLabel(m.cfg, x.macro)}`, items: r.items.filter((i) => i.macro === x.macro) }); }}
            className="flex h-full items-center justify-center border-r border-white text-[10px] font-semibold leading-none"
            style={{ width: `${w}%`, background: macroColor(m.cfg, x.macro), color: x.macro === 'qualidade' ? '#0f172a' : '#fff' }}>
            {(w / 100) * 208 > 14 ? x.count : ''}
          </span>
        );
      })}
    </div>
  );
}

function TableColumn({ m, lines, collapsed, highlightCritical, onToggleGroup, onDrill }: {
  m: ReportModel; lines: Line[]; collapsed: Set<string>; highlightCritical: boolean; onToggleGroup: (f: string) => void; onDrill: (d: DrillSpec) => void;
}) {
  const rowWord = m.cfg.rowLevel === 'epic' ? 'épicos' : 'features';
  return (
    <div className="min-w-0 flex-1">
      <div className={cn(COLS, 'border-b border-slate-300 pb-0.5 text-[13px] font-semibold text-slate-600')}>
        <span>{m.cfg.rowLevel === 'epic' ? 'Épico / Feature' : 'Feature'}</span>
        <span className="text-right">Total</span>
        <span className="text-right">PBIs</span>
        <span className="text-right">Bugs (ab.)</span>
        <span className="text-right">% concl.</span>
        <span>Distribuição por macroetapa</span>
        <span className="text-center">Situação</span>
      </div>
      {lines.map((l, i) =>
        l.kind === 'group' ? (
          <button key={`g${i}`} onClick={() => onToggleGroup(l.g.frente)}
            className="mt-[3px] flex h-[19px] w-full items-center justify-between bg-sky-100/70 px-1 text-left text-[13px] hover:bg-sky-100">
            <span className="flex items-center gap-1 font-bold uppercase text-navy-900">
              {collapsed.has(l.g.frente) ? <ChevronRight size={13} /> : <ChevronDown size={13} className="no-print" />}
              {l.g.frente}{l.cont ? ' (CONT.)' : ''}
            </span>
            <span className="text-[12px] text-slate-600">
              {l.g.rows.filter((r) => r.situation !== 'unlinked').length || l.g.rows.length} {l.g.frente === UNLINKED ? 'grupo' : rowWord} · {l.g.total} cards · {fmtPct(l.g.pctDone)} concluído
            </span>
          </button>
        ) : (
          <div key={l.r.key} role="button" onClick={() => onDrill({ title: l.r.title, subtitle: `${l.r.total} cards · ${fmtPct(l.r.pctDone)} concluído · Situação: ${SITUATION[l.r.situation].label} — ${l.r.reasons.join('; ')}`, items: l.r.items })}
            title={l.r.reasons.join('; ')}
            className={cn(COLS, 'h-[18.5px] cursor-pointer border-b border-slate-100 px-1 text-[13px] hover:bg-slate-50', highlightCritical && l.r.situation === 'critical' && 'bg-red-50')}>
            <span className="truncate text-slate-800">{l.r.title}</span>
            <span className="tabular text-right font-semibold">{l.r.total}</span>
            <span className="tabular text-right">{l.r.pbis}</span>
            <span className={cn('tabular text-right', l.r.bugsOpen > 0 ? 'text-red-600' : 'text-slate-500')}>{l.r.bugs ? `${l.r.bugs} (${l.r.bugsOpen})` : '–'}</span>
            <span className="tabular text-right font-semibold">{fmtPct(l.r.pctDone)}</span>
            <RowBar m={m} r={l.r} onDrill={onDrill} />
            <span className={cn('mx-auto w-[86px] rounded-sm py-[1px] text-center text-[11.5px] font-semibold leading-tight', SITUATION[l.r.situation].cls)}>{SITUATION[l.r.situation].label}</span>
          </div>
        ),
      )}
    </div>
  );
}

function EpicSection(p: ReportProps) {
  const { m } = p;
  const rs = m.rowSummary;
  const [left, right] = buildColumns(m.groups, p.sort, p.collapsed);
  const sortLabel = { alpha: 'ordem alfabética', priority: 'ordem de prioridade', pct: 'ordem de % concluído', situation: 'ordem de criticidade' }[p.sort];
  const word = m.cfg.rowLevel === 'epic' ? 'épicos' : 'features';
  return (
    <section className="px-11 pt-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[19px] font-bold text-navy-900">
          ANÁLISE POR {m.cfg.rowLevel === 'epic' ? 'ÉPICO / FEATURE' : 'FEATURE'} — {m.cfg.project} <span className="font-semibold">(agrupado por frente, {sortLabel})</span>
        </h2>
        {m.hasHierarchy && (
          <div className="flex items-center gap-2 text-[14px]">
            <span className="font-bold text-navy-900">Situação dos {rs.total} {word}:</span>
            <span className="rounded-full bg-slate-700 px-3 py-0.5 font-semibold text-white">Concluído: {rs.done}</span>
            <span className="rounded-full bg-green-600 px-3 py-0.5 font-semibold text-white">No prazo: {rs.onTrack}</span>
            <span className="rounded-full bg-amber-400 px-3 py-0.5 font-semibold text-navy-900">Atenção: {rs.attention}</span>
            <span className="rounded-full bg-red-600 px-3 py-0.5 font-semibold text-white">Crítico/atrasado: {rs.critical}</span>
          </div>
        )}
      </div>
      {!m.hasHierarchy ? (
        <div className="mt-2 rounded border border-dashed border-slate-300 p-4 text-[14px] text-slate-600">
          {ND}: a exportação não contém hierarquia (coluna <b>Parent</b> ou query em árvore com colunas <b>Title 1, Title 2…</b>). Inclua a coluna Parent na query para habilitar a análise por Épico/Feature. Nenhum vínculo é presumido.
        </div>
      ) : (
        <div className="mt-1 flex gap-8">
          <TableColumn m={m} lines={left} collapsed={p.collapsed} highlightCritical={p.highlightCritical} onToggleGroup={p.onToggleGroup} onDrill={p.onDrill} />
          <TableColumn m={m} lines={right} collapsed={p.collapsed} highlightCritical={p.highlightCritical} onToggleGroup={p.onToggleGroup} onDrill={p.onDrill} />
        </div>
      )}
      <p className="mt-1 text-[11.5px] text-slate-500">
        Situação{m.cfg.goalDate ? ` (meta ${fmtDate(m.cfg.goalDate)})` : ''}: Concluído = 100% done · Crítico = data-alvo vencida com itens abertos{m.cfg.rowRules.criticalBlockedPct < 100 ? ` ou ≥${m.cfg.rowRules.criticalBlockedPct}% bloqueados` : ''} · Atenção = bloqueio (estado/tag) ou card parado &gt;{m.cfg.staleDays} dias · No prazo = sem impedimentos.
        {' '}Barra = PBIs + Bugs por macroetapa · Bugs (ab.) = total (abertos) · Data-alvo = Target Date do {m.cfg.rowLevel === 'epic' ? 'épico' : 'feature'}, ou a meta global.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ painéis inferiores

function Panel({ title, icon, tone, items, empty, risk }: { title: string; icon: ReactNode; tone: 'green' | 'orange' | 'red'; items: Insight[]; empty: string; risk?: boolean }) {
  const t = {
    green: { head: 'bg-green-600', body: 'bg-green-50/70 border-green-600', dot: 'bg-green-600' },
    orange: { head: 'bg-orange-500', body: 'bg-orange-50/70 border-orange-500', dot: 'bg-orange-500' },
    red: { head: 'bg-red-600', body: 'bg-red-50/70 border-red-600', dot: 'bg-red-600' },
  }[tone];
  const lvl = { POTENCIAL: 'bg-red-600', ALTO: 'bg-red-700', 'CRÍTICO': 'bg-red-900' };
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border-2', t.body)}>
      <div className={cn('flex items-center gap-2 px-4 py-1.5 text-[17px] font-bold uppercase text-white', t.head)}>
        {icon}
        {title}
      </div>
      <ul className="flex flex-1 flex-col gap-1.5 px-4 py-2 text-[13.5px] leading-[1.3] text-slate-800">
        {items.length === 0 && <li className="text-slate-500">{empty}</li>}
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            {risk && it.level ? (
              <span className={cn('mt-[1px] h-fit shrink-0 rounded px-1.5 py-[1px] text-[11px] font-bold text-white', lvl[it.level])}>{it.level}</span>
            ) : (
              <span className={cn('mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full', t.dot)} />
            )}
            <span>
              {it.text}
              {risk && it.evidence ? <span className="text-slate-600"> ({it.evidence}).</span> : ''}
              {it.impact && risk ? <span className="text-slate-600"> Impacto: {it.impact}</span> : ''}
              {it.action ? <span className="font-semibold"> Ação: {it.action}</span> : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ página

export function ExecutiveReport(p: ReportProps) {
  const { m, ins, reading } = p;
  const s = m.snapshot;
  return (
    <div id="executive-report" className="flex min-h-[1080px] flex-col bg-white font-sans text-slate-900" style={{ width: REPORT_WIDTH }}>
      <Header m={m} />
      <KpiRow m={m} onDrill={p.onDrill} />
      <StatusSection m={m} onDrill={p.onDrill} />
      <EpicSection {...p} />
      <div className="flex-1" />
      <div className="flex gap-5 px-11 pb-3 pt-2.5">
        <Panel title="Principais avanços do período" icon={<CheckSquare size={18} />} tone="green" items={ins.advances} empty="Sem avanços calculáveis: configure a sprint atual ou importe um snapshot anterior para comparação." />
        <Panel title="Pontos de atenção" icon={<span className="text-[18px] font-black">!</span>} tone="orange" items={ins.attention} empty="Nenhum ponto de atenção disparado pelas regras." />
        <Panel title="Riscos" icon={<AlertTriangle size={18} />} tone="red" items={ins.risks} empty="Nenhum risco com evidência nos dados." risk />
      </div>
      <footer className="bg-navy-900 px-11 py-2.5 text-white">
        <div className="flex gap-6 text-[15.5px]">
          <span className="shrink-0 font-bold uppercase text-amber-400">Leitura executiva</span>
          <span>{reading.text}</span>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-400">
          Fonte: Azure DevOps · arquivo “{s.fileName}” ({s.sheets.join(', ')}) · {s.items.length} work items importados, {m.kpi.total} cards no recorte ({m.cfg.cardTypes.filter((t) => m.cards.some((c) => c.type === t)).join(', ') || '—'}) ·
          {' '}Indicadores = dados extraídos; saúde e situação = regras configuráveis; avanços, atenção e riscos = análise por regras com evidência
          {reading.ai ? `; leitura executiva redigida por IA (${reading.ai}) a partir dos indicadores calculados` : ''}.
        </div>
      </footer>
    </div>
  );
}
