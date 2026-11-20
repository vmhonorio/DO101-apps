import type {
  Category, Enriched, GroupMetrics, Health, MacroCount, Num, ProjectConfig, RowMetrics, Situation, Snapshot, SprintDef, WorkItem,
} from './types';
import { inList, lc, ruleFor } from './config';
import { DAY, daysBetween, pct, toDate } from './format';

// ------------------------------------------------------------ filtros dinâmicos

export interface Filters {
  frentes: string[];
  assignee: string;
  kind: 'all' | 'pbi' | 'bug';
  tag: string;
  search: string;
}
export const EMPTY_FILTERS: Filters = { frentes: [], assignee: '', kind: 'all', tag: '', search: '' };

// ------------------------------------------------------------ enriquecimento (hierarquia + classificação)

export interface Hierarchy {
  byId: Map<number, WorkItem>;
  epics: WorkItem[];
  features: WorkItem[];
}

export function buildHierarchy(items: WorkItem[], cfg: ProjectConfig): Hierarchy {
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    byId,
    epics: items.filter((i) => inList(cfg.epicTypes, i.type)),
    features: items.filter((i) => inList(cfg.featureTypes, i.type)),
  };
}

/** Sobe a cadeia de pais (somente itens presentes na exportação) até achar Épico e Feature. */
export function ancestors(item: WorkItem, h: Hierarchy, cfg: ProjectConfig): { epic?: WorkItem; feature?: WorkItem } {
  let epic: WorkItem | undefined;
  let feature: WorkItem | undefined;
  const seen = new Set<number>([item.id]);
  let cur = item.parentId ? h.byId.get(item.parentId) : undefined;
  while (cur && !seen.has(cur.id) && seen.size < 20) {
    seen.add(cur.id);
    if (!feature && inList(cfg.featureTypes, cur.type)) feature = cur;
    if (!epic && inList(cfg.epicTypes, cur.type)) {
      epic = cur;
      break;
    }
    cur = cur.parentId ? h.byId.get(cur.parentId) : undefined;
  }
  return { epic, feature };
}

function pathSegment(path: string | undefined, level: number): string | undefined {
  if (!path) return undefined;
  const parts = path.split(/[\\/]/).map((p) => p.trim()).filter(Boolean);
  return parts[Math.min(level, parts.length) - 1];
}

export const UNLINKED = 'SEM VÍNCULO';

export function frenteOf(row: WorkItem | undefined, h: Hierarchy, cfg: ProjectConfig, fallback?: WorkItem): string {
  const src = cfg.frente.source;
  const it = row ?? fallback;
  if (!it) return UNLINKED;
  let v: string | undefined;
  if (src === 'none') v = cfg.project;
  else if (src === 'areaPath') v = pathSegment(it.areaPath ?? fallback?.areaPath, cfg.frente.level);
  else if (src === 'iterationPath') v = pathSegment(it.iterationPath ?? fallback?.iterationPath, cfg.frente.level);
  else if (src === 'tagPrefix') {
    const p = lc(cfg.frente.tagPrefix);
    const t = it.tags.find((x) => lc(x).startsWith(p));
    v = t ? t.slice(cfg.frente.tagPrefix.length).trim() : undefined;
  } else if (src === 'epicParent') {
    const parent = it.parentId ? h.byId.get(it.parentId) : undefined;
    v = parent?.title;
  }
  return (v ?? 'Sem frente').toUpperCase();
}

export function enrich(items: WorkItem[], cfg: ProjectConfig, refDate: Date): { cards: Enriched[]; excluded: WorkItem[]; h: Hierarchy } {
  const h = buildHierarchy(items, cfg);
  const cards: Enriched[] = [];
  const excluded: WorkItem[] = [];
  const blocked = cfg.blockedTags.map(lc);
  for (const it of items) {
    if (!inList(cfg.cardTypes, it.type)) continue;
    const rule = ruleFor(cfg, it.state);
    if (rule.category === 'excluded') {
      excluded.push(it);
      continue;
    }
    const { epic, feature } = ancestors(it, h, cfg);
    const rowItem = cfg.rowLevel === 'epic' ? epic : feature;
    const ref = it.stateChangeDate ?? it.changedDate;
    cards.push({
      ...it,
      macro: rule.macro,
      category: rule.category,
      isBug: inList(cfg.bugTypes, it.type),
      blockedTag: it.tags.some((t) => blocked.includes(lc(t))),
      epicId: epic?.id,
      featureId: feature?.id,
      rowKey: rowItem ? String(rowItem.id) : UNLINKED,
      frente: rowItem ? frenteOf(rowItem, h, cfg, it) : UNLINKED,
      idleDays: ref ? Math.max(0, daysBetween(toDate(ref), refDate)) : undefined,
    });
  }
  return { cards, excluded, h };
}

