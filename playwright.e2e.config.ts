import { defineConfig } from '@playwright/test'

// 驗收測試（assert 明確、單一職責、壞了看得出壞在哪）。
// 慣例：底線開頭的檔名視為工具腳本、不是測試，不會被收進來。
//
//   npx playwright test -c playwright.e2e.config.ts
export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/_*.spec.ts',
  timeout: 60_000,
  retries: 1,
  reporter: [['list']],
  use: {
    // 預設打本機；驗正式站用：
    //   E2E_BASE_URL=https://next.nuwa.chg2asc.com npx playwright test -c playwright.e2e.config.ts
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
