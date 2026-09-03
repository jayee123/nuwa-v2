import { test, expect } from '@playwright/test'

const TEST_PHONE = '0936923912'
const TEST_PASSWORD = 'nuwa168'

// ── Highlight helper (boundingBox + viewport-safe) ──
async function highlight(
  page: import('@playwright/test').Page,
  selector: string | import('@playwright/test').Locator,
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

  const locator = typeof selector === 'string' ? page.locator(selector).first() : selector.first()
  const box = await locator.boundingBox().catch(() => null)
  if (!box) return

  const vw = await page.evaluate(() => window.innerWidth)
  const vh = await page.evaluate(() => window.innerHeight)

  const ringLeft = Math.max(0, Math.min(box.x - 6, vw - box.width - 12))
  const ringTop = Math.max(0, Math.min(box.y - 6, vh - box.height - 12))
  const tipBelow = (box.y + box.height + 50) < vh
  const tipTop = tipBelow ? box.y + box.height + 10 : Math.max(4, box.y - 44)
  const tipLeft = Math.max(8, Math.min(box.x, vw - 420))

  await page.evaluate(
    ({ lbl, ringColor, bgColor, rLeft, rTop, rW, rH, tLeft, tTop }) => {
      const ring = document.createElement('div')
      ring.id = '__highlight_ring'
      ring.style.cssText = `position:fixed;z-index:99999;left:${rLeft}px;top:${rTop}px;width:${rW}px;height:${rH}px;border:3px solid ${ringColor};border-radius:12px;pointer-events:none;animation:hlPulse .6s ease-in-out infinite alternate;`

      const tip = document.createElement('div')
      tip.id = '__highlight_tip'
      tip.style.cssText = `position:fixed;z-index:99999;left:${tLeft}px;top:${tTop}px;background:${bgColor};color:#fff;font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25);max-width:min(85vw,440px);white-space:pre-wrap;line-height:1.4;`
      tip.textContent = lbl

      const style = document.createElement('style')
      style.id = '__highlight_style'
      style.textContent = `@keyframes hlPulse{from{opacity:1}to{opacity:.3}}`

      document.body.append(style, ring, tip)
    },
    { lbl: label, ringColor: c.ring, bgColor: c.bg, rLeft: ringLeft, rTop: ringTop, rW: box.width + 12, rH: box.height + 12, tLeft: tipLeft, tTop: tipTop }
  )
  await page.waitForTimeout(durationMs)
  await page.screenshot({ path: `test-results/full-${Date.now()}.png`, fullPage: false })
  await page.evaluate(() => { document.getElementById('__highlight_ring')?.remove(); document.getElementById('__highlight_tip')?.remove(); document.getElementById('__highlight_style')?.remove() })
}

// ── Banner helper ──
async function banner(page: import('@playwright/test').Page, title: string, body: string, ms = 6000) {
  await page.evaluate(({ t, b }) => {
    const o = document.createElement('div')
    o.id = '__banner'
    o.style.cssText = 'position:fixed;z-index:999999;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.75);pointer-events:none;'
    o.innerHTML = `<div style="background:#1e293b;border-radius:16px;padding:28px 36px;max-width:580px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4)"><div style="font-size:18px;font-weight:700;color:#f97316;margin-bottom:10px">${t}</div><div style="font-size:13px;color:#e2e8f0;line-height:1.8;white-space:pre-wrap">${b}</div></div>`
    document.body.appendChild(o)
  }, { t: title, b: body })
  await page.waitForTimeout(ms)
  await page.screenshot({ path: `test-results/full-${Date.now()}.png`, fullPage: false })
  await page.evaluate(() => document.getElementById('__banner')?.remove())
}

