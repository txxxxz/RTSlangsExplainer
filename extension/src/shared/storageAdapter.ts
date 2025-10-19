import { SYNC_MODE, type SyncMode } from './config.js';
import { getDb, resetDb } from './db.js';
import type {
  HistoryEntry,
  LinguaLensSettings,
  ModelConfig,
  ProfileTemplate
} from './types.js';

const HISTORY_LIMIT = 300;
const SETTINGS_KEY = 'singleton';

export interface StorageAdapter {
  mode: SyncMode;
  getProfiles(): Promise<ProfileTemplate[]>;
  saveProfile(profile: ProfileTemplate): Promise<ProfileTemplate>;
  deleteProfile(id: string): Promise<void>;

  getHistory(limit?: number): Promise<HistoryEntry[]>;
  saveHistory(entry: HistoryEntry): Promise<void>;
  deleteHistoryEntry(id: string): Promise<void>;
  clearHistory(): Promise<void>;
  importHistory(entries: HistoryEntry[]): Promise<void>;

  getModelConfigs(): Promise<ModelConfig[]>;
  saveModelConfig(config: ModelConfig): Promise<ModelConfig>;
  deleteModelConfig(id: string): Promise<void>;
  setDefaultModel(modelId: string | null): Promise<void>;

  getSettings(): Promise<LinguaLensSettings>;
  saveSettings(settings: Partial<LinguaLensSettings>): Promise<LinguaLensSettings>;

  resetAll(): Promise<void>;
}

const DEFAULT_SETTINGS: Omit<LinguaLensSettings, 'updatedAt'> = {
  theme: 'system',
  glossaryEnabledByDefault: false,
  syncMode: SYNC_MODE
};

function sortProfiles(profiles: ProfileTemplate[]): ProfileTemplate[] {
  return [...profiles].sort((a, b) => b.updatedAt - a.updatedAt);
}

function sortModels(models: ModelConfig[]): ModelConfig[] {
  return [...models].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

function normalizeHistoryEntries(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt);
}

async function trimHistory() {
  const db = await getDb();
  const tx = db.transaction('history', 'readwrite');
  const store = tx.objectStore('history');
  const entries = await store.getAll();
  if (entries.length <= HISTORY_LIMIT) {
    await tx.done;
    return;
  }
  const sorted = entries.sort((a, b) => b.createdAt - a.createdAt);
  const toRemove = sorted.slice(HISTORY_LIMIT);
  for (const entry of toRemove) {
    await store.delete(entry.id);
  }
  await tx.done;
}

class LocalStorageAdapter implements StorageAdapter {
  mode: SyncMode = 'local';

  async getProfiles(): Promise<ProfileTemplate[]> {
    const db = await getDb();
    const profiles = await db.getAll('profiles');
    return sortProfiles(profiles);
  }

  async saveProfile(profile: ProfileTemplate): Promise<ProfileTemplate> {
    const db = await getDb();
    const payload: ProfileTemplate = {
      ...profile,
      createdAt: profile.createdAt ?? Date.now(),
      updatedAt: Date.now()
    };
    await db.put('profiles', payload);
    return payload;
  }

  async deleteProfile(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('profiles', id);
  }

  async getHistory(limit?: number): Promise<HistoryEntry[]> {
    const db = await getDb();
    const entries = await db.getAll('history');
    const sorted = normalizeHistoryEntries(entries);
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }

  async saveHistory(entry: HistoryEntry): Promise<void> {
    const db = await getDb();
    await db.put('history', {
      ...entry,
      createdAt: entry.createdAt ?? Date.now()
    });
    await trimHistory();
  }

  async deleteHistoryEntry(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('history', id);
  }

  async clearHistory(): Promise<void> {
    const db = await getDb();
    await db.clear('history');
  }

  async importHistory(entries: HistoryEntry[]): Promise<void> {
    if (!entries.length) return;
    const db = await getDb();
    const tx = db.transaction('history', 'readwrite');
    for (const entry of entries) {
      await tx.store.put({
        ...entry,
        createdAt: entry.createdAt ?? Date.now()
      });
    }
    await tx.done;
    await trimHistory();
  }

  async getModelConfigs(): Promise<ModelConfig[]> {
    const db = await getDb();
    const models = await db.getAll('models');
    return sortModels(models);
  }

  async saveModelConfig(config: ModelConfig): Promise<ModelConfig> {
    const db = await getDb();
    const now = Date.now();
    const existing = await db.get('models', config.id);
    const payload: ModelConfig = {
      ...config,
      createdAt: existing?.createdAt ?? config.createdAt ?? now,
      updatedAt: now
    };
    await db.put('models', payload);
    if (payload.isDefault) {
      await this.setDefaultModel(payload.id);
    }
    return payload;
  }

  async deleteModelConfig(id: string): Promise<void> {
    const db = await getDb();
    const existing = await db.get('models', id);
    await db.delete('models', id);
    if (existing?.isDefault) {
      await this.setDefaultModel(null);
    }
  }

  async setDefaultModel(modelId: string | null): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('models', 'readwrite');
    const store = tx.objectStore('models');
    const models = await store.getAll();
    for (const model of models) {
      const next = {
        ...model,
        isDefault: modelId ? model.id === modelId : false,
        updatedAt: model.id === modelId ? Date.now() : model.updatedAt
      };
      await store.put(next);
    }
    await tx.done;
    const settings = await this.getSettings();
    await this.saveSettings({ defaultModelId: modelId ?? undefined });
  }

  async getSettings(): Promise<LinguaLensSettings> {
    const db = await getDb();
    const stored = await db.get('settings', SETTINGS_KEY);
    if (!stored) {
      const defaults: LinguaLensSettings = {
        ...DEFAULT_SETTINGS,
        updatedAt: Date.now()
      };
      await db.put('settings', { ...defaults, id: SETTINGS_KEY });
      return defaults;
    }
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      syncMode: SYNC_MODE,
      updatedAt: stored.updatedAt ?? Date.now()
    };
  }

  async saveSettings(settings: Partial<LinguaLensSettings>): Promise<LinguaLensSettings> {
    const db = await getDb();
    const current = await this.getSettings();
    const next: LinguaLensSettings = {
      ...current,
      ...settings,
      syncMode: SYNC_MODE,
      updatedAt: Date.now()
    };
    await db.put('settings', { ...next, id: SETTINGS_KEY });
    return next;
  }

  async resetAll(): Promise<void> {
    await resetDb();
  }
}

let adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!adapter) {
    adapter = new LocalStorageAdapter();
  }
  return adapter;
}
