import * as XLSX from 'xlsx';
import { detectLayout, type SheetLayout } from '../domain/fieldMapping';

export interface SheetInfo {
  name: string;
  rows: unknown[][];
  layout: SheetLayout | null;
}

/** Lê XLSX / XLS / CSV no navegador. As planilhas são mantidas como matriz bruta para permitir remapeamento manual. */
export function readWorkbook(data: ArrayBuffer): SheetInfo[] {
  const b = new Uint8Array(data);
  const isZip = b[0] === 0x50 && b[1] === 0x4b; // .xlsx
  const isOle = b[0] === 0xd0 && b[1] === 0xcf; // .xls
  let wb: XLSX.WorkBook;
  if (isZip || isOle) wb = XLSX.read(data, { type: 'array', cellDates: true, dense: true });
  else {
    // CSV/texto: decodificar explicitamente (exportações do Azure DevOps são UTF-8, às vezes com BOM;
    // arquivos salvos pelo Excel em PT-BR podem estar em Windows-1252)
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(b);
    } catch {
      text = new TextDecoder('windows-1252').decode(b);
    }
    wb = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string', cellDates: true, dense: true, raw: true });
  }
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
