import { describe, expect, it } from 'vitest'
import { SUNPAY_TRADE_URLS, validateSunpayConfig } from '../config'

const KEY_HEX = 'a'.repeat(64)

function values(overrides: Partial<Record<string, string>> = {}) {
  return {
    SUNPAY_WEB: 'MC31793850',
    SUNPAY_SHA2_SECRET: 'secret',
    SUNPAY_RSA_PUBLIC_KEY: 'AAAA',
    SUNPAY_TRADE_URL: SUNPAY_TRADE_URLS.production,
    SUNPAY_RELAY_URL: 'https://relay.example.com/',
    SUNPAY_RELAY_SECRET: 'relay-secret',
    SUNPAY_TOKEN_KEY: KEY_HEX,
    ...overrides,
  }
}

describe('validateSunpayConfig', () => {
  it('完整設定：判斷正式環境、轉送站網址去掉結尾斜線、公鑰轉 PEM', () => {
    const result = validateSunpayConfig(values())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.env).toBe('production')
    expect(result.config.relayUrl).toBe('https://relay.example.com')
    expect(result.config.rsaPublicKeyPem).toContain('BEGIN PUBLIC KEY')
  })

  it('測試區網址 → test', () => {
    const result = validateSunpayConfig(values({ SUNPAY_TRADE_URL: SUNPAY_TRADE_URLS.test }))
    expect(result.ok && result.config.env).toBe('test')
  })

  it('沒設轉送站＝直連（本機測試用）', () => {
    const result = validateSunpayConfig(values({ SUNPAY_RELAY_URL: '', SUNPAY_RELAY_SECRET: '' }))
    expect(result.ok && result.config.relayUrl).toBe('')
  })

  it('缺必要欄位：列出缺哪些，訊息不含任何值', () => {
    const result = validateSunpayConfig(values({ SUNPAY_WEB: '', SUNPAY_SHA2_SECRET: '' }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toEqual(expect.arrayContaining(['SUNPAY_WEB 未設定', 'SUNPAY_SHA2_SECRET 未設定']))
    expect(result.problems.join()).not.toContain('relay-secret')
  })

  it('交易網址不是紅陽的兩個 /v3/token 就拒絕（防止把請求送去別處）', () => {
    const result = validateSunpayConfig(values({ SUNPAY_TRADE_URL: 'https://evil.example.com/v3/token' }))
    expect(result.ok).toBe(false)
  })

  it('TOKEN_KEY 不是 64 碼 hex 就拒絕', () => {
    expect(validateSunpayConfig(values({ SUNPAY_TOKEN_KEY: 'short' })).ok).toBe(false)
  })

  it('轉送站要 https，且要有密鑰', () => {
    expect(validateSunpayConfig(values({ SUNPAY_RELAY_URL: 'http://relay.example.com' })).ok).toBe(false)
    expect(validateSunpayConfig(values({ SUNPAY_RELAY_SECRET: '' })).ok).toBe(false)
  })
})
