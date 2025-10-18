import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.resolve(__dirname, '../..', 'dist');
const contentScriptPath = path.join(buildDir, 'content', 'index.global.js');

const quickResponse = {
  requestId: 'test-request',
  literal: 'literal translation',
  context: 'contextual explanation',
  languages: { primary: 'en' },
  detectedAt: Date.now(),
  expiresAt: Date.now() + 1000
};

const crossCulture = [
  {
    profileId: 'p-default',
    profileName: 'Default Profile',
    headline: 'Default profile insight',
    analogy: 'Cross culture snippet',
    confidence: 'medium',
    notes: 'Tailored for the active profile.'
  }
];

const backgroundSection = {
  summary: 'Background section streamed',
  detail: 'Additional background context for testing.',
  highlights: ['First highlight', 'Second highlight']
};

const deepProgress = {
  requestId: 'test-request',
  background: backgroundSection,
  crossCulture,
  sources: [
    {
      title: 'Mock Source',
      url: 'https://example.com',
      credibility: 'high',
      excerpt: 'Excerpt text'
    }
  ]
};

const deepComplete = {
  requestId: 'test-request',
  background: backgroundSection,
  crossCulture,
  sources: deepProgress.sources,
  confidence: { level: 'high', notes: 'High agreement between knowledge sources.' },
  generatedAt: Date.now()
};

test.describe('LinguaLens content script', () => {
  test('renders quick bubble and responds to deep streaming updates', async ({ page }) => {
    const script = readFileSync(contentScriptPath, 'utf8');

    await page.addInitScript(() => {
      const listeners: Array<(message: unknown) => void> = [];
      if (!window.crypto) {
        (window as any).crypto = {};
      }
      if (!(window.crypto as any).randomUUID) {
        (window.crypto as any).randomUUID = () => 'test-request';
      }
      const runtime = {
        getURL(path: string) {
          return path;
        },
        sendMessage(message: any) {
          (window as any).__lastMessage = message;
          return Promise.resolve({ ok: true });
        },
        onMessage: {
          addListener(fn: (message: unknown) => void) {
            listeners.push(fn);
          },
          removeListener(fn: (message: unknown) => void) {
            const idx = listeners.indexOf(fn);
            if (idx >= 0) listeners.splice(idx, 1);
          }
        }
      };
      (window as any).chrome = { runtime };
      (window as any).__emitChromeMessage = (payload: unknown) => {
        listeners.forEach((listener) => listener(payload));
      };
    });

    await page.setContent(`
      <html>
        <body>
          <div class="player">
            <div class="subtitle">Hello world</div>
          </div>
          <video width="640" height="480"></video>
        </body>
      </html>
    `);

    await page.addScriptTag({ content: script });

    await page.waitForFunction(() => Boolean((window as any).__lastMessage));
    const message = await page.evaluate(() => (window as any).__lastMessage);
    expect(message.type).toBe('EXPLAIN_REQUEST');
    expect(message.payload.subtitleText).toBe('Hello world');

    await page.evaluate((payload) => {
      (window as any).__emitChromeMessage({
        type: 'QUICK_EXPLAIN_READY',
        payload
      });
    }, quickResponse);

    await page.waitForSelector('.lingualens-bubble .literal');
    await expect(page.locator('.lingualens-bubble .literal')).toContainText('literal translation');

    await page.click('.lingualens-bubble button');
    await page.waitForSelector('.lingualens-drawer', { state: 'visible' });

    await page.evaluate((progress) => {
      (window as any).__emitChromeMessage({
        type: 'DEEP_EXPLAIN_PROGRESS',
        payload: progress
      });
    }, deepProgress);

    await page.waitForSelector('.lingualens-drawer .paragraph');
    await expect(page.locator('.lingualens-drawer .paragraph').first()).toContainText(
      'Background section streamed'
    );

    await page.evaluate((complete) => {
      (window as any).__emitChromeMessage({
        type: 'DEEP_EXPLAIN_READY',
        payload: complete
      });
    }, deepComplete);

    await expect(page.locator('.lingualens-drawer .sources li')).toHaveCount(1);
    await expect(page.locator('.lingualens-drawer .badge-high')).toBeVisible();
  });
});
