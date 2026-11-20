import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { readWorkbook } from '../data/excel';
import { defaultConfig, ensureStateRules, classifyState } from './config';
import { detectLayout } from './fieldMapping';
import { parseDate, parseId, parseSheet } from './parse';
import { previewImport, toSnapshot } from './pipeline';
import { computeReport, EMPTY_FILTERS, UNLINKED } from './metrics';
import { buildInsights } from './insights';
import type { ProjectConfig, Snapshot } from './types';

const buf = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function load(path: string, label: string, ref: string, dateFormat: 'DMY' | 'MDY' = 'DMY'): Snapshot {
  const sheets = readWorkbook(buf(path)).filter((s) => s.layout);
  const p = previewImport(sheets.map((s) => ({ name: s.name, rows: s.rows, layout: s.layout! })), dateFormat);
  return toSnapshot(p, { project: 'CRM', label, referenceDate: ref, fileName: path, sheets: sheets.map((s) => s.name) });
}

function cfgFor(s: Snapshot, patch: Partial<ProjectConfig> = {}) {
  return ensureStateRules({ ...defaultConfig('CRM'), ...patch }, s.items).cfg;
}

function aoaBuffer(aoa: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('conversores', () => {
  it('datas em vários formatos', () => {
    expect(parseDate('10/10/2026 02:27')!.slice(0, 10)).toBe(new Date(2026, 9, 10, 2, 27).toISOString().slice(0, 10));
    expect(new Date(parseDate('25/09/2026')!).getMonth()).toBe(8);
    expect(new Date(parseDate('09/25/2026', 'DMY')!).getDate()).toBe(25); // 25 > 12 => dia
    expect(new Date(parseDate('03/04/2026', 'MDY')!).getMonth()).toBe(2);
    expect(new Date(parseDate('3/4/2026 1:05 PM', 'MDY')!).getHours()).toBe(13);
    expect(parseDate('2026-10-01')).toBeDefined();
    expect(parseDate(46000)).toBeDefined(); // serial Excel
    expect(parseDate('31/02/2026')).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
  });
  it('ids', () => {
    expect(parseId('Feature 123: Título')).toBe(123);
    expect(parseId(77)).toBe(77);
    expect(parseId('')).toBeUndefined();
  });
  it('heurística de estados', () => {
    expect(classifyState('Aguardando Deploy UAT')).toMatchObject({ macro: 'homologacao', category: 'waiting' });
    expect(classifyState('Em Homolog (UAT)')).toMatchObject({ macro: 'homologacao', category: 'inProgress' });
    expect(classifyState('Pronto para Desenvolvimento')).toMatchObject({ macro: 'refinamento', category: 'waiting' });
    expect(classifyState('Code Review')).toMatchObject({ macro: 'desenvolvimento', category: 'inProgress' });
    expect(classifyState('Para PROD')).toMatchObject({ macro: 'implantacao', category: 'waiting' });
    expect(classifyState('Em Ref. Técnico')).toMatchObject({ macro: 'refinamento' });
    expect(classifyState('Done').category).toBe('done');
    expect(classifyState('Bloqueado').category).toBe('blocked');
    expect(classifyState('Removed').category).toBe('excluded');
    expect(classifyState('Xyz').recognized).toBe(false);
  });
});

describe('cabeçalhos e hierarquia', () => {
  it('detecta cabeçalho após linhas de metadados e sinônimos PT-BR', () => {
    const rows = [['Project: X'], ['Query: Y'], [], ['ID', 'Tipo de Item de Trabalho', 'Título', 'Estado', 'Pai'], [1, 'Epic', 'E', 'New', '']];
    const l = detectLayout(rows)!;
    expect(l.headerRow).toBe(3);
    expect(l.mapping).toMatchObject({ id: 0, type: 1, title: 2, state: 3, parent: 4 });
  });
  it('infere pai pela árvore (Title 1/2/3) e valida obrigatórios', () => {
    const rows = [
      ['ID', 'Work Item Type', 'Title 1', 'Title 2', 'Title 3', 'State'],
      [1, 'Epic', 'E1', '', '', 'New'],
      [2, 'Feature', '', 'F1', '', 'New'],
      [3, 'Product Backlog Item', '', '', 'P1', 'Done'],
      [4, 'Feature', '', 'F2', '', 'New'],
      [5, 'Bug', '', '', 'B1', 'New'],
      [6, 'Bug', '', '', '', ''], // inválida
    ];
    const r = parseSheet('S', rows, detectLayout(rows)!, 'DMY');
    expect(r.hierarchy).toBe('tree');
    expect(r.items.find((i) => i.id === 3)!.parentId).toBe(2);
    expect(r.items.find((i) => i.id === 5)!.parentId).toBe(4);
    expect(r.items.find((i) => i.id === 4)!.parentId).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].row).toBe(7);
  });
  it('não presume vínculo: pai fora da exportação => sem vínculo + aviso; ciclo não trava', () => {
    const b = aoaBuffer([
      ['ID', 'Work Item Type', 'Title', 'State', 'Parent'],
      [10, 'Epic', 'E', 'New', ''],
      [11, 'Product Backlog Item', 'A', 'New', 10],
      [12, 'Product Backlog Item', 'B', 'New', 999],
      [13, 'Product Backlog Item', 'C', 'New', 14],
      [14, 'Product Backlog Item', 'D', 'Done', 13],
    ]);
    const sheets = readWorkbook(b);
    const p = previewImport([{ name: 'S1', rows: sheets[0].rows, layout: sheets[0].layout! }], 'DMY');
    expect(p.warnings.join(' ')).toMatch(/pai que não está na exportação/);
    const s = toSnapshot(p, { project: 'P', label: 'L', referenceDate: new Date().toISOString(), fileName: 'x', sheets: ['S1'] });
    const m = computeReport(s, cfgFor(s));
    expect(m.cards.find((c) => c.id === 11)!.epicId).toBe(10);
    expect(m.cards.find((c) => c.id === 12)!.rowKey).toBe(UNLINKED);
    expect(m.cards.find((c) => c.id === 13)!.rowKey).toBe(UNLINKED);
    expect(m.kpi.unlinked).toBe(3);
  });
});

