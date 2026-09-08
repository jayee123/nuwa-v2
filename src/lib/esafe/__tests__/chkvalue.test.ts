/**
 * ChkValue 公式鎖定測試（PAYMENT_BOUNDARIES §G.1）。
 *
 * 期望值是用固定測試憑證「離線預先算好」的常數，不是在測試裡呼叫同一段
 * 實作重算 —— 否則公式被改壞測試也照樣過。若這些常數開始失敗，
 * 代表串接順序 / 演算法 / 大小寫其中之一被動到了，先對 V1 PHP 驗證再改。
 *
 * 憑證一律用假值；secret_params 的 DB 查詢在測試中會因缺 SUPABASE env
 * 進 catch、fallback 到 process.env（lib/secret-params.ts 的既定行為）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  chkValueBinding,
  chkValueCallback,
  chkValueCallbackRaw,
  chkValuePasscode,
  chkValuePayment,
} from '../chkvalue'

const TEST_MERCHANT = 'TESTMERCHANT01'
const TEST_PASSWORD = 'TESTPASS'

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.ESAFE_MERCHANT_ID = TEST_MERCHANT
  process.env.ESAFE_PASSWORD = TEST_PASSWORD
})

describe('chkValueBinding — SHA1(merchantId + password + MN + Term) 大寫', () => {
  it('amount=100, term 預設空字串', async () => {
    expect(await chkValueBinding(100)).toBe('BC0D448131E9367832EAC4BB3E2B9EFCA9654C7C')
  })

  it('term 有值時參與串接', async () => {
    expect(await chkValueBinding(100, '12')).toBe('F8BB96D9F2CDB332EBEA0A87818B4186AA98597F')
  })

  it('輸出是 40 碼 hex 全大寫', async () => {
    expect(await chkValueBinding(999)).toMatch(/^[0-9A-F]{40}$/)
  })

  it('串接順序敏感：merchantId 與 password 對調是不同結果', async () => {
    // sha1(password + merchantId + 100 + '') 的預算值
    expect(await chkValueBinding(100)).not.toBe('68C4A87ECB02886745206363E74D52F890F91768')
  })
})

describe('chkValueCallback / chkValueCallbackRaw — SHA1(merchantId + password + MN + Td) 大寫', () => {
  it('callback: amount=100, td=TD123', async () => {
    expect(await chkValueCallback(100, 'TD123')).toBe('0C528373F6293D9286D26E0E2F4ECB91BC321F47')
  })

  it('MN 是整數字串時 Raw 與非 Raw 相等', async () => {
    expect(await chkValueCallbackRaw('100', 'TD123')).toBe(await chkValueCallback(100, 'TD123'))
  })

  it('MN 帶小數（eSafe 原樣格式）只有 Raw 對得上', async () => {
    expect(await chkValueCallbackRaw('100.00', 'TD123')).toBe('4D16365BF8F4B348754B8C629D1BEDEAE4FBC5BF')
    expect(await chkValueCallbackRaw('100.00', 'TD123')).not.toBe(await chkValueCallback(100, 'TD123'))
  })
})

describe('chkValuePasscode — SHA256(merchantId + password + rawJSON) 小寫', () => {
  it('固定 JSON 輸入', async () => {
    expect(await chkValuePasscode('{"a":1}')).toBe(
      'eb22c9af37432d21ed59156d49ccb98bc76ce1f3a7694b4d18893dc99a9d5367',
    )
  })

  it('輸出是 64 碼 hex 全小寫', async () => {
    expect(await chkValuePasscode('{}')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('chkValuePayment — SHA256(merchantId + password + price + term + rawJSON) 小寫', () => {
  it('price=500, term 預設空字串', async () => {
    expect(await chkValuePayment(500, '{"a":1}')).toBe(
      '9f26dbff1a1e53ce0a616e18a32873d7321338dc52c84a78c260be6234964dd6',
    )
  })

  it('price 參與串接：不同金額不同結果', async () => {
    expect(await chkValuePayment(500, '{"a":1}')).not.toBe(await chkValuePayment(501, '{"a":1}'))
  })
})

describe('憑證缺失（PAYMENT_BOUNDARIES §G.3 — 鎖現狀，不是背書）', () => {
  it('缺 ESAFE_MERCHANT_ID / ESAFE_PASSWORD 不 throw，仍回 40 碼大寫 hex', async () => {
    // getSecretParam 拿不到值回空字串（不 throw）→ 等於用空憑證算雜湊。
    // v1 spec §H.1 認為該 throw；改動牽動全站取值路徑，列 PAYMENT_SPEC §4 待議。
    delete process.env.ESAFE_MERCHANT_ID
    delete process.env.ESAFE_PASSWORD
    await expect(chkValueBinding(100)).resolves.toMatch(/^[0-9A-F]{40}$/)
  })
})
