import { BarChart3, History, Settings, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { ReportPage } from './pages/ReportPage';
import { ImportPage } from './pages/ImportPage';
import { ConfigPage } from './pages/ConfigPage';
import { HistoryPage } from './pages/HistoryPage';
import { Select } from './ui/primitives';
import { cn } from './ui/cn';

const ROUTES = [
  { key: 'report', label: 'Status Executivo', icon: BarChart3 },
  { key: 'import', label: 'Importar', icon: Upload },
  { key: 'history', label: 'Histórico', icon: History },
  { key: 'config', label: 'Configuração', icon: Settings },
] as const;

function Shell() {
  const { projects, project, setProject, ready } = useStore();
  const [route, setRoute] = useState(() => location.hash.slice(1) || 'report');
  useEffect(() => {
    const f = () => setRoute(location.hash.slice(1) || 'report');
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = (r: string) => { location.hash = r; setRoute(r); };
  return (
    <div className="min-h-screen">
      <nav className="no-print sticky top-0 z-30 flex h-[52px] items-center gap-4 overflow-x-auto whitespace-nowrap bg-navy-900 px-4 text-white">
        <span className="text-[17px] font-bold tracking-wide">EXECUTIVE <span className="text-amber-400">STATUS</span></span>
        <div className="flex gap-1">
          {ROUTES.map((r) => (
            <button key={r.key} onClick={() => go(r.key)} className={cn('flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold', route === r.key ? 'bg-white/15' : 'text-slate-300 hover:bg-white/10')}>
              <r.icon size={15} /> {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-slate-300">Projeto</span>
          <Select value={project ?? ''} onChange={(e) => setProject(e.target.value || null)} className="h-8 w-56 border-white/20 bg-navy-800 text-white" disabled={!projects.length}>
            {!projects.length && <option value="">—</option>}
            {projects.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
      </nav>
      {!ready ? <p className="p-8 text-slate-500">Carregando…</p> : (
        <>
          {route === 'report' && <ReportPage go={go} />}
          {route === 'import' && <ImportPage go={go} />}
          {route === 'history' && <HistoryPage go={go} />}
          {route === 'config' && <ConfigPage />}
        </>
      )}
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}
