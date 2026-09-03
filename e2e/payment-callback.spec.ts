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

  test('查無此訂單時回 404、不會回 OK', async ({ request }) => {
    // 注意：目前實作是 `if (chkValue && localChk !== chkValue)`，
    // 也就是「沒帶 ChkValue 就跳過驗簽」。這裡確認即使跳過驗簽，
    // 也會因為查無訂單而擋下 —— 但驗簽本身應該改成必填。
    const res = await request.post(ENDPOINT, {
      multipart: {
        Td: 'NON-EXISTENT-ORDER',
        MN: '100',
        errcode: '00',
        note1: '00000000-0000-0000-0000-000000000000',
        note2: 'happy',
      },
    })

    expect(res.status()).toBe(404)
    expect(await res.text()).not.toBe('OK')
  })

  test('GET 不被接受（只允許 POST）', async ({ request }) => {
    const res = await request.get(ENDPOINT)
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})
