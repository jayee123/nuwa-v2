/**
 * 手機號正規化規則鎖定（2026-09-21 Steve 沒補零收不到驗證碼事件）。
 * normalizeLocalPhone 是 users.phone / sms_verifications.phone 的唯一標準，
 * 改這裡的行為前先想清楚既有資料都是 09 開頭的 10 碼。
 */
import { describe, expect, it } from 'vitest'
import { formatPhoneE164, normalizeLocalPhone } from '../phone'

describe('normalizeLocalPhone（+886）', () => {
  it('沒打開頭 0 → 補上（Steve 踩到的坑）', () => {
    expect(normalizeLocalPhone('905376287')).toBe('0905376287')
  })

  it('已有 0 → 原樣', () => {
    expect(normalizeLocalPhone('0905376287')).toBe('0905376287')
  })

  it('+886 開頭 → 轉本地格式', () => {
    expect(normalizeLocalPhone('+886905376287')).toBe('0905376287')
  })

  it('886 開頭（12 碼）→ 轉本地格式', () => {
    expect(normalizeLocalPhone('886905376287')).toBe('0905376287')
  })

  it('空白與橫線清掉', () => {
    expect(normalizeLocalPhone('09 0537-6287')).toBe('0905376287')
    expect(normalizeLocalPhone('905 376 287')).toBe('0905376287')
  })

  it('四種寫法收斂成同一個字串', () => {
    const forms = ['905376287', '0905376287', '+886905376287', '886905376287']
    expect(new Set(forms.map((f) => normalizeLocalPhone(f))).size).toBe(1)
  })
})

describe('normalizeLocalPhone（非 +886）', () => {
  it('只清符號、不補零不動格式（國際支援另議）', () => {
    expect(normalizeLocalPhone('12 345-6789', '+60')).toBe('123456789')
  })
})

describe('與 formatPhoneE164 的組合', () => {
  it('先本地化再 E.164，四種輸入結果一致', () => {
    const forms = ['905376287', '0905376287', '+886905376287', '886905376287']
    const e164 = forms.map((f) => formatPhoneE164(normalizeLocalPhone(f), '+886'))
    expect(new Set(e164).size).toBe(1)
    expect(e164[0]).toBe('+886905376287')
  })
})
