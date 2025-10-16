import type { BackgroundMessage } from '../shared/messages';
import type { DeepExplainResponse, DeepExplainPartial, ProfileTemplate } from '../shared/types';
import { fetchQuickExplain } from '../shared/openai';
import {
  readDeepFromCache,
  readQuickFromCache,
  writeDeepToCache,
  writeQuickToCache
} from './cache';
import { DEFAULT_OPENAI_BASE_URL, getApiKeys, saveApiKeys } from './keyStore';
import { getActiveProfile } from './profileStore';
import { recordQuickRequestEnd, recordQuickRequestStart } from './telemetry';
import { normalizeProfileTemplate } from '../shared/profile';

const SERVER_BASE = 'http://localhost:8787';

export async function handleBackgroundMessage(
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender
) {
  switch (message.type) {
    case 'EXPLAIN_REQUEST':
      if (message.payload.mode === 'quick') {
        return processQuickExplain(message.payload, sender);
      }
      return processDeepExplain(message.payload, sender);
    case 'STORE_API_KEYS':
      await saveApiKeys(message.payload);
      return { ok: true };
    case 'FETCH_PROFILES':
      return fetchProfiles();
    case 'UPSERT_PROFILE':
      return upsertProfile(message.payload);
    case 'DELETE_PROFILE':
      return deleteProfile(message.payload.id);
    default:
      return { ok: false };
  }
}

