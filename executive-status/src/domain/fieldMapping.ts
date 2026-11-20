import type { CanonicalField } from './types';

export interface FieldDef {
  key: CanonicalField;
  label: string;
  required?: boolean;
  /** sinônimos normalizados (minúsculas, sem acento, sem pontuação) — EN e PT-BR */
  synonyms: string[];
}

export const FIELD_DEFS: FieldDef[] = [
  { key: 'id', label: 'ID', required: true, synonyms: ['id', 'work item id', 'system id', 'identificacao'] },
  { key: 'type', label: 'Work Item Type', required: true, synonyms: ['work item type', 'type', 'tipo', 'tipo de item de trabalho', 'system workitemtype', 'workitemtype'] },
  { key: 'title', label: 'Title', required: true, synonyms: ['title', 'titulo', 'system title', 'nome'] },
  { key: 'state', label: 'State', required: true, synonyms: ['state', 'estado', 'status', 'system state', 'situacao'] },
  { key: 'assignedTo', label: 'Assigned To', synonyms: ['assigned to', 'atribuido a', 'responsavel', 'system assignedto'] },
  { key: 'areaPath', label: 'Area Path', synonyms: ['area path', 'caminho da area', 'area', 'system areapath'] },
  { key: 'iterationPath', label: 'Iteration Path', synonyms: ['iteration path', 'caminho da iteracao', 'iteracao', 'sprint', 'system iterationpath'] },
  { key: 'priority', label: 'Priority', synonyms: ['priority', 'prioridade', 'backlog priority', 'microsoft vsts common priority'] },
  { key: 'parent', label: 'Parent', synonyms: ['parent', 'pai', 'parent id', 'system parent', 'item pai'] },
  { key: 'tags', label: 'Tags', synonyms: ['tags', 'marcas', 'etiquetas', 'system tags'] },
  { key: 'createdDate', label: 'Created Date', synonyms: ['created date', 'data de criacao', 'criado em', 'system createddate'] },
  { key: 'changedDate', label: 'Changed Date', synonyms: ['changed date', 'data de alteracao', 'alterado em', 'system changeddate'] },
  { key: 'stateChangeDate', label: 'State Change Date', synonyms: ['state change date', 'data de alteracao do estado', 'microsoft vsts common statechangedate'] },
  { key: 'closedDate', label: 'Closed Date', synonyms: ['closed date', 'data de fechamento', 'data de conclusao', 'microsoft vsts common closeddate'] },
  { key: 'targetDate', label: 'Target Date', synonyms: ['target date', 'data alvo', 'data de destino', 'data meta', 'due date', 'microsoft vsts scheduling targetdate'] },
  { key: 'storyPoints', label: 'Story Points', synonyms: ['story points', 'pontos de historia', 'microsoft vsts scheduling storypoints'] },
  { key: 'effort', label: 'Effort', synonyms: ['effort', 'esforco', 'microsoft vsts scheduling effort'] },
  { key: 'remainingWork', label: 'Remaining Work', synonyms: ['remaining work', 'trabalho restante'] },
  { key: 'completedWork', label: 'Completed Work', synonyms: ['completed work', 'trabalho concluido'] },
  { key: 'severity', label: 'Severity', synonyms: ['severity', 'severidade'] },
  { key: 'team', label: 'Team / Equipe', synonyms: ['team', 'equipe', 'time', 'squad'] },
];

export const FIELD_LABEL: Record<CanonicalField, string> = Object.fromEntries(
  FIELD_DEFS.map((f) => [f.key, f.label]),
) as Record<CanonicalField, string>;

export function normHeader(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[._\-/\\()[\]:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Colunas "Title 1", "Title 2"... de queries em árvore (Tree of work items). */
export function treeLevel(header: string): number | null {
  const m = /^(?:title|titulo)\s*(\d+)$/.exec(normHeader(header));
  return m ? Number(m[1]) : null;
}

export function matchField(header: string): CanonicalField | null {
  const n = normHeader(header);
  if (!n) return null;
  for (const f of FIELD_DEFS) if (f.synonyms.includes(n)) return f.key;
  return null;
}

export type ColumnMapping = Partial<Record<CanonicalField, number>>;

export interface SheetLayout {
  headerRow: number; // índice (0-based) da linha de cabeçalho
  headers: string[];
  mapping: ColumnMapping;
  treeColumns: { level: number; col: number }[];
  score: number;
}

/**
 * Detecta a linha de cabeçalho: varre as 30 primeiras linhas e escolhe a que reconhece mais campos.
 * Exportações do plugin Excel do Azure DevOps costumam ter linhas de metadados (Project, Server, Query) antes da tabela.
 */
export function detectLayout(rows: unknown[][]): SheetLayout | null {
  let best: SheetLayout | null = null;
  const limit = Math.min(rows.length, 30);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    const headers = row.map((c) => String(c ?? '').trim());
    const mapping: ColumnMapping = {};
    const treeColumns: { level: number; col: number }[] = [];
    headers.forEach((h, col) => {
      const lvl = treeLevel(h);
      if (lvl !== null) {
        treeColumns.push({ level: lvl, col });
        return;
      }
      const f = matchField(h);
      if (f && mapping[f] === undefined) mapping[f] = col;
    });
    let score = Object.keys(mapping).length + (treeColumns.length ? 1 : 0);
    if (mapping.id !== undefined) score += 2;
    if (score >= 3 && (!best || score > best.score)) {
      best = { headerRow: r, headers, mapping, treeColumns: treeColumns.sort((a, b) => a.level - b.level), score };
    }
  }
  return best;
}

/** Recalcula o layout a partir de uma linha de cabeçalho escolhida manualmente. */
export function layoutFromRow(rows: unknown[][], headerRow: number): SheetLayout {
  const headers = (rows[headerRow] ?? []).map((c) => String(c ?? '').trim());
  const mapping: ColumnMapping = {};
  const treeColumns: { level: number; col: number }[] = [];
  headers.forEach((h, col) => {
    const lvl = treeLevel(h);
    if (lvl !== null) treeColumns.push({ level: lvl, col });
    else {
      const f = matchField(h);
      if (f && mapping[f] === undefined) mapping[f] = col;
    }
  });
  return { headerRow, headers, mapping, treeColumns: treeColumns.sort((a, b) => a.level - b.level), score: Object.keys(mapping).length };
}
