import { generateKeyPairSync } from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOutcomeUnknown, requestFirstPayment, requestSubsequentPayment } from '../client'
import { SUNPAY_TRADE_URLS, type SunpayConfig } from '../config'

const { publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const baseConfig: SunpayConfig = {
  web: 'MC31793850',
  sha2Secret: 'secret',
  rsaPublicKeyPem: publicKey,
  env: 'production',
  tradeUrl: SUNPAY_TRADE_URLS.production,
  relayUrl: 'https://relay.example.com',
  relaySecret: 'relay-secret',
  tokenKey: 'a'.repeat(64),
}

const customer = { email: 'a@b.co', name: '王小明', phone: '0912345678' }
const firstInput = { customer, amount: 5, orderInfo: '幸福 進階', orderNo: 'V3F1', saveCardToken: 'user-1' }
const nextInput = { customer, amount: 5, orderInfo: '自動扣款', orderNo: 'V3R1', saveCardToken: 'user-1', tokenKey: 'TK' }

function mockFetch(response: { status?: number; body: string }) {
  const fn = vi.fn(async () => new Response(response.body, { status: response.status ?? 200 }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('經轉送站送出', () => {
  it('打轉送站的 /v3/token，帶密鑰與環境，body 是已簽好的四個欄位', async () => {
    const fetchMock = mockFetch({ body: JSON.stringify({ code: '00', msg: '請求成功', result: { pay_code: 'https://pay', trade_no: 'C1' } }) })
    const result = await requestFirstPayment(baseConfig, firstInput)

    expect(result).toMatchObject({ ok: true, code: '00', payUrl: 'https://pay', tradeNo: 'C1' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://relay.example.com/v3/token')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer relay-secret')
    expect(headers['X-Sunpay-Env']).toBe('production')
    expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual(['check_value', 'rsamsg', 'send_time', 'web'])
  })

  it('沒設轉送站就直連紅陽，不帶轉送站密鑰', async () => {
    const fetchMock = mockFetch({ body: JSON.stringify({ code: '00', result: { pay_code: 'https://pay' } }) })
    await requestFirstPayment({ ...baseConfig, relayUrl: '', relaySecret: '' }, firstInput)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(SUNPAY_TRADE_URLS.production)
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})

describe('requestFirstPayment', () => {
  it('紅陽回 97（IP 不在白名單）：ok=false 並帶回代碼', async () => {
    mockFetch({ body: JSON.stringify({ code: '97', msg: '不接受此 IP 進行授權' }) })
    expect(await requestFirstPayment(baseConfig, firstInput)).toMatchObject({ ok: false, code: '97' })
  })

  it('code=00 但沒有付款連結：ok=false', async () => {
    mockFetch({ body: JSON.stringify({ code: '00', result: {} }) })
    expect((await requestFirstPayment(baseConfig, firstInput)).ok).toBe(false)
  })

  it('轉送站回 401（密鑰錯）：RELAY_REJECTED，確定沒送到紅陽', async () => {
    mockFetch({ status: 401, body: 'unauthorized' })
    const result = await requestFirstPayment(baseConfig, firstInput)
    expect(result).toMatchObject({ ok: false, code: 'RELAY_REJECTED' })
    expect(isOutcomeUnknown(result.code)).toBe(false)
  })

  it('轉送站回 502（連紅陽逾時）：NETWORK，結果不明', async () => {
    mockFetch({ status: 502, body: '{"error":"timeout"}' })
    const result = await requestFirstPayment(baseConfig, firstInput)
    expect(result.code).toBe('NETWORK')
    expect(isOutcomeUnknown(result.code)).toBe(true)
  })

  it('回應不是 JSON：BAD_RESPONSE', async () => {
    mockFetch({ body: '<html>error</html>' })
    expect(await requestFirstPayment(baseConfig, firstInput)).toMatchObject({ ok: false, code: 'BAD_RESPONSE' })
  })

  it('連線失敗：NETWORK，不 throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    expect(await requestFirstPayment(baseConfig, firstInput)).toMatchObject({ ok: false, code: 'NETWORK' })
  })
})

describe('requestSubsequentPayment', () => {
  it('code=00：ok（結果等通知）', async () => {
    mockFetch({ body: JSON.stringify({ code: '00', msg: '請求成功' }) })
    expect(await requestSubsequentPayment(baseConfig, nextInput)).toEqual({ ok: true, code: '00', msg: '請求成功' })
  })

  it('要求 3D 驗證：背景月扣做不到，當失敗', async () => {
    mockFetch({ body: JSON.stringify({ code: '00', resultHtml: '<form>3d</form>' }) })
    expect(await requestSubsequentPayment(baseConfig, nextInput)).toMatchObject({ ok: false, code: '3D_REQUIRED' })
  })

  it('S-PAY-07 查無 token（95）：ok=false', async () => {
    mockFetch({ body: JSON.stringify({ code: '95', msg: '查無 token 或 token_key' }) })
    expect(await requestSubsequentPayment(baseConfig, nextInput)).toMatchObject({ ok: false, code: '95' })
  })
})
