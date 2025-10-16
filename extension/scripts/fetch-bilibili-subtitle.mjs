#!/usr/bin/env node
import { chromium } from '@playwright/test';

const TARGET_URL =
  'https://www.bilibili.com/video/BV1C25mz4EaS/?spm_id_from=333.337.search-card.all.click&vd_source=9a5d68f12be48410a383705feb38c353';
const TARGET_TIMESTAMP_SECONDS = 9 * 60 + 23;
const SUBTITLE_SELECTORS = [
  '.bpx-player-subtitle-panel',
  '.subtitle-item',
  '.bpx-player-subtitle-item-text',
  '.bpx-player-subtitle-word'
];

async function waitForPlayerFrame(page) {
  const iframeHandle = await page.waitForSelector('iframe[src*="player.bilibili.com"]', {
    timeout: 20000
  });
  const frame = await iframeHandle.contentFrame();
  if (!frame) {
    throw new Error('Player iframe located but frame content is unavailable.');
  }
  return frame;
}

async function ensurePlayback(frame) {
  await frame.evaluate(async () => {
    const video = document.querySelector('video');
    if (!video) {
      throw new Error('No <video> element inside player frame.');
    }
    const playWithFallback = async () => {
      try {
        await video.play();
      } catch (error) {
        const startButton = document.querySelector('.bpx-player-video-btn-start');
        if (startButton instanceof HTMLElement) {
          startButton.click();
          await new Promise((resolve) => setTimeout(resolve, 600));
          await video.play().catch(() => {});
        } else {
          throw error;
        }
      }
    };
    await playWithFallback();
  });
}

async function seekToTimestamp(frame, seconds) {
  await frame.evaluate(async (targetSeconds) => {
    const video = document.querySelector('video');
    if (!video) return;
    video.currentTime = targetSeconds;
  }, seconds);
}

async function fetchSubtitle(frame) {
  const handle = await frame.waitForFunction(
    (selectors) => {
      const elements = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
      );
      for (const element of elements) {
        const text = element.textContent?.replace(/\s+/g, ' ').trim();
        if (text) return text;
      }
      return null;
    },
    SUBTITLE_SELECTORS,
    { timeout: 15000 }
  );
  return handle.jsonValue();
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 }
    });
    const page = await context.newPage();

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const frame = await waitForPlayerFrame(page);
    await ensurePlayback(frame);
    await seekToTimestamp(frame, TARGET_TIMESTAMP_SECONDS);
    await frame.waitForTimeout(1500);

    const subtitleText = await fetchSubtitle(frame);
    console.log(`Subtitle at 9:23: ${subtitleText}`);
  } catch (error) {
    console.error('Failed to fetch subtitle:', error);
  } finally {
    await browser.close();
  }
}

main();
