import { Download, FileText, Printer, Sparkles, ChevronsDownUp, ChevronsUpDown, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getApiKey, setApiKey } from '../ai/key';
import { exportConsolidated } from '../data/exporters';
import { buildInsights } from '../domain/insights';
import { computeReport, EMPTY_FILTERS, type Filters } from '../domain/metrics';
import { fmtDate } from '../domain/format';
import { useStore } from '../store';
import { Button, Empty, Field, Input, Modal, Select } from '../ui/primitives';
import { DrillDown } from '../ui/report/DrillDown';
import { ExecutiveReport, REPORT_WIDTH, type DrillSpec, type SortMode } from '../ui/report/ExecutiveReport';

export function ReportPage({ go }: { go: (r: string) => void }) {
  const { snapshots, config, saveConfig, updateSnapshot } = useStore();
  const [snapId, setSnapId] = useState<string>('');
  const [cmpId, setCmpId] = useState<string>('auto');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortMode>('alpha');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState(true);
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const snap = snapshots.find((s) => s.id === snapId) ?? snapshots[snapshots.length - 1];
  useEffect(() => { if (snap && snap.id !== snapId) setSnapId(snap.id); }, [snap, snapId]);
  const idx = snap ? snapshots.findIndex((s) => s.id === snap.id) : -1;
  const prev = cmpId === 'none' ? undefined : cmpId === 'auto' ? (idx > 0 ? snapshots[idx - 1] : undefined) : snapshots.find((s) => s.id === cmpId);

  const model = useMemo(() => (snap && config ? computeReport(snap, config, filters, prev) : null), [snap, config, filters, prev]);
  const ins = useMemo(() => (model ? buildInsights(model) : null), [model]);
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const reading = model && ins
    ? useAi && !filtered && snap?.aiReading ? { text: snap.aiReading.text, ai: snap.aiReading.model } : { text: ins.reading }
    : { text: '' };

  // ---------------------------------------------- escala do "slide" 1920px para caber na largura da tela
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1080);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (wrap.current) setScale(Math.min(1, (wrap.current.clientWidth - 0) / REPORT_WIDTH));
      if (canvas.current) setHeight(canvas.current.offsetHeight);
    });
    if (wrap.current) ro.observe(wrap.current);
    if (canvas.current) ro.observe(canvas.current);
    return () => ro.disconnect();
  }, [model]);

  if (!snapshots.length || !snap) return <Empty title="Nenhuma planilha importada">Importe a exportação de uma Query do Azure DevOps para gerar o Status Executivo.<div className="mt-4"><Button onClick={() => go('import')}>Importar planilha</Button></div></Empty>;
  if (!config || !model || !ins) return <p className="p-8 text-slate-500">Carregando…</p>;

  const frentes = [...new Set(model.allCards.map((c) => c.frente))].sort();
  const people = [...new Set(model.allCards.map((c) => c.assignedTo ?? '(sem responsável)'))].sort();
  const tags = [...new Set(model.allCards.flatMap((c) => c.tags))].sort();

  const print = () => {
    // página única: altura = conteúdo + folga; o canvas estica até a página (o rodapé fica no fim)
    const h = Math.max(1080, Math.ceil((canvas.current?.getBoundingClientRect().height ?? 1080) / scale) + 40);
    let st = document.getElementById('print-page-size');
    if (!st) { st = document.createElement('style'); st.id = 'print-page-size'; document.head.appendChild(st); }
    st.textContent = `@page { size: ${REPORT_WIDTH}px ${h}px; margin: 0; } @media print { #executive-report { min-height: ${h - 2}px !important; } }`;
    const old = document.title;
    document.title = `Status Executivo - ${config.project} - ${snap.label}`;
    window.print();
    document.title = old;
  };

  const runAi = async () => {
    const key = getApiKey();
    if (!key) { setKeyOpen(true); return; }
    setAiBusy(true); setAiError('');
    const { refineReading, describeAiError } = await import('../ai/claude');
    try {
      const r = await refineReading(key, config.ai.model, computeReport(snap, config, EMPTY_FILTERS, prev), buildInsights(computeReport(snap, config, EMPTY_FILTERS, prev)));
      await updateSnapshot({ ...snap, aiReading: { text: r.text, model: r.model, createdAt: new Date().toISOString() } });
      setUseAi(true);
    } catch (e) {
      setAiError(describeAiError(e));
    } finally { setAiBusy(false); }
  };

  const setF = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  const allCollapsed = model.groups.every((g) => collapsed.has(g.frente));

  return (
    <div>
      <div className="no-print sticky top-[52px] z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Snapshot / período">
            <Select value={snap.id} onChange={(e) => setSnapId(e.target.value)} className="w-56">
              {snapshots.map((s) => <option key={s.id} value={s.id}>{s.label} — {fmtDate(s.referenceDate, true)}</option>)}
            </Select>
          </Field>
          <Field label="Comparar com">
            <Select value={cmpId} onChange={(e) => setCmpId(e.target.value)} className="w-52">
              <option value="auto">Snapshot anterior {idx > 0 ? `(${snapshots[idx - 1].label})` : '(nenhum)'}</option>
              <option value="none">Sem comparação</option>
              {snapshots.filter((s) => s.id !== snap.id).map((s) => <option key={s.id} value={s.id}>{s.label} — {fmtDate(s.referenceDate)}</option>)}
            </Select>
          </Field>
          <Field label="Sprint atual">
            <Select value={config.currentSprint ?? ''} onChange={(e) => void saveConfig({ ...config, currentSprint: e.target.value || undefined })} className="w-40">
              <option value="">{config.sprints.length ? '(não definida)' : '(cadastre em Configuração)'}</option>
              {config.sprints.map((s) => <option key={s.name}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Ordenação">
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="w-40">
              <option value="alpha">Alfabética</option>
              <option value="priority">Prioridade</option>
              <option value="pct">% concluído</option>
              <option value="situation">Criticidade</option>
            </Select>
          </Field>
          <Button variant="outline" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(model.groups.map((g) => g.frente)))}>
            {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />} {allCollapsed ? 'Expandir' : 'Recolher'} grupos
          </Button>
          <label className="flex h-9 items-center gap-1.5 text-sm"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /> Destacar críticos</label>
          <div className="ml-auto flex flex-wrap gap-2">
            {config.ai.enabled && (
              <>
                <Button variant="outline" onClick={() => void runAi()} disabled={aiBusy || filtered} title={filtered ? 'Remova os filtros para gerar a leitura do projeto inteiro' : ''}>
                  <Sparkles size={15} /> {aiBusy ? 'Gerando…' : snap.aiReading ? 'Regerar leitura (IA)' : 'Leitura com IA'}
                </Button>
                {snap.aiReading && <label className="flex h-9 items-center gap-1.5 text-sm"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Usar texto IA</label>}
              </>
            )}
            <Button variant="outline" onClick={() => exportConsolidated(model, ins, reading.text)}><Download size={15} /> Excel consolidado</Button>
            <Button variant="outline" onClick={print}><Printer size={15} /> Imprimir</Button>
            <Button variant="navy" onClick={print}><FileText size={15} /> Exportar PDF</Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Select value={filters.frentes[0] ?? ''} onChange={(e) => setF({ frentes: e.target.value ? [e.target.value] : [] })} className="h-8 w-52 text-[13px]">
            <option value="">Todas as frentes</option>
            {frentes.map((f) => <option key={f}>{f}</option>)}
          </Select>
          <Select value={filters.assignee} onChange={(e) => setF({ assignee: e.target.value })} className="h-8 w-48 text-[13px]" disabled={!snap.availableFields.includes('assignedTo')}>
            <option value="">Todos os responsáveis</option>
            {people.map((f) => <option key={f}>{f}</option>)}
          </Select>
          <Select value={filters.kind} onChange={(e) => setF({ kind: e.target.value as Filters['kind'] })} className="h-8 w-36 text-[13px]">
            <option value="all">PBIs e Bugs</option>
            <option value="pbi">Somente PBIs</option>
            <option value="bug">Somente Bugs</option>
          </Select>
          <Select value={filters.tag} onChange={(e) => setF({ tag: e.target.value })} className="h-8 w-40 text-[13px]" disabled={!tags.length}>
            <option value="">Todas as tags</option>
            {tags.map((f) => <option key={f}>{f}</option>)}
          </Select>
          <Input value={filters.search} onChange={(e) => setF({ search: e.target.value })} placeholder="Buscar título ou ID" className="h-8 w-52 text-[13px]" />
          {filtered && <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}><X size={14} /> Limpar filtros</Button>}
          {filtered && <span className="text-xs font-semibold text-amber-700">Filtros ativos: todos os indicadores refletem o recorte.</span>}
          {aiError && <span className="text-xs font-semibold text-red-700">IA: {aiError}</span>}
          {snap.warnings.length > 0 && <span className="text-xs text-slate-500" title={snap.warnings.join('\n')}>⚠ {snap.warnings.length} aviso(s) de importação</span>}
        </div>
      </div>

      <div ref={wrap} className="print-reset p-4">
        <div className="print-reset mx-auto overflow-hidden shadow-xl" style={{ width: REPORT_WIDTH * scale, height: height * scale }}>
          <div ref={canvas} className="print-reset origin-top-left" style={{ transform: `scale(${scale})`, width: REPORT_WIDTH }}>
            <ExecutiveReport m={model} ins={ins} reading={reading} sort={sort} collapsed={collapsed} highlightCritical={highlight}
              onToggleGroup={(f) => setCollapsed((c) => { const n = new Set(c); if (n.has(f)) n.delete(f); else n.add(f); return n; })}
              onDrill={setDrill} />
          </div>
        </div>
      </div>

      <DrillDown spec={drill} cfg={config} byId={model.h.byId} onClose={() => setDrill(null)} />
      <Modal open={keyOpen} onOpenChange={setKeyOpen} title="Chave da API (Claude)" subtitle="Usada apenas nesta sessão do navegador para redigir a leitura executiva a partir dos indicadores já calculados.">
        <Input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…" className="w-full" />
        <p className="mt-2 text-xs text-slate-500">A chave fica em sessionStorage e é enviada somente para api.anthropic.com. São enviados apenas indicadores agregados, títulos de épicos citados nos quadros e os textos de avanços/atenção/riscos. Em produção, use um proxy no servidor.</p>
        <div className="mt-3 flex justify-end"><Button onClick={() => { setApiKey(keyDraft.trim()); setKeyOpen(false); void runAi(); }} disabled={!keyDraft.trim()}>Salvar e gerar</Button></div>
      </Modal>
    </div>
  );
}
