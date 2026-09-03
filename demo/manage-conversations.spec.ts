import { test, expect } from '@playwright/test'

const TEST_PHONE = '0936923912'
const TEST_PASSWORD = 'nuwa168'

/** Colored highlight — accepts Playwright locator or CSS selector */
async function highlight(
  page: import('@playwright/test').Page,
  target: string | import('@playwright/test').Locator,
  label: string,
  color: 'navigate' | 'input' | 'ai' | 'info' | 'compare' = 'navigate',
  durationMs = 5000
) {
  const colors = {
    navigate: { ring: '#3b82f6', bg: '#3b82f6' },
    input:    { ring: '#22c55e', bg: '#16a34a' },
    ai:       { ring: '#a855f7', bg: '#9333ea' },
    info:     { ring: '#f97316', bg: '#ea580c' },
    compare:  { ring: '#ef4444', bg: '#dc2626' },
  }
  const c = colors[color]

  // Get bounding box from Playwright locator or CSS selector
  let rect: { x: number; y: number; width: number; height: number } | null = null
  if (typeof target === 'string') {
    const locator = page.locator(target).first()
    rect = await locator.boundingBox()
  } else {
    rect = await target.first().boundingBox()
  }
  if (!rect) return

  await page.evaluate(
    ({ r, lbl, ringColor, bgColor }) => {
      const ring = document.createElement('div')
      ring.id = '__highlight_ring'
      ring.style.cssText = `
        position:fixed; z-index:99999;
        left:${r.x - 6}px; top:${r.y - 6}px;
        width:${r.width + 12}px; height:${r.height + 12}px;
        border:3px solid ${ringColor}; border-radius:12px;
        pointer-events:none;
        animation: hlPulse 0.6s ease-in-out infinite alternate;
      `
      const tip = document.createElement('div')
      tip.id = '__highlight_tip'
      tip.style.cssText = `
        position:fixed; z-index:99999;
        left:${r.x}px; top:${r.y + r.height + 10}px;
        background:${bgColor}; color:#fff; font-size:14px; font-weight:600;
        padding:8px 16px; border-radius:8px;
        pointer-events:none;
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        max-width:85vw; white-space:pre-wrap; line-height:1.4;
      `
      tip.textContent = lbl
      const style = document.createElement('style')
      style.id = '__highlight_style'
      style.textContent = `@keyframes hlPulse { from { opacity:1 } to { opacity:0.3 } }`
      document.body.append(style, ring, tip)
    },
    { r: rect, lbl: label, ringColor: c.ring, bgColor: c.bg }
  )
  await page.waitForTimeout(durationMs)
  await page.screenshot({ path: `test-results/manage-step-${Date.now()}.png`, fullPage: false })
  await page.evaluate(() => {
    document.getElementById('__highlight_ring')?.remove()
    document.getElementById('__highlight_tip')?.remove()
    document.getElementById('__highlight_style')?.remove()
  })
}

/** Full-screen banner */
async function showBanner(
  page: import('@playwright/test').Page,
  title: string,
  body: string,
  durationMs = 6000
) {
  await page.evaluate(
    ({ t, b }) => {
      const overlay = document.createElement('div')
      overlay.id = '__banner'
      overlay.style.cssText = `
        position:fixed; z-index:999999; inset:0;
        display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.75); pointer-events:none;
      `
      overlay.innerHTML = `
        <div style="background:#1e293b;border-radius:16px;padding:32px 40px;max-width:600px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
          <div style="font-size:20px;font-weight:700;color:#f97316;margin-bottom:12px;">${t}</div>
          <div style="font-size:14px;color:#e2e8f0;line-height:1.8;white-space:pre-wrap;">${b}</div>
        </div>
      `
      document.body.appendChild(overlay)
    },
    { t: title, b: body }
  )
  await page.waitForTimeout(durationMs)
  await page.screenshot({ path: `test-results/manage-step-${Date.now()}.png`, fullPage: false })
  await page.evaluate(() => document.getElementById('__banner')?.remove())
}

// Login helper
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="tel"]').first().fill(TEST_PHONE)
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForSelector('input[inputmode="numeric"]', { timeout: 10_000 })
  const otpInput = page.locator('input[inputmode="numeric"]')
  await otpInput.click()
  await page.keyboard.type('1234', { delay: 100 })
  await page.waitForFunction(() => {
    const btn = document.querySelector('button') as HTMLButtonElement | null
    return btn && btn.textContent?.includes('驗證登入') && !btn.disabled
  }, { timeout: 5_000 })
  await page.locator('button', { hasText: '驗證登入' }).click()
  await page.waitForURL('**/dashboard**', { timeout: 20_000 })
}

