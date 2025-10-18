import { readRecord, trimRecords, writeRecord } from '../shared/indexedDb.js';
import type { DeepExplainResponse, QuickExplainResponse } from '../shared/types.js';
import { computeCacheKey } from '../shared/utils.js';
import { getCacheSettings } from './cachePolicy.js';

export async function readQuickFromCache(text: string, profileId?: string) {
  const key = computeCacheKey(text, profileId);
  const record = await readRecord(key);
  if (record?.quick && record.quick.expiresAt > Date.now()) {
    return record.quick;
  }
  return null;
}

export async function writeQuickToCache(
  text: string,
  response: QuickExplainResponse,
  profileId?: string
) {
  const settings = await getCacheSettings();
  const now = Date.now();
  const ttlExpiry = now + settings.quickTtlMinutes * 60 * 1000;
  const adjustedExpiresAt = response.expiresAt
    ? Math.min(response.expiresAt, ttlExpiry)
    : ttlExpiry;
  const adjustedResponse: QuickExplainResponse = {
    ...response,
    expiresAt: adjustedExpiresAt
  };
  const key = computeCacheKey(text, profileId);
  await writeRecord({
    key,
    quick: adjustedResponse,
    profileId,
    updatedAt: Date.now()
  });
  await trimRecords(settings.maxEntries);
}

export async function writeDeepToCache(
  text: string,
  response: DeepExplainResponse,
  profileId?: string
) {
  const settings = await getCacheSettings();
  const key = computeCacheKey(text, profileId);
  await writeRecord({
    key,
    profileId,
    updatedAt: Date.now(),
    deep: response
  });
  await trimRecords(settings.maxEntries);
}

export async function readDeepFromCache(text: string, profileId?: string) {
  const key = computeCacheKey(text, profileId);
  const record = await readRecord(key);
  return record?.deep ?? null;
}
