import {
  CACHE_SETTINGS_KEY,
  DEFAULT_CACHE_SETTINGS,
  type CacheSettings
} from '../shared/cacheSettings';

let cachedSettings: CacheSettings = DEFAULT_CACHE_SETTINGS;
let hasLoaded = false;
let loadingPromise: Promise<CacheSettings> | null = null;
let listenerRegistered = false;

function normalizeSettings(raw?: Partial<CacheSettings>): CacheSettings {
  const next: CacheSettings = { ...DEFAULT_CACHE_SETTINGS };
  if (raw) {
    if (Number.isFinite(raw.quickTtlMinutes) && (raw.quickTtlMinutes ?? 0) > 0) {
      next.quickTtlMinutes = Math.min(Math.max(raw.quickTtlMinutes!, 5), 180);
    }
    if (Number.isFinite(raw.maxEntries) && (raw.maxEntries ?? 0) > 0) {
      next.maxEntries = Math.min(Math.max(Math.floor(raw.maxEntries!), 50), 2000);
    }
  }
  return next;
}

async function readSettingsFromStorage(): Promise<CacheSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_SETTINGS_KEY], (result) => {
      const raw = result[CACHE_SETTINGS_KEY] as Partial<CacheSettings> | undefined;
      resolve(normalizeSettings(raw));
    });
  });
}

function ensureListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const change = changes[CACHE_SETTINGS_KEY];
    if (!change) return;
    cachedSettings = normalizeSettings(change.newValue as Partial<CacheSettings>);
  });
}

export async function getCacheSettings(): Promise<CacheSettings> {
  ensureListener();
  if (hasLoaded) {
    return cachedSettings;
  }
  if (!loadingPromise) {
    loadingPromise = readSettingsFromStorage().then((settings) => {
      cachedSettings = settings;
      hasLoaded = true;
      loadingPromise = null;
      return settings;
    });
  }
  return loadingPromise;
}
