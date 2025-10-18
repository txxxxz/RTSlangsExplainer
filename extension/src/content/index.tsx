import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BackgroundMessage, ContentMessage } from '../shared/messages';
import type { DeepExplainResponse, QuickExplainResponse } from '../shared/types';
import { createRequestId, safeParseLanguage } from '../shared/utils';
import { SubtitleDetector, type SubtitleObservation } from './subtitleDetector';
import { DeepDrawer } from './ui/DeepDrawer';
import { QuickExplainBubble } from './ui/QuickExplainBubble';
import { TriggerButton } from './ui/TriggerButton';

const BRIDGE_EVENT = 'LINGUALENS_SUBTITLE';
const RUNTIME_AVAILABLE = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const IS_TOP_FRAME = window.top === window.self;

type BridgePayload = {
  source: 'LinguaLens';
  type: typeof BRIDGE_EVENT;
  observation: SubtitleObservation;
};

type QuickExplainResult =
  | { ok: true; response: QuickExplainResponse; cached: boolean }
  | { ok: false; error?: string };

function adjustRectForParent(rect: SubtitleObservation['rect'] | undefined) {
  if (!rect) return rect;
  try {
    const frameElement = window.frameElement as HTMLElement | null;
    if (!frameElement) return rect;
    const frameRect = frameElement.getBoundingClientRect();
    return {
      left: rect.left + frameRect.left,
      top: rect.top + frameRect.top,
      width: rect.width,
      height: rect.height
    };
  } catch (error) {
    console.warn('[LinguaLens] Failed to adjust rect for parent frame', error);
    return rect;
  }
}

function startSubtitleRelay() {
  const detector = new SubtitleDetector();
  const unsubscribe = detector.onSubtitle((observation) => {
    const observationForParent: SubtitleObservation = {
      ...observation,
      rect: adjustRectForParent(observation.rect)
    };
    try {
      window.top?.postMessage(
        {
          source: 'LinguaLens',
          type: BRIDGE_EVENT,
          observation: observationForParent
        } satisfies BridgePayload,
        '*'
      );
    } catch (error) {
      console.warn('[LinguaLens] Failed to relay subtitle to parent window', error);
    }
  });
  detector.start();
  const cleanup = () => {
    unsubscribe();
    detector.stop();
  };
  window.addEventListener('pagehide', cleanup, { once: true });
  window.addEventListener('beforeunload', cleanup, { once: true });
}

function isExtensionContextInvalid(error: unknown) {
  return (
    error instanceof Error &&
    typeof error.message === 'string' &&
    error.message.includes('Extension context invalidated')
  );
}

function sendMessageSafe(
  message: Parameters<typeof chrome.runtime.sendMessage>[0],
  debugLabel: string
) {
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined;
  if (!runtime || typeof runtime.sendMessage !== 'function') {
    console.warn('[LinguaLens] Runtime API missing, skip message', debugLabel);
    return;
  }
  Promise.resolve(runtime.sendMessage(message)).catch((error) => {
    if (isExtensionContextInvalid(error)) {
      console.warn('[LinguaLens] Extension context invalidated, drop message', debugLabel);
      return;
    }
    console.error('[LinguaLens] Failed to send message', debugLabel, error);
  });
}

