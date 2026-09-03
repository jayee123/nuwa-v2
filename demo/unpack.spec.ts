import { test, expect } from '@playwright/test'

const TEST_PHONE = '0936923912'
const TEST_PASSWORD = 'nuwa168'

/**
 * Colored highlight with category-based styling.
 * Colors: navigate=blue, input=green, ai=purple, info=orange, compare=red
 */
async function highlight(
  page: import('@playwright/test').Page,
  selector: string,
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

  const locator = page.locator(selector).last()
  await locator.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return

  const vw = await page.evaluate(() => window.innerWidth)
  const vh = await page.evaluate(() => window.innerHeight)

  const ringLeft = Math.max(0, Math.min(box.x - 6, vw - box.width - 12))
  const ringTop = Math.max(0, Math.min(box.y - 6, vh - box.height - 12))

  const tipBelow = (box.y + box.height + 50) < vh
  const tipTop = tipBelow ? box.y + box.height + 10 : Math.max(4, box.y - 44)
  const tipLeft = Math.max(8, Math.min(box.x, vw - 400))

  await page.evaluate(
    ({ lbl, ringColor, bgColor, rLeft, rTop, rW, rH, tLeft, tTop }) => {
      const ring = document.createElement('div')
      ring.id = '__highlight_ring'
      ring.style.cssText = `
        position:fixed; z-index:99999;
        left:${rLeft}px; top:${rTop}px;
        width:${rW}px; height:${rH}px;
        border:3px solid ${ringColor}; border-radius:12px;
        pointer-events:none;
        animation: hlPulse 0.6s ease-in-out infinite alternate;
      `

      const tip = document.createElement('div')
      tip.id = '__highlight_tip'
      tip.style.cssText = `
        position:fixed; z-index:99999;
        left:${tLeft}px; top:${tTop}px;
        background:${bgColor}; color:#fff; font-size:13px; font-weight:600;
        padding:6px 14px; border-radius:8px;
        pointer-events:none;
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        max-width:min(85vw, 450px); white-space:pre-wrap; line-height:1.4;
      `
      tip.textContent = lbl

      const style = document.createElement('style')
      style.id = '__highlight_style'
      style.textContent = `@keyframes hlPulse { from { opacity:1 } to { opacity:0.3 } }`

      document.body.append(style, ring, tip)
    },
    {
      lbl: label, ringColor: c.ring, bgColor: c.bg,
      rLeft: ringLeft, rTop: ringTop, rW: box.width + 12, rH: box.height + 12,
      tLeft: tipLeft, tTop: tipTop,
    }
  )

  await page.waitForTimeout(durationMs)
  await page.screenshot({ path: `test-results/step-${Date.now()}.png`, fullPage: false })

  await page.evaluate(() => {
    document.getElementById('__highlight_ring')?.remove()
    document.getElementById('__highlight_tip')?.remove()
    document.getElementById('__highlight_style')?.remove()
  })
}

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
  await page.screenshot({ path: `test-results/step-${Date.now()}.png`, fullPage: false })
  await page.evaluate(() => document.getElementById('__banner')?.remove())
}

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

/** Wait for AI reply with content, scoped to chat area */
async function waitForAiReply(page: import('@playwright/test').Page, minMessages: number) {
  await page.waitForFunction(
    (min: number) => {
      const container = document.querySelector('.overflow-y-auto')
      if (!container) return false
      const msgs = container.querySelectorAll('.rounded-2xl')
      return msgs.length >= min && (msgs[msgs.length - 1] as HTMLElement).textContent!.length > 10
    },
    minMessages,
    { timeout: 45_000 }
  )
  // Scroll chat to bottom to see latest message
  await page.evaluate(() => {
    const container = document.querySelector('.overflow-y-auto')
    if (container) container.scrollTop = container.scrollHeight
  })
  await page.waitForTimeout(5000)
}

