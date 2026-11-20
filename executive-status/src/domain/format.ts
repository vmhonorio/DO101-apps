import type { Num } from './types';

export const ND = 'N/D';
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtNum = (n: Num | undefined) => (n === null || n === undefined || !isFinite(n) ? ND : nf1.format(n));
export const fmtInt = (n: Num | undefined) => (n === null || n === undefined || !isFinite(n) ? ND : nf0.format(n));
export const fmtPct = (n: Num | undefined) => (n === null || n === undefined || !isFinite(n) ? ND : `${nf1.format(n)}%`);
export const fmtSigned = (n: Num | undefined) => (n === null || n === undefined ? ND : `${n >= 0 ? '+' : '−'}${nf0.format(Math.abs(n))}`);
export const pct = (part: number, total: number): Num => (total > 0 ? (part / total) * 100 : null);

export function fmtDate(iso?: string, withTime = false): string {
  if (!iso) return ND;
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return ND;
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export const fmtShortDate = (iso?: string) => (iso ? fmtDate(iso).slice(0, 5) : ND);

export const DAY = 86400000;
export const toDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
export const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);

export function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}