describe('planilha completa (flat + Parent, PT-BR, 3 abas, duplicado)', () => {
  const s16 = load('samples/crm-sprint16-flat-parent.xlsx', 'Sprint 16', new Date('2026-10-10T02:27:00').toISOString());
  const s15 = load('samples/crm-sprint15-flat-parent.xlsx', 'Sprint 15', new Date('2026-09-26T02:00:00').toISOString());
  const sprints = Array.from({ length: 17 }, (_, i) => {
    const st = new Date(Date.UTC(2026, 2, 2) + i * 14 * 86400000);
    const en = new Date(st.getTime() + 13 * 86400000);
    return { name: `Sprint ${i + 1}`, start: st.toISOString().slice(0, 10), end: en.toISOString().slice(0, 10) };
  });
  const cfg = cfgFor(s16, { goalDate: '2026-11-17', sprints, currentSprint: 'Sprint 16' });

  it('importa, consolida duplicados e identifica hierarquia', () => {
    expect(s16.hierarchySource).toBe('parent-field');
    expect(s16.warnings.join(' ')).toMatch(/duplicado/);
    expect(new Set(s16.items.map((i) => i.id)).size).toBe(s16.items.length);
    expect(s16.availableFields).toEqual(expect.arrayContaining(['closedDate', 'changedDate', 'assignedTo', 'tags']));
    // e-mail removido do "Atribuído a"
    expect(s16.items.some((i) => i.assignedTo?.includes('<'))).toBe(false);
  });

  it('categorias são mutuamente exclusivas e somam o total', () => {
    const m = computeReport(s16, cfg, EMPTY_FILTERS, s15);
    const k = m.kpi;
    expect(k.done + k.inProgress + k.waiting + k.blocked).toBe(k.total);
    expect(k.pbis + k.bugs).toBe(k.total);
    expect(m.states.reduce((s, x) => s + x.count, 0)).toBe(k.total);
    expect(m.groups.reduce((s, g) => s + g.total, 0)).toBe(k.total);
    expect(m.rows.reduce((s, r) => s + r.byMacro.reduce((a, b) => a + b.count, 0), 0)).toBe(k.total);
    const rs = m.rowSummary;
    expect(rs.done + rs.onTrack + rs.attention + rs.critical).toBe(rs.total);
    expect(k.unlinked).toBe(25);
    expect(m.comparison!.total).toBeLessThan(k.total);
    expect(m.period.doneInPeriod).not.toBeNull();
    expect(m.period.throughput).not.toBeNull();
    expect(['onTrack', 'attention', 'critical']).toContain(m.health.value);
    expect(m.health.reasons.length).toBeGreaterThan(0);
  });

  it('filtros recalculam tudo', () => {
    const m = computeReport(s16, cfg, { ...EMPTY_FILTERS, kind: 'bug' });
    expect(m.kpi.pbis).toBe(0);
    expect(m.kpi.bugs).toBe(m.kpi.total);
    const f = computeReport(s16, cfg, { ...EMPTY_FILTERS, frentes: ['PROTOCOLOS'] });
    expect(f.groups.map((g) => g.frente)).toEqual(['PROTOCOLOS']);
  });

  it('insights sempre com evidência numérica', () => {
    const m = computeReport(s16, cfg, EMPTY_FILTERS, s15);
    const ins = buildInsights(m);
    expect(ins.advances.length).toBeGreaterThan(0);
    for (const i of [...ins.advances, ...ins.attention, ...ins.risks]) expect(i.text).toMatch(/\d/);
    for (const r of ins.risks) expect(['POTENCIAL', 'ALTO', 'CRÍTICO']).toContain(r.level);
    expect(ins.reading).toMatch(/cards concluídos/);
  });

  it('meta vencida torna linhas críticas', () => {
    const late = { ...cfg, goalDate: '2026-01-01' };
    const m = computeReport(s16, late);
    expect(m.rowSummary.critical).toBeGreaterThan(0);
    expect(m.health.value).toBe('critical');
  });
});