export function applyFilters(cards: Enriched[], f: Filters): Enriched[] {
  const q = lc(f.search);
  const tag = lc(f.tag);
  return cards.filter(
    (c) =>
      (!f.frentes.length || f.frentes.includes(c.frente)) &&
      (!f.assignee || (c.assignedTo ?? '(sem responsável)') === f.assignee) &&
      (f.kind === 'all' || (f.kind === 'bug' ? c.isBug : !c.isBug)) &&
      (!tag || c.tags.some((t) => lc(t) === tag)) &&
      (!q || lc(c.title).includes(q) || String(c.id) === q),
  );
}

// ------------------------------------------------------------ agregações

const isOpen = (c: Enriched) => c.category !== 'done';
export const isStale = (c: Enriched, cfg: ProjectConfig) => isOpen(c) && c.idleDays !== undefined && c.idleDays > cfg.staleDays;

export function countByMacro(cards: Enriched[], cfg: ProjectConfig): MacroCount[] {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.macro, (m.get(c.macro) ?? 0) + 1);
  return cfg.macroStages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ macro: s.key, count: m.get(s.key) ?? 0 }))
    .filter((x) => x.count > 0);
}

export interface StateCount {
  state: string;
  macro: string;
  category: Category;
  count: number;
  pct: number;
  order: number;
}

export function countByState(cards: Enriched[], cfg: ProjectConfig): StateCount[] {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.state, (m.get(c.state) ?? 0) + 1);
  const macroOrder = new Map(cfg.macroStages.map((s) => [s.key, s.order]));
  return [...m.entries()]
    .map(([state, count]) => {
      const r = ruleFor(cfg, state);
      return { state, count, macro: r.macro, category: r.category, order: r.order, pct: (count / cards.length) * 100 };
    })
    .sort((a, b) => (macroOrder.get(a.macro) ?? 99) - (macroOrder.get(b.macro) ?? 99) || a.order - b.order || a.state.localeCompare(b.state));
}

function situationOf(row: Omit<RowMetrics, 'situation' | 'reasons'>, cfg: ProjectConfig, refDate: Date, unlinked: boolean): { s: Situation; reasons: string[] } {
  if (unlinked) return { s: 'unlinked', reasons: ['Cards sem Épico/Feature vinculado na exportação'] };
  const open = row.total - row.done;
  if (row.total > 0 && open === 0) return { s: 'done', reasons: ['100% dos cards concluídos'] };
  const reasons: string[] = [];
  const target = row.targetDate ?? cfg.goalDate;
  const crit: string[] = [];
  if (cfg.rowRules.criticalWhenOverdue && target && toDate(target).getTime() < refDate.getTime() && open > 0)
    crit.push(`data-alvo ${toDate(target).toLocaleDateString('pt-BR')} vencida com ${open} cards abertos`);
  const blockedPct = row.total ? (row.blocked / row.total) * 100 : 0;
  if (row.blocked > 0 && blockedPct >= cfg.rowRules.criticalBlockedPct) crit.push(`${blockedPct.toFixed(0)}% dos cards bloqueados`);
  if (crit.length) return { s: 'critical', reasons: crit };
  if (row.blocked + row.blockedTag >= cfg.rowRules.attentionBlocked && row.blocked + row.blockedTag > 0)
    reasons.push(`${row.blocked} bloqueado(s) por estado, ${row.blockedTag} com tag de bloqueio`);
  if (row.stale >= cfg.rowRules.attentionStale && row.stale > 0) reasons.push(`${row.stale} card(s) parado(s) há mais de ${cfg.staleDays} dias`);
  if (reasons.length) return { s: 'attention', reasons };
  return { s: 'onTrack', reasons: ['Sem impedimentos, sem cards parados e dentro da data-alvo'] };
}

