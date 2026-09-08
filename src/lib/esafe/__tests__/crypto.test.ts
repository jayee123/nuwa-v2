/**
 * AES-256-CBC round-trip 測試（PAYMENT_BOUNDARIES §G.2）。
 *
 * decrypt 的前處理是針對紅陽 form POST 的實務：payload 經過 URL encode 後
 * `+` 會變空格，所以 decrypt 先 decodeURIComponent、再把空格還原成 `+`。
 * 這兩條路徑都要有測試釘住，V1 就踩過這個雷。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '../crypto'

// base64('A' * 32) / base64('B' * 16) — 固定假金鑰，非真實憑證
const TEST_KEY = 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE='
const TEST_IV = 'QkJCQkJCQkJCQkJCQkJCQg=='

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.ESAFE_ENC_KEY = TEST_KEY
  process.env.ESAFE_ENC_IV = TEST_IV
})

describe('encrypt → decrypt round-trip', () => {
  it('ASCII 物件', async () => {
    const data = { paymentToken: 'tok_abc123', price: 1888 }
    expect(await decrypt(await encrypt(data))).toEqual(data)
  })

  it('中文與特殊字元（+ / = & % 空格）', async () => {
    const data = {
      orderInfo: '旗艦方案 月扣款',
      note: 'a+b/c=d&e%f g',
      nested: { name: '測試用戶', symbols: '!@#$%^&*()' },
    }
    expect(await decrypt(await encrypt(data))).toEqual(data)
  })

  it('空物件', async () => {
    expect(await decrypt(await encrypt({}))).toEqual({})
  })
})

describe('decrypt 的 URL-encode 前處理（模擬紅陽 form POST）', () => {
  it('base64 裡的 + 被表單解碼成空格後仍可還原', async () => {
    // 找一筆密文含 '+' 的輸入（固定資料算出來的 base64 若沒有 + 就換 payload）
    let cipher = ''
    let payload = { seq: 0 }
    for (let i = 0; i < 200 && !cipher.includes('+'); i++) {
      payload = { seq: i }
      cipher = await encrypt(payload)
    }
    expect(cipher).toContain('+')
    expect(await decrypt(cipher.replace(/\+/g, ' '))).toEqual(payload)
  })

  it('整串被 encodeURIComponent 過仍可還原', async () => {
    const data = { td: 'ORDER_001', mn: '1888' }
    const cipher = await encrypt(data)
    expect(await decrypt(encodeURIComponent(cipher))).toEqual(data)
  })
})

describe('壞輸入不吞錯', async () => {
  it('非 base64 垃圾輸入 → reject', async () => {
    await expect(decrypt('!!!not-base64!!!')).rejects.toThrow()
  })

  it('金鑰長度錯誤 → reject（encrypt 端）', async () => {
    process.env.ESAFE_ENC_KEY = Buffer.from('too-short').toString('base64')
    await expect(encrypt({ a: 1 })).rejects.toThrow()
  })

  it('用錯 IV 解不回原文（回垃圾或 throw，但絕不回正確物件）', async () => {
    const data = { secret: 'value' }
    const cipher = await encrypt(data)
    process.env.ESAFE_ENC_IV = Buffer.from('C'.repeat(16)).toString('base64')
    // padding 恰好合法時 JSON.parse 會失敗、或解出亂碼；兩種都不等於原物件
    await expect(
      decrypt(cipher).then(
        (out) => JSON.stringify(out) === JSON.stringify(data),
        () => false,
      ),
    ).resolves.toBe(false)
  })
})
