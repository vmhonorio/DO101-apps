import { ArrowDown, ArrowUp, Download, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultConfig, ensureStateRules } from '../domain/config';
import { CATEGORY_LABEL, type Category, type ProjectConfig, type SprintDef } from '../domain/types';
import { useStore } from '../store';
import { Badge, Button, Card, Empty, Field, Input, Select } from '../ui/primitives';
import { cn } from '../ui/cn';
import { getApiKey, setApiKey } from '../ai/key';

const TABS = ['Estados e macroetapas', 'Tipos e agrupamento', 'Regras e limites', 'Sprints e meta', 'Integração e IA'] as const;
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const NumIn = ({ value, onChange, step = 1 }: { value: number; onChange: (n: number) => void; step?: number }) => (
  <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-28" />
);

export function ConfigPage() {
  const { config, saveConfig, snapshots, project } = useStore();
  const [c, setC] = useState<ProjectConfig | null>(config);
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [saved, setSaved] = useState(false);
  const [gen, setGen] = useState({ prefix: 'Sprint ', first: 1, count: 20, start: '', days: 14 });
  const [key, setKey] = useState(getApiKey());
  useEffect(() => setC(config), [config]);

  const latest = snapshots[snapshots.length - 1];
  const stateCounts = useMemo(() => {
    const m = new Map<string, number>();
    latest?.items.forEach((i) => m.set(i.state, (m.get(i.state) ?? 0) + 1));
    return m;
  }, [latest]);
  const typesFound = useMemo(() => [...new Set(snapshots.flatMap((s) => s.items.map((i) => i.type)))], [snapshots]);
  const iterations = useMemo(() => [...new Set(latest?.items.map((i) => i.iterationPath?.split(/[\\/]/).pop()).filter(Boolean) as string[])].sort(), [latest]);

  if (!project || !c) return <Empty title="Sem projeto">Importe uma planilha para configurar o projeto.</Empty>;
  const set = (p: Partial<ProjectConfig>) => { setC({ ...c, ...p }); setSaved(false); };
  const states = Object.entries(c.stateRules).sort((a, b) => {
    const mo = (k: string) => c.macroStages.find((m) => m.key === k)?.order ?? 99;
    return mo(a[1].macro) - mo(b[1].macro) || a[1].order - b[1].order;
  });
  const move = (state: string, dir: -1 | 1) => {
    const same = states.filter(([, r]) => r.macro === c.stateRules[state].macro);
    const i = same.findIndex(([s]) => s === state);
    const j = i + dir;
    if (j < 0 || j >= same.length) return;
    const a = same[i][1].order, b = same[j][1].order;
    const rules = { ...c.stateRules, [state]: { ...c.stateRules[state], order: b === a ? b + dir : b }, [same[j][0]]: { ...same[j][1], order: a } };
    set({ stateRules: rules });
  };
  const save = async () => { await saveConfig(c); setSaved(true); };
  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }));
    a.download = `config-${c.project}.json`;
    a.click();
  };
  const importJson = async (f: File) => { const j = JSON.parse(await f.text()) as ProjectConfig; set({ ...defaultConfig(c.project), ...j, project: c.project }); };
  const sec = (title: string, children: ReactNode, hint?: string) => (
    <div className="border-b border-slate-100 py-3"><h3 className="text-sm font-bold text-navy-900">{title}</h3>{hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}<div className="flex flex-wrap items-end gap-3">{children}</div></div>
  );

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-navy-900">Configuração — {c.project}</h1>
        <span className="text-sm text-slate-500">Todas as regras de negócio ficam aqui; nada é fixo no código.</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={exportJson}><Download size={15} /> Exportar JSON</Button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"><Upload size={15} /> Importar JSON<input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} /></label>
          <Button variant="outline" onClick={() => { if (confirm('Restaurar a configuração padrão deste projeto?')) set(ensureStateRules(defaultConfig(c.project), snapshots.flatMap((s) => s.items)).cfg); }}><RotateCcw size={15} /> Padrão</Button>
          <Button onClick={() => void save()}><Save size={15} /> {saved ? 'Salvo' : 'Salvar'}</Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold', tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900')}>{t}</button>)}
      </div>

      {tab === TABS[0] && (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card title="Mapeamento de estados do Azure DevOps">
            <p className="mb-2 text-xs text-slate-500">Cada estado pertence a uma macroetapa (cor/agrupamento) e a uma categoria (indicadores). As categorias são mutuamente exclusivas, evitando dupla contagem. “auto” = sugerido por heurística, ainda não revisado.</p>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="py-1">Estado</th><th>Cards*</th><th>Macroetapa</th><th>Categoria</th><th>Ordem</th></tr></thead>
              <tbody>
                {states.map(([s, r]) => (
                  <tr key={s} className="border-b border-slate-100">
                    <td className="py-1"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.macroStages.find((m) => m.key === r.macro)?.color }} />{s} {r.auto && <Badge className="bg-amber-100 text-amber-800">auto</Badge>}</td>
                    <td className="tabular text-slate-500">{stateCounts.get(s) ?? 0}</td>
                    <td><Select className="h-8" value={r.macro} onChange={(e) => set({ stateRules: { ...c.stateRules, [s]: { ...r, macro: e.target.value, auto: false } } })}>{c.macroStages.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</Select></td>
                    <td><Select className="h-8" value={r.category} onChange={(e) => set({ stateRules: { ...c.stateRules, [s]: { ...r, category: e.target.value as Category, auto: false } } })}>{(Object.keys(CATEGORY_LABEL) as Category[]).map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}</Select></td>
                    <td className="whitespace-nowrap"><button className="p-1 hover:bg-slate-100" onClick={() => move(s, -1)}><ArrowUp size={14} /></button><button className="p-1 hover:bg-slate-100" onClick={() => move(s, 1)}><ArrowDown size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate-500">* todos os tipos, no snapshot mais recente. <button className="text-blue-700 underline" onClick={() => set({ stateRules: Object.fromEntries(Object.entries(c.stateRules).map(([k, v]) => [k, { ...v, auto: false }])) })}>Marcar todos como revisados</button></p>
          </Card>
          <Card title="Macroetapas">
            {c.macroStages.slice().sort((a, b) => a.order - b.order).map((m) => (
              <div key={m.key} className="mb-2 flex items-center gap-2">
                <input type="color" value={m.color} onChange={(e) => set({ macroStages: c.macroStages.map((x) => (x.key === m.key ? { ...x, color: e.target.value } : x)) })} className="h-8 w-10 cursor-pointer rounded border" />
                <Input value={m.label} onChange={(e) => set({ macroStages: c.macroStages.map((x) => (x.key === m.key ? { ...x, label: e.target.value } : x)) })} className="h-8 flex-1" />
                <Input type="number" value={m.order} onChange={(e) => set({ macroStages: c.macroStages.map((x) => (x.key === m.key ? { ...x, order: Number(e.target.value) } : x)) })} className="h-8 w-16" title="Ordem" />
                <span className="w-24 truncate text-xs text-slate-400">{m.key}</span>
                {!Object.values(c.stateRules).some((r) => r.macro === m.key) && <button title="Remover" onClick={() => set({ macroStages: c.macroStages.filter((x) => x.key !== m.key) })}><Trash2 size={14} className="text-red-600" /></button>}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => { const key = `etapa${c.macroStages.length + 1}`; set({ macroStages: [...c.macroStages, { key, label: 'Nova etapa', color: '#64748b', order: c.macroStages.length + 1 }] }); }}><Plus size={14} /> Macroetapa</Button>
            <p className="mt-2 text-xs text-slate-500">As chaves “homologacao”, “implantacao”, “desenvolvimento” e “backlog” são usadas pelas regras de análise (represamento, cards longos em desenvolvimento).</p>
          </Card>
        </div>
      )}

      {tab === TABS[1] && (
        <Card>
          {sec('Tipos de work item', <>
            <Field label="Tipos contados como Card" className="w-full"><Input value={c.cardTypes.join(', ')} onChange={(e) => set({ cardTypes: list(e.target.value) })} /></Field>
            <Field label="Tipos de Bug"><Input value={c.bugTypes.join(', ')} onChange={(e) => set({ bugTypes: list(e.target.value) })} className="w-64" /></Field>
            <Field label="Tipos de Épico"><Input value={c.epicTypes.join(', ')} onChange={(e) => set({ epicTypes: list(e.target.value) })} className="w-64" /></Field>
            <Field label="Tipos de Feature"><Input value={c.featureTypes.join(', ')} onChange={(e) => set({ featureTypes: list(e.target.value) })} className="w-64" /></Field>
          </>, `Tipos encontrados nos snapshots: ${typesFound.join(', ')}. Separe por vírgula.`)}
          {sec('Agrupamento da análise', <>
            <Field label="Linhas da tabela"><Select value={c.rowLevel} onChange={(e) => set({ rowLevel: e.target.value as 'epic' | 'feature' })}><option value="epic">Épicos</option><option value="feature">Features</option></Select></Field>
            <Field label="Frente (grupo) definida por"><Select value={c.frente.source} onChange={(e) => set({ frente: { ...c.frente, source: e.target.value as ProjectConfig['frente']['source'] } })}>
              <option value="areaPath">Area Path (nível)</option><option value="iterationPath">Iteration Path (nível)</option><option value="tagPrefix">Tag com prefixo</option><option value="epicParent">Pai do épico/feature</option><option value="none">Sem agrupamento</option>
            </Select></Field>
            {(c.frente.source === 'areaPath' || c.frente.source === 'iterationPath') && <Field label="Nível do caminho" hint="1 = raiz (projeto)"><NumIn value={c.frente.level} onChange={(n) => set({ frente: { ...c.frente, level: Math.max(1, n) } })} /></Field>}
            {c.frente.source === 'tagPrefix' && <Field label="Prefixo da tag"><Input value={c.frente.tagPrefix} onChange={(e) => set({ frente: { ...c.frente, tagPrefix: e.target.value } })} /></Field>}
          </>, 'Frente = agrupamento de épicos (ex.: equipe, área, programa).')}
        </Card>
      )}

      {tab === TABS[2] && (
        <Card>
          {sec('Bloqueios e dependências', <>
            <Field label="Tags de bloqueio" className="w-80"><Input value={c.blockedTags.join(', ')} onChange={(e) => set({ blockedTags: list(e.target.value) })} /></Field>
            <Field label="Tags de dependência externa" className="w-80"><Input value={c.dependencyTags.join(', ')} onChange={(e) => set({ dependencyTags: list(e.target.value) })} /></Field>
            <Field label="Severidades de bug crítico" className="w-80"><Input value={c.criticalBugSeverities.join(', ')} onChange={(e) => set({ criticalBugSeverities: list(e.target.value) })} /></Field>
          </>, 'Bloqueado por estado = categoria “Bloqueado”. Cards com tag de bloqueio são exibidos à parte (não somam, evitando dupla contagem).')}
          {sec('Tempo parado', <>
            <Field label="Card parado após (dias)"><NumIn value={c.staleDays} onChange={(n) => set({ staleDays: n })} /></Field>
            <Field label="Desenvolvimento longo após (dias)"><NumIn value={c.longDevDays} onChange={(n) => set({ longDevDays: n })} /></Field>
          </>, 'Usa State Change Date; se ausente, Changed Date (que também muda com comentários).')}
          {sec('Situação por épico/feature', <>
            <Field label="Atenção: mín. bloqueados"><NumIn value={c.rowRules.attentionBlocked} onChange={(n) => set({ rowRules: { ...c.rowRules, attentionBlocked: n } })} /></Field>
            <Field label="Atenção: mín. parados"><NumIn value={c.rowRules.attentionStale} onChange={(n) => set({ rowRules: { ...c.rowRules, attentionStale: n } })} /></Field>
            <Field label="Crítico: % bloqueados ≥"><NumIn value={c.rowRules.criticalBlockedPct} onChange={(n) => set({ rowRules: { ...c.rowRules, criticalBlockedPct: n } })} /></Field>
            <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={c.rowRules.criticalWhenOverdue} onChange={(e) => set({ rowRules: { ...c.rowRules, criticalWhenOverdue: e.target.checked } })} /> Crítico quando a data-alvo venceu com itens abertos</label>
          </>)}
          {sec('Saúde geral do projeto', <>
            <Field label="CRÍTICO: % bloqueados ≥"><NumIn value={c.health.criticalBlockedPct} onChange={(n) => set({ health: { ...c.health, criticalBlockedPct: n } })} /></Field>
            <Field label="CRÍTICO: épicos críticos ≥"><NumIn value={c.health.criticalOverdueRows} onChange={(n) => set({ health: { ...c.health, criticalOverdueRows: n } })} /></Field>
            <Field label="CRÍTICO: sprints necessárias / disponíveis ≥"><NumIn step={0.1} value={c.health.criticalProjectionRatio} onChange={(n) => set({ health: { ...c.health, criticalProjectionRatio: n } })} /></Field>
            <Field label="ATENÇÃO: % épicos em atenção ≥"><NumIn value={c.health.attentionRowsPct} onChange={(n) => set({ health: { ...c.health, attentionRowsPct: n } })} /></Field>
            <Field label="ATENÇÃO: bloqueados ≥"><NumIn value={c.health.attentionBlockedCount} onChange={(n) => set({ health: { ...c.health, attentionBlockedCount: n } })} /></Field>
            <Field label="ATENÇÃO: % parados ≥"><NumIn value={c.health.attentionStalePct} onChange={(n) => set({ health: { ...c.health, attentionStalePct: n } })} /></Field>
            <Field label="ATENÇÃO: razão de projeção >"><NumIn step={0.1} value={c.health.attentionProjectionRatio} onChange={(n) => set({ health: { ...c.health, attentionProjectionRatio: n } })} /></Field>
          </>, 'Avaliadas em ordem: qualquer regra CRÍTICO dispara CRÍTICO; senão qualquer regra ATENÇÃO dispara ATENÇÃO; senão NO PRAZO. As regras disparadas aparecem no cabeçalho.')}
          {sec('Análise (avanços, atenção e riscos)', <>
            <Field label="Represamento/acúmulo: % do aberto ≥"><NumIn value={c.insight.homologAccumulationPct} onChange={(n) => set({ insight: { ...c.insight, homologAccumulationPct: n } })} /></Field>
            <Field label="Concentração por pessoa: % ≥"><NumIn value={c.insight.concentrationPct} onChange={(n) => set({ insight: { ...c.insight, concentrationPct: n } })} /></Field>
            <Field label="Concentração: mín. cards"><NumIn value={c.insight.concentrationMinItems} onChange={(n) => set({ insight: { ...c.insight, concentrationMinItems: n } })} /></Field>
            <Field label="Alta maturidade: % ≥"><NumIn value={c.insight.highMaturityPct} onChange={(n) => set({ insight: { ...c.insight, highMaturityPct: n } })} /></Field>
            <Field label="Baixa evolução: % <"><NumIn value={c.insight.lowEvolutionPct} onChange={(n) => set({ insight: { ...c.insight, lowEvolutionPct: n } })} /></Field>
            <Field label="Itens por quadro"><NumIn value={c.insight.maxPerPanel} onChange={(n) => set({ insight: { ...c.insight, maxPerPanel: n } })} /></Field>
          </>)}
        </Card>
      )}

      {tab === TABS[3] && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Card title="Meta de conclusão">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Data da meta"><Input type="date" value={c.goalDate ?? ''} onChange={(e) => set({ goalDate: e.target.value || undefined })} /></Field>
              <Field label="Rótulo"><Input value={c.goalLabel} onChange={(e) => set({ goalLabel: e.target.value })} /></Field>
              <Field label="Sprint atual"><Select value={c.currentSprint ?? ''} onChange={(e) => set({ currentSprint: e.target.value || undefined })}><option value="">(não definida)</option>{c.sprints.map((s) => <option key={s.name}>{s.name}</option>)}</Select></Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">A meta é usada quando o épico/feature não possui Target Date. A projeção usa a vazão média das últimas 3 sprints (Closed Date).</p>
            <h3 className="mt-4 text-sm font-bold text-navy-900">Gerar calendário de sprints</h3>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <Field label="Prefixo"><Input value={gen.prefix} onChange={(e) => setGen({ ...gen, prefix: e.target.value })} className="w-24" /></Field>
              <Field label="Nº inicial"><Input type="number" value={gen.first} onChange={(e) => setGen({ ...gen, first: Number(e.target.value) })} className="w-20" /></Field>
              <Field label="Qtde"><Input type="number" value={gen.count} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })} className="w-20" /></Field>
              <Field label="Início da 1ª"><Input type="date" value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} /></Field>
              <Field label="Duração (dias)"><Input type="number" value={gen.days} onChange={(e) => setGen({ ...gen, days: Number(e.target.value) })} className="w-20" /></Field>
              <Button variant="outline" disabled={!gen.start} onClick={() => {
                const out: SprintDef[] = [];
                const base = new Date(gen.start + 'T00:00:00Z').getTime();
                for (let i = 0; i < gen.count; i++) {
                  const st = new Date(base + i * gen.days * 86400000);
                  const en = new Date(st.getTime() + (gen.days - 1) * 86400000);
                  out.push({ name: `${gen.prefix}${gen.first + i}`, start: st.toISOString().slice(0, 10), end: en.toISOString().slice(0, 10) });
                }
                set({ sprints: out });
              }}>Gerar</Button>
            </div>
            {iterations.length > 0 && <p className="mt-2 text-xs text-slate-500">Iterações na exportação: {iterations.join(', ')}. As datas das sprints não vêm na exportação — informe-as aqui.</p>}
          </Card>
          <Card title={`Sprints (${c.sprints.length})`} actions={<Button size="sm" variant="outline" onClick={() => set({ sprints: [...c.sprints, { name: `Sprint ${c.sprints.length + 1}`, start: '', end: '' }] })}><Plus size={14} /> Sprint</Button>}>
            <div className="max-h-[480px] overflow-auto">
              {c.sprints.map((s, i) => (
                <div key={i} className="mb-1.5 flex items-center gap-2">
                  <Input value={s.name} onChange={(e) => set({ sprints: c.sprints.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="h-8 w-40" />
                  <Input type="date" value={s.start} onChange={(e) => set({ sprints: c.sprints.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} className="h-8" />
                  <Input type="date" value={s.end} onChange={(e) => set({ sprints: c.sprints.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} className="h-8" />
                  <button onClick={() => set({ sprints: c.sprints.filter((_, j) => j !== i) })}><Trash2 size={14} className="text-red-600" /></button>
                </div>
              ))}
              {!c.sprints.length && <p className="text-sm text-slate-500">Sem sprints: indicadores por período usarão a comparação entre snapshots, ou ficarão N/D.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === TABS[4] && (
        <Card>
          {sec('Azure DevOps', <Field label="URL base do projeto" hint="Ex.: https://dev.azure.com/organizacao/projeto — usada para links nos itens do detalhamento." className="w-[520px]"><Input value={c.azureBaseUrl ?? ''} onChange={(e) => set({ azureBaseUrl: e.target.value || undefined })} /></Field>)}
          {sec('Leitura executiva com IA (opcional)', <>
            <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={c.ai.enabled} onChange={(e) => set({ ai: { ...c.ai, enabled: e.target.checked } })} /> Habilitar botão “Leitura com IA” (Claude)</label>
            <Field label="Modelo"><Input value={c.ai.model} onChange={(e) => set({ ai: { ...c.ai, model: e.target.value } })} className="w-56" /></Field>
            <Field label="Chave da API (somente nesta sessão)"><Input type="password" value={key} onChange={(e) => { setKey(e.target.value); setApiKey(e.target.value); }} className="w-72" placeholder="sk-ant-…" /></Field>
          </>, 'A IA não calcula indicadores: recebe os fatos já calculados e redige a leitura executiva. Indicadores, situação, saúde, avanços, atenção e riscos são sempre determinísticos.')}
        </Card>
      )}
    </div>
  );
}
