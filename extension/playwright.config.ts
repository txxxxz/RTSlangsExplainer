import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  retries: 0,
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 720 }
      }
    }
  ],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
});
