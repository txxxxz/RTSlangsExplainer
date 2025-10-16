export const STORAGE_KEYS = {
  apiKeys: 'lingualens::keys',
  activeProfile: 'lingualens::activeProfile'
} as const;

type StorageAreaName = 'sync' | 'local';

function hasSyncStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.sync;
}

function fallbackToLocal<T>(keys: string | string[], callback: (value: T) => void) {
  chrome.storage.local.get(keys, (result) => {
    callback(result as unknown as T);
  });
}

export async function storageGet<T>(
  keys: string | string[],
  preferSync = true
): Promise<{ data: T; area: StorageAreaName }> {
  if (preferSync && hasSyncStorage()) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[LinguaLens] storage.sync.get failed; falling back to local', chrome.runtime.lastError);
          fallbackToLocal<T>(keys, (data) => resolve({ data, area: 'local' }));
        } else {
          resolve({ data: result as unknown as T, area: 'sync' });
        }
      });
    });
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve({ data: result as unknown as T, area: 'local' }));
  });
}

export async function storageSet(
  items: Record<string, unknown>,
  preferSync = true
): Promise<StorageAreaName> {
  if (preferSync && hasSyncStorage()) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(items, () => {
        if (chrome.runtime.lastError) {
          console.warn('[LinguaLens] storage.sync.set failed; falling back to local', chrome.runtime.lastError);
          chrome.storage.local.set(items, () => resolve('local'));
        } else {
          resolve('sync');
        }
      });
    });
  }
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve('local'));
  });
}

export async function storageRemove(
  keys: string | string[],
  preferSync = true
): Promise<StorageAreaName> {
  if (preferSync && hasSyncStorage()) {
    return new Promise((resolve) => {
      chrome.storage.sync.remove(keys, () => {
        if (chrome.runtime.lastError) {
          console.warn('[LinguaLens] storage.sync.remove failed; falling back to local', chrome.runtime.lastError);
          chrome.storage.local.remove(keys, () => resolve('local'));
        } else {
          resolve('sync');
        }
      });
    });
  }
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, () => resolve('local'));
  });
}
