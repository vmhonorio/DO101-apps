import { openDB, type IDBPDatabase } from 'idb';
import type { ProjectConfig, Snapshot } from '../domain/types';

/** Persistência local (IndexedDB). A interface permite trocar por um backend/BD de servidor sem tocar na UI. */
export interface Repository {
  listSnapshots(project?: string): Promise<Snapshot[]>;
  getSnapshot(id: string): Promise<Snapshot | undefined>;
  saveSnapshot(s: Snapshot): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
  getConfig(project: string): Promise<ProjectConfig | undefined>;
  saveConfig(c: ProjectConfig): Promise<void>;
}

const DB = 'executive-status';

export class IndexedDbRepository implements Repository {
  private db: Promise<IDBPDatabase>;
  constructor(name = DB) {
    this.db = openDB(name, 1, {
      upgrade(db) {
        const s = db.createObjectStore('snapshots', { keyPath: 'id' });
        s.createIndex('project', 'project');
        db.createObjectStore('configs', { keyPath: 'project' });
      },
    });
  }
  async listSnapshots(project?: string) {
    const db = await this.db;
    const all: Snapshot[] = project ? await db.getAllFromIndex('snapshots', 'project', project) : await db.getAll('snapshots');
    return all.sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  }
  async getSnapshot(id: string) {
    return (await this.db).get('snapshots', id);
  }
  async saveSnapshot(s: Snapshot) {
    await (await this.db).put('snapshots', s);
  }
  async deleteSnapshot(id: string) {
    await (await this.db).delete('snapshots', id);
  }
  async getConfig(project: string) {
    return (await this.db).get('configs', project);
  }
  async saveConfig(c: ProjectConfig) {
    await (await this.db).put('configs', c);
  }
}

/** Fallback quando o navegador bloqueia o IndexedDB (janela privada, sandbox): dados só durante a sessão. */
export class MemoryRepository implements Repository {
  private snaps = new Map<string, Snapshot>();
  private cfgs = new Map<string, ProjectConfig>();
  async listSnapshots(project?: string) {
    return [...this.snaps.values()].filter((s) => !project || s.project === project).sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
  }
  async getSnapshot(id: string) { return this.snaps.get(id); }
  async saveSnapshot(s: Snapshot) { this.snaps.set(s.id, s); }
  async deleteSnapshot(id: string) { this.snaps.delete(id); }
  async getConfig(p: string) { return this.cfgs.get(p); }
  async saveConfig(c: ProjectConfig) { this.cfgs.set(c.project, c); }
}

/** Usa IndexedDB; se não estiver disponível, passa a operar em memória sem quebrar a aplicação. */
class ResilientRepository implements Repository {
  private impl: Promise<Repository>;
  persistent = true;
  constructor() {
    this.impl = (async () => {
      try {
        const r = new IndexedDbRepository();
        await r.listSnapshots();
        return r;
      } catch {
        this.persistent = false;
        return new MemoryRepository();
      }
    })();
  }
  listSnapshots(p?: string) { return this.impl.then((r) => r.listSnapshots(p)); }
  getSnapshot(id: string) { return this.impl.then((r) => r.getSnapshot(id)); }
  saveSnapshot(s: Snapshot) { return this.impl.then((r) => r.saveSnapshot(s)); }
  deleteSnapshot(id: string) { return this.impl.then((r) => r.deleteSnapshot(id)); }
  getConfig(p: string) { return this.impl.then((r) => r.getConfig(p)); }
  saveConfig(c: ProjectConfig) { return this.impl.then((r) => r.saveConfig(c)); }
}

export const repo: Repository = new ResilientRepository();
