import type { SheetLayout } from './fieldMapping';
import { consolidate, parseSheet, type ConsolidateResult, type RowError } from './parse';
import type { Snapshot } from './types';

export interface SheetInput {
  name: string;
  rows: unknown[][];
  layout: SheetLayout;
}

export interface ImportPreview extends ConsolidateResult {
  errors: RowError[];
  rowsRead: number;
  perSheet: { name: string; valid: number; errors: number; hierarchy: string }[];
}

export function previewImport(sheets: SheetInput[], dateFormat: 'DMY' | 'MDY'): ImportPreview {
  const parts = sheets.map((s) => ({ sheet: s.name, layout: s.layout, result: parseSheet(s.name, s.rows, s.layout, dateFormat) }));
  const c = consolidate(parts);
  return {
    ...c,
    errors: parts.flatMap((p) => p.result.errors),
    rowsRead: parts.reduce((s, p) => s + p.result.items.length + p.result.errors.filter((e) => !e.message.startsWith('Parent')).length, 0),
    perSheet: parts.map((p) => ({ name: p.sheet, valid: p.result.items.length, errors: p.result.errors.length, hierarchy: p.result.hierarchy })),
  };
}

export function toSnapshot(
  p: ImportPreview,
  meta: { project: string; label: string; referenceDate: string; fileName: string; sheets: string[] },
): Snapshot {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    project: meta.project.trim(),
    label: meta.label.trim(),
    referenceDate: meta.referenceDate,
    importedAt: new Date().toISOString(),
    fileName: meta.fileName,
    sheets: meta.sheets,
    items: p.items,
    availableFields: p.availableFields,
    hierarchySource: p.hierarchy,
    warnings: [
      ...p.warnings,
      ...(p.duplicates.length ? [`${p.duplicates.length} ID(s) duplicado(s) consolidados (mantido o registro mais recente).`] : []),
      ...(p.errors.length ? [`${p.errors.length} linha(s) ignorada(s)/ajustada(s) na validação.`] : []),
    ],
  };
}
