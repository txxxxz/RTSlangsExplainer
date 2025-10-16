import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ContentMessage } from '../shared/messages';
import type { DeepExplainResponse, QuickExplainResponse } from '../shared/types';
import { createRequestId, safeParseLanguage } from '../shared/utils';
import { SubtitleDetector, type SubtitleObservation } from './subtitleDetector';
import { DeepDrawer } from './ui/DeepDrawer';
import { QuickExplainBubble } from './ui/QuickExplainBubble';
import { TriggerButton } from './ui/TriggerButton';

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
  const [deepLoading, setDeepLoading] = useState(false);
  const [quickResponse, setQuickResponse] = useState<QuickExplainResponse | undefined>(undefined);
  const [deepData, setDeepData] = useState<Partial<DeepExplainResponse> | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [triggerVisible, setTriggerVisible] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState<{ left: number; top: number } | null>(null);
  const [lastRect, setLastRect] = useState<SubtitleObservation['rect'] | null>(null);

  useEffect(() => {
    const detector = new SubtitleDetector();
    const unsubscribe = detector.onSubtitle((observation: SubtitleObservation) => {
      setCurrentLine(observation.text);
      setSurrounding(observation.surrounding);
      setDrawerOpen(false);
      setBubbleVisible(false);
      setTriggerVisible(true);
      setQuickLoading(false);
      setDeepLoading(false);
      setQuickResponse(undefined);
      setDeepData(undefined);
      setLastRequestId(null);
      setLastRect(observation.rect ?? null);
      setTriggerPosition(computeTriggerPosition(observation.rect));
    });
    detector.start();
    return () => {
      unsubscribe();
      detector.stop();
    };
  }, []);

  useEffect(() => {
    function handleMessage(message: ContentMessage) {
      switch (message.type) {
        case 'QUICK_EXPLAIN_READY':
          if (message.payload.requestId !== lastRequestId) return;
          setQuickResponse(message.payload);
          setQuickLoading(false);
          break;
        case 'DEEP_EXPLAIN_READY':
          if (message.payload.requestId !== lastRequestId) return;
          setDeepData(message.payload);
          setDeepLoading(false);
          break;
        case 'DEEP_EXPLAIN_PROGRESS':
          if (message.payload.requestId !== lastRequestId) return;
          setDeepData((prev) => ({ ...(prev ?? {}), ...message.payload }));
          break;
        case 'REQUEST_FAILED':
          if (message.payload.requestId !== lastRequestId) return;
          if (message.payload.mode === 'quick') setQuickLoading(false);
          if (message.payload.mode === 'deep') setDeepLoading(false);
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
  }, [lastRect]);

  function computeTriggerPosition(
    rect?: SubtitleObservation['rect']
  ): { left: number; top: number } | null {
    if (!rect) return null;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : rect.left + rect.width;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : rect.top + rect.height;
    const left = Math.min(rect.left + rect.width + 16, viewportWidth - 56);
    const top = Math.min(Math.max(rect.top + rect.height / 2, 80), viewportHeight - 120);
    return { left, top };
  }

  function handleTriggerClick() {
    if (!currentLine) return;
    setTriggerVisible(false);
    setBubbleVisible(true);
    triggerQuickExplain(currentLine, surrounding);
  }

  function handleBubbleClose() {
    setBubbleVisible(false);
    setTriggerVisible(true);
    setQuickLoading(false);
  }

  function triggerQuickExplain(text: string, context?: string) {
    const requestId = createRequestId();
    setLastRequestId(requestId);
    setQuickLoading(true);
    setDeepData(undefined);
    setQuickResponse(undefined);
    chrome.runtime.sendMessage({
      type: 'EXPLAIN_REQUEST',
      payload: {
        requestId,
        subtitleText: text,
        surrounding: context,
        timestamp: Date.now(),
        mode: 'quick',
        languages
      }
    });
  }

  function triggerDeepExplain() {
    if (!currentLine) return;
    const requestId = lastRequestId ?? createRequestId();
    setLastRequestId(requestId);
    setDeepLoading(true);
    setDeepData((prev) => ({ ...(prev ?? {}), requestId }));
    setDrawerOpen(true);
    chrome.runtime.sendMessage({
      type: 'EXPLAIN_REQUEST',
      payload: {
        requestId,
        subtitleText: currentLine,
        surrounding,
        timestamp: Date.now(),
        mode: 'deep',
        languages
      }
    });
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
