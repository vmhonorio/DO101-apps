import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { computeReport } from '../domain/metrics';
import { fmtDate, fmtPct } from '../domain/format';
import { useStore } from '../store';
import { Button, Card, ConfirmButton, Empty } from '../ui/primitives';

export function HistoryPage({ go }: { go: (r: string) => void }) {
  const { snapshots, config, deleteSnapshot, project } = useStore();
  const rows = useMemo(() => (config ? snapshots.map((s) => ({ s, m: computeReport(s, config) })) : []), [snapshots, config]);
  if (!project) return <Empty title="Sem histórico">Nenhuma importação realizada.<div className="mt-4"><Button onClick={() => go('import')}>Importar planilha</Button></div></Empty>;
  const max = Math.max(1, ...rows.map((r) => r.m.kpi.total));
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <Card title={`Histórico de importações — ${project}`}>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-slate-500">{['Período', 'Consulta', 'Importado em', 'Arquivo / abas', 'Itens', 'Cards', 'Concluídos', 'Evolução', 'Saúde', 'Hierarquia', ''].map((h) => <th key={h} className="py-1.5 pr-2">{h}</th>)}</tr></thead>
          <tbody>
            {rows.slice().reverse().map(({ s, m }) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 font-semibold">{s.label}</td>
                <td className="pr-2">{fmtDate(s.referenceDate, true)}</td>
                <td className="pr-2 text-slate-500">{fmtDate(s.importedAt, true)}</td>
                <td className="pr-2 text-slate-600">{s.fileName}<div className="text-xs text-slate-400">{s.sheets.join(', ')}</div></td>
                <td className="tabular pr-2">{s.items.length}</td>
                <td className="tabular pr-2">{m.kpi.total}</td>
                <td className="tabular pr-2">{m.kpi.done} ({fmtPct(m.kpi.donePct)})</td>
                <td className="w-56 pr-2">
                  <div className="flex h-3 overflow-hidden rounded bg-slate-100" style={{ width: `${(m.kpi.total / max) * 100}%` }}>
                    <span className="bg-slate-700" style={{ width: `${m.kpi.donePct ?? 0}%` }} />
                    <span className="bg-green-600" style={{ width: `${m.kpi.inProgressPct ?? 0}%` }} />
                    <span className="bg-blue-600" style={{ width: `${m.kpi.waitingPct ?? 0}%` }} />
                    <span className="bg-red-600" style={{ width: `${m.kpi.blockedPct ?? 0}%` }} />
                  </div>
                </td>
                <td className="pr-2">{{ onTrack: 'No prazo', attention: 'Atenção', critical: 'Crítico', nd: 'N/D' }[m.health.value]}</td>
                <td className="pr-2 text-xs">{s.hierarchySource}</td>
                <td><ConfirmButton title="Excluir snapshot" confirmLabel="Excluir?" onConfirm={() => void deleteSnapshot(s.id)}><Trash2 size={15} className="text-red-600" /></ConfirmButton></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Cada importação é preservada. Indicadores recalculados com a configuração atual do projeto. Os dados ficam no IndexedDB deste navegador.</p>
      </Card>
    </div>
  );
}
