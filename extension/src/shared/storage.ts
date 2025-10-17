export const STORAGE_KEYS = {
  apiKeys: 'lingualens::keys',
  activeProfile: 'lingualens::activeProfile'
} as const;

type StorageAreaName = 'sync' | 'local';

function hasSyncStorage(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.storage?.sync;
  } catch {
    return false;
  }
}

async function safeStorageGet<T>(
  area: 'sync' | 'local',
  keys: string | string[]
): Promise<{ data: T; area: StorageAreaName } | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage[area].get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.warn(`[LinguaLens] storage.${area}.get failed:`, chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve({ data: result as unknown as T, area });
        }
      });
    } catch (error) {
      console.warn(`[LinguaLens] storage.${area}.get error:`, error);
      resolve(null);
    }
  });
}

export async function storageGet<T>(
  keys: string | string[],
  preferSync = true
): Promise<{ data: T; area: StorageAreaName }> {
  let result = null;

  if (preferSync && hasSyncStorage()) {
    result = await safeStorageGet<T>('sync', keys);
  }

  if (!result) {
    result = await safeStorageGet<T>('local', keys);
  }

  if (!result) {
    console.warn('[LinguaLens] All storage attempts failed, returning empty data');
    return { data: {} as T, area: 'local' };
  }

  return result;
}

export async function storageSet(
  items: Record<string, unknown>,
  preferSync = true
): Promise<StorageAreaName> {
  return new Promise((resolve) => {
    const setInArea = (area: 'sync' | 'local') => {
      try {
        chrome.storage[area].set(items, () => {
          if (chrome.runtime.lastError) {
            console.warn(`[LinguaLens] storage.${area}.set failed:`, chrome.runtime.lastError);
            if (area === 'sync') {
              setInArea('local');
            } else {
              resolve('local');
            }
          } else {
            resolve(area);
          }
        });
      } catch (error) {
        console.warn(`[LinguaLens] storage.${area}.set error:`, error);
        if (area === 'sync') {
          setInArea('local');
        } else {
          resolve('local');
        }
      }
    };

    if (preferSync && hasSyncStorage()) {
      setInArea('sync');
    } else {
      setInArea('local');
    }
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
