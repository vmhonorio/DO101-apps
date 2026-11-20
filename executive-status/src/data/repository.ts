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

export const repo: Repository = new IndexedDbRepository();