// ── Login ──
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="tel"]').first().fill(TEST_PHONE)
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForSelector('input[inputmode="numeric"]', { timeout: 10_000 })
  await page.locator('input[inputmode="numeric"]').click()
  await page.keyboard.type('1234', { delay: 100 })
  await page.waitForFunction(() => { const b = document.querySelector('button') as HTMLButtonElement | null; return b && b.textContent?.includes('驗證登入') && !b.disabled }, { timeout: 5_000 })
  await page.locator('button', { hasText: '驗證登入' }).click()
  await page.waitForURL('**/dashboard**', { timeout: 20_000 })
}

// ══════════════════════════════════════════════════
test.describe('完整功能 E2E Demo — P0+P1+P2 全功能展示', () => {

  test('公開引流 → 登入 → 解卡點 → 21 天 → 後台', async ({ page }) => {
    test.setTimeout(480_000)

    // ══════════════════════════════════════
    // Part 1: 公開引流頁 /stuck
    // ══════════════════════════════════════
    await banner(page,
      '🌟 Part 1：公開引流頁（不用登入）',
      `新功能：/stuck 頁面讓訪客免費體驗 3 次對話\n對齊：升維 Stack L1 入口\n目的：從 FB 廣告進來的使用者，直接體驗「我卡住幫我拆」`,
      6000
    )

    await page.goto('/stuck')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await highlight(page, 'input[placeholder*="問題"]', '🟢 訪客不用登入，直接輸入困擾', 'input', 5000)

    const stuckInput = page.locator('input[placeholder*="問題"]').first()
    await stuckInput.fill('我跟老公常常為了小孩教育的事吵架，他覺得我管太多')
    await page.waitForTimeout(1500)

    await highlight(page, page.locator('button[type="submit"]').first(), '🟢 送出 → AI 即時回覆（免費，不用註冊）', 'input', 4000)
    await page.locator('button[type="submit"]').first().click()

    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('.rounded-2xl')
      return msgs.length >= 2 && (msgs[msgs.length - 1] as HTMLElement).textContent!.length > 10
    }, { timeout: 30_000 })
    await page.waitForTimeout(4000)

    await highlight(page, '.rounded-2xl', '🟣 AI 用三步心法回覆：接住情緒 → 打破認知 → 行動建議\n品牌紀律（P0）：不說「你必須」，改說「你可以試試」', 'ai', 7000)

    await page.waitForTimeout(2000)

    // ══════════════════════════════════════
    // Part 2: 登入 → Dashboard
    // ══════════════════════════════════════
    await banner(page,
      '🔐 Part 2：登入後的會員體驗',
      `登入後看到兩個核心功能入口：\n🧩 我卡住幫我拆 — Mode 2 諮詢師（§13）\n📅 21 天刻意練習 — Mode 1 教練（§6）`,
      5000
    )

    await login(page)
    await page.waitForTimeout(2000)

    await highlight(page, 'a[href="/dashboard/practice/unpack"]', '🔴 新功能入口：「我卡住，幫我拆」\n升維 Stack L1 — immediate pain solve', 'compare', 6000)

    // ══════════════════════════════════════
    // Part 3: 解卡點 5 步漏斗
    // ══════════════════════════════════════
    await page.locator('a[href="/dashboard/practice/unpack"]').click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await banner(page,
      '🧩 Part 3：解卡點對話（5 步漏斗）',
      `P1-6: Lead & Probe SOP\nStep 1 診斷 → Step 2 路徑選擇 → Step 3 深入拆解 → Step 4 引導\n對齊：Steven spec §13 Mode 2 + positioning §9`,
      5000
    )

    const unpackInput = page.locator('input[placeholder*="問題"]').first()
    await unpackInput.fill('我兒子 14 歲整天玩手機不理人，叫他吃飯也不出來，我不知道怎麼辦')
    await page.waitForTimeout(1500)
    await page.locator('button[type="submit"]').first().click()

    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('.rounded-2xl')
      return msgs.length >= 2 && (msgs[msgs.length - 1] as HTMLElement).textContent!.length > 10
    }, { timeout: 30_000 })
    await page.waitForTimeout(5000)

    await highlight(page, '.bg-surface-secondary.rounded-2xl', '🟣 Step 1 診斷：一針見血 + 今晚能做的建議\n盲點偵測（P1-2）：偵測到 B1-B5 會溫柔提醒', 'ai', 7000)

    const opts = page.locator('button.border-brand-purple\\/30')
    if (await opts.count() > 0) {
      await highlight(page, opts.first(), '🟠 Step 2 路徑選擇：了解對方 / 看自己 / 先試試\n新功能（P1-6）：使用者決定方向，AI 跟著走', 'info', 6000)
    }

    await unpackInput.fill('我想更了解他為什麼這樣，他平常很安靜不太說話')
    await page.waitForTimeout(1000)
    await page.locator('button[type="submit"]').first().click()

    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('.rounded-2xl')
      return msgs.length >= 4 && (msgs[msgs.length - 1] as HTMLElement).textContent!.length > 10
    }, { timeout: 30_000 })
    await page.waitForTimeout(5000)

    await highlight(page, '.bg-surface-secondary.rounded-2xl:last-of-type', '🟣 Step 3 深入拆解：推測個性傾向（不直接說 MBTI）\nMBTI 防漂移（P0-3）：不用認知功能組合', 'ai', 7000)

    // 返回
    await page.waitForTimeout(2000)
    const backLink = page.locator('a[href="/dashboard/practice"]')
    if (await backLink.isVisible()) {
      await backLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1500)
    }

    // ══════════════════════════════════════
    // Part 4: 練習專區
    // ══════════════════════════════════════
    await banner(page,
      '📋 Part 4：練習專區',
      `新頁面：/dashboard/practice\nMode 1（21天）+ Mode 2（解卡點）統一入口\n對齊：§13.1.2「同一 User 的兩種姿態」`,
      5000
    )

    // ══════════════════════════════════════
    // Part 5: 21 天刻意練習
    // ══════════════════════════════════════
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    await highlight(page, page.locator('a[href="/dashboard/service/happy"]').first(), '🔵 進入 21 天刻意練習 — Mode 1 Learner 姿態', 'navigate', 5000)
    await page.locator('a[href="/dashboard/service/happy"]').first().click()
    await page.waitForLoadState('networkidle')

    await page.waitForSelector('input[placeholder="輸入你的回應..."]', { timeout: 15_000 })
    await page.waitForTimeout(2000)

    await banner(page,
      '📅 Part 5：21 天刻意練習',
      `P0：品牌紀律 + Day Lock + Week Structure\nP1：MBTI 16型深度檔案 + 盲點偵測 B1-B5\nP2：GOLDEN_EXAMPLE few-shot + W2 內觀紀律`,
      6000
    )

    const jInput = page.locator('input[placeholder="輸入你的回應..."]')
    await jInput.fill('我今天跟另一半吵架了，他總是不聽我說話，我都是為他好')
    await page.waitForTimeout(1500)
    await page.locator('button[type="submit"]').click()

    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('[class*="rounded-2xl"]')
      return msgs.length >= 2
    }, { timeout: 30_000 })
    await page.waitForTimeout(6000)

    await highlight(page, '[class*="rounded-2xl"]', '🟣 AI 回覆特色：\n• MBTI 深度檔案（P1-1）：帶入對方渴望/地雷\n• 盲點偵測（P1-2）：「我都是為他好」→ B1 提醒\n• 品牌紀律（P0-1）：不說「你必須」\n• Day Lock（P0-4）：鎖定今天主題', 'ai', 8000)

    await jInput.fill('他是 ISTJ，很固執，我該怎麼跟他溝通？')
    await page.waitForTimeout(1500)
    await page.locator('button[type="submit"]').click()

    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('[class*="rounded-2xl"]')
      return msgs.length >= 4
    }, { timeout: 30_000 })
    await page.waitForTimeout(6000)

    await highlight(page, '[class*="rounded-2xl"]:last-of-type', '🟣 ISTJ 深度檔案自動帶入：\n• 渴望：被尊重、被認可付出\n• 地雷：被質疑能力或承諾\n• 解鎖：給具體行動方案', 'ai', 8000)

    // ══════════════════════════════════════
    // Part 6: 後台對話管理
    // ══════════════════════════════════════
    await banner(page,
      '🛠️ Part 6：後台對話管理',
      `管理員可查看所有對話紀錄\n🟣 解卡點 Tab — 我卡住幫我拆的對話\n🟢 21 天練習 Tab — 課程對話\n搜尋、篩選、展開、匯出 CSV`,
      5000
    )

    await page.goto('/manage/conversations')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const unpackTab = page.locator('button', { hasText: '解卡點' }).first()
    if (await unpackTab.isVisible()) {
      await highlight(page, unpackTab, '🔵 解卡點 Tab — 篩選 Mode 2 對話', 'navigate', 5000)
      await unpackTab.click()
      await page.waitForTimeout(2000)
      await highlight(page, '.space-y-2', '🟣 解卡點對話列表：紫色標籤 + stage + 問題摘要', 'ai', 5000)
    }

    const journeyTab = page.locator('button', { hasText: '21 天練習' }).first()
    if (await journeyTab.isVisible()) {
      await highlight(page, journeyTab, '🔵 21 天練習 Tab — 篩選 Mode 1 對話', 'navigate', 5000)
      await journeyTab.click()
      await page.waitForTimeout(2000)
      await highlight(page, '.space-y-2', '🟢 21 天對話列表：青色標籤', 'input', 5000)
    }

    const allTab = page.locator('button', { hasText: '全部' }).first()
    if (await allTab.isVisible()) { await allTab.click(); await page.waitForTimeout(1000) }

    const firstTopic = page.locator('.overflow-hidden.rounded-xl.border button').first()
    if (await firstTopic.isVisible()) {
      await highlight(page, firstTopic, '🔵 展開 — 查看完整對話歷史', 'navigate', 4000)
      await firstTopic.click()
      await page.waitForTimeout(3000)
      const expanded = page.locator('.border-t.border-surface-secondary')
      if (await expanded.first().isVisible()) {
        await highlight(page, expanded.first(), '🟣 對話紀錄：用戶訊息 + AI 回覆 + token 統計', 'ai', 6000)
      }
    }

    // ══════════════════════════════════════
    // Part 7: 課程管理後台
    // ══════════════════════════════════════
    await banner(page,
      '📚 Part 7：課程管理後台',
      `管理員可編輯 21 天每日課程內容\n知識點 / 任務 / 反思問題 / AI 指令\n這些內容直接影響 AI 的教學回覆`,
      5000
    )

    await page.goto('/manage/course-days')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const dayButtons = page.locator('button', { hasText: 'Day' })
    if (await dayButtons.count() > 0) {
      await highlight(page, dayButtons.first(), '🔵 左側 Day 列表 — 點選任一天可編輯課程內容', 'navigate', 5000)
    }

    // ══════════════════════════════════════
    // 結尾
    // ══════════════════════════════════════
    await banner(page,
      '✅ 全功能測試完成',
      `P0（品質基礎）：品牌紀律 / 記憶注入 / MBTI 守則 / Day Lock / Week Structure\n` +
      `P1（深度提升）：16型 MBTI 檔案 / 盲點偵測 B1-B5 / 品牌語言 / 5步漏斗\n` +
      `P2（進階功能）：/stuck 公開引流 / few-shot 範例 / W2 內觀紀律\n\n` +
      `前端：/stuck / /dashboard/practice / /dashboard/practice/unpack\n` +
      `後台：/manage/conversations / /manage/course-days\n` +
      `對齊 Steven spec：§6 §13 §1.13 §5.3 positioning §2 §9`,
      8000
    )

    await page.screenshot({ path: 'test-results/full-demo-final.png', fullPage: true })
  })
})
