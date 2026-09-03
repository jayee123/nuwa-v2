import { defineConfig } from '@playwright/test'

// 錄影 demo（簡報素材）——不是驗收測試。
// 這幾支會 highlight 元素、錄影、走完整條 funnel，任何一步壞掉整條就紅。
// 驗收測試請看 playwright.e2e.config.ts（testDir: ./e2e）。
export default defineConfig({
  testDir: './demo',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    video: 'on',
    screenshot: 'on',
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