async function processQuickExplain(
  payload: BackgroundMessage & { type: 'EXPLAIN_REQUEST' }['payload'],
  sender: chrome.runtime.MessageSender
) {
  if (!sender.tab?.id) return { ok: false };
  recordQuickRequestStart(payload.requestId);
  const activeProfile = await getActiveProfile();
  const profileId = payload.profileId ?? activeProfile?.id;
  const effectivePayload = {
    ...payload,
    profileId,
    profile: activeProfile ?? undefined
  };
  const cacheHit = await readQuickFromCache(effectivePayload.subtitleText, profileId);
  if (cacheHit) {
    await emitToTab(sender.tab.id, {
      type: 'QUICK_EXPLAIN_READY',
      payload: cacheHit
    });
    await recordQuickRequestEnd(payload.requestId, { status: 'success', fromCache: true });
    return { ok: true, cached: true };
  }
  const { openaiKey, openaiBaseUrl } = await getApiKeys();
  if (!openaiKey) {
    await emitFailure(sender.tab.id, payload.requestId, payload.mode, 'Missing OpenAI API key');
    await recordQuickRequestEnd(payload.requestId, { status: 'failure', fromCache: false });
    return { ok: false, error: 'missing_key' };
  }
  try {
    const response = await fetchQuickExplain(
      effectivePayload,
      openaiKey,
      openaiBaseUrl || DEFAULT_OPENAI_BASE_URL,
      activeProfile ?? undefined
    );
    await writeQuickToCache(effectivePayload.subtitleText, response, profileId);
    await emitToTab(sender.tab.id, {
      type: 'QUICK_EXPLAIN_READY',
      payload: response
    });
    await recordQuickRequestEnd(payload.requestId, { status: 'success', fromCache: false });
    return { ok: true, cached: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    await emitFailure(sender.tab.id, payload.requestId, payload.mode, reason);
    await recordQuickRequestEnd(payload.requestId, { status: 'failure', fromCache: false });
    return { ok: false, error: reason };
  }
}

async function processDeepExplain(
  payload: BackgroundMessage & { type: 'EXPLAIN_REQUEST' }['payload'],
  sender: chrome.runtime.MessageSender
) {
  if (!sender.tab?.id) return { ok: false };
  const activeProfile = await getActiveProfile();
  const profileId = payload.profileId ?? activeProfile?.id;
  const effectivePayload = {
    ...payload,
    profileId,
    profile: activeProfile ?? undefined
  };
  let variantProfiles: ProfileTemplate[] | undefined;
  try {
    const response = await fetchProfiles();
    if (response.profiles.length) {
      variantProfiles = response.profiles.filter((profile) => profile.id !== profileId);
    }
  } catch (error) {
    console.warn('[LinguaLens] Failed to load profile variants', error);
  }
  const requestPayload = {
    ...effectivePayload,
    ...(variantProfiles && variantProfiles.length ? { profiles: variantProfiles } : {})
  };
  const cacheHit = await readDeepFromCache(effectivePayload.subtitleText, profileId);
  if (cacheHit) {
    await emitToTab(sender.tab.id, {
      type: 'DEEP_EXPLAIN_READY',
      payload: cacheHit
    });
    return { ok: true, cached: true };
  }
  try {
    const response = await streamDeepExplain(requestPayload, sender.tab.id);
    await writeDeepToCache(effectivePayload.subtitleText, response, profileId);
    return { ok: true, cached: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    await emitFailure(sender.tab.id, payload.requestId, payload.mode, reason);
    return { ok: false, error: reason };
  }
}

async function streamDeepExplain(
  payload: BackgroundMessage & { type: 'EXPLAIN_REQUEST' }['payload'],
  tabId: number
): Promise<DeepExplainResponse> {
  const response = await fetch(`${SERVER_BASE}/explain/deep`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Deep explain failed: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('Deep explain response has no body to stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: DeepExplainResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = await processSseBuffer(buffer, tabId, payload.requestId, (partial) => {
      finalResult = partial as DeepExplainResponse;
    });
  }

  if (!finalResult) {
    throw new Error('Deep explain stream ended without completion event');
  }
  await emitToTab(tabId, {
    type: 'DEEP_EXPLAIN_READY',
    payload: finalResult
  });
  return finalResult;
}

async function processSseBuffer(
  buffer: string,
  tabId: number,
  requestId: string,
  onComplete: (payload: DeepExplainResponse) => void
) {
  let workingBuffer = buffer;
  let separatorIndex = workingBuffer.indexOf('\n\n');

  while (separatorIndex !== -1) {
    const rawEvent = workingBuffer.slice(0, separatorIndex).trim();
    workingBuffer = workingBuffer.slice(separatorIndex + 2);
    if (rawEvent) {
      await handleSseEvent(rawEvent, tabId, requestId, onComplete);
    }
    separatorIndex = workingBuffer.indexOf('\n\n');
  }

  return workingBuffer;
}

async function handleSseEvent(
  rawEvent: string,
  tabId: number,
  requestId: string,
  onComplete: (payload: DeepExplainResponse) => void
) {
  const lines = rawEvent.split('\n');
  let eventType = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.replace('event:', '').trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.replace('data:', '').trim());
    }
  }

  const dataRaw = dataLines.join('\n');
  if (!dataRaw) return;

  const parsed = JSON.parse(dataRaw) as DeepExplainPartial | DeepExplainResponse;

  if (eventType === 'complete') {
    onComplete(parsed as DeepExplainResponse);
    return;
  }

  if (eventType === 'error') {
    throw new Error((parsed as { reason?: string }).reason ?? 'Deep explain streaming error');
  }

  const progressPayload: DeepExplainPartial = {
    requestId,
    ...parsed
  };

  await emitToTab(tabId, {
    type: 'DEEP_EXPLAIN_PROGRESS',
    payload: progressPayload
  });
}

async function fetchProfiles(): Promise<{ profiles: ProfileTemplate[] }> {
  const response = await fetch(`${SERVER_BASE}/profiles`, {
    method: 'GET'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch profiles');
  }
  const payload = await response.json();
  const profiles = Array.isArray(payload?.profiles)
    ? payload.profiles.map((profile: ProfileTemplate) => normalizeProfileTemplate(profile))
    : [];
  return { profiles };
}

async function upsertProfile(profile: ProfileTemplate) {
  const normalized = normalizeProfileTemplate(profile);
  const response = await fetch(`${SERVER_BASE}/profiles`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(normalized)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to upsert profile');
  }
  const payload = await response.json();
  return normalizeProfileTemplate(payload);
}

async function deleteProfile(profileId: string) {
  const response = await fetch(`${SERVER_BASE}/profiles/${profileId}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error('Failed to delete profile');
  }
  return { ok: true };
}

async function emitToTab(tabId: number, message: { type: string; payload: unknown }) {
  return new Promise<void>((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => resolve());
  });
}

async function emitFailure(tabId: number, requestId: string, mode: string, reason: string) {
  return emitToTab(tabId, {
    type: 'REQUEST_FAILED',
    payload: {
      requestId,
      mode,
      reason
    }
  });
}
