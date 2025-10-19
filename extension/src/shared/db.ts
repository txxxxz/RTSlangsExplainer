import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  HistoryEntry,
  LinguaLensSettings,
  ModelConfig,
  ProfileTemplate
} from './types.js';

const DB_NAME = 'lingualens';
const DB_VERSION = 1;

interface LinguaLensDB extends DBSchema {
  profiles: {
    key: string;
    value: ProfileTemplate;
    indexes: {
      'by-createdAt': number;
      'by-updatedAt': number;
      'by-name': string;
    };
  };
  history: {
    key: string;
    value: HistoryEntry;
    indexes: {
      'by-createdAt': number;
    };
  };
  models: {
    key: string;
    value: ModelConfig;
    indexes: {
      'by-provider': string;
      'by-default': number;
    };
  };
  settings: {
    key: string;
    value: LinguaLensSettings & { id: string };
  };
}

let dbPromise: Promise<IDBPDatabase<LinguaLensDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<LinguaLensDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LinguaLensDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('profiles')) {
          const profiles = db.createObjectStore('profiles', {
            keyPath: 'id'
          });
          profiles.createIndex('by-createdAt', 'createdAt');
          profiles.createIndex('by-updatedAt', 'updatedAt');
          profiles.createIndex('by-name', 'name');
        }
        if (!db.objectStoreNames.contains('history')) {
          const history = db.createObjectStore('history', {
            keyPath: 'id'
          });
          history.createIndex('by-createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('models')) {
          const models = db.createObjectStore('models', {
            keyPath: 'id'
          });
          models.createIndex('by-provider', 'provider');
          models.createIndex('by-default', 'isDefault');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', {
            keyPath: 'id'
          });
        }
      }
    });
  }
  return dbPromise;
}

export async function resetDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await indexedDB.deleteDatabase(DB_NAME);
}
