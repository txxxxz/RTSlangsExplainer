import { debounce } from '../shared/utils.js';
import { runOcr } from './ocrFallback.js';

export interface SubtitleObservation {
  text: string;
  surrounding?: string;
  rect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

type SubtitleListener = (observation: SubtitleObservation) => void;

const GLOBAL_SUBTITLE_SELECTORS = [
  '[class*="caption"]',
  '[class*="subtitle"]',
  '[data-purpose="player_subtitle"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]'
];

const HOST_SELECTOR_RULES: Array<{ pattern: RegExp; selectors: string[] }> = [
  {
    pattern: /youtube\.com$/,
    selectors: ['.ytp-caption-segment', '.ytp-caption-window-container']
  },
  {
    pattern: /netflix\.com$/,
    selectors: ['.player-timedtext-text-container', '.player-timedtext-text']
  },
  {
    pattern: /bilibili\.com$/,
    selectors: ['.bpx-player-subtitle-panel', '.subtitle-item']
  },
  {
    pattern: /udemy\.com$/,
    selectors: ['.captions-display--captions-container--', '[data-purpose="captions-cue"]']
  },
  {
    pattern: /primevideo\.com$/,
    selectors: ['.atvwebplayersdk-captions-text', '.webPlayerUI__subtitle']
  }
];

const OCR_PREFERRED_HOSTS = [/disneyplus\.com$/, /hbomax\.com$/, /iqiyi\.com$/];
const MIN_DOM_SCORE = 1.6;
const ARIA_LIVE_FALLBACK_SELECTORS = [
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
  '[role="alert"]',
  '[role="status"]'
];

const DEBUG = (() => {
  try {
    const stored = window.localStorage?.getItem('lingualens-debug');
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch (error) {
    console.warn('[LinguaLens] Failed to read debug flag', error);
  }
  return true;
})();

function debugLog(...args: unknown[]) {
  if (!DEBUG) return;
  console.debug('[LinguaLens][SubtitleDetector]', ...args);
}

export class SubtitleDetector {
  private listeners = new Set<SubtitleListener>();
  private observer?: MutationObserver;
  private lastSubtitle = '';
  private ocrCooldown = false;
  private domMisses = 0;

  start() {
    const debouncedScan = debounce(() => this.scanDom(), 150);
    this.observer = new MutationObserver(() => debouncedScan());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    const initialSelectors = this.buildSelectorList();
    debugLog('Subtitle detector started', {
      host: window.location.hostname,
      selectors: initialSelectors.map(({ selector }) => selector)
    });
    this.scanDom();
  }

  stop() {
    this.observer?.disconnect();
    debugLog('Subtitle detector stopped');
    this.listeners.clear();
  }

  onSubtitle(listener: SubtitleListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(observation: SubtitleObservation) {
    if (!observation.text || observation.text === this.lastSubtitle) {
      return;
    }
    debugLog('Emitting subtitle', {
      text: observation.text,
      rect: observation.rect
    });
    this.lastSubtitle = observation.text;
    this.listeners.forEach((listener) => listener(observation));
  }

  private scanDom() {
    const selectors = this.buildSelectorList();
    const videoMetrics = this.getVideoMetrics();
    const candidates: Array<{ observation: SubtitleObservation; score: number }> = [];
    debugLog('Scanning DOM', {
      selectorCount: selectors.length,
      videoFound: Boolean(videoMetrics)
    });

    for (const { selector, weight } of selectors) {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
      for (const element of elements) {
        if (!this.isVisible(element)) continue;
        const text = element.innerText.replace(/\s+/g, ' ').trim();
        if (!text || this.isLikelyHeader(element, text)) continue;
        const rect = element.getBoundingClientRect();
        const observation: SubtitleObservation = {
          text,
          surrounding: this.collectContext(element, text),
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          }
        };
        const score = this.scoreCandidate(rect, weight, text.length, videoMetrics);
        if (score > 0) {
          candidates.push({ observation, score });
        }
      }
    }

    if (candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      debugLog('Best DOM candidate', {
        text: best.observation.text,
        score: best.score,
        rect: best.observation.rect
      });
      if (best.score >= MIN_DOM_SCORE) {
        this.domMisses = 0;
        this.emit(best.observation);
        return;
      }
    }
    debugLog('DOM detection miss', {
      candidateCount: candidates.length,
      topScore: candidates[0]?.score ?? null,
      domMisses: this.domMisses + 1
    });
    this.domMisses += 1;

    const textTrackObservation = this.tryTextTrackFallback(videoMetrics);
    if (textTrackObservation) {
      debugLog('Text track fallback used');
      this.domMisses = 0;
      this.emit(textTrackObservation);
      return;
    }

    const ariaLiveObservation = this.tryAriaLiveFallback(videoMetrics);
    if (ariaLiveObservation) {
      debugLog('ARIA live fallback used');
      this.domMisses = 0;
      this.emit(ariaLiveObservation);
      return;
    }

    const force = this.domMisses > 3;
    debugLog('Scheduling OCR fallback', {
      force,
      preferredHost: this.isOcrPreferredHost(),
      hasCandidateScore: (candidates[0]?.score ?? 0) > 0
    });
    this.scheduleOcrFallback(force || this.isOcrPreferredHost() || (candidates[0]?.score ?? 0) > 0);
  }

  private async scheduleOcrFallback(force = false) {
    if (this.ocrCooldown && !force) {
      debugLog('OCR fallback skipped due to cooldown');
      return;
    }
    this.ocrCooldown = true;
    try {
      const { canvas, videoRect } = this.captureVideoFrame();
      if (!canvas) {
        debugLog('OCR skipped: unable to capture video frame');
        return;
      }
      const result = await runOcr(canvas);
      debugLog('OCR result', { text: result.text, confidence: result.confidence });
      if (result.text && result.confidence > 60) {
        this.emit({
          text: result.text,
          rect: videoRect
            ? {
                left: videoRect.left,
                top: videoRect.top,
                width: videoRect.width,
                height: videoRect.height
              }
            : undefined
        });
      }
    } catch (error) {
      console.warn('[LinguaLens] OCR fallback failed', error);
    } finally {
      debugLog('OCR cooldown set', { duration: force ? 500 : 2000 });
      setTimeout(() => {
        this.ocrCooldown = false;
        debugLog('OCR cooldown cleared');
      }, force ? 500 : 2000);
    }
  }

  private captureVideoFrame() {
    const video = this.getVideoElement();
    if (!video) {
      debugLog('captureVideoFrame: no video element found');
      return { canvas: null, videoRect: null };
    }
    if (video.readyState < 2) {
      debugLog('captureVideoFrame: video not ready', { readyState: video.readyState });
      return { canvas: null, videoRect: null };
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return { canvas: null, videoRect: null };
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rect = video.getBoundingClientRect();
    return {
      canvas,
      videoRect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }
    };
  }

  private buildSelectorList() {
    const host = window.location.hostname.toLowerCase();
    const hostSelectors = HOST_SELECTOR_RULES.filter((rule) => rule.pattern.test(host)).flatMap(
      (rule) => rule.selectors
    );
    debugLog('Building selectors', { host, hostSelectors });
    return [
      ...hostSelectors.map((selector) => ({ selector, weight: 2 })),
      ...GLOBAL_SUBTITLE_SELECTORS.map((selector) => ({ selector, weight: 1 }))
    ];
  }

  private isVisible(element: HTMLElement) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  private isOcrPreferredHost() {
    const host = window.location.hostname.toLowerCase();
    return OCR_PREFERRED_HOSTS.some((pattern) => pattern.test(host));
  }

  private isLikelyHeader(element: HTMLElement, text: string) {
    if (!text) return false;
    const normalizedTitle = document.title?.trim().toLowerCase();
    if (normalizedTitle && text.toLowerCase() === normalizedTitle) {
      return true;
    }
    if (
      element.closest(
        'header,[role="banner"],nav,[role="navigation"],ytd-masthead,ytm-header-bar'
      )
    ) {
      return true;
    }
    return false;
  }

  private collectContext(element: HTMLElement, text: string) {
    const candidate = element.parentElement?.innerText ?? '';
    const normalized = candidate.replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.toLowerCase() === text.toLowerCase()) {
      return undefined;
    }
    return normalized.slice(0, 400);
  }

  private scoreCandidate(
    rect: DOMRect,
    weight: number,
    textLength: number,
    videoMetrics: ReturnType<SubtitleDetector['getVideoMetrics']>
  ) {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const horizontalFactor =
      viewportWidth > 0
        ? 1 - Math.min(Math.abs(centerX - viewportWidth / 2) / (viewportWidth / 2), 1)
        : 0.5;
    const verticalFactor =
      viewportHeight > 0 ? Math.min(Math.max(centerY / viewportHeight, 0), 1) : 0.5;
    const lengthPenalty = textLength > 160 ? (textLength - 160) / 160 : 0;
    const sizePenalty = rect.height > viewportHeight * 0.4 ? 0.5 : 0;
    const videoAffinity = this.computeVideoAffinity(rect, videoMetrics);
    const affinityPenalty = videoAffinity < 0.2 ? 1 : 0;
    return (
      weight +
      horizontalFactor +
      verticalFactor +
      videoAffinity -
      lengthPenalty -
      sizePenalty -
      affinityPenalty
    );
  }

  private getVideoMetrics() {
    const video = this.getVideoElement();
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const diagonal = Math.sqrt(rect.width ** 2 + rect.height ** 2);
    return { rect, centerX, centerY, diagonal };
  }

  private computeVideoAffinity(
    rect: DOMRect,
    metrics: ReturnType<SubtitleDetector['getVideoMetrics']>
  ) {
    if (!metrics) return 0.5;
    const { rect: videoRect, centerX, centerY, diagonal } = metrics;
    const overlapWidth = Math.max(
      0,
      Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left)
    );
    const overlapHeight = Math.max(
      0,
      Math.min(rect.bottom, videoRect.bottom) - Math.max(rect.top, videoRect.top)
    );
    const overlapArea = overlapWidth * overlapHeight;
    const rectArea = Math.max(rect.width * rect.height, 1);
    const overlapRatio = overlapArea / rectArea;

    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const dx = Math.abs(targetX - centerX);
    const dy = Math.abs(targetY - centerY);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const distanceScore = 1 - Math.min(distance / Math.max(diagonal / 2, 1), 1);

    const fullyInside =
      rect.left >= videoRect.left &&
      rect.right <= videoRect.right &&
      rect.top >= videoRect.top &&
      rect.bottom <= videoRect.bottom;

    const affinity = Math.max(overlapRatio, distanceScore * 0.8) + (fullyInside ? 0.2 : 0);
    return Math.max(0, Math.min(affinity, 1));
  }

