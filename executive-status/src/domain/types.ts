// Modelo de dados central do EXECUTIVE STATUS.
// Camada pura (sem React / sem I/O) — reutilizável por uma futura fonte de dados via API do Azure DevOps.

/** Campos canônicos reconhecidos nas exportações do Azure DevOps. */
export type CanonicalField =
  | 'id'
  | 'type'
  | 'title'
  | 'state'
  | 'assignedTo'
  | 'areaPath'
  | 'iterationPath'
  | 'priority'
  | 'parent'
  | 'tags'
  | 'createdDate'
  | 'changedDate'
  | 'stateChangeDate'
  | 'closedDate'
  | 'targetDate'
  | 'storyPoints'
  | 'effort'
  | 'remainingWork'
  | 'completedWork'
  | 'severity'
  | 'team';

/** Item de trabalho normalizado. Datas em ISO-8601. Campo ausente = undefined (nunca inventado). */
export interface WorkItem {
  id: number;
  type: string;
  title: string;
  state: string;
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number;
  /** ID do pai, apenas quando informado pela coluna Parent ou pela estrutura de árvore da query. */
  parentId?: number;
  parentSource?: 'parent-field' | 'tree';
  tags: string[];
  createdDate?: string;
  changedDate?: string;
  stateChangeDate?: string;
  closedDate?: string;
  targetDate?: string;
  storyPoints?: number;
  effort?: number;
  remainingWork?: number;
  completedWork?: number;
  severity?: string;
  team?: string;
  sourceSheet: string;
  sourceRow: number;
}

export type HierarchySource = 'parent-field' | 'tree' | 'mixed' | 'none';

/** Uma importação = um retrato (snapshot) da query num instante. O histórico é a sequência de snapshots. */
export interface Snapshot {
  id: string;
  project: string;
  /** Rótulo do período/sprint (ex.: "Sprint 16"). */
  label: string;
  /** Data/hora da consolidação dos dados (quando a query foi executada). */
  referenceDate: string;
  importedAt: string;
  fileName: string;
  sheets: string[];
  items: WorkItem[];
  availableFields: CanonicalField[];
  hierarchySource: HierarchySource;
  warnings: string[];
  /** Texto refinado por IA (opcional), guardado junto do snapshot. */
  aiReading?: { text: string; model: string; createdAt: string };
}

// ---------------------------------------------------------------- Configuração

export type Category = 'done' | 'inProgress' | 'waiting' | 'blocked' | 'excluded';

export const CATEGORY_LABEL: Record<Category, string> = {
  done: 'Concluído',
  inProgress: 'Em andamento',
  waiting: 'Aguardando etapa',
  blocked: 'Bloqueado',
  excluded: 'Excluído da contagem',
};

export interface MacroStage {
  key: string;
  label: string;
  color: string;
  order: number;
}

export interface StateRule {
  macro: string;
  category: Category;
  order: number;
  /** true quando foi classificado automaticamente (heurística) e ainda não revisado pelo gestor. */
  auto?: boolean;
}

export type FrenteSource = 'areaPath' | 'iterationPath' | 'tagPrefix' | 'epicParent' | 'none';

export interface SprintDef {
  name: string;
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd
}

export interface ProjectConfig {
  project: string;
  macroStages: MacroStage[];
  /** chave = nome do estado exatamente como aparece no Azure DevOps */
  stateRules: Record<string, StateRule>;
  cardTypes: string[];
  bugTypes: string[];
  epicTypes: string[];
  featureTypes: string[];
  rowLevel: 'epic' | 'feature';
  frente: { source: FrenteSource; level: number; tagPrefix: string };
  blockedTags: string[];
  dependencyTags: string[];
  criticalBugSeverities: string[];
  staleDays: number;
  longDevDays: number;
  goalDate?: string;
  goalLabel: string;
  dateFormat: 'DMY' | 'MDY';
  sprints: SprintDef[];
  currentSprint?: string;
  rowRules: {
    /** Atenção quando houver ao menos N cards bloqueados (estado ou tag). */
    attentionBlocked: number;
    /** Atenção quando houver ao menos N cards parados há mais de staleDays. */
    attentionStale: number;
    /** Crítico quando % de cards bloqueados da linha ≥ valor. */
    criticalBlockedPct: number;
    /** Crítico quando a data-alvo (Target Date do épico/feature, ou meta global) venceu com itens abertos. */
    criticalWhenOverdue: boolean;
  };
  health: {
    criticalBlockedPct: number;
    criticalOverdueRows: number;
    criticalProjectionRatio: number;
    attentionRowsPct: number;
    attentionBlockedCount: number;
    attentionStalePct: number;
    attentionProjectionRatio: number;
  };
  insight: {
    homologAccumulationPct: number;
    concentrationPct: number;
    concentrationMinItems: number;
    highMaturityPct: number;
    lowEvolutionPct: number;
    maxPerPanel: number;
  };
  azureBaseUrl?: string;
  ai: { enabled: boolean; model: string };
}

// ---------------------------------------------------------------- Resultado calculado

export interface Enriched extends WorkItem {
  macro: string;
  category: Category;
  isBug: boolean;
  blockedTag: boolean;
  epicId?: number;
  featureId?: number;
  rowKey: string;
  frente: string;
  /** dias desde a última mudança de estado (ou alteração), se a data existir */
  idleDays?: number;
}

export interface MacroCount {
  macro: string;
  count: number;
}

export type Situation = 'done' | 'onTrack' | 'attention' | 'critical' | 'unlinked';

export interface RowMetrics {
  key: string;
  id?: number;
  title: string;
  frente: string;
  priority?: number;
  targetDate?: string;
  total: number;
  pbis: number;
  bugs: number;
  bugsOpen: number;
  done: number;
  pctDone: number;
  blocked: number;
  blockedTag: number;
  stale: number;
  byMacro: MacroCount[];
  situation: Situation;
  reasons: string[];
  items: Enriched[];
}

export interface GroupMetrics {
  frente: string;
  rows: RowMetrics[];
  total: number;
  done: number;
  pctDone: number;
}

export type Health = 'onTrack' | 'attention' | 'critical' | 'nd';

export type Level = 'POTENCIAL' | 'ALTO' | 'CRÍTICO';

export interface Insight {
  text: string;
  level?: Level;
  evidence?: string;
  impact?: string;
  action?: string;
  weight: number;
}

/** Valor numérico ou null = N/D (não calculável com os dados disponíveis). */
export type Num = number | null;