export function buildRow(key: string, rowItem: WorkItem | undefined, cards: Enriched[], cfg: ProjectConfig, refDate: Date, frente: string): RowMetrics {
  const done = cards.filter((c) => c.category === 'done').length;
  const bugs = cards.filter((c) => c.isBug);
  const base = {
    key,
    id: rowItem?.id,
    title: rowItem?.title ?? (cfg.rowLevel === 'epic' ? 'Itens sem Épico/Feature vinculados' : 'Itens sem Feature vinculada'),
    frente,
    priority: rowItem?.priority,
    targetDate: rowItem?.targetDate,
    total: cards.length,
    pbis: cards.length - bugs.length,
    bugs: bugs.length,
    bugsOpen: bugs.filter(isOpen).length,
    done,
    pctDone: cards.length ? (done / cards.length) * 100 : 0,
    blocked: cards.filter((c) => c.category === 'blocked').length,
    blockedTag: cards.filter((c) => c.blockedTag && isOpen(c) && c.category !== 'blocked').length,
    stale: cards.filter((c) => isStale(c, cfg)).length,
    byMacro: countByMacro(cards, cfg),
    items: cards,
  };
  const { s, reasons } = situationOf(base, cfg, refDate, !rowItem);
  return { ...base, situation: s, reasons };
}

export function buildGroups(cards: Enriched[], h: Hierarchy, cfg: ProjectConfig, refDate: Date): GroupMetrics[] {
  const byRow = new Map<string, Enriched[]>();
  for (const c of cards) {
    const l = byRow.get(c.rowKey) ?? [];
    l.push(c);
    byRow.set(c.rowKey, l);
  }
  const groups = new Map<string, RowMetrics[]>();
  for (const [key, list] of byRow) {
    const item = key === UNLINKED ? undefined : h.byId.get(Number(key));
    const frente = list[0].frente;
    const row = buildRow(key, item, list, cfg, refDate, frente);
    const g = groups.get(frente) ?? [];
    g.push(row);
    groups.set(frente, g);
  }
  return [...groups.entries()]
    .map(([frente, rows]) => {
      const total = rows.reduce((s, r) => s + r.total, 0);
      const done = rows.reduce((s, r) => s + r.done, 0);
      return { frente, rows, total, done, pctDone: total ? (done / total) * 100 : 0 };
    })
    .sort((a, b) => (a.frente === UNLINKED ? 1 : b.frente === UNLINKED ? -1 : a.frente.localeCompare(b.frente, 'pt-BR')));
}

// ------------------------------------------------------------ períodos / sprints

export function sprintRange(s: SprintDef): [Date, Date] {
  return [toDate(s.start), new Date(toDate(s.end).getTime() + DAY - 1)];
}

const within = (iso: string | undefined, [a, b]: [Date, Date]) => {
  if (!iso) return false;
  const t = toDate(iso).getTime();
  return t >= a.getTime() && t <= b.getTime();
};

export function findSprint(cfg: ProjectConfig, name?: string): SprintDef | undefined {
  return name ? cfg.sprints.find((s) => s.name === name) : undefined;
}

export function previousSprint(cfg: ProjectConfig, cur?: SprintDef): SprintDef | undefined {
  if (!cur) return undefined;
  return cfg.sprints
    .filter((s) => s.end < cur.start)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
}

// ------------------------------------------------------------ modelo do relatório

export interface PeriodFacts {
  sprint?: SprintDef;
  prevSprint?: SprintDef;
  /** concluídos no período e a origem do cálculo */
  doneInPeriod: Num;
  doneInPrevPeriod: Num;
  doneInPeriodSource: string;
  doneInPeriodBugs: Num;
  createdInPeriod: Num;
  createdInPrevPeriod: Num;
  createdSource: string;
  movedToHomolog: { macro: string; state: string; count: number }[] | null;
  throughput: Num;
  throughputSource: string;
  sprintsToGoal: Num;
  sprintsNeeded: Num;
  projectionRatio: Num;
}

export interface Comparison {
  label: string;
  total: number;
  done: number;
  pctDone: Num;
  newIds: number;
  newlyDone: number;
}

