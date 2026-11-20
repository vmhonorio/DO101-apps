import type { CanonicalField, HierarchySource, WorkItem } from './types';
import type { SheetLayout } from './fieldMapping';

// ------------------------------------------------------------ conversores de valor

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export function parseDate(v: unknown, fmt: 'DMY' | 'MDY' = 'DMY'): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v.toISOString();
  if (typeof v === 'number') {
    if (v < 1 || v > 2958465) return undefined;
    return new Date(EXCEL_EPOCH + v * 86400000).toISOString();
  }
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    // desambiguação: se um dos lados > 12 ele é o dia; caso contrário usa o formato configurado
    let day: number, month: number;
    if (a > 12) [day, month] = [a, b];
    else if (b > 12) [day, month] = [b, a];
    else [day, month] = fmt === 'DMY' ? [a, b] : [b, a];
    let h = m[4] ? Number(m[4]) : 0;
    const min = m[5] ? Number(m[5]) : 0;
    const sec = m[6] ? Number(m[6]) : 0;
    if (m[7]) {
      const pm = m[7].toUpperCase() === 'PM';
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    const d = new Date(year, month - 1, day, h, min, sec);
    return isNaN(d.getTime()) || d.getMonth() !== month - 1 ? undefined : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  let s = String(v).trim();
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : undefined;
}

/** Extrai o primeiro inteiro (aceita "123", "Feature 123: Título", "#123"). */
export function parseId(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : undefined;
  const m = /(\d+)/.exec(String(v ?? ''));
  return m ? Number(m[1]) : undefined;
}

export function parseTags(v: unknown): string[] {
  return String(v ?? '')
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function cleanPerson(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  return s.replace(/\s*<[^>]+>\s*$/, '').trim() || s;
}

function str(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  return s ? s : undefined;
}

// ------------------------------------------------------------ normalização de uma planilha

export interface RowError {
  sheet: string;
  row: number; // linha 1-based como no Excel
  message: string;
}

export interface SheetParseResult {
  items: WorkItem[];
  errors: RowError[];
  hierarchy: HierarchySource;
  emptyRows: number;
}

export function parseSheet(
  sheet: string,
  rows: unknown[][],
  layout: SheetLayout,
  dateFormat: 'DMY' | 'MDY',
): SheetParseResult {
  const { mapping, treeColumns, headerRow } = layout;
  const get = (row: unknown[], f: CanonicalField) => (mapping[f] === undefined ? undefined : row[mapping[f]!]);
  const items: WorkItem[] = [];
  const errors: RowError[] = [];
  let emptyRows = 0;
  const treeStack: number[] = []; // treeStack[level-1] = id do último item naquele nível
  let usedTree = false;
  let usedParent = false;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      emptyRows++;
      continue;
    }
    const excelRow = r + 1;
    // título: coluna Title, ou a coluna "Title N" preenchida (árvore)
    let title = str(get(row, 'title'));
    let level: number | null = null;
    for (const tc of treeColumns) {
      const t = str(row[tc.col]);
      if (t) {
        level = tc.level;
        if (!title) title = t;
        break;
      }
    }
    const id = parseId(get(row, 'id'));
    const type = str(get(row, 'type'));
    const state = str(get(row, 'state'));
    const missing: string[] = [];
    if (!id) missing.push('ID');
    if (!type) missing.push('Work Item Type');
    if (!state) missing.push('State');
    if (!title) missing.push('Title');
    if (missing.length) {
      errors.push({ sheet, row: excelRow, message: `Campo(s) obrigatório(s) ausente(s) ou inválido(s): ${missing.join(', ')}` });
      continue;
    }

    let parentId: number | undefined;
    let parentSource: WorkItem['parentSource'];
    const pRaw = get(row, 'parent');
    if (pRaw !== undefined && String(pRaw).trim() !== '') {
      parentId = parseId(pRaw);
      if (parentId) {
        parentSource = 'parent-field';
        usedParent = true;
      } else errors.push({ sheet, row: excelRow, message: `Parent inválido: "${String(pRaw)}" (ignorado)` });
    }
    if (level !== null) {
      treeStack.length = level - 1;
      treeStack[level - 1] = id!;
      if (!parentId && level > 1 && treeStack[level - 2]) {
        parentId = treeStack[level - 2];
        parentSource = 'tree';
        usedTree = true;
      }
    }

    items.push({
      id: id!,
      type: type!,
      title: title!,
      state: state!,
      assignedTo: cleanPerson(get(row, 'assignedTo')),
      areaPath: str(get(row, 'areaPath')),
      iterationPath: str(get(row, 'iterationPath')),
      priority: parseNumber(get(row, 'priority')),
      parentId,
      parentSource,
      tags: parseTags(get(row, 'tags')),
      createdDate: parseDate(get(row, 'createdDate'), dateFormat),
      changedDate: parseDate(get(row, 'changedDate'), dateFormat),
      stateChangeDate: parseDate(get(row, 'stateChangeDate'), dateFormat),
      closedDate: parseDate(get(row, 'closedDate'), dateFormat),
      targetDate: parseDate(get(row, 'targetDate'), dateFormat),
      storyPoints: parseNumber(get(row, 'storyPoints')),
      effort: parseNumber(get(row, 'effort')),
      remainingWork: parseNumber(get(row, 'remainingWork')),
      completedWork: parseNumber(get(row, 'completedWork')),
      severity: str(get(row, 'severity')),
      team: str(get(row, 'team')),
      sourceSheet: sheet,
      sourceRow: excelRow,
    });
  }
  const hierarchy: HierarchySource = usedTree && usedParent ? 'mixed' : usedTree ? 'tree' : usedParent ? 'parent-field' : 'none';
  return { items, errors, hierarchy, emptyRows };
}