test.describe('後台對話紀錄 E2E Demo', () => {

  test('管理後台 — 解卡點 / 21 天練習 對話管理', async ({ page }) => {
    test.setTimeout(300_000)

    // ── 登入 ──
    await login(page)
    await page.waitForTimeout(2000)

    // ── 開場說明 ──
    await showBanner(page,
      '🛠️ 後台對話紀錄管理',
      `管理員可以查看所有用戶的對話歷史\n` +
      `分成兩大類：\n` +
      `🟣 解卡點 — 「我卡住幫我拆」的對話\n` +
      `🟢 21 天練習 — 課程練習的對話\n` +
      `支援搜尋、篩選、展開查看、匯出 CSV`,
      7000
    )

    // ── 進入管理後台 ──
    await page.goto('/manage/conversations')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // ── Step 1: 總覽 ──
    await showBanner(page,
      '📊 Step 1：對話總覽',
      `頁面上方顯示三個統計卡片\n` +
      `對話主題數 / 總訊息數 / 參與用戶數\n` +
      `一眼看到系統的使用狀況`,
      5000
    )

    const statCards = page.locator('.rounded-xl.border.border-surface-secondary.bg-white.p-4')
    if (await statCards.count() >= 3) {
      await highlight(page,
        '.rounded-xl.border.border-surface-secondary.bg-white.p-4',
        '🟠 統計卡片：對話主題數 / 總訊息數 / 參與用戶',
        'info', 5000
      )
    }

    // ── Step 2: Tab 篩選 ──
    await showBanner(page,
      '🏷️ Step 2：Tab 分類篩選',
      `點選不同 Tab 可以快速篩選：\n` +
      `「全部」— 所有對話\n` +
      `「解卡點」— 我卡住幫我拆的對話\n` +
      `「21 天練習」— 課程相關對話\n` +
      `「自由聊」— 一般對話`,
      6000
    )

    // 點「解卡點」tab
    const unpackTab = page.locator('button', { hasText: '解卡點' }).first()
    if (await unpackTab.isVisible()) {
      await highlight(page,
        page.locator('button', { hasText: '解卡點' }).first(),
        '🔵 點選「解卡點」— 只看我卡住幫我拆的對話',
        'navigate', 5000
      )
      await unpackTab.click()
      await page.waitForTimeout(2000)

      await highlight(page,
        '.space-y-2',
        '🟣 篩選結果：只顯示「解卡點」模式的對話，每筆有紫色標籤',
        'ai', 6000
      )
    }

    // 點「21 天練習」tab
    const journeyTab = page.locator('button', { hasText: '21 天練習' }).first()
    if (await journeyTab.isVisible()) {
      await highlight(page,
        page.locator('button', { hasText: '21 天練習' }).first(),
        '🔵 點選「21 天練習」— 只看課程練習的對話',
        'navigate', 5000
      )
      await journeyTab.click()
      await page.waitForTimeout(2000)

      await highlight(page,
        '.space-y-2',
        '🟢 篩選結果：只顯示「21 天」模式的對話，每筆有青色標籤',
        'input', 5000
      )
    }

    // 回到全部
    const allTab = page.locator('button', { hasText: '全部' }).first()
    if (await allTab.isVisible()) {
      await allTab.click()
      await page.waitForTimeout(1500)
    }

    // ── Step 3: 搜尋 ──
    await showBanner(page,
      '🔍 Step 3：搜尋用戶',
      `在搜尋框輸入用戶名稱、手機號碼或主題\n` +
      `即時篩選，快速找到特定用戶的對話`,
      5000
    )

    const searchInput = page.locator('input[placeholder*="搜尋"]')
    if (await searchInput.isVisible()) {
      await highlight(page,
        'input[placeholder*="搜尋"]',
        '🟢 搜尋框：輸入用戶名稱、手機、或對話主題',
        'input', 4000
      )

      await searchInput.fill('卡住')
      await page.waitForTimeout(2000)

      await highlight(page,
        '.space-y-2',
        '🟠 搜尋結果：顯示包含「卡住」的對話',
        'info', 5000
      )

      await searchInput.fill('')
      await page.waitForTimeout(1000)
    }

    // ── Step 4: 展開對話 ──
    await showBanner(page,
      '💬 Step 4：展開查看對話內容',
      `點選任一筆對話，可以展開看完整對話歷史\n` +
      `包含：用戶訊息、AI 回覆、時間、token 使用量\n` +
      `支援分頁瀏覽`,
      6000
    )

    const firstTopic = page.locator('.overflow-hidden.rounded-xl.border button').first()
    if (await firstTopic.isVisible()) {
      await highlight(page,
        '.overflow-hidden.rounded-xl.border button',
        '🔵 點選展開 — 查看這筆對話的完整內容',
        'navigate', 4000
      )
      await firstTopic.click()
      await page.waitForTimeout(3000)

      const expandedArea = page.locator('.border-t.border-surface-secondary')
      if (await expandedArea.first().isVisible()) {
        await highlight(page,
          '.border-t.border-surface-secondary',
          '🟣 對話內容：紫色標籤=AI 回覆 / 藍色標籤=用戶訊息 / 含時間與 token 數',
          'ai', 7000
        )
      }
    }

    // ── Step 5: 匯出 CSV ──
    await showBanner(page,
      '📥 Step 5：匯出 CSV',
      `點選「匯出 CSV」可以下載所有對話摘要\n` +
      `包含用戶、手機、教師、主題、訊息數、最後更新時間\n` +
      `方便離線分析或報告使用`,
      5000
    )

    const exportBtn = page.locator('button', { hasText: '匯出' })
    if (await exportBtn.isVisible()) {
      await highlight(page,
        page.locator('button', { hasText: '匯出' }).first(),
        '🟠 匯出 CSV — 下載對話摘要報表',
        'info', 5000
      )
    }

    // ── 結尾 ──
    await showBanner(page,
      '✅ 後台功能總結',
      `🟣 解卡點 Tab — 查看「我卡住幫我拆」的所有對話\n` +
      `🟢 21 天練習 Tab — 查看課程練習的所有對話\n` +
      `🔍 搜尋 — 用名稱、手機、主題快速定位\n` +
      `💬 展開 — 完整對話歷史 + token 統計\n` +
      `📥 匯出 — CSV 報表下載\n` +
      `每筆對話標記 mode + unpack stage + 問題摘要`,
      8000
    )

    await page.screenshot({ path: 'test-results/manage-demo-final.png', fullPage: true })
  })
})