export interface ReportModel {
  cfg: ProjectConfig;
  snapshot: Snapshot;
  refDate: Date;
  allCards: Enriched[];
  cards: Enriched[];
  excluded: number;
  h: Hierarchy;
  hasHierarchy: boolean;
  kpi: {
    features: Num;
    epics: Num;
    unlinked: Num;
    total: number;
    pbis: number;
    bugs: number;
    done: number;
    donePct: Num;
    inProgress: number;
    inProgressPct: Num;
    inProgressByMacro: MacroCount[];
    waiting: number;
    waitingPct: Num;
    waitingByMacro: MacroCount[];
    blocked: number;
    blockedPct: Num;
    blockedTagOpen: number;
    stale: Num;
    bugsDone: number;
    bugsOpen: number;
    bugsBlocked: number;
  };
  states: StateCount[];
  macroTotals: MacroCount[];
  groups: GroupMetrics[];
  rows: RowMetrics[];
  rowSummary: { total: number; done: number; onTrack: number; attention: number; critical: number };
  comparison: Comparison | null;
  period: PeriodFacts;
  health: { value: Health; reasons: string[] };
}

export function computeReport(
  snapshot: Snapshot,
  cfg: ProjectConfig,
  filters: Filters = EMPTY_FILTERS,
  previous?: Snapshot,
): ReportModel {
  const refDate = new Date(snapshot.referenceDate);
  const { cards: allCards, excluded, h } = enrich(snapshot.items, cfg, refDate);
  const cards = applyFilters(allCards, filters);
  const total = cards.length;
  const by = (cat: Category) => cards.filter((c) => c.category === cat);
  const done = by('done');
  const inProg = by('inProgress');
  const waiting = by('waiting');
  const blocked = by('blocked');
  const bugs = cards.filter((c) => c.isBug);
  const hasHierarchy = snapshot.hierarchySource !== 'none';
  const hasIdle = cards.some((c) => c.idleDays !== undefined);

  const groups = buildGroups(cards, h, cfg, refDate);
  const rows = groups.flatMap((g) => g.rows);
  const linkedRows = rows.filter((r) => r.situation !== 'unlinked');
  // Features monitoradas = features (presentes na exportação) que têm ao menos 1 card no recorte
  const featureIds = new Set(cards.map((c) => c.featureId).filter(Boolean));
  const epicIds = new Set(cards.map((c) => c.epicId).filter(Boolean));

  // comparação com o snapshot anterior (mesma configuração e mesmos filtros)
  let comparison: Comparison | null = null;
  let prevCards: Enriched[] | null = null;
  if (previous) {
    prevCards = applyFilters(enrich(previous.items, cfg, new Date(previous.referenceDate)).cards, filters);
    const prevById = new Map(prevCards.map((c) => [c.id, c]));
    const pDone = prevCards.filter((c) => c.category === 'done').length;
    comparison = {
      label: previous.label,
      total: prevCards.length,
      done: pDone,
      pctDone: pct(pDone, prevCards.length),
      newIds: cards.filter((c) => !prevById.has(c.id)).length,
      newlyDone: cards.filter((c) => c.category === 'done' && prevById.get(c.id) && prevById.get(c.id)!.category !== 'done').length,
    };
  }

  const period = computePeriod(cards, cfg, refDate, prevCards, comparison, snapshot);

  const kpi: ReportModel['kpi'] = {
    features: hasHierarchy ? featureIds.size : null,
    epics: hasHierarchy ? epicIds.size : null,
    unlinked: hasHierarchy ? cards.filter((c) => c.rowKey === UNLINKED).length : null,
    total,
    pbis: total - bugs.length,
    bugs: bugs.length,
    done: done.length,
    donePct: pct(done.length, total),
    inProgress: inProg.length,
    inProgressPct: pct(inProg.length, total),
    inProgressByMacro: countByMacro(inProg, cfg).sort((a, b) => b.count - a.count),
    waiting: waiting.length,
    waitingPct: pct(waiting.length, total),
    waitingByMacro: countByMacro(waiting, cfg).sort((a, b) => b.count - a.count),
    blocked: blocked.length,
    blockedPct: pct(blocked.length, total),
    blockedTagOpen: cards.filter((c) => c.blockedTag && c.category !== 'done' && c.category !== 'blocked').length,
    stale: hasIdle ? cards.filter((c) => isStale(c, cfg)).length : null,
    bugsDone: bugs.filter((c) => c.category === 'done').length,
    bugsOpen: bugs.filter((c) => c.category !== 'done').length,
    bugsBlocked: bugs.filter((c) => c.category === 'blocked').length,
  };

  const rowSummary = {
    total: linkedRows.length,
    done: linkedRows.filter((r) => r.situation === 'done').length,
    onTrack: linkedRows.filter((r) => r.situation === 'onTrack').length,
    attention: linkedRows.filter((r) => r.situation === 'attention').length,
    critical: linkedRows.filter((r) => r.situation === 'critical').length,
  };

  const model: ReportModel = {
    cfg, snapshot, refDate, allCards, cards, excluded: excluded.length, h, hasHierarchy, kpi,
    states: countByState(cards, cfg),
    macroTotals: countByMacro(cards, cfg),
    groups, rows, rowSummary, comparison, period,
    health: { value: 'nd', reasons: [] },
  };
  model.health = computeHealth(model);
  return model;
}

