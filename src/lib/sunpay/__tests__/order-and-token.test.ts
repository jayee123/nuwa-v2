import { randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'
import { generateOrderNo, orderKindOf, toSunpayName, toSunpayOrderInfo, toSunpayPhone } from '../order'
import { isTokenExpired, isV3Token, isValidTokenKey, packToken, unpackToken, type StoredToken } from '../token-store'

describe('generateOrderNo', () => {
  it('首次付款 V3F＋台灣時間 yyMMddHHmmss＋6 碼，英數 21 碼', () => {
    // UTC 07:30:45 = 台灣 15:30:45
    const td = generateOrderNo('first', new Date(Date.UTC(2026, 9, 12, 7, 30, 45)))
    expect(td).toMatch(/^V3F261012153045[A-Z0-9]{6}$/)
  })

  it('月扣 V3R 開頭', () => {
    expect(generateOrderNo('recurring')).toMatch(/^V3R\d{12}[A-Z0-9]{6}$/)
  })

  it('連續產生不重複', () => {
    const now = new Date()
    const all = new Set(Array.from({ length: 200 }, () => generateOrderNo('first', now)))
    expect(all.size).toBe(200)
  })
})

describe('orderKindOf', () => {
  it('依前綴判斷，舊 esafe 的 V2 編號回 null', () => {
    expect(orderKindOf('V3F261012153045K7Q2MX')).toBe('first')
    expect(orderKindOf('V3R261012153045K7Q2MX')).toBe('recurring')
    expect(orderKindOf('V226101215301234')).toBeNull()
  })
})

describe('送給紅陽的消費者欄位', () => {
  it('姓名去掉手冊禁止的特殊字元，保留中英文與數字', () => {
    expect(toSunpayName(`王<小>明*'"[1]`)).toBe('王小明1')
  })

  it('姓名清完是空的就用「會員」', () => {
    expect(toSunpayName('***')).toBe('會員')
    expect(toSunpayName(null)).toBe('會員')
  })

  it('姓名最多 30 字', () => {
    expect(toSunpayName('名'.repeat(40))).toHaveLength(30)
  })

  it('電話只留數字', () => {
    expect(toSunpayPhone('+886 912-345-678')).toBe('886912345678')
    expect(toSunpayPhone(undefined)).toBe('')
  })

  it('商品名稱最多 50 字', () => {
    expect(toSunpayOrderInfo('品'.repeat(60))).toHaveLength(50)
  })
})

describe('卡片代碼落地加密', () => {
  const keyHex = randomBytes(32).toString('hex')
  const bundle: StoredToken = { saveCardToken: 'user-1', tokenKey: 'ABC', tokenLife: '20281231', boundAt: '2026-10-12T00:00:00Z' }

  it('加密後解得回來，且有 v3: 前綴、看不到明文', () => {
    const packed = packToken(bundle, keyHex)
    expect(isV3Token(packed)).toBe(true)
    expect(packed).not.toContain('ABC')
    expect(unpackToken(packed, keyHex)).toEqual(bundle)
  })

  it('換了金鑰解不開', () => {
    const packed = packToken(bundle, keyHex)
    expect(() => unpackToken(packed, randomBytes(32).toString('hex'))).toThrow()
  })

  it('內容被竄改解不開（GCM 驗證）', () => {
    const packed = packToken(bundle, keyHex)
    const raw = Buffer.from(packed.slice(3), 'base64')
    raw[raw.length - 1] ^= 1
    expect(() => unpackToken('v3:' + raw.toString('base64'), keyHex)).toThrow()
  })

  it('舊 esafe 格式不認', () => {
    expect(isV3Token('U2FsdGVk...')).toBe(false)
    expect(() => unpackToken('U2FsdGVk', keyHex)).toThrow(/v3/)
  })

  it('金鑰格式不對就拒絕', () => {
    expect(isValidTokenKey('abc')).toBe(false)
    expect(() => packToken(bundle, 'abc')).toThrow(/64 碼 hex/)
  })
})

describe('isTokenExpired', () => {
  it('到期日早於今天才算過期，當天還能扣', () => {
    expect(isTokenExpired('20261011', '20261012')).toBe(true)
    expect(isTokenExpired('20261012', '20261012')).toBe(false)
  })

  it('沒帶或格式不對不擋，交給紅陽判斷', () => {
    expect(isTokenExpired('', '20261012')).toBe(false)
    expect(isTokenExpired('2028', '20261012')).toBe(false)
  })
})
