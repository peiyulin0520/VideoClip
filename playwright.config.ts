import { defineConfig, devices } from '@playwright/test';

// iPhone 13 的螢幕與觸控設定，但用沙盒內建的 Chromium 跑（沙盒沒有 WebKit）。
// iPhone Safari 的實際行為要請使用者在真機確認（見 docs/PLAN.md §7）。
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  reporter: 'list',
  use: {
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    baseURL: 'http://localhost:4173/VideoClip/',
    trace: 'off',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/VideoClip/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