function computePeriod(
  cards: Enriched[], cfg: ProjectConfig, refDate: Date, prevCards: Enriched[] | null, cmp: Comparison | null, snapshot: Snapshot,
): PeriodFacts {
  const sprint = findSprint(cfg, cfg.currentSprint);
  const prevSprint = previousSprint(cfg, sprint);
  const hasClosed = snapshot.availableFields.includes('closedDate');
  const hasCreated = snapshot.availableFields.includes('createdDate');
  const doneCards = cards.filter((c) => c.category === 'done');
  let doneInPeriod: Num = null, doneInPrevPeriod: Num = null, doneInPeriodBugs: Num = null;
  let doneInPeriodSource = 'N/D: configure a sprint atual (datas) com Closed Date na query, ou importe um snapshot anterior';
  if (sprint && hasClosed) {
    const r = sprintRange(sprint);
    const inP = doneCards.filter((c) => within(c.closedDate, r));
    doneInPeriod = inP.length;
    doneInPeriodBugs = inP.filter((c) => c.isBug).length;
    doneInPeriodSource = `Closed Date dentro de ${sprint.name}`;
    if (prevSprint) doneInPrevPeriod = doneCards.filter((c) => within(c.closedDate, sprintRange(prevSprint))).length;
  } else if (cmp && prevCards) {
    const prevById = new Map(prevCards.map((c) => [c.id, c]));
    const nd = doneCards.filter((c) => prevById.get(c.id) && prevById.get(c.id)!.category !== 'done');
    doneInPeriod = nd.length;
    doneInPeriodBugs = nd.filter((c) => c.isBug).length;
    doneInPeriodSource = `transições para concluído desde o snapshot "${cmp.label}"`;
  }

  let createdInPeriod: Num = null, createdInPrevPeriod: Num = null;
  let createdSource = 'N/D';
  if (sprint && hasCreated) {
    createdInPeriod = cards.filter((c) => within(c.createdDate, sprintRange(sprint))).length;
    if (prevSprint) createdInPrevPeriod = cards.filter((c) => within(c.createdDate, sprintRange(prevSprint))).length;
    createdSource = `Created Date dentro de ${sprint.name}`;
  } else if (cmp) {
    createdInPeriod = cmp.newIds;
    createdSource = `IDs novos desde o snapshot "${cmp.label}"`;
  }

  let movedToHomolog: PeriodFacts['movedToHomolog'] = null;
  if (prevCards) {
    const prevById = new Map(prevCards.map((c) => [c.id, c]));
    const target = new Set(['homologacao', 'implantacao']);
    const counts = new Map<string, { macro: string; state: string; count: number }>();
    for (const c of cards) {
      const p = prevById.get(c.id);
      if (target.has(c.macro) && (!p || !target.has(p.macro)) && c.category !== 'done') {
        const k = c.state;
        const e = counts.get(k) ?? { macro: c.macro, state: c.state, count: 0 };
        e.count++;
        counts.set(k, e);
      }
    }
    movedToHomolog = [...counts.values()].sort((a, b) => b.count - a.count);
  }

  // vazão (throughput) por sprint: média das últimas até 3 sprints encerradas, via Closed Date
  let throughput: Num = null;
  let throughputSource = 'N/D';
  if (hasClosed && cfg.sprints.length) {
    const closed = cfg.sprints
      .filter((s) => toDate(s.end).getTime() <= refDate.getTime() || s.name === sprint?.name)
      .sort((a, b) => b.end.localeCompare(a.end))
      .slice(0, 3);
    if (closed.length) {
      const counts = closed.map((s) => doneCards.filter((c) => within(c.closedDate, sprintRange(s))).length);
      throughput = counts.reduce((a, b) => a + b, 0) / counts.length;
      throughputSource = `média de ${closed.map((s) => s.name).join(', ')}`;
    }
  } else if (doneInPeriod !== null && cmp) {
    throughput = doneInPeriod;
    throughputSource = `entregas desde o snapshot "${cmp.label}"`;
  }

  let sprintsToGoal: Num = null, sprintsNeeded: Num = null, projectionRatio: Num = null;
  if (cfg.goalDate) {
    const lens = cfg.sprints.map((s) => daysBetween(toDate(s.start), toDate(s.end)) + 1).filter((n) => n > 0);
    const len = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 14;
    sprintsToGoal = Math.max(0, daysBetween(refDate, toDate(cfg.goalDate)) / len);
    const open = cards.filter((c) => c.category !== 'done').length;
    if (throughput && throughput > 0) {
      sprintsNeeded = open / throughput;
      projectionRatio = sprintsToGoal > 0 ? sprintsNeeded / sprintsToGoal : open > 0 ? Infinity : 0;
    }
  }
  return {
    sprint, prevSprint, doneInPeriod, doneInPrevPeriod, doneInPeriodSource, doneInPeriodBugs, createdInPeriod, createdInPrevPeriod,
    createdSource, movedToHomolog, throughput, throughputSource, sprintsToGoal, sprintsNeeded, projectionRatio,
  };
}

