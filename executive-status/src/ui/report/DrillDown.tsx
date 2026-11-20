import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { macroLabel } from '../../domain/metrics';
import type { ProjectConfig, WorkItem } from '../../domain/types';
import { CATEGORY_LABEL } from '../../domain/types';
import { fmtDate } from '../../domain/format';
import { Button, Input, Modal } from '../primitives';
import { itemRows } from '../../data/exporters';
import { downloadWorkbook } from '../../data/excel';
import type { DrillSpec } from './ExecutiveReport';

export function DrillDown({ spec, cfg, byId, onClose }: { spec: DrillSpec | null; cfg: ProjectConfig; byId: Map<number, WorkItem>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const l = (spec?.items ?? []).filter((i) => !q || i.title.toLowerCase().includes(q.toLowerCase()) || String(i.id) === q);
    return l.slice().sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1));
  }, [spec, q]);
  const link = (id: number) => (cfg.azureBaseUrl ? `${cfg.azureBaseUrl.replace(/\/$/, '')}/_workitems/edit/${id}` : undefined);
  return (
    <Modal open={!!spec} onOpenChange={(o) => !o && onClose()} wide title={spec?.title ?? ''} subtitle={spec?.subtitle ?? `${spec?.items.length ?? 0} cards`}
      actions={<Button size="sm" variant="outline" onClick={() => downloadWorkbook([{ name: 'Itens', rows: itemRows(items, cfg, byId) }], 'detalhe.xlsx')}><Download size={14} /> Excel</Button>}>
      <Input placeholder="Filtrar por título ou ID…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 w-72" />
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white text-left text-slate-500">
          <tr className="border-b">
            {['ID', 'Tipo', 'Título', 'Estado', 'Macroetapa / Categoria', 'Responsável', 'Épico', 'Parado (dias)', 'Alterado', 'Tags'].map((h) => <th key={h} className="px-1.5 py-1 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
              <td className="px-1.5 py-1 font-mono">{link(i.id) ? <a className="text-blue-700 underline" href={link(i.id)} target="_blank" rel="noreferrer">{i.id}</a> : i.id}</td>
              <td className="px-1.5 py-1">{i.type}</td>
              <td className="px-1.5 py-1">{i.title}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{i.state}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{macroLabel(cfg, i.macro)} · {CATEGORY_LABEL[i.category]}</td>
              <td className="px-1.5 py-1">{i.assignedTo ?? '—'}</td>
              <td className="px-1.5 py-1">{i.epicId ? byId.get(i.epicId)?.title : '—'}</td>
              <td className="px-1.5 py-1 text-right tabular">{i.idleDays ?? 'N/D'}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{fmtDate(i.changedDate)}</td>
              <td className="px-1.5 py-1">{i.tags.join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="py-6 text-center text-slate-500">Nenhum item.</p>}
    </Modal>
  );
}
