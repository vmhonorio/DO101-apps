// Carrega as planilhas de exemplo (DADOS FICTÍCIOS) publicadas junto com a aplicação.
import { readWorkbook } from './excel';
import { previewImport, toSnapshot } from '../domain/pipeline';
import { defaultConfig } from '../domain/config';
import type { ProjectConfig, Snapshot } from '../domain/types';

export const DEMO_PROJECT = 'Exemplo CRM (fictício)';

async function load(file: string, label: string, ref: string): Promise<Snapshot> {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
  if (!res.ok) throw new Error(`Exemplo indisponível (${res.status})`);
  const sheets = readWorkbook(await res.arrayBuffer()).filter((s) => s.layout);
  const p = previewImport(sheets.map((s) => ({ name: s.name, rows: s.rows, layout: s.layout! })), 'DMY');
  return toSnapshot(p, { project: DEMO_PROJECT, label, referenceDate: new Date(ref).toISOString(), fileName: file, sheets: sheets.map((s) => s.name) });
}

export async function demoData(): Promise<{ snapshots: Snapshot[]; config: ProjectConfig }> {
  const snapshots = [
    await load('exemplo-sprint15.csv', 'Sprint 15', '2026-09-26T02:00:00'),
    await load('exemplo-sprint16.csv', 'Sprint 16', '2026-10-10T02:27:00'),
  ];
  const sprints = Array.from({ length: 20 }, (_, i) => {
    const st = new Date(Date.UTC(2026, 2, 2) + i * 14 * 86400000);
    return { name: `Sprint ${i + 1}`, start: st.toISOString().slice(0, 10), end: new Date(st.getTime() + 13 * 86400000).toISOString().slice(0, 10) };
  });
  return { snapshots, config: { ...defaultConfig(DEMO_PROJECT), sprints, currentSprint: 'Sprint 16', goalDate: '2026-11-17' } };
}
