import { STORAGE_KEYS } from '../shared/storage';

interface ApiKeys {
  openaiKey?: string;
  langGraphKey?: string;
  openaiBaseUrl?: string;
}

export async function getApiKeys(): Promise<ApiKeys> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEYS.apiKeys], (result) => {
      const stored: ApiKeys = result[STORAGE_KEYS.apiKeys] ?? {};
      resolve({
        openaiBaseUrl: stored.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL,
        openaiKey: stored.openaiKey,
        langGraphKey: stored.langGraphKey
      });
    });
  });
}

export async function saveApiKeys(keys: ApiKeys) {
  return new Promise<void>((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEYS.apiKeys]: keys }, () => resolve());
  });
}

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