describe('outros formatos', () => {
  it('query em árvore, cabeçalhos EN, datas ISO', () => {
    const s = load('samples/tree-query-en.xlsx', 'T', new Date('2026-10-10').toISOString());
    expect(s.hierarchySource).toBe('tree');
    const m = computeReport(s, cfgFor(s));
    expect(m.kpi.epics).toBeGreaterThan(0);
    expect(m.kpi.unlinked).toBe(0);
    expect(m.kpi.stale).not.toBeNull();
  });
  it('CSV mínimo: sem hierarquia/datas => N/D, Removed excluído, estados Agile', () => {
    const s = load('samples/minimal-agile.csv', 'M', new Date().toISOString());
    expect(s.hierarchySource).toBe('none');
    const cfg = cfgFor(s);
    expect(cfg.stateRules['Active']).toMatchObject({ macro: 'desenvolvimento', category: 'inProgress' });
    expect(cfg.stateRules['Closed'].category).toBe('done');
    const m = computeReport(s, cfg);
    expect(m.kpi.features).toBeNull();
    expect(m.kpi.stale).toBeNull();
    expect(m.period.doneInPeriod).toBeNull();
    expect(m.excluded).toBe(s.items.filter((i) => i.state === 'Removed').length);
    expect(m.kpi.total + m.excluded).toBe(60);
    const ins = buildInsights(m);
    expect(ins.reading).toMatch(/cards concluídos/);
  });
});
