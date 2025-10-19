import type { BackgroundMessage } from '../shared/messages.js';
import type {
  DeepExplainResponse,
  DeepExplainPartial,
  ExplainRequestPayload,
  ProfileTemplate
} from '../shared/types.js';
import { fetchQuickExplain } from '../shared/openai.js';
import {
  readDeepFromCache,
  readQuickFromCache,
  writeDeepToCache,
  writeQuickToCache
} from './cache.js';
import { DEFAULT_OPENAI_BASE_URL } from '../shared/config.js';
import { getApiKeys, saveApiKeys } from './keyStore.js';
import { getActiveProfile } from './profileStore.js';
import { recordQuickRequestEnd, recordQuickRequestStart } from './telemetry.js';
import { normalizeProfileTemplate } from '../shared/profile.js';

const SERVER_BASE = 'http://127.0.0.1:8000';

console.info('[LinguaLens][SW] 后台路由初始化完成');

export async function handleBackgroundMessage(
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender
) {
  switch (message.type) {
    case 'EXPLAIN_REQUEST': {
      const explainMessage = message as Extract<BackgroundMessage, { type: 'EXPLAIN_REQUEST' }>;
      if (explainMessage.payload.mode === 'quick') {
        return processQuickExplain(explainMessage.payload, sender);
      }
      return processDeepExplain(explainMessage.payload, sender);
    }
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
  payload: ExplainRequestPayload,
  _sender: chrome.runtime.MessageSender
) {
  recordQuickRequestStart(payload.requestId);
  console.info('[LinguaLens][SW] 收到快速解释请求', {
    请求编号: payload.requestId,
    字幕内容: payload.subtitleText,
    Profile编号: payload.profileId ?? null
  });
  const activeProfile = await getActiveProfile();
  const profileId = payload.profileId ?? activeProfile?.id;
  const effectivePayload = {
    ...payload,
    profileId,
    profile: activeProfile ?? undefined
  };
  const cacheHit = await readQuickFromCache(effectivePayload.subtitleText, profileId);
  if (cacheHit) {
    console.info('[LinguaLens][SW] 快速解释命中缓存', {
      请求编号: payload.requestId,
      Profile编号: profileId ?? null
    });
    await recordQuickRequestEnd(payload.requestId, { status: 'success', fromCache: true });
    console.info('[LinguaLens][SW] 返回缓存快速解释结果', {
      请求编号: payload.requestId
    });
    return { ok: true, cached: true, response: cacheHit };
  }
  const { openaiKey, openaiBaseUrl } = await getApiKeys();
  if (!openaiKey) {
    console.info('[LinguaLens][SW] 缺少 OpenAI 密钥，无法生成快速解释', {
      请求编号: payload.requestId
    });
    await recordQuickRequestEnd(payload.requestId, { status: 'failure', fromCache: false });
    return { ok: false, error: 'Missing OpenAI API key' };
  }
  console.info('[LinguaLens][SW] 缓存未命中，准备调用 OpenAI', {
    请求编号: payload.requestId,
    Profile编号: profileId ?? null
  });
  try {
    const response = await fetchQuickExplain(
      effectivePayload,
      openaiKey,
      openaiBaseUrl || DEFAULT_OPENAI_BASE_URL,
      activeProfile ?? undefined
    );
    console.info('[LinguaLens][SW] OpenAI 返回快速解释', {
      请求编号: payload.requestId,
      直译预览: response.literal.slice(0, 40),
      背景字数: response.context.length
    });
    await writeQuickToCache(effectivePayload.subtitleText, response, profileId);
    console.info('[LinguaLens][SW] 已写入快速缓存', {
      请求编号: payload.requestId,
      Profile编号: profileId ?? null
    });
    await recordQuickRequestEnd(payload.requestId, { status: 'success', fromCache: false });
    console.info('[LinguaLens][SW] 返回实时快速解释结果', {
      请求编号: payload.requestId
    });
    return { ok: true, cached: false, response };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.info('[LinguaLens][SW] OpenAI 调用失败', {
      请求编号: payload.requestId,
      错误原因: reason
    });
    await recordQuickRequestEnd(payload.requestId, { status: 'failure', fromCache: false });
    console.info('[LinguaLens][SW] 返回快速解释错误结果', {
      请求编号: payload.requestId
    });
    return { ok: false, error: reason };
  }
}

async function processDeepExplain(
  payload: ExplainRequestPayload,
  sender: chrome.runtime.MessageSender
) {
  if (!sender.tab?.id) return { ok: false };
  console.info('[LinguaLens][SW] 收到深度解释请求', {
    请求编号: payload.requestId,
    字幕内容: payload.subtitleText
  });
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
    console.info('[LinguaLens][SW] 深度解释命中缓存', {
      请求编号: payload.requestId,
      Profile编号: profileId ?? null
    });
    await emitToTab(sender.tab.id, {
      type: 'DEEP_EXPLAIN_READY',
      payload: cacheHit
    });
    console.info('[LinguaLens][SW] 已发送缓存深度解释结果', {
      请求编号: payload.requestId
    });
    return { ok: true, cached: true };
  }
  try {
    console.info('[LinguaLens][SW] 深度解释缓存未命中，开始流式请求', {
      请求编号: payload.requestId
    });
    const response = await streamDeepExplain(requestPayload, sender.tab.id);
    console.info('[LinguaLens][SW] 深度解释生成完成', {
      请求编号: payload.requestId
    });
    await writeDeepToCache(effectivePayload.subtitleText, response, profileId);
    console.info('[LinguaLens][SW] 深度解释已写入缓存', {
      请求编号: payload.requestId
    });
    return { ok: true, cached: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.info('[LinguaLens][SW] 深度解释失败', {
      请求编号: payload.requestId,
      错误原因: reason
    });
    await emitFailure(sender.tab.id, payload.requestId, payload.mode, reason);
    console.info('[LinguaLens][SW] 返回深度解释错误结果', {
      请求编号: payload.requestId
    });
    return { ok: false, error: reason };
  }
}

async function streamDeepExplain(
  payload: ExplainRequestPayload,
  tabId: number
): Promise<DeepExplainResponse> {
  console.info('[LinguaLens][SW] 向服务器发送深度解释请求', {
    请求编号: payload.requestId,
    目标地址: `${SERVER_BASE}/explain/deep`
  });
  console.info('[LinguaLens][SW] 深度解释请求体预览', {
    字幕前40字符: payload.subtitleText.slice(0, 40),
    上下文有无: Boolean(payload.surrounding),
    变体Profile数量: payload.profiles?.length ?? 0
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  try {
    const { openaiKey, openaiBaseUrl } = await getApiKeys();
    if (openaiKey) {
      headers['X-OpenAI-Key'] = openaiKey;
    }
    if (openaiBaseUrl) {
      headers['X-OpenAI-Base'] = openaiBaseUrl;
    }
  } catch (error) {
    console.warn('[LinguaLens][SW] 无法读取本地 OpenAI 密钥，将尝试使用服务器配置', error);
  }
  const response = await fetch(`${SERVER_BASE}/explain/deep`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  console.info('[LinguaLens][SW] 深度解释服务器响应状态', {
    请求编号: payload.requestId,
    状态码: response.status,
    状态描述: response.statusText
  });
  if (!response.ok) {
    console.info('[LinguaLens][SW] 深度解释接口返回错误状态', {
      请求编号: payload.requestId,
      状态码: response.status,
      状态描述: response.statusText
    });
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
    console.info('[LinguaLens][SW] 深度解释流片段字节数', {
      请求编号: payload.requestId,
      当前缓冲长度: buffer.length
    });
    buffer = await processSseBuffer(buffer, tabId, payload.requestId, (partial) => {
      finalResult = partial as DeepExplainResponse;
      console.info('[LinguaLens][SW] 深度解释收到流式片段', {
        请求编号: payload.requestId,
        包含背景段落: Boolean((partial as DeepExplainResponse).background?.summary)
      });
    });
  }

  if (!finalResult) {
    throw new Error('Deep explain stream ended without completion event');
  }
  await emitToTab(tabId, {
    type: 'DEEP_EXPLAIN_READY',
    payload: finalResult
  });
  console.info('[LinguaLens][SW] 深度解释结果已发送到页面', {
    请求编号: payload.requestId
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

  console.info('[LinguaLens][SW] 解析深度解释事件', {
    请求编号: requestId,
    事件类型: eventType
  });

  if (eventType === 'complete') {
    onComplete(parsed as DeepExplainResponse);
    return;
  }

  if (eventType === 'error') {
    console.error('[LinguaLens][SW] 深度解释流错误事件', {
      请求编号: requestId,
      原始数据: parsed
    });
    throw new Error((parsed as { reason?: string }).reason ?? 'Deep explain streaming error');
  }

  const progressPayload: DeepExplainPartial = {
    ...parsed,
    requestId
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
  console.log('后台脚本收到 upsert 请求:', profile);
  const normalized = normalizeProfileTemplate(profile);
  console.log('准备发送到服务器的数据:', normalized);
  try {
    const response = await fetch(`${SERVER_BASE}/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(normalized)
    });
    console.log('服务器响应状态:', response.status, response.statusText);
    if (!response.ok) {
      const message = await response.text();
      console.error('服务器返回错误:', message);
      throw new Error(message || 'Failed to upsert profile');
    }
    const payload = await response.json();
    console.log('服务器返回数据:', payload);
    return normalizeProfileTemplate(payload);
  } catch (error) {
    console.error('发送请求到服务器时出错:', error);
    throw error;
  }
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
  console.info('[LinguaLens][SW] 向内容脚本发送消息', {
    标签页: tabId,
    消息类型: message.type
  });
  return new Promise<void>((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => resolve());
  });
}

async function emitFailure(tabId: number, requestId: string, mode: string, reason: string) {
  console.info('[LinguaLens][SW] 通知前端请求失败', {
    标签页: tabId,
    请求编号: requestId,
    模式: mode,
    错误原因: reason
  });
  return emitToTab(tabId, {
    type: 'REQUEST_FAILED',
    payload: {
      requestId,
      mode,
      reason
    }
  });
}
