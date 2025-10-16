import { STORAGE_KEYS, storageGet, storageSet } from '../shared/storage';

interface ApiKeys {
  openaiKey?: string;
  langGraphKey?: string;
  openaiBaseUrl?: string;
}

export async function getApiKeys(): Promise<ApiKeys> {
  const { data } = await storageGet<Record<string, ApiKeys>>([STORAGE_KEYS.apiKeys]);
  const stored: ApiKeys = data[STORAGE_KEYS.apiKeys] ?? {};
  return {
    openaiBaseUrl: stored.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL,
    openaiKey: stored.openaiKey,
    langGraphKey: stored.langGraphKey
  };
}

export async function saveApiKeys(keys: ApiKeys) {
  await storageSet({ [STORAGE_KEYS.apiKeys]: keys });
}

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