  private getVideoElement() {
    return document.querySelector<HTMLVideoElement>('video');
  }

  private tryTextTrackFallback(
    videoMetrics: ReturnType<SubtitleDetector['getVideoMetrics']>
  ): SubtitleObservation | null {
    const video = this.getVideoElement();
    if (!video) {
      debugLog('Text track fallback skipped: no video element');
      return null;
    }
    if (!video.textTracks || video.textTracks.length === 0) {
      debugLog('Text track fallback skipped: no text tracks available');
      return null;
    }
    const tracks = Array.from(video.textTracks);
    for (const track of tracks) {
      const kind = track.kind?.toLowerCase();
      if (kind !== 'subtitles' && kind !== 'captions') continue;
      if (track.mode === 'disabled') {
        track.mode = 'hidden';
      }
      const cue = this.getActiveCue(track, video.currentTime);
      if (!cue) continue;
      const text = this.extractCueText(cue);
      if (!text) continue;
      const rect = videoMetrics?.rect ?? video.getBoundingClientRect();
      debugLog('Text track cue selected', {
        label: track.label,
        kind: track.kind,
        text
      });
      return {
        text,
        rect: rect ? this.toObservationRect(rect) : undefined
      };
    }
    return null;
  }

  private tryAriaLiveFallback(
    videoMetrics: ReturnType<SubtitleDetector['getVideoMetrics']>
  ): SubtitleObservation | null {
    const seen = new Set<HTMLElement>();
    const candidates: Array<{ observation: SubtitleObservation; strength: number }> = [];
    for (const selector of ARIA_LIVE_FALLBACK_SELECTORS) {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
      for (const element of elements) {
        if (seen.has(element)) continue;
        seen.add(element);
        const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (!text) continue;
        if (this.isLikelyHeader(element, text)) continue;
        const rect = element.getBoundingClientRect();
        const fallbackRect =
          rect.width > 2 && rect.height > 2
            ? rect
            : videoMetrics?.rect ?? this.getVideoElement()?.getBoundingClientRect();
        candidates.push({
          observation: {
            text,
            surrounding: this.collectContext(element, text),
            rect: fallbackRect ? this.toObservationRect(fallbackRect) : undefined
          },
          strength: text.length
        });
      }
    }
    if (!candidates.length) return null;
    debugLog('ARIA live candidates found', {
      count: candidates.length,
      longest: candidates[0]?.observation.text
    });
    candidates.sort((a, b) => b.strength - a.strength);
    return candidates[0].observation;
  }

  private getActiveCue(track: TextTrack, currentTime: number) {
    if (track.activeCues && track.activeCues.length > 0) {
      return track.activeCues[track.activeCues.length - 1] as TextTrackCue;
    }
    if (!track.cues) return null;
    for (let i = 0; i < track.cues.length; i += 1) {
      const cue = track.cues[i];
      if (cue.startTime <= currentTime && currentTime <= cue.endTime) {
        return cue;
      }
    }
    return null;
  }

  private extractCueText(cue: TextTrackCue) {
    const anyCue = cue as any;
    let text = '';
    if (typeof anyCue.text === 'string') {
      text = anyCue.text;
    } else if (typeof anyCue.getCueAsHTML === 'function') {
      const fragment = anyCue.getCueAsHTML();
      const container = document.createElement('div');
      container.appendChild(fragment);
      text = container.textContent ?? '';
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  private toObservationRect(rect: DOMRect) {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }
}