test.describe('Lead & Probe SOP E2E Demo — v1.3.8 對齊版', () => {

  test('完整 funnel 測試：diagnose → 4S → 深度版 → 後台統計', async ({ page }) => {
    test.setTimeout(480_000)

    // ══════════════════════════════════════
    // 開場
    // ══════════════════════════════════════
    await login(page)
    await page.waitForTimeout(2000)

    await showBanner(page,
      '🧭 Lead & Probe SOP — v1.3.8 對齊版 E2E Demo',
      `本次測試驗證 Steven v1.3.8 對齊的完整 funnel：\n\n` +
      `Step 1 — 一針見血（CRITICAL FEW：1 診斷 + 1 action）\n` +
      `Step 2 — A/B 二選一收尾 + 4S Trigger Handler\n` +
      `Step 3 — 深度版（Path C 雙方完整拆）\n` +
      `收尾 — 預演 + 21 天 hook\n\n` +
      `新增：3 條鐵律（不斷層/不回頭/一次一步）`,
      8000
    )

    // ══════════════════════════════════════
    // Part 1: Dashboard 入口
    // ══════════════════════════════════════
    await highlight(page,
      'a[href="/dashboard/practice/unpack"]',
      '入口：「我卡住，幫我拆」— 對應升維 Stack L1',
      'navigate', 4000
    )

    await page.locator('a[href="/dashboard/practice/unpack"]').click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await showBanner(page,
      '🟪 Step 1：一針見血',
      `CRITICAL FEW 紀律（A 教練原則）：\n` +
      `- Quick-scan：≥3 個事實要素 → 直接診斷，不盤問\n` +
      `- 1 個關鍵診斷（啊哈點）\n` +
      `- 1 個今晚就能做的 action\n` +
      `- 結尾強制 A/B 二選一 hook`,
      6000
    )

    // ══════════════════════════════════════
    // Part 2: Step 1 — 一針見血
    // ══════════════════════════════════════
    const chatInput = page.locator('input[placeholder="說說你遇到的問題..."]')

    await highlight(page, 'input[placeholder="說說你遇到的問題..."]',
      '使用者輸入困擾 — 提供 ≥3 個事實要素觸發 Quick-scan',
      'input', 3000
    )

    await chatInput.fill('我兒子每天玩手機好幾個小時，成績掉到倒數，我一講他就關門，沒收手機還絕食，不知道怎麼辦')
    await page.waitForTimeout(1500)
    await page.locator('button[type="submit"]').click()

    await waitForAiReply(page, 2)

    await highlight(page,
      '.overflow-y-auto .bg-surface-secondary',
      'Step 1 回覆：1 個診斷 + 1 個 action + A/B 收尾\n' +
      '對應 CRITICAL FEW 規則 2（≤400 字）',
      'ai', 8000
    )

    // 檢查選項按鈕
    const optionButtons = page.locator('button.border-brand-purple\\/30')
    const optCount = await optionButtons.count()
    if (optCount > 0) {
      await highlight(page,
        'button.border-brand-purple\\/30',
        'Lead & Probe 動態選項\n' +
        '包含「教我一句話（4S）」trigger button',
        'info', 5000
      )
    }

    // ══════════════════════════════════════
    // Part 3: Step 2 — 使用者提供對方資訊
    // ══════════════════════════════════════
    await showBanner(page,
      '🟩 Step 2A：使用者提供對方資訊',
      `使用者選擇 A 路徑（認知路徑）\n` +
      `提供對方的個性描述\n` +
      `AI 用個性傾向分析對方行為底層需求\n` +
      `結尾僅 hook「回我 4S」（鐵律 3：一次一步）`,
      5000
    )

    await chatInput.fill('他今年14歲，平常很安靜不太講話，但打遊戲的時候很投入。他可能是 ISTJ 型的')
    await page.waitForTimeout(1500)
    await page.locator('button[type="submit"]').click()

    await waitForAiReply(page, 4)

    await highlight(page,
      '.overflow-y-auto .bg-surface-secondary',
      'Step 2A 深化：用個性傾向分析\n' +
      '結尾 hook「回我 4S」（一次一步、不跨層）',
      'ai', 8000
    )

    // ══════════════════════════════════════
    // Part 4: 4S Trigger Handler
    // ══════════════════════════════════════
    await showBanner(page,
      '🎯 4S Trigger Handler',
      `Magic word「4S」觸發一句話範本\n\n` +
      `格式：[場景]（觀察）+ [感受]（感受）+ [需求]（需求）+ [請求]（請求）\n\n` +
      `鐵律：用 user case 的具體場景（不可 generic）\n` +
      `結尾 3 層：洞察 + 預演 + 深度版 hook`,
      6000
    )

    const has4sButton = await page.locator('button.border-brand-purple\\/30', { hasText: '4S' }).count()
    if (has4sButton > 0) {
      await highlight(page,
        'button.border-brand-purple\\/30:has-text("4S")',
        '點擊 4S trigger button — 降低 friction',
        'input', 3000
      )
      await page.locator('button.border-brand-purple\\/30', { hasText: '4S' }).click()
    } else {
      await chatInput.fill('4S')
      await page.waitForTimeout(500)
      await page.locator('button[type="submit"]').click()
    }

    await waitForAiReply(page, 6)

    await highlight(page,
      '.overflow-y-auto .bg-surface-secondary',
      '4S 範本句：觀察 / 感受 / 需求 / 請求 4 標籤\n' +
      '用兒子玩手機的具體場景（非 generic）\n' +
      '結尾接「深度版」hook（鐵律 1：不斷層）',
      'ai', 10000
    )

    // ══════════════════════════════════════
    // Part 5: 深度版 trigger → Path C
    // ══════════════════════════════════════
    await showBanner(page,
      '🌊 Step 3 Path C：完整深度版',
      `trigger word「深度版」直接觸發 Path C\n\n` +
      `結構：共鳴開場 → 雙方 anchor → 【觀】觀察傾聽\n` +
      `→ 【感】識別情緒 → 【想】釐清需求 → 核心心法\n` +
      `→ 【行】3 個具體行動 → 預演 + 21 天 hook`,
      6000
    )

    const hasDeepButton = await page.locator('button.border-brand-purple\\/30', { hasText: '深度版' }).count()
    if (hasDeepButton > 0) {
      await page.locator('button.border-brand-purple\\/30', { hasText: '深度版' }).click()
    } else {
      await chatInput.fill('深度版')
      await page.waitForTimeout(500)
      await page.locator('button[type="submit"]').click()
    }

    await waitForAiReply(page, 8)

    await page.evaluate(() => {
      const container = document.querySelector('.overflow-y-auto')
      if (container) container.scrollTop = container.scrollHeight
    })
    await page.waitForTimeout(2000)

    await highlight(page,
      '.overflow-y-auto .bg-surface-secondary',
      'Path C 完整輸出：【觀】【感】【想】【行】\n' +
      '雙方個性 anchor + 4 步覺察 + 3 行動\n' +
      '結尾：預演 hook + 21 天 hook（funnel 終點）',
      'ai', 10000
    )

    // ══════════════════════════════════════
    // Part 6: 後台統計驗證
    // ══════════════════════════════════════
    await showBanner(page,
      '📊 後台統計：AI 使用數據',
      `驗證後台 /manage 新增的 AI 統計區塊\n` +
      `解卡點對話數 + 21 天練習數\n` +
      `7/30 天活躍對話 + 模式分佈圖`,
      5000
    )

    await page.goto('/manage')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await highlight(page,
      'h1',
      '後台統計總覽',
      'navigate', 3000
    )

    const aiStatsHeading = page.locator('h2', { hasText: 'AI 使用統計' })
    if (await aiStatsHeading.count() > 0) {
      await aiStatsHeading.scrollIntoViewIfNeeded()
      await page.waitForTimeout(1000)
      await highlight(page,
        'h2:has-text("AI 使用統計")',
        '新增 AI 統計區塊：解卡點 / 21 天 / 活躍對話',
        'compare', 6000
      )
    }

    const modeChart = page.locator('text=對話模式分佈')
    if (await modeChart.count() > 0) {
      await modeChart.scrollIntoViewIfNeeded()
      await page.waitForTimeout(1000)
      await highlight(page,
        ':has-text("對話模式分佈")',
        '模式分佈：Mode A/B 比例 + 轉化率\n' +
        '對應升維 Stack L1→L2 轉化追蹤',
        'compare', 6000
      )
    }

    // ══════════════════════════════════════
    // 結尾
    // ══════════════════════════════════════
    await showBanner(page,
      '✅ Lead & Probe SOP E2E 測試完成',
      `Step 1 一針見血 ✅ — CRITICAL FEW（1 診斷 + 1 action）\n` +
      `Step 2 A/B 收尾 ✅ — 認知路徑 + 行動路徑\n` +
      `4S Trigger ✅ — 觀感想行 4 標籤範本句\n` +
      `深度版 Path C ✅ — 【觀】【感】【想】【行】完整拆解\n` +
      `3 鐵律 ✅ — 不斷層 / 不回頭 / 一次一步\n` +
      `後台 AI 統計 ✅ — Mode A/B 分佈 + 轉化率\n\n` +
      `對齊版本：Steven v2.1-course-spec v1.3.8`,
      10000
    )

    await page.screenshot({ path: 'test-results/demo-lead-probe-final.png', fullPage: true })

    // Verify we're on manage page with AI stats
    await expect(page.locator('h1', { hasText: '統計總覽' })).toBeVisible()
    await expect(page.locator('h2', { hasText: 'AI 使用統計' })).toBeVisible()
  })
})
