export const CACHE_SETTINGS_KEY = 'lingualens::cache';

export interface CacheSettings {
  quickTtlMinutes: number;
  maxEntries: number;
}

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  quickTtlMinutes: 30,
  maxEntries: 400
};
