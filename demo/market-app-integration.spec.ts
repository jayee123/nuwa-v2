/**
 * 雙版整合 Demo — 錄影用（非驗收測試）
 *
 * 走完今天上線的主線：
 *   公版首頁 → 會員中心 → App 服務 → SSO 交握 → 私版對話
 *   → 私版側邊欄 / 我的方案 → 回公版看用量歸戶
 *
 * 對象是**正式站**，用 magic link 產生的 session 略過登入畫面
 * （腳本內寫死的舊測試密碼已失效）。
 *
 *   node --env-file=.env.local <產 session 的腳本> /tmp/demo-session.json
 *   SESSION_COOKIES=/tmp/demo-session.json npx playwright test demo/market-app-integration.spec.ts
 *
 * 影片輸出在 test-results/ 底下（playwright.config.ts 已設 video: 'on'）。
 */
import { test, type Page } from '@playwright/test'
import * as fs from 'fs'

const MARKET = 'https://next.nuwa.chg2asc.com'
const APP = 'https://nexthappy.sakilu-dev.uk'
const SESSION_COOKIES = process.env.SESSION_COOKIES

/** 在畫面上疊一張說明卡，讓觀看者知道現在在看什麼 */
async function caption(page: Page, step: string, title: string, body: string, ms = 3500) {
  await page.evaluate(
    ({ step, title, body }) => {
      document.getElementById('__demo_cap')?.remove()
      const el = document.createElement('div')
      el.id = '__demo_cap'
      el.style.cssText = [
        'position:fixed', 'left:32px', 'bottom:32px', 'z-index:2147483647',
        'max-width:560px', 'padding:18px 22px', 'border-radius:14px',
        'background:rgba(23,20,28,.94)', 'color:#fff',
        'font-family:-apple-system,"PingFang TC",sans-serif',
        'box-shadow:0 12px 40px rgba(0,0,0,.45)',
        'border-left:4px solid #B491BC',
        'opacity:0', 'transition:opacity .35s ease',
      ].join(';')
      el.innerHTML =
        `<div style="font-size:11px;letter-spacing:.16em;color:#B491BC;font-weight:700">${step}</div>` +
        `<div style="font-size:20px;font-weight:700;margin-top:4px">${title}</div>` +
        `<div style="font-size:14px;line-height:1.7;color:#D9D4E0;margin-top:6px">${body}</div>`
      document.body.appendChild(el)
      requestAnimationFrame(() => { el.style.opacity = '1' })
    },
    { step, title, body },
  )
  await page.waitForTimeout(ms)
}

/** 框住某個元素，強調「看這裡」 */
async function spotlight(page: Page, selector: string, ms = 2200) {
  const box = await page.locator(selector).first().boundingBox().catch(() => null)
  if (!box) return
  await page.evaluate(
    (b) => {
      document.getElementById('__demo_ring')?.remove()
      const r = document.createElement('div')
      r.id = '__demo_ring'
      r.style.cssText = [
        'position:fixed', `left:${b.x - 6}px`, `top:${b.y - 6}px`,
        `width:${b.width + 12}px`, `height:${b.height + 12}px`,
        'border:3px solid #E39258', 'border-radius:12px', 'z-index:2147483646',
        'pointer-events:none', 'box-shadow:0 0 0 9999px rgba(0,0,0,.28)',
        'transition:opacity .3s ease',
      ].join(';')
      document.body.appendChild(r)
    },
    box,
  )
  await page.waitForTimeout(ms)
  await page.evaluate(() => document.getElementById('__demo_ring')?.remove())
}

test('雙版整合：公版登入 → SSO → 私版對話 → 用量歸戶', async ({ page, context }) => {
  test.setTimeout(300_000)
  test.skip(!SESSION_COOKIES, '需要 SESSION_COOKIES')

  await context.addCookies(JSON.parse(fs.readFileSync(SESSION_COOKIES!, 'utf8')))

  // ── 1. 公版首頁 ──
  await page.goto(MARKET)
  await page.waitForLoadState('networkidle').catch(() => {})
  await caption(page, 'STEP 1', '公版：NUWA 平台首頁',
    '整合後首頁改為「所有 App 列表」。帳號、訂閱、付費都由平台持有，App 只負責提供服務。')
  await page.evaluate(() => document.getElementById('__demo_cap')?.remove())

  // ── 2. 會員中心 ──
  await page.goto(`${MARKET}/dashboard`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await caption(page, 'STEP 2', '會員中心',
    '原本的「開始上課」入口已移除 —— 課程內容一律在 App 裡進行，平台只負責把人帶進去。')
  await page.evaluate(() => document.getElementById('__demo_cap')?.remove())

  // ── 3. App 服務 ──
  await page.goto(`${MARKET}/dashboard/apps`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await caption(page, 'STEP 3', 'App 服務（Launcher）',
    '點「進入」會由平台簽發一枚有效期 120 秒的 token，帶著身分交給 App。')
  await spotlight(page, 'a[href*="/launch"]')
  await page.evaluate(() => document.getElementById('__demo_cap')?.remove())

  // ── 4. SSO 交握 ──
  await page.goto(`${MARKET}/api/apps/happy/launch?to=app`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
  await caption(page, 'STEP 4', 'SSO 交握完成',
    'App 驗過簽章後自行建立 session。使用者沒有再登入一次，帳號仍然只有平台那一份。', 4000)
  await page.evaluate(() => document.getElementById('__demo_cap')?.remove())

  // ── 5. 私版對話 ──
  await page.goto(`${APP}/chat`)
  await page.locator('textarea, input[type="text"]').first()
    .waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  await caption(page, 'STEP 5', 'App：對話主畫面',
    '上方只留兩個練習模式與「回到 NUWA」。下載、訂閱、進度、登出都收進側邊欄，手機上不再擠成一排圖示。', 4500)
  await page.evaluate(() => document.getElementById('__demo_cap')?.remove())

  // ── 6. 側邊欄 ──
  await page.locator('button').first().click().catch(() => {})
  await page.waitForTimeout(1500)
  await caption(page, 'STEP 6', '側邊欄：低頻功能收納處',
    '進度、個人設定、我的方案、登出。登出會先清除 App 自己的 session，再回到平台。', 4000)
  await page.evaluate(() => document.getElementById('__demo_cap')?.remove())

  // ── 7. 我的方案（唯讀）──
  await page.goto(`${APP}/settings/billing`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await caption(page, 'STEP 7', 'App：我的方案（唯讀）',
    'App 端不再有訂閱、升降級、綁卡、取消。方案讀自平台，要調整一律回平台處理。', 4500)
  await page.evaluate(() => document.getElementById('__demo_cap')?.remove())

  // ── 8. 回公版看用量歸戶 ──
  await page.goto(`${MARKET}/manage/ai-usage`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await caption(page, 'STEP 8', '公版：AI 用量歸戶',
    'App 每次 AI 呼叫把 token 與成本回寫平台。以會員為單位彙總各 App 的用量，未來多支 App 也適用。', 4500)
  const userTab = page.getByRole('button', { name: /按會員/ })
  if (await userTab.isVisible().catch(() => false)) {
    await spotlight(page, 'button:has-text("按會員")', 1800)
    await userTab.click()
    await page.waitForTimeout(2500)
  }
  await caption(page, '完成', '一份帳號、一處付費、一份用量',
    '帳號真值在平台、付費在平台、方案在平台；App 只讀、只用，用量再回饋給平台歸戶。', 5000)
})
