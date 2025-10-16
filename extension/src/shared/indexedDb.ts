import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CachedExplainRecord } from './types';

interface LinguaLensSchema extends DBSchema {
  records: {
    key: string;
    value: CachedExplainRecord;
    indexes: { updatedAt: number };
  };
}

const DB_NAME = 'lingualens';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LinguaLensSchema>> | null = null;

async function getDb(): Promise<IDBPDatabase<LinguaLensSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<LinguaLensSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('records')) {
          const store = database.createObjectStore('records', { keyPath: 'key' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      }
    });
  }
  return dbPromise;
}

export async function readRecord(key: string) {
  const db = await getDb();
  return db.get('records', key);
}

export async function writeRecord(record: CachedExplainRecord) {
  const db = await getDb();
  await db.put('records', record);
}

export async function trimRecords(maxEntries: number) {
  const db = await getDb();
  const tx = db.transaction('records', 'readwrite');
  const store = tx.store;
  const count = await store.count();
  if (count <= maxEntries) {
    await tx.done;
    return;
  }
  const toDelete = count - maxEntries;
  let deleted = 0;
  for await (const cursor of store.index('updatedAt').iterate()) {
    if (deleted >= toDelete) {
      break;
    }
    await cursor.delete();
    deleted += 1;
  }
  await tx.done;
}

export async function clearExpired(now: number) {
  const db = await getDb();
  const tx = db.transaction('records', 'readwrite');
  const cursor = await tx.store.openCursor();
  while (cursor) {
    const { quick } = cursor.value;
    if (quick && quick.expiresAt < now) {
      await cursor.delete();
    }
    await cursor.continue();
  }
  await tx.done;
}
