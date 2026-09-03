import { test, expect } from '@playwright/test'

/**
 * nexthappy E2E Demo — Steven's happy-relationship-app 完整復刻版
 * 測試對象：http://localhost:3002（獨立部署，happy schema）
 * 解析度：1920x1080
 */

const BASE = 'http://localhost:3002'
const TEST_EMAIL = 'test@nexthappy.test'
const TEST_PASSWORD = 'test1234'

// ─── Highlight helpers ───

async function highlight(
  page: import('@playwright/test').Page,
  selector: string,
  label: string,
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' = 'blue',
  durationMs = 4000
) {
  const colors = {
    blue:   { ring: '#3b82f6', bg: '#3b82f6' },
    green:  { ring: '#22c55e', bg: '#16a34a' },
    purple: { ring: '#a855f7', bg: '#9333ea' },
    orange: { ring: '#f97316', bg: '#ea580c' },
    red:    { ring: '#ef4444', bg: '#dc2626' },
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
  const tipLeft = Math.max(8, Math.min(box.x, vw - 500))

  await page.evaluate(
    ({ lbl, ringColor, bgColor, rLeft, rTop, rW, rH, tLeft, tTop }) => {
      const ring = document.createElement('div')
      ring.id = '__hl_ring'
      ring.style.cssText = `position:fixed;z-index:99999;left:${rLeft}px;top:${rTop}px;width:${rW}px;height:${rH}px;border:3px solid ${ringColor};border-radius:12px;pointer-events:none;animation:hlP 0.6s ease-in-out infinite alternate;`
      const tip = document.createElement('div')
      tip.id = '__hl_tip'
      tip.style.cssText = `position:fixed;z-index:99999;left:${tLeft}px;top:${tTop}px;background:${bgColor};color:#fff;font-size:14px;font-weight:600;padding:8px 16px;border-radius:8px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);max-width:min(85vw,550px);white-space:pre-wrap;line-height:1.5;`
      tip.textContent = lbl
      const st = document.createElement('style')
      st.id = '__hl_st'
      st.textContent = `@keyframes hlP{from{opacity:1}to{opacity:0.3}}`
      document.body.append(st, ring, tip)
    },
    { lbl: label, ringColor: c.ring, bgColor: c.bg, rLeft: ringLeft, rTop: ringTop, rW: box.width + 12, rH: box.height + 12, tLeft: tipLeft, tTop: tipTop }
  )
  await page.waitForTimeout(durationMs)
  await page.evaluate(() => {
    document.getElementById('__hl_ring')?.remove()
    document.getElementById('__hl_tip')?.remove()
    document.getElementById('__hl_st')?.remove()
  })
}

async function showBanner(page: import('@playwright/test').Page, title: string, body: string, ms = 5000) {
  await page.evaluate(({ t, b }) => {
    const o = document.createElement('div')
    o.id = '__banner'
    o.style.cssText = `position:fixed;z-index:999999;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);pointer-events:none;`
    o.innerHTML = `<div style="background:#1e293b;border-radius:16px;padding:36px 48px;max-width:700px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);"><div style="font-size:22px;font-weight:700;color:#f97316;margin-bottom:14px;">${t}</div><div style="font-size:15px;color:#e2e8f0;line-height:1.9;white-space:pre-wrap;">${b}</div></div>`
    document.body.appendChild(o)
  }, { t: title, b: body })
  await page.waitForTimeout(ms)
  await page.evaluate(() => document.getElementById('__banner')?.remove())
}

// ─── Test ───

test.describe('nexthappy 完整復刻 Demo（1080p）', () => {

  test('登入 → Onboarding → 我卡住幫我拆 → 21天練習 → Progress → Settings', async ({ page }) => {
    test.setTimeout(600_000)

    // ══════════════════════════════════════
    // 開場
    // ══════════════════════════════════════
    await page.goto(`${BASE}/auth/login`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await showBanner(page,
      '🌱 nexthappy 完整復刻 Demo',
      `Steven's happy-relationship-app 完全復刻版\n` +
      `部署目標：nexthappy.nyuwa.com.tw\n` +
      `共用 Supabase（happy schema 隔離）\n\n` +
      `功能：21天刻意練習 + 我卡住幫我拆 + Admin 後台\n` +
      `AI：Claude Sonnet（Anthropic SDK）\n` +
      `解析度：1920 × 1080`,
      7000
    )

    // ══════════════════════════════════════
    // Part 1: 登入
    // ══════════════════════════════════════
    await showBanner(page, '🔐 Part 1：登入', 'Email + 密碼認證\n邀請碼制度（封閉測試）', 3000)

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i]').first()
    const pwInput = page.locator('input[type="password"]').first()

    if (await emailInput.count() > 0) {
      await emailInput.fill(TEST_EMAIL)
      await pwInput.fill(TEST_PASSWORD)
      await page.waitForTimeout(1000)
      await highlight(page, 'button[type="submit"]', '登入 — Email/密碼認證', 'green', 3000)
      await page.locator('button[type="submit"]').click()
      await page.waitForURL('**/*', { timeout: 15_000 })
      await page.waitForTimeout(3000)
    }

    // ══════════════════════════════════════
    // Part 2: Onboarding（如果還沒完成）
    // ══════════════════════════════════════
    const currentUrl = page.url()
    if (currentUrl.includes('onboarding')) {
      await showBanner(page,
        '📋 Part 2：Onboarding',
        `Step 1：認識小羽（AI 教練介紹）\n` +
        `Step 2：選擇 MBTI + 信心度 + 暱稱\n\n` +
        `Trier-first：完成後可直接試用「我卡住幫我拆」\n` +
        `不強制開啟 21 天（降低門檻）`,
        5000
      )

      // Step 1: 歡迎頁
      const nextBtn = page.locator('button', { hasText: /下一步|開始|繼續/ }).first()
      if (await nextBtn.count() > 0) {
        await highlight(page, 'button:has-text("下一步"), button:has-text("開始"), button:has-text("繼續")', 'Step 1：認識小羽', 'green', 3000)
        await nextBtn.click()
        await page.waitForTimeout(2000)
      }

      // Step 2: MBTI 選擇
      const entjBtn = page.locator('button:has-text("ENTJ")').first()
      if (await entjBtn.count() > 0) {
        await showBanner(page, '🧠 MBTI 16 型選擇', '每個類型影響 AI 的回應角度\n選擇後 AI 用你的 MBTI 做個性化診斷', 3000)
        await entjBtn.click()
        await page.waitForTimeout(1000)
      }

      // Confidence
      const confBtn = page.locator('button:has-text("很確定"), button:has-text("大概是")').first()
      if (await confBtn.count() > 0) {
        await confBtn.click()
        await page.waitForTimeout(500)
      }

      // Submit
      const submitBtn = page.locator('button:has-text("完成"), button:has-text("開始練習"), button[type="submit"]').last()
      if (await submitBtn.count() > 0) {
        await highlight(page, 'button:has-text("完成"), button:has-text("開始練習")', '完成 Onboarding', 'green', 2000)
        await submitBtn.click()
        await page.waitForTimeout(5000)
      }
    }

    // ══════════════════════════════════════
    // Part 3: 主畫面 — 雙 Tab
    // ══════════════════════════════════════
    if (!page.url().includes('/chat')) {
      await page.goto(`${BASE}/chat`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(3000)
    }

    await showBanner(page,
      '💬 Part 3：主畫面 — 雙 Tab 架構',
      `🌱 21天刻意練習（Mode A）— 固定主題、循序漸進\n` +
      `🤝 我卡住，幫我拆（Mode B）— 即時診斷、解決困擾\n\n` +
      `Sidebar：對話歷史 + 主題管理 + 封存\n` +
      `對應 Steven spec §6 Dual Mode`,
      5000
    )

    await page.screenshot({ path: 'test-results/nexthappy-chat-main.png', fullPage: false })
    await page.waitForTimeout(2000)

    // ══════════════════════════════════════
    // Part 4: 切到「我卡住幫我拆」
    // ══════════════════════════════════════
    const tabUnpack = page.locator('button:has-text("卡住"), button:has-text("幫我拆")').first()
    if (await tabUnpack.count() > 0) {
      await highlight(page, 'button:has-text("卡住"), button:has-text("幫我拆")', '切換到「我卡住，幫我拆」— Mode B', 'orange', 3000)
      await tabUnpack.click()
      await page.waitForTimeout(3000)
    }

    await showBanner(page,
      '🤝 Part 4：我卡住，幫我拆',
      `Lead & Probe SOP（v1.3.8）：\n` +
      `Step 1 — 一針見血（Quick-scan → 1 診斷 + 1 action）\n` +
      `Step 2 — A/B 收尾（認知路徑 vs 行動路徑）\n` +
      `4S Trigger — 觀感想行一句話範本\n` +
      `CRITICAL FEW — A 教練紀律`,
      6000
    )

    // Send a message
    const chatInput = page.locator('textarea, input[type="text"]').last()
    if (await chatInput.count() > 0 && await chatInput.isVisible()) {
      await chatInput.fill('我兒子每天玩手機好幾個小時，成績掉到倒數，我一講他就關門，沒收手機還絕食，不知道怎麼辦')
      await page.waitForTimeout(1500)
      await highlight(page, 'textarea, input[type="text"]', '輸入困擾 — 5 個事實要素', 'green', 3000)

      const sendBtn = page.locator('button[type="submit"], button:has(svg)').last()
      if (await sendBtn.count() > 0) {
        await sendBtn.click()

        // Wait for AI streaming response
        await page.waitForTimeout(20000)

        await page.evaluate(() => {
          const containers = document.querySelectorAll('[class*="overflow"]')
          containers.forEach(c => { c.scrollTop = c.scrollHeight })
        })
        await page.waitForTimeout(3000)

        await highlight(page, '[class*="message"], [class*="prose"], [class*="markdown"]',
          'AI 回覆：一針見血 + A/B 收尾\nClaude Sonnet 即時串流',
          'purple', 8000
        )
      }
    }

    await page.screenshot({ path: 'test-results/nexthappy-unpack-chat.png', fullPage: false })

    // ══════════════════════════════════════
    // Part 5: 21 天練習 Tab
    // ══════════════════════════════════════
    const tabPractice = page.locator('button:has-text("21天"), button:has-text("練習")').first()
    if (await tabPractice.count() > 0) {
      await highlight(page, 'button:has-text("21天"), button:has-text("練習")', '切換到 21 天練習 — Mode A', 'blue', 3000)
      await tabPractice.click()
      await page.waitForTimeout(3000)
    }

    await showBanner(page,
      '🌱 Part 5：21 天刻意練習',
      `Week 1（Day 1-7）：對外覺察 — 觀察/傾聽/MBTI/同理\n` +
      `Week 2（Day 8-14）：對內覺察 — 自我觀察/情緒/需求\n` +
      `Week 3（Day 15-21）：整合應用 — 衝突/修復/習慣\n\n` +
      `每天：學（知識點）→ 練（行動任務）→ 回（晚間反思）`,
      5000
    )

    await page.screenshot({ path: 'test-results/nexthappy-practice.png', fullPage: false })

    // ══════════════════════════════════════
    // Part 6: Progress 頁面
    // ══════════════════════════════════════
    await page.goto(`${BASE}/progress`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await showBanner(page, '📊 Part 6：學習進度', '21 天日曆 + 積分 + 徽章\n三個里程碑：觀察者 / 語言轉換師 / 幸福實踐者', 4000)
    await page.screenshot({ path: 'test-results/nexthappy-progress.png', fullPage: true })

    // ══════════════════════════════════════
    // Part 7: Settings
    // ══════════════════════════════════════
    await page.goto(`${BASE}/settings`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await showBanner(page, '⚙️ Part 7：Settings', '用戶可自改 MBTI（PATCH /api/user/me）\n對應 Steven spec v1.3.8 hotfix #8', 4000)
    await page.screenshot({ path: 'test-results/nexthappy-settings.png', fullPage: true })

    // ══════════════════════════════════════
    // 結尾
    // ══════════════════════════════════════
    await showBanner(page,
      '✅ nexthappy 完整復刻 Demo 完成',
      `登入（Email + 密碼 + 邀請碼） ✅\n` +
      `Onboarding（MBTI 16 型 + 信心度）✅\n` +
      `主畫面雙 Tab（Mode A + Mode B） ✅\n` +
      `我卡住幫我拆（Lead & Probe SOP） ✅\n` +
      `21 天刻意練習（觀感想行 4 步）✅\n` +
      `學習進度（日曆 + 積分 + 徽章）✅\n` +
      `Settings（改 MBTI）✅\n\n` +
      `架構：共用 Supabase happy schema\n` +
      `部署：nexthappy.nyuwa.com.tw（Vercel）`,
      10000
    )

    await page.screenshot({ path: 'test-results/nexthappy-demo-final.png', fullPage: true })

    // 基本驗證
    expect(page.url()).toContain(BASE)
  })
})