async function requestQuickExplain(
  payload: BackgroundMessage & { type: 'EXPLAIN_REQUEST' }['payload']
): Promise<QuickExplainResult> {
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined;
  if (!runtime || typeof runtime.sendMessage !== 'function') {
    return { ok: false, error: 'Extension runtime unavailable' };
  }
  try {
    const result = (await runtime.sendMessage({ type: 'EXPLAIN_REQUEST', payload })) as
      | (QuickExplainResult & { cached?: boolean; response?: QuickExplainResponse })
      | undefined;
    if (result && 'ok' in result) {
      if (result.ok && result.response) {
        return { ok: true, response: result.response, cached: Boolean(result.cached) };
      }
      return { ok: false, error: result.error };
    }
    return { ok: false, error: 'Empty response from background' };
  } catch (error) {
    if (isExtensionContextInvalid(error)) {
      return { ok: false, error: 'Extension context invalidated' };
    }
    console.error('[LinguaLens] Quick explain request failed', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

if (!IS_TOP_FRAME || !RUNTIME_AVAILABLE) {
  startSubtitleRelay();
} else {
  const primaryLanguage = safeParseLanguage(navigator.language);
  const secondaryLanguage = primaryLanguage.startsWith('en') ? undefined : 'en';

  const styleHref = chrome.runtime.getURL('content/styles/overlay.css');
  const styleEl = document.createElement('link');
  styleEl.rel = 'stylesheet';
  styleEl.href = styleHref;
  document.head.appendChild(styleEl);

  const container = document.createElement('div');
  container.className = 'lingualens-root';
  document.body.appendChild(container);

  const Overlay: React.FC = () => {
    const [currentLine, setCurrentLine] = useState('');
    const [surrounding, setSurrounding] = useState<string | undefined>(undefined);
    const [quickLoading, setQuickLoading] = useState(false);
    const [quickError, setQuickError] = useState<string | null>(null);
    const [deepLoading, setDeepLoading] = useState(false);
    const [quickResponse, setQuickResponse] = useState<QuickExplainResponse | undefined>(undefined);
    const [deepData, setDeepData] = useState<Partial<DeepExplainResponse> | undefined>(undefined);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [lastRequestId, setLastRequestId] = useState<string | null>(null);
    const lastRequestIdRef = useRef<string | null>(null);
    const [triggerVisible, setTriggerVisible] = useState(false);
    const [bubbleVisible, setBubbleVisible] = useState(false);
    const [triggerPosition, setTriggerPosition] =
      useState<{ left: number; top: number } | null>(null);
    const [lastRect, setLastRect] = useState<SubtitleObservation['rect'] | null>(null);

    const computeTriggerPosition = useCallback(
      (rect?: SubtitleObservation['rect']): { left: number; top: number } | null => {
        if (!rect) return null;
        const viewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : rect.left + rect.width;
        const viewportHeight =
          typeof window !== 'undefined' ? window.innerHeight : rect.top + rect.height;
        const left = Math.min(rect.left + rect.width + 16, viewportWidth - 56);
        const top = Math.min(Math.max(rect.top + rect.height / 2, 80), viewportHeight - 120);
        return { left, top };
      },
      []
    );

    const handleObservation = useCallback(
      (observation: SubtitleObservation) => {
        setCurrentLine(observation.text);
        setSurrounding(observation.surrounding);
        console.info('[LinguaLens][Content] 捕获字幕', {
          字幕文本: observation.text,
          上下文: observation.surrounding ?? null
        });
        setDrawerOpen(false);
        setBubbleVisible(false);
        setTriggerVisible(true);
        setQuickLoading(false);
        setQuickError(null);
        setDeepLoading(false);
        setQuickResponse(undefined);
        setQuickError(null);
        setDeepData(undefined);
        setLastRequestId(null);
        setLastRect(observation.rect ?? null);
        setTriggerPosition(computeTriggerPosition(observation.rect));
      },
      [computeTriggerPosition]
    );

    useEffect(() => {
      const detector = new SubtitleDetector();
      const unsubscribe = detector.onSubtitle(handleObservation);
      detector.start();
      return () => {
        unsubscribe();
        detector.stop();
      };
    }, [handleObservation]);

    useEffect(() => {
      const listener = (event: MessageEvent) => {
        const payload = event.data as BridgePayload;
        if (!payload || payload.source !== 'LinguaLens') return;
        if (payload.type !== BRIDGE_EVENT || !payload.observation) return;
        if (typeof payload.observation.text !== 'string') return;
        handleObservation(payload.observation);
      };
      window.addEventListener('message', listener);
      return () => {
        window.removeEventListener('message', listener);
      };
    }, [handleObservation]);

    useEffect(() => {
      function handleMessage(message: ContentMessage) {
        switch (message.type) {
          case 'DEEP_EXPLAIN_READY':
            if (message.payload.requestId !== lastRequestId) return;
            console.info('[LinguaLens][Content] 收到深度解释最终结果', {
              请求编号: message.payload.requestId
            });
            setDeepData(message.payload);
            setDeepLoading(false);
            break;
          case 'DEEP_EXPLAIN_PROGRESS':
            if (message.payload.requestId !== lastRequestId) return;
            console.info('[LinguaLens][Content] 收到深度解释进度片段', {
              请求编号: message.payload.requestId,
              包含背景: Boolean(message.payload.background)
            });
            setDeepData((prev) => ({ ...(prev ?? {}), ...message.payload }));
            break;
          case 'REQUEST_FAILED':
            if (message.payload.requestId !== lastRequestId) return;
            if (message.payload.mode === 'quick') setQuickLoading(false);
            if (message.payload.mode === 'deep') setDeepLoading(false);
            if (message.payload.mode === 'quick') setQuickError(message.payload.reason ?? 'Unknown error');
            console.warn('[LinguaLens] Request failed', message.payload.reason);
            break;
          default:
            break;
        }
      }
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
      };
    }, [lastRequestId]);

    const languages = useMemo(
      () => ({
        primary: primaryLanguage,
        secondary: secondaryLanguage
      }),
      []
    );

    useEffect(() => {
      lastRequestIdRef.current = lastRequestId;
    }, [lastRequestId]);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const handleResize = () => {
        if (lastRect) {
          setTriggerPosition(computeTriggerPosition(lastRect));
        }
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, [lastRect, computeTriggerPosition]);

    function handleTriggerClick() {
      if (!currentLine) return;
      console.info('[LinguaLens][Content] 用户点击快速解释按钮', {
        字幕文本: currentLine
      });
      setTriggerVisible(false);
      setBubbleVisible(true);
      triggerQuickExplain(currentLine, surrounding);
    }

    function handleBubbleClose() {
      setBubbleVisible(false);
      setTriggerVisible(true);
      setQuickLoading(false);
      setQuickError(null);
    }

    async function triggerQuickExplain(text: string, context?: string) {
      const requestId = createRequestId();
      setLastRequestId(requestId);
      setQuickLoading(true);
      setDeepData(undefined);
      setQuickResponse(undefined);
      setQuickError(null);
      console.info('[LinguaLens][Content] 正在请求快速解释', {
        请求编号: requestId,
        字幕文本: text,
        上下文: context ?? null
      });
      try {
        const result = await requestQuickExplain({
          requestId,
          subtitleText: text,
          surrounding: context,
          timestamp: Date.now(),
          mode: 'quick',
          languages
        });
        if (lastRequestIdRef.current !== requestId) {
          return;
        }
        if (result.ok) {
          setQuickResponse(result.response);
          setQuickError(null);
          console.info('[LinguaLens][Content] 快速解释返回成功', {
            请求编号: requestId,
            直译预览: result.response.literal,
            背景字数: result.response.context.length
          });
        } else {
          setQuickError(result.error ?? 'Unknown error');
          console.info('[LinguaLens][Content] 快速解释返回失败', {
            请求编号: requestId,
            错误原因: result.error ?? 'Unknown error'
          });
        }
      } catch (error) {
        if (lastRequestIdRef.current !== requestId) {
          return;
        }
        const reason = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        setQuickError(reason);
        console.info('[LinguaLens][Content] 快速解释请求异常', {
          请求编号: requestId,
          错误原因: reason
        });
      } finally {
        if (lastRequestIdRef.current === requestId) {
          setQuickLoading(false);
          console.info('[LinguaLens][Content] 快速解释加载状态结束', {
            请求编号: requestId
          });
        }
      }
    }

    function triggerDeepExplain() {
      if (!currentLine) return;
      const requestId = lastRequestId ?? createRequestId();
      setLastRequestId(requestId);
      setDeepLoading(true);
      setDeepData((prev) => ({ ...(prev ?? {}), requestId }));
      setDrawerOpen(true);
      console.info('[LinguaLens][Content] 用户请求深度解释', {
        请求编号: requestId,
        字幕文本: currentLine
      });
      sendMessageSafe(
        {
          type: 'EXPLAIN_REQUEST',
          payload: {
            requestId,
            subtitleText: currentLine,
            surrounding,
            timestamp: Date.now(),
            mode: 'deep',
            languages
          }
        },
        'deep-explain'
      );
    }

    return (
      <>
        <TriggerButton
          visible={triggerVisible && !!currentLine && !bubbleVisible}
          position={triggerPosition}
          disabled={quickLoading}
          onClick={handleTriggerClick}
        />
        {bubbleVisible && (
          <QuickExplainBubble
            anchorText={currentLine}
            loading={quickLoading}
            response={quickResponse}
            error={quickError}
            onDeepExplain={triggerDeepExplain}
            onClose={handleBubbleClose}
          />
        )}
        <DeepDrawer
          open={drawerOpen}
          loading={deepLoading}
          data={deepData}
          onClose={() => setDrawerOpen(false)}
        />
      </>
    );
  };

  const root = createRoot(container);
  root.render(<Overlay />);
}