/** Saúde geral: regras determinísticas e configuráveis. Cada regra disparada vira uma justificativa. */
export function computeHealth(m: ReportModel): { value: Health; reasons: string[] } {
  const { cfg, kpi, rowSummary, period } = m;
  if (kpi.total === 0) return { value: 'nd', reasons: ['Sem cards no recorte'] };
  const H = cfg.health;
  const crit: string[] = [];
  const att: string[] = [];
  if ((kpi.blockedPct ?? 0) >= H.criticalBlockedPct) crit.push(`bloqueados ${kpi.blockedPct!.toFixed(1)}% ≥ ${H.criticalBlockedPct}%`);
  if (rowSummary.critical >= H.criticalOverdueRows && rowSummary.critical > 0) crit.push(`${rowSummary.critical} épico(s) crítico(s)/atrasado(s)`);
  if (period.projectionRatio !== null && period.projectionRatio >= H.criticalProjectionRatio)
    crit.push(`projeção: ${period.sprintsNeeded!.toFixed(1).replace('.', ',')} sprints necessárias x ${period.sprintsToGoal!.toFixed(1).replace('.', ',')} até a meta`);
  if (crit.length) return { value: 'critical', reasons: crit };
  const attPct = rowSummary.total ? ((rowSummary.attention + rowSummary.critical) / rowSummary.total) * 100 : 0;
  if (rowSummary.total && attPct >= H.attentionRowsPct) att.push(`${attPct.toFixed(0)}% dos épicos em atenção`);
  if (kpi.blocked >= H.attentionBlockedCount && kpi.blocked > 0) att.push(`${kpi.blocked} card(s) bloqueado(s)`);
  if (kpi.stale !== null && (kpi.stale / kpi.total) * 100 >= H.attentionStalePct) att.push(`${kpi.stale} cards parados > ${cfg.staleDays} dias`);
  if (period.projectionRatio !== null && period.projectionRatio > H.attentionProjectionRatio) att.push(`ritmo atual não cobre a meta ${cfg.goalDate ? toDate(cfg.goalDate).toLocaleDateString('pt-BR') : ''}`);
  if (att.length) return { value: 'attention', reasons: att };
  const limits = kpi.stale === null ? ['sem datas na exportação: regras de tempo não avaliadas'] : [];
  return { value: 'onTrack', reasons: ['Nenhuma regra de atenção ou criticidade disparada', ...limits] };
}

export function macroLabel(cfg: ProjectConfig, key: string) {
  return cfg.macroStages.find((m) => m.key === key)?.label ?? key;
}
export function macroColor(cfg: ProjectConfig, key: string) {
  return cfg.macroStages.find((m) => m.key === key)?.color ?? '#94a3b8';
}
