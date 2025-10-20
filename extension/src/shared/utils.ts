import { normalizeLanguageCode } from './languageCodes.js';

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
  let timeout: number | undefined;
  return (...args: Parameters<T>) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

export function createRequestId() {
  return crypto.randomUUID();
}

export function computeCacheKey(text: string, profileId?: string) {
  return `${profileId ?? 'default'}::${text.trim().toLowerCase()}`;
}

export function safeParseLanguage(language?: string) {
  const normalized = normalizeLanguageCode(language);
  return normalized ?? 'en';
}
