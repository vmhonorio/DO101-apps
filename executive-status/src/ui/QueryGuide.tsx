import { CheckCircle2, ChevronDown, ChevronRight, Download, MinusCircle } from 'lucide-react';
import { useState } from 'react';
import { defaultConfig } from '../domain/config';
import { buildWiql, FIELD_GUIDE, QUERY_STEPS, type Need } from '../domain/queryGuide';
import type { CanonicalField, ProjectConfig } from '../domain/types';
import { IS_ARTIFACT } from '../env';
import { downloadTemplate } from '../data/template';
import { CopyButton } from './CopyButton';
import { Button } from './primitives';
import { cn } from './cn';

const NEED_CLS: Record<Need, string> = {
  'Obrigatório': 'bg-red-100 text-red-800',
  Hierarquia: 'bg-violet-100 text-violet-800',
  Recomendado: 'bg-blue-100 text-blue-800',
  Opcional: 'bg-slate-100 text-slate-700',
};

/** Guia dos campos da query do Boards, com modelo de planilha e WIQL. Mostra o que a última importação já trouxe. */
export function QueryGuide({ cfg, available, treeHierarchy, defaultOpen }: { cfg: ProjectConfig | null; available?: CanonicalField[]; treeHierarchy?: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tree, setTree] = useState(false);
  const c = cfg ?? defaultConfig('');
  const wiql = buildWiql(c, tree);
  const columns = FIELD_GUIDE.filter((f) => f.need !== 'Opcional').map((f) => f.en).join(', ');
  const has = (k: CanonicalField) => !!available?.includes(k) || (k === 'parent' && !!treeHierarchy);
  const missing = available ? FIELD_GUIDE.filter((f) => f.need !== 'Opcional' && !has(f.key)) : [];
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-base font-bold text-navy-900">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Guia da query no Azure Boards — campos e modelo de planilha
        </span>
        {available && (
          <span className={cn('text-xs font-semibold', missing.length ? 'text-amber-700' : 'text-green-700')}>
            {missing.length ? `Última importação sem ${missing.length} campo(s) recomendados` : 'Última importação com todos os campos recomendados'}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {IS_ARTIFACT ? (
              <span className="text-xs text-slate-500">Na versão online o download está bloqueado pelo claude.ai: use os botões de copiar abaixo. Na versão instalada há o botão “Baixar modelo (.xlsx)”.</span>
            ) : (
              <Button onClick={() => downloadTemplate(c)}><Download size={15} /> Baixar modelo de planilha (.xlsx)</Button>
            )}
            <CopyButton text={columns} label="Copiar lista de colunas" targetId="qg-columns" />
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {QUERY_STEPS.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b text-left text-slate-500">
                <th className="py-1 pr-2">Coluna (EN)</th><th className="pr-2">Coluna (PT-BR)</th><th className="pr-2">Necessidade</th><th className="pr-2">O que habilita no relatório</th>{available && <th className="pr-2">Última importação</th>}
              </tr></thead>
              <tbody>
                {FIELD_GUIDE.map((f) => (
                  <tr key={f.key} className="border-b border-slate-100 align-top">
                    <td className="py-1 pr-2 font-semibold">{f.en}<div className="font-mono text-[11px] font-normal text-slate-400">{f.ref}</div></td>
                    <td className="py-1 pr-2">{f.pt}</td>
                    <td className="py-1 pr-2"><span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', NEED_CLS[f.need])}>{f.need}</span></td>
                    <td className="py-1 pr-2 text-slate-700">{f.enables}</td>
                    {available && (
                      <td className="py-1 pr-2">
                        {has(f.key) ? <span className="flex items-center gap-1 text-green-700"><CheckCircle2 size={14} /> veio</span> : <span className="flex items-center gap-1 text-slate-400"><MinusCircle size={14} /> não veio</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p id="qg-columns" className="rounded bg-slate-50 p-2 font-mono text-xs text-slate-700">{columns}</p>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-navy-900">WIQL de referência</span>
              <label className="flex items-center gap-1 text-xs"><input type="radio" checked={!tree} onChange={() => setTree(false)} /> Lista simples + Parent</label>
              <label className="flex items-center gap-1 text-xs"><input type="radio" checked={tree} onChange={() => setTree(true)} /> Árvore</label>
              <CopyButton text={wiql} label="Copiar WIQL" targetId="qg-wiql" />
            </div>
            <pre id="qg-wiql" className="overflow-x-auto rounded bg-navy-900 p-3 text-xs text-slate-100">{wiql}</pre>
            <p className="mt-1 text-xs text-slate-500">Útil para conferência ou para a futura integração via API. No portal, a forma usual é montar a query pelo editor e escolher as colunas em “Opções de coluna”.</p>
          </div>
        </div>
      )}
    </section>
  );
}
