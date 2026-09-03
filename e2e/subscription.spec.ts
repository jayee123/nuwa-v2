/**
 * 訂閱升降級 —— 驗收測試
 *
 * 這條路徑會動到錢與權益，先前完全沒有自動化覆蓋。
 *
 * 紀律：**只測失敗路徑**。
 * 成功的降級會寫入 users.next_plan，改變真實會員的方案狀態；
 * 成功的升級會導向金流。兩者都不該由測試觸發，因此這裡只驗守門是否有效。
 *
 * 需要登入的案例會讀 SESSION_COOKIES（見 sso-integration.spec.ts 檔頭說明），
 * 沒提供時自動略過。
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'

const SESSION_COOKIES = process.env.SESSION_COOKIES

function loadCookies(path: string) {
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8'))
  return Array.isArray(parsed) ? parsed : parsed.cookies
}

test.describe('降級 API 守門', () => {
  test('未登入時拒絕', async ({ request }) => {
    const res = await request.post('/api/subscription/downgrade', {
      data: { planCode: 'basic', serviceCode: 'happy' },
    })
    expect(res.status(), '未登入不得變更方案').toBe(401)
  })

  test('未登入時也不能取消降級排程', async ({ request }) => {
    const res = await request.delete('/api/subscription/downgrade')
    expect(res.status()).toBe(401)
  })

  test('無效的方案代碼被拒絕', async ({ context }) => {
    test.skip(!SESSION_COOKIES, '需要 SESSION_COOKIES')
    await context.addCookies(loadCookies(SESSION_COOKIES!))

    const res = await context.request.post('/api/subscription/downgrade', {
      data: { planCode: 'enterprise', serviceCode: 'happy' },
    })
    expect(res.status(), '不存在的方案應被擋下').toBe(400)
    expect((await res.json()).error).toContain('方案')
  })

  test('升級不能走降級端點', async ({ context }) => {
    test.skip(!SESSION_COOKIES, '需要 SESSION_COOKIES')
    await context.addCookies(loadCookies(SESSION_COOKIES!))

    // 測試帳號目前是 premium（最高級）。指定同級或更高級都不算降級，
    // 必須被擋下 —— 否則會出現「用降級端點免費升級」的漏洞。
    const res = await context.request.post('/api/subscription/downgrade', {
      data: { planCode: 'premium', serviceCode: 'happy' },
    })
    expect(res.status(), '非降級操作應被擋下').toBe(400)
    expect((await res.json()).error).toContain('降級')
  })
})

test.describe('自動扣款排程守門', () => {
  test('沒有排程金鑰時拒絕執行', async ({ request }) => {
    // 這支會真的對用戶的卡扣款，未帶正確金鑰絕不可執行
    const res = await request.get('/api/subscription/auto-charge')
    expect(res.status(), '缺少授權時必須拒絕').toBe(401)
  })

  test('錯誤的排程金鑰也拒絕', async ({ request }) => {
    const res = await request.get('/api/subscription/auto-charge', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    expect(res.status()).toBe(401)
  })

  test('到期通知排程同樣需要金鑰', async ({ request }) => {
    const res = await request.get('/api/subscription/notify-expiring')
    expect(res.status()).toBe(401)
  })
})

test.describe('方案清單', () => {
  test('公開端點回傳三個可訂閱方案', async ({ request }) => {
    const res = await request.get('/api/plans')
    expect(res.status()).toBe(200)

    // 回應形狀為 { data: [...] }
    const { data: plans } = await res.json()
    expect(Array.isArray(plans), '應回傳陣列').toBe(true)
    expect(plans.length, '應有 basic / advanced / premium').toBeGreaterThanOrEqual(3)

    const codes = plans.map((p: { code: string }) => p.code)
    expect(codes).toEqual(expect.arrayContaining(['basic', 'advanced', 'premium']))

    // 額度是公私版一致性的關鍵 —— 兩邊分岔過一次，這裡守住
    const byCode = Object.fromEntries(plans.map((p: { code: string; monthly_dialog_count: number }) => [p.code, p.monthly_dialog_count]))
    expect(byCode.basic).toBe(50)
    expect(byCode.advanced).toBe(100)
    expect(byCode.premium).toBe(200)
  })
})
