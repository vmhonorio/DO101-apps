import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { readWorkbook, type SheetInfo } from '../data/excel';
import { FIELD_DEFS, layoutFromRow, type SheetLayout } from '../domain/fieldMapping';
import { previewImport, toSnapshot } from '../domain/pipeline';
import type { CanonicalField } from '../domain/types';
import { fmtDate } from '../domain/format';
import { useStore } from '../store';
import { Badge, Button, Card, Field, Input, Select } from '../ui/primitives';
import { cn } from '../ui/cn';

const pad = (n: number) => String(n).padStart(2, '0');
const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function ImportPage({ go }: { go: (r: string) => void }) {
  const { project, projects, saveSnapshot, config } = useStore();
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [layouts, setLayouts] = useState<Record<string, SheetLayout>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState('');
  const [dateFormat, setDateFormat] = useState<'DMY' | 'MDY'>(config?.dateFormat ?? 'DMY');
  const [proj, setProj] = useState(project ?? '');
  const [label, setLabel] = useState('');
  const [refDate, setRefDate] = useState(localNow());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const onFile = async (f: File) => {
    setError('');
    try {
      const info = readWorkbook(await f.arrayBuffer());
      setFileName(f.name);
      setSheets(info);
      const l: Record<string, SheetLayout> = {};
      info.forEach((s) => { if (s.layout) l[s.name] = s.layout; });
      setLayouts(l);
      const sel = info.filter((s) => s.layout).map((s) => s.name);
      setSelected(sel);
      setActive(sel[0] ?? info[0]?.name ?? '');
      if (!sel.length) setError('Nenhuma aba com cabeçalho reconhecível. Selecione a aba e informe a linha do cabeçalho manualmente.');
    } catch (e) {
      setError(`Não foi possível ler o arquivo: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const inputs = selected.filter((n) => layouts[n]).map((n) => ({ name: n, rows: sheets.find((s) => s.name === n)!.rows, layout: layouts[n] }));
  const preview = useMemo(() => (inputs.length ? previewImport(inputs, dateFormat) : null), [JSON.stringify(selected), layouts, dateFormat, sheets]); // eslint-disable-line react-hooks/exhaustive-deps

  // sugestões de metadados a partir dos dados (o gestor confirma)
  const suggestion = useMemo(() => {
    if (!preview) return { project: '', label: '' };
    const root = preview.items.map((i) => i.areaPath?.split(/[\\/]/)[0]).find(Boolean) ?? fileName.replace(/\.[^.]+$/, '');
    const it = new Map<string, number>();
    preview.items.forEach((i) => { const leaf = i.iterationPath?.split(/[\\/]/).pop(); if (leaf && /sprint|itera/i.test(leaf)) it.set(leaf, (it.get(leaf) ?? 0) + 1); });
    const leaf = [...it.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return { project: root, label: leaf ?? `Importação ${fmtDate(new Date().toISOString())}` };
  }, [preview, fileName]);

  const sheet = sheets.find((s) => s.name === active);
  const layout = layouts[active];
  const required = FIELD_DEFS.filter((f) => f.required).map((f) => f.key);
  const missingReq = (l?: SheetLayout) => (l ? required.filter((k) => l.mapping[k] === undefined && !(k === 'title' && l.treeColumns.length)) : required);
  const blocking = inputs.some((i) => missingReq(i.layout).length > 0);

  const setMap = (field: CanonicalField, col: string) => {
    const l = { ...layout, mapping: { ...layout.mapping } };
    if (col === '') delete l.mapping[field];
    else l.mapping[field] = Number(col);
    setLayouts({ ...layouts, [active]: l });
  };

  const doImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const snap = toSnapshot(preview, {
        project: proj || suggestion.project, label: label || suggestion.label, referenceDate: new Date(refDate).toISOString(), fileName, sheets: selected,
      });
      await saveSnapshot(snap);
      go('report');
    } catch (e) {
      setError(String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <Card title="1. Arquivo exportado do Azure DevOps">
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
          className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center', drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50')}>
          <Upload className="text-blue-600" />
          <span className="font-semibold">{fileName || 'Arraste a planilha aqui ou clique para selecionar'}</span>
          <span className="text-xs text-slate-500">XLSX, XLS ou CSV — resultado de uma Query (flat com coluna Parent, ou árvore com colunas Title 1, Title 2…). O arquivo é processado localmente no navegador.</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        </label>
        {error && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-700"><AlertTriangle size={16} /> {error}</p>}
      </Card>

      {sheets.length > 0 && (
        <Card title="2. Planilhas e mapeamento de colunas">
          <div className="mb-3 flex flex-wrap gap-2">
            {sheets.map((s) => (
              <div key={s.name} className={cn('flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm', active === s.name ? 'border-blue-500 bg-blue-50' : 'border-slate-200')}>
                <input type="checkbox" checked={selected.includes(s.name)}
                  onChange={(e) => {
                    if (e.target.checked && !layouts[s.name]) setLayouts({ ...layouts, [s.name]: layoutFromRow(s.rows, 0) });
                    setSelected(e.target.checked ? [...selected, s.name] : selected.filter((x) => x !== s.name));
                  }} />
                <button className="flex items-center gap-1.5 font-semibold" onClick={() => { if (!layouts[s.name]) setLayouts({ ...layouts, [s.name]: layoutFromRow(s.rows, 0) }); setActive(s.name); }}>
                  <FileSpreadsheet size={15} /> {s.name}
                </button>
                <span className="text-xs text-slate-500">{s.rows.length} linhas</span>
                {s.layout ? <Badge className="bg-green-100 text-green-800">cabeçalho detectado</Badge> : <Badge className="bg-amber-100 text-amber-800">sem cabeçalho</Badge>}
              </div>
            ))}
            <Field label="Formato de data ambíguo" className="ml-auto">
              <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as 'DMY' | 'MDY')}>
                <option value="DMY">dd/mm/aaaa (pt-BR)</option>
                <option value="MDY">mm/dd/aaaa (en-US)</option>
              </Select>
            </Field>
          </div>
          {sheet && layout && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <div className="mb-2 flex items-end gap-3">
                  <Field label="Linha do cabeçalho">
                    <Input type="number" min={1} value={layout.headerRow + 1} className="w-24"
                      onChange={(e) => setLayouts({ ...layouts, [active]: layoutFromRow(sheet.rows, Math.max(0, Number(e.target.value) - 1)) })} />
                  </Field>
                  <span className="pb-2 text-xs text-slate-500">
                    {layout.treeColumns.length ? `Query em árvore: colunas ${layout.treeColumns.map((t) => layout.headers[t.col]).join(', ')} definem a hierarquia.` : 'Hierarquia via coluna Parent (se mapeada).'}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th className="py-1">Campo</th><th>Coluna da planilha</th><th>Exemplo</th></tr></thead>
                  <tbody>
                    {FIELD_DEFS.map((f) => {
                      const col = layout.mapping[f.key];
                      const sample = col !== undefined ? sheet.rows.slice(layout.headerRow + 1).find((r) => r?.[col] != null && r[col] !== '')?.[col] : undefined;
                      const treeTitle = f.key === 'title' && col === undefined && layout.treeColumns.length > 0;
                      return (
                        <tr key={f.key} className="border-b border-slate-100">
                          <td className="py-1 pr-2">{f.label}{f.required && <span className="text-red-600"> *</span>}</td>
                          <td className="py-1 pr-2">
                            <Select value={col ?? ''} onChange={(e) => setMap(f.key, e.target.value)} className={cn('h-8 w-full', f.required && col === undefined && !treeTitle && 'border-red-400')}>
                              <option value="">{treeTitle ? '— (Title 1, 2, 3…) —' : '— não mapeado (N/D) —'}</option>
                              {layout.headers.map((h, i) => <option key={i} value={i}>{h || `(coluna ${i + 1})`}</option>)}
                            </Select>
                          </td>
                          <td className="max-w-[180px] truncate py-1 text-xs text-slate-500">{sample instanceof Date ? sample.toLocaleString('pt-BR') : sample !== undefined ? String(sample) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="min-w-0">
                <h3 className="mb-1 text-sm font-bold text-navy-900">Prévia dos dados brutos ({active})</h3>
                <div className="max-h-[520px] overflow-auto rounded border">
                  <table className="text-xs">
                    <tbody>
                      {sheet.rows.slice(0, 40).map((r, i) => (
                        <tr key={i} className={cn('border-b', i === layout.headerRow && 'bg-blue-100 font-bold', i < layout.headerRow && 'text-slate-400')}>
                          <td className="bg-slate-50 px-1 text-slate-400">{i + 1}</td>
                          {(r ?? []).slice(0, 14).map((c, j) => <td key={j} className="max-w-[160px] truncate whitespace-nowrap px-1.5 py-0.5">{c instanceof Date ? c.toLocaleString('pt-BR') : String(c ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {preview && (
        <Card title="3. Validação e prévia">
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ['Registros válidos', preview.items.length, 'text-green-700'],
              ['Linhas com erro', preview.errors.length, preview.errors.length ? 'text-red-700' : 'text-slate-700'],
              ['IDs duplicados', preview.duplicates.length, preview.duplicates.length ? 'text-amber-700' : 'text-slate-700'],
              ['Hierarquia', { 'parent-field': 'Coluna Parent', tree: 'Árvore (Title N)', mixed: 'Parent + árvore', none: 'Ausente (N/D)' }[preview.hierarchy], preview.hierarchy === 'none' ? 'text-amber-700' : 'text-slate-700'],
              ['Tipos', [...new Set(preview.items.map((i) => i.type))].length, 'text-slate-700'],
            ].map(([k, v, c]) => (
              <div key={k as string} className="rounded border border-slate-200 p-3"><div className="text-xs text-slate-500">{k}</div><div className={cn('text-xl font-bold', c as string)}>{v}</div></div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="text-sm">
              <p className="font-semibold">Campos disponíveis: <span className="font-normal">{preview.availableFields.join(', ')}</span></p>
              <p className="mt-1 text-slate-600">Campos ausentes geram indicadores “N/D” (ex.: sem Closed Date não há entregas por sprint; sem Changed Date não há cards parados).</p>
              <p className="mt-1">Tipos: {Object.entries(preview.items.reduce<Record<string, number>>((a, i) => ((a[i.type] = (a[i.type] ?? 0) + 1), a), {})).map(([t, n]) => `${t} (${n})`).join(' · ')}</p>
              <p className="mt-1">Estados: {[...new Set(preview.items.map((i) => i.state))].join(' · ')}</p>
              {preview.warnings.map((w, i) => <p key={i} className="mt-1 flex gap-1.5 text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}</p>)}
            </div>
            <div className="max-h-48 overflow-auto rounded border text-xs">
              {preview.errors.length === 0 && preview.duplicates.length === 0 && <p className="flex items-center gap-1.5 p-3 text-green-700"><CheckCircle2 size={14} /> Nenhum erro de validação.</p>}
              {preview.errors.slice(0, 200).map((e, i) => <div key={i} className="border-b px-2 py-1"><b>{e.sheet}</b> linha {e.row}: {e.message}</div>)}
              {preview.duplicates.slice(0, 100).map((d) => <div key={d.id} className="border-b px-2 py-1 text-amber-800">ID {d.id} duplicado em {d.occurrences.map((o) => `${o.sheet}:${o.row} (${o.state})`).join(', ')} → mantido {d.kept.sheet}:{d.kept.row}</div>)}
            </div>
          </div>
          <div className="mt-3 max-h-64 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left"><tr>{['ID', 'Tipo', 'Título', 'Estado', 'Pai', 'Responsável', 'Área', 'Alterado', 'Fechado', 'Tags'].map((h) => <th key={h} className="px-1.5 py-1">{h}</th>)}</tr></thead>
              <tbody>
                {preview.items.slice(0, 25).map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-1.5">{i.id}</td><td className="px-1.5">{i.type}</td><td className="max-w-[260px] truncate px-1.5">{i.title}</td><td className="px-1.5">{i.state}</td>
                    <td className="px-1.5">{i.parentId ?? '—'}</td><td className="px-1.5">{i.assignedTo ?? '—'}</td><td className="px-1.5">{i.areaPath ?? '—'}</td>
                    <td className="px-1.5">{fmtDate(i.changedDate)}</td><td className="px-1.5">{fmtDate(i.closedDate)}</td><td className="px-1.5">{i.tags.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {preview && (
        <Card title="4. Identificação do snapshot">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Projeto / portfólio" hint={projects.length ? `Existentes: ${projects.join(', ')}` : 'Snapshots do mesmo projeto formam o histórico.'}>
              <Input list="proj-list" value={proj} placeholder={suggestion.project} onChange={(e) => setProj(e.target.value)} className="w-64" />
              <datalist id="proj-list">{projects.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="Período / sprint" hint="Rótulo exibido no relatório e no histórico.">
              <Input value={label} placeholder={suggestion.label} onChange={(e) => setLabel(e.target.value)} className="w-56" />
            </Field>
            <Field label="Data/hora da consulta" hint="Quando a query foi executada (base dos cálculos de dias parados).">
              <Input type="datetime-local" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="w-56" />
            </Field>
            <Button onClick={() => void doImport()} disabled={busy || blocking || !preview.items.length} className="ml-auto h-10 px-6">
              {busy ? 'Importando…' : `Importar ${preview.items.length} registros`}
            </Button>
          </div>
          {blocking && <p className="mt-2 text-sm font-semibold text-red-700">Mapeie os campos obrigatórios (ID, Work Item Type, Title, State) em todas as abas selecionadas.</p>}
          <p className="mt-2 text-xs text-slate-500">Cada importação cria um novo snapshot; os anteriores são preservados para comparação entre períodos.</p>
        </Card>
      )}
    </div>
  );
}
