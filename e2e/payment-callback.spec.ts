/**
 * 紅陽 (esafe) 付款回呼驗簽 — 驗收測試
 *
 * /api/payment/callback 是 server-to-server 端點，沒有 session 保護，
 * 唯一的防線是 ChkValue 驗簽。這裡確認偽造的回呼進不來。
 *
 *   npx playwright test -c playwright.e2e.config.ts e2e/payment-callback.spec.ts
 */
import { test, expect } from '@playwright/test'

const ENDPOINT = '/api/payment/callback'

test.describe('付款回呼', () => {
  test('ChkValue 錯誤時回 400、不進入後續處理', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      multipart: {
        Td: 'FAKE-ORDER-0001',
        MN: '100',
        errcode: '00',
        ChkValue: 'THIS-IS-NOT-A-VALID-CHECKSUM',
        note1: '00000000-0000-0000-0000-000000000000',
        note2: 'happy',
      },
    })

    expect(res.status(), '偽造簽章應被擋下').toBe(400)
    expect(await res.text()).toContain('ChkValue')
  })

  test('沒帶 ChkValue 也回 400 —— 驗簽是必填，不是選填', async ({ request }) => {
    // 以前是「有帶才驗」：用戶自己 initiate 拿到 Td 後，POST 一個不帶 ChkValue 的
    // 回呼就能把自己的 pending 標成 paid、白拿一個月訂閱。這裡釘死不准再退回去。
    const res = await request.post(ENDPOINT, {
      multipart: {
        Td: 'NON-EXISTENT-ORDER',
        MN: '100',
        errcode: '00',
        note1: '00000000-0000-0000-0000-000000000000',
        note2: 'happy',
      },
    })

    expect(res.status(), '缺 ChkValue 必須在查訂單之前就被擋下').toBe(400)
    expect(await res.text()).toContain('ChkValue')
  })

  test('缺 Td 或 MN 也回 400', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      multipart: { errcode: '00', ChkValue: 'ABC' },
    })
    expect(res.status()).toBe(400)
  })

  test('GET 不被接受（只允許 POST）', async ({ request }) => {
    const res = await request.get(ENDPOINT)
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})
