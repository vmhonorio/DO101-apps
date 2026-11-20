import * as XLSX from 'xlsx';
import { detectLayout, type SheetLayout } from '../domain/fieldMapping';

export interface SheetInfo {
  name: string;
  rows: unknown[][];
  layout: SheetLayout | null;
}

/** Lê XLSX / XLS / CSV no navegador. As planilhas são mantidas como matriz bruta para permitir remapeamento manual. */
export function readWorkbook(data: ArrayBuffer): SheetInfo[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, dense: true });
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    return { name, rows, layout: detectLayout(rows) };
  });
}

export function downloadWorkbook(sheets: { name: string; rows: Record<string, unknown>[] }[], fileName: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}