// ------------------------------------------------------------ consolidação de várias planilhas

export interface Duplicate {
  id: number;
  occurrences: { sheet: string; row: number; state: string }[];
  kept: { sheet: string; row: number };
}

export interface ConsolidateResult {
  items: WorkItem[];
  duplicates: Duplicate[];
  hierarchy: HierarchySource;
  availableFields: CanonicalField[];
  warnings: string[];
}

/**
 * Une itens de várias planilhas. Duplicados (mesmo ID) são resolvidos mantendo o registro com
 * Changed Date mais recente (ou o último lido, quando a data não existir). Pais de árvore e de coluna
 * Parent são mesclados sem sobrescrever um pai explícito.
 */
export function consolidate(parts: { sheet: string; result: SheetParseResult; layout: SheetLayout }[]): ConsolidateResult {
  const byId = new Map<number, WorkItem>();
  const occ = new Map<number, WorkItem[]>();
  const warnings: string[] = [];
  const fields = new Set<CanonicalField>();
  const hs = new Set<HierarchySource>();
  for (const p of parts) {
    Object.keys(p.layout.mapping).forEach((k) => fields.add(k as CanonicalField));
    if (p.layout.treeColumns.length) fields.add('title');
    if (p.result.hierarchy !== 'none') hs.add(p.result.hierarchy);
    for (const it of p.result.items) {
      const list = occ.get(it.id) ?? [];
      list.push(it);
      occ.set(it.id, list);
      const cur = byId.get(it.id);
      if (!cur) {
        byId.set(it.id, it);
        continue;
      }
      const newer = (it.changedDate ?? '') >= (cur.changedDate ?? '');
      const keep = newer ? { ...it } : { ...cur };
      const other = newer ? cur : it;
      if (!keep.parentId && other.parentId) {
        keep.parentId = other.parentId;
        keep.parentSource = other.parentSource;
      }
      byId.set(it.id, keep);
    }
  }
  const duplicates: Duplicate[] = [];
  for (const [id, list] of occ) {
    if (list.length > 1) {
      const kept = byId.get(id)!;
      duplicates.push({
        id,
        occurrences: list.map((x) => ({ sheet: x.sourceSheet, row: x.sourceRow, state: x.state })),
        kept: { sheet: kept.sourceSheet, row: kept.sourceRow },
      });
      const states = new Set(list.map((x) => x.state));
      if (states.size > 1) warnings.push(`ID ${id} aparece com estados diferentes (${[...states].join(' / ')}); mantido o registro mais recente.`);
    }
  }
  if (hs.has('parent-field')) fields.add('parent');
  const items = [...byId.values()];
  const ids = new Set(items.map((i) => i.id));
  const orphanParents = items.filter((i) => i.parentId && !ids.has(i.parentId)).length;
  if (orphanParents)
    warnings.push(`${orphanParents} item(ns) apontam para um pai que não está na exportação; o vínculo não é presumido (ficam em "Sem vínculo" se nenhum ancestral exportado for Épico/Feature).`);
  const hierarchy: HierarchySource = hs.size === 0 ? 'none' : hs.size > 1 ? 'mixed' : [...hs][0];
  if (hierarchy === 'none') warnings.push('Nenhuma hierarquia identificada (sem coluna Parent nem colunas Title 1/2/3). A análise por Épico/Feature ficará como N/D.');
  // campos presentes mas sem nenhum valor preenchido não contam como disponíveis
  const check: [CanonicalField, (i: WorkItem) => unknown][] = [
    ['changedDate', (i) => i.changedDate], ['stateChangeDate', (i) => i.stateChangeDate], ['closedDate', (i) => i.closedDate],
    ['createdDate', (i) => i.createdDate], ['targetDate', (i) => i.targetDate], ['assignedTo', (i) => i.assignedTo],
    ['areaPath', (i) => i.areaPath], ['tags', (i) => (i.tags.length ? 1 : undefined)], ['priority', (i) => i.priority],
  ];
  for (const [f, g] of check) if (fields.has(f) && !items.some((i) => g(i) !== undefined)) fields.delete(f);
  return { items, duplicates, hierarchy, availableFields: [...fields], warnings };
}
