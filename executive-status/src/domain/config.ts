import type { Category, MacroStage, ProjectConfig, StateRule, WorkItem } from './types';

export const DEFAULT_MACROS: MacroStage[] = [
  { key: 'backlog', label: 'Backlog', color: '#2563eb', order: 1 },
  { key: 'refinamento', label: 'Refinamento', color: '#60a5fa', order: 2 },
  { key: 'desenvolvimento', label: 'Desenvolvimento', color: '#16a34a', order: 3 },
  { key: 'qualidade', label: 'Qualidade', color: '#eab308', order: 4 },
  { key: 'homologacao', label: 'Homologação', color: '#f97316', order: 5 },
  { key: 'implantacao', label: 'Implantação', color: '#c2410c', order: 6 },
  { key: 'bloqueado', label: 'Bloqueado', color: '#dc2626', order: 7 },
  { key: 'concluido', label: 'Concluído', color: '#334155', order: 8 },
];

export function defaultConfig(project: string): ProjectConfig {
  return {
    project,
    macroStages: DEFAULT_MACROS.map((m) => ({ ...m })),
    stateRules: {},
    cardTypes: ['Product Backlog Item', 'User Story', 'Requirement', 'Issue', 'Bug', 'Item de Lista de Pendências do Produto', 'História de Usuário', 'Requisito', 'Problema'],
    bugTypes: ['Bug', 'Defeito'],
    epicTypes: ['Epic', 'Épico'],
    featureTypes: ['Feature', 'Recurso', 'Funcionalidade'],
    rowLevel: 'epic',
    frente: { source: 'areaPath', level: 2, tagPrefix: 'Frente:' },
    blockedTags: ['bloqueado', 'blocked', 'impedimento', 'impedido'],
    dependencyTags: ['dependência externa', 'dependencia externa', 'fornecedor', 'externo', 'dependência', 'dependencia'],
    criticalBugSeverities: ['1 - Critical', '1 - Crítico', 'Critical', 'Crítico'],
    staleDays: 30,
    longDevDays: 60,
    goalDate: undefined,
    goalLabel: 'Meta',
    dateFormat: 'DMY',
    sprints: [],
    currentSprint: undefined,
    rowRules: { attentionBlocked: 1, attentionStale: 1, criticalBlockedPct: 25, criticalWhenOverdue: true },
    health: {
      criticalBlockedPct: 10,
      criticalOverdueRows: 1,
      criticalProjectionRatio: 1.5,
      attentionRowsPct: 25,
      attentionBlockedCount: 1,
      attentionStalePct: 10,
      attentionProjectionRatio: 1,
    },
    insight: { homologAccumulationPct: 25, concentrationPct: 25, concentrationMinItems: 10, highMaturityPct: 70, lowEvolutionPct: 20, maxPerPanel: 5 },
    azureBaseUrl: undefined,
    ai: { enabled: false, model: 'claude-opus-5-5' },
  };
}

// ------------------------------------------------------------ heurística de classificação de estados
// Usada apenas como sugestão inicial para estados ainda não mapeados; o gestor revisa na tela de Configuração.

const WAITING_PREFIX = /^(aguard|para |pronto|ready|to |waiting|pending|pendente|fila)/i;

const HEURISTICS: { re: RegExp; macro: string; category?: Category }[] = [
  { re: /removed|removido|cancel|descartad|cut\b/i, macro: 'backlog', category: 'excluded' },
  { re: /bloque|block|impedi|on hold|suspens/i, macro: 'bloqueado', category: 'blocked' },
  { re: /^(done|closed|conclu|fechad|finaliz|entregue|completed|complete)/i, macro: 'concluido', category: 'done' },
  { re: /\bprod\b|produ[cç][aã]o|release|deploy prod|implanta/i, macro: 'implantacao' },
  { re: /uat|homolog|aceite|valida[cç][aã]o (do )?cliente|acceptance/i, macro: 'homologacao' },
  { re: /\bqa\b|test|teste|qualidade|resolved|resolvido|verifica/i, macro: 'qualidade' },
  { re: /pronto para (o )?desenv|ready for dev|approved|aprovado/i, macro: 'refinamento', category: 'waiting' },
  { re: /refin|\bref\b|ux|escrita|design|an[aá]lise|analysis|especifica/i, macro: 'refinamento', category: 'waiting' },
  { re: /desenv|develop|in progress|em andamento|committed|doing|active|ativo|code review|review|revis|build|fazendo/i, macro: 'desenvolvimento' },
  { re: /new|novo|backlog|proposed|proposto|to do|todo|open|aberto/i, macro: 'backlog', category: 'waiting' },
];

export function classifyState(state: string): { macro: string; category: Category; recognized: boolean } {
  const s = state.trim();
  for (const h of HEURISTICS) {
    if (h.re.test(s)) {
      const category = h.category ?? (WAITING_PREFIX.test(s) ? 'waiting' : 'inProgress');
      return { macro: h.macro, category, recognized: true };
    }
  }
  return { macro: 'backlog', category: 'waiting', recognized: false };
}

/** Garante uma regra para cada estado encontrado nos itens; não altera regras já revisadas. */
export function ensureStateRules(cfg: ProjectConfig, items: WorkItem[]): { cfg: ProjectConfig; added: string[]; unrecognized: string[] } {
  const rules: Record<string, StateRule> = { ...cfg.stateRules };
  const added: string[] = [];
  const unrecognized: string[] = [];
  const macroOrder = new Map(cfg.macroStages.map((m) => [m.key, m.order]));
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.state)) continue;
    seen.add(it.state);
    if (rules[it.state]) continue;
    const c = classifyState(it.state);
    const macro = macroOrder.has(c.macro) ? c.macro : cfg.macroStages[0].key;
    const inMacro = Object.values(rules).filter((r) => r.macro === macro).length;
    // ordem dentro da macroetapa: filas de espera antes de execução
    const base = (macroOrder.get(macro) ?? 9) * 100 + (c.category === 'inProgress' ? 50 : 0);
    rules[it.state] = { macro, category: c.category, order: base + inMacro, auto: true };
    added.push(it.state);
    if (!c.recognized) unrecognized.push(it.state);
  }
  return { cfg: { ...cfg, stateRules: rules }, added, unrecognized };
}

export function ruleFor(cfg: ProjectConfig, state: string): StateRule {
  const r = cfg.stateRules[state];
  if (r) return r;
  const c = classifyState(state);
  return { macro: c.macro, category: c.category, order: 999, auto: true };
}

export const lc = (s: string) => s.trim().toLowerCase();
export const inList = (list: string[], v: string | undefined) => !!v && list.some((x) => lc(x) === lc(v));
