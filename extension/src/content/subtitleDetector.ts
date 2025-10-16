import { debounce } from '../shared/utils';
import { runOcr } from './ocrFallback';

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
    this.scanDom();
  }

  stop() {
    this.observer?.disconnect();
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
    this.lastSubtitle = observation.text;
    this.listeners.forEach((listener) => listener(observation));
  }

  private scanDom() {
    const selectors = this.buildSelectorList();
    for (const selector of selectors) {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
      for (const element of candidates) {
        if (!this.isVisible(element)) continue;
        const text = element.innerText.trim();
        if (text) {
          const surrounding = element.parentElement?.innerText?.trim();
          const rect = element.getBoundingClientRect();
          this.domMisses = 0;
          this.emit({
            text,
            surrounding,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }
          });
          return;
        }
      }
    }
    this.domMisses += 1;
    const force = this.domMisses > 3;
    this.scheduleOcrFallback(force || this.isOcrPreferredHost());
  }

  private async scheduleOcrFallback(force = false) {
    if (this.ocrCooldown && !force) return;
    this.ocrCooldown = true;
    try {
      const { canvas, videoRect } = this.captureVideoFrame();
      if (!canvas) return;
      const result = await runOcr(canvas);
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
      setTimeout(() => {
        this.ocrCooldown = false;
      }, force ? 500 : 2000);
    }
  }

  private captureVideoFrame() {
    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video || video.readyState < 2) return { canvas: null, videoRect: null };
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
    const hostSelectors = HOST_SELECTOR_RULES.filter((rule) => rule.pattern.test(host))
      .flatMap((rule) => rule.selectors);
    return [...hostSelectors, ...GLOBAL_SUBTITLE_SELECTORS];
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
}
