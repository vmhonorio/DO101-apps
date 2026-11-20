import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { repo } from './data/repository';
import { defaultConfig, ensureStateRules } from './domain/config';
import type { ProjectConfig, Snapshot } from './domain/types';

interface Store {
  ready: boolean;
  projects: string[];
  project: string | null;
  setProject: (p: string | null) => void;
  snapshots: Snapshot[];
  config: ProjectConfig | null;
  saveConfig: (c: ProjectConfig) => Promise<void>;
  saveSnapshot: (s: Snapshot) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  updateSnapshot: (s: Snapshot) => Promise<void>;
  refresh: () => Promise<void>;
  loadDemo: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const LAST = 'es.lastProject';
const getLast = () => { try { return localStorage.getItem(LAST); } catch { return null; } };
const setLast = (p: string) => { try { localStorage.setItem(LAST, p); } catch { /* ignore */ } };

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [all, setAll] = useState<Snapshot[]>([]);
  const [project, setProjectState] = useState<string | null>(null);
  const [config, setConfig] = useState<ProjectConfig | null>(null);

  const refresh = useCallback(async () => {
    const list = await repo.listSnapshots();
    setAll(list);
    setReady(true);
    setProjectState((cur) => {
      const names = [...new Set(list.map((s) => s.project))];
      if (cur && names.includes(cur)) return cur;
      const last = getLast();
      return last && names.includes(last) ? last : names[names.length - 1] ?? null;
    });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const snapshots = useMemo(() => all.filter((s) => s.project === project), [all, project]);

  useEffect(() => {
    if (!project) { setConfig(null); return; }
    let alive = true;
    void (async () => {
      const stored = (await repo.getConfig(project)) ?? defaultConfig(project);
      const items = (await repo.listSnapshots(project)).flatMap((s) => s.items);
      const { cfg, added } = ensureStateRules(stored, items);
      if (added.length || !(await repo.getConfig(project))) await repo.saveConfig(cfg);
      if (alive) setConfig(cfg);
    })();
    return () => { alive = false; };
  }, [project, all]);

  const value: Store = {
    ready,
    projects: [...new Set(all.map((s) => s.project))].sort(),
    project,
    setProject: (p) => { if (p) setLast(p); setProjectState(p); },
    snapshots,
    config,
    saveConfig: async (c) => { await repo.saveConfig(c); setConfig(c); },
    saveSnapshot: async (s) => { await repo.saveSnapshot(s); setLast(s.project); setProjectState(s.project); await refresh(); },
    updateSnapshot: async (s) => { await repo.saveSnapshot(s); setAll((l) => l.map((x) => (x.id === s.id ? s : x))); },
    deleteSnapshot: async (id) => { await repo.deleteSnapshot(id); await refresh(); },
    refresh,
    loadDemo: async () => {
      const { demoData } = await import('./data/demo');
      const { snapshots: list, config: cfg } = await demoData();
      const { cfg: full } = ensureStateRules(cfg, list.flatMap((x) => x.items));
      await repo.saveConfig({ ...full, stateRules: Object.fromEntries(Object.entries(full.stateRules).map(([k, v]) => [k, { ...v, auto: false }])) });
      for (const x of list) await repo.saveSnapshot(x);
      setLast(cfg.project);
      setProjectState(cfg.project);
      await refresh();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider ausente');
  return v;
}
