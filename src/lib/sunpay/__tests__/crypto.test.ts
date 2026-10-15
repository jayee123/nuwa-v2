/**
 * SunPay v3 簽章與加解密。
 * check_value 用手冊 V1.0.4 §4.2.3 的已知答案向量釘住（私版 7/15 已用同一組向量驗證）。
 * 通知解密用本地產生的金鑰對模擬「紅陽用私鑰加密、我們用公鑰解」。
 */
import { constants, generateKeyPairSync, privateEncrypt } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  buildSignedRequest,
  calcCheckValue,
  genSendTime,
  parseNotify,
  phpUrlencode,
  toPem,
  type SunpaySigningKeys,
} from '../crypto'

// 手冊範例的公開測試值，非真實憑證
const DOC_SHA2_SECRET = 'D2AE96E5528531CFCDE90591695F973D23846ABD01A639AB1D3E0322D56E0ED9'
const DOC_ENCODED =
  '%7B%22body%22%3A%7B%22email%22%3A%22test%40esafe.com.tw%22%2C%22mn%22%3A%2210%22%2C%22order_info%22%3A%22test%22%2C%22save_card_token%22%3A%22test%22%2C%22sdt%22%3A%220911123123%22%2C%22sna%22%3A%22test%22%2C%22td%22%3A%22TT1697708818%22%7D%2C%22head%22%3A%7B%22send_time%22%3A%2259758461720231019%22%2C%22web%22%3A%22MC31793850%22%7D%7D'
const DOC_EXPECTED_CHECK_VALUE = '152c3234ee7422af6e8f2fe1132a2391b99a552bac6070549d727a67e5b213fc'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const keys: SunpaySigningKeys = { web: 'MC31793850', sha2Secret: DOC_SHA2_SECRET, rsaPublicKeyPem: publicKey }

/** 模擬紅陽送通知：私鑰分段加密（每段 117 byte）＋ check_value */
function fakeSunpayNotify(decoded: unknown, sha2Secret = DOC_SHA2_SECRET, signingKey = privateKey) {
  const raw = phpUrlencode(JSON.stringify(decoded))
  const data = Buffer.from(raw, 'utf8')
  const parts: Buffer[] = []
  for (let i = 0; i < data.length; i += 117) {
    parts.push(privateEncrypt({ key: signingKey, padding: constants.RSA_PKCS1_PADDING }, data.subarray(i, i + 117)))
  }
  return { rsamsg: Buffer.concat(parts).toString('base64'), check_value: calcCheckValue(raw, sha2Secret) }
}

const NOTIFY_BODY = {
  body: { mn: '5', pay_result: '10', td: 'V3F261012153045K7Q2MX', token_key: '7295DF62E72A597D8FBF020D5063ACCE', token_life: '20281231', trade_no: 'C241125163534958032' },
  head: { send_time: '76050381620241125', web: 'MC31793850' },
}

describe('check_value — 手冊已知答案向量', () => {
  it('URL encode 字串 + SHA2 密鑰 → 手冊上的 check_value', () => {
    expect(calcCheckValue(DOC_ENCODED, DOC_SHA2_SECRET)).toBe(DOC_EXPECTED_CHECK_VALUE)
  })

  it('從物件走完整簽章路徑（排序 → JSON → URL encode → sha256）也重現同一個值', () => {
    // 手冊 send_time 59758461720231019 = 台灣 2023-10-19 17:46:58.597 = UTC 09:46:58.597
    const docDate = new Date(Date.UTC(2023, 9, 19, 9, 46, 58, 597))
    const req = buildSignedRequest(
      keys,
      { email: 'test@esafe.com.tw', mn: '10', order_info: 'test', save_card_token: 'test', sdt: '0911123123', sna: 'test', td: 'TT1697708818' },
      docDate,
    )
    expect(req.send_time).toBe('59758461720231019')
    expect(req.check_value).toBe(DOC_EXPECTED_CHECK_VALUE)
  })
})

describe('genSendTime', () => {
  it('fffssmmHHyyyyMMdd，台灣時間', () => {
    expect(genSendTime(new Date(Date.UTC(2024, 10, 25, 8, 20, 41, 610)))).toBe('61041201620241125')
  })

  it('UTC 跨日時用台灣日期', () => {
    // UTC 10/11 20:00 = 台灣 10/12 04:00
    expect(genSendTime(new Date(Date.UTC(2026, 9, 11, 20, 0, 0, 0)))).toBe('00000000420261012')
  })
})

describe('phpUrlencode', () => {
  it('空白變 +，另外編碼 ! ~ * \' ( )', () => {
    expect(phpUrlencode("a b!~*'()")).toBe('a+b%21%7E%2A%27%28%29')
  })
})

describe('toPem', () => {
  it('單行 base64 包成 PEM', () => {
    const pem = toPem('A'.repeat(100))
    expect(pem.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBe(true)
    expect(pem.split('\n')[1]).toHaveLength(64)
  })

  it('已是 PEM 就原樣回傳', () => {
    expect(toPem(publicKey)).toBe(publicKey.trim())
  })
})

describe('buildSignedRequest', () => {
  it('長資料分段加密：密文是 128 byte 的整數倍', () => {
    const req = buildSignedRequest(keys, { order_info: 'x'.repeat(300), td: 'T1' })
    const cipher = Buffer.from(req.rsamsg, 'base64')
    expect(cipher.length % 128).toBe(0)
    expect(cipher.length).toBeGreaterThan(128)
  })
})

describe('parseNotify', () => {
  it('S-PAY-01 紅陽私鑰加密的通知：解得開、特店相符、check_value 相符', () => {
    const parsed = parseNotify(keys, fakeSunpayNotify(NOTIFY_BODY))
    expect(parsed.isOurMerchant).toBe(true)
    expect(parsed.isCheckValueValid).toBe(true)
    expect(parsed.body.td).toBe('V3F261012153045K7Q2MX')
    expect(parsed.body.token_key).toBe('7295DF62E72A597D8FBF020D5063ACCE')
  })

  it('長通知（超過一段 117 byte）也解得開', () => {
    const long = { ...NOTIFY_BODY, body: { ...NOTIFY_BODY.body, order_info: '中文商品名稱'.repeat(10) } }
    expect(parseNotify(keys, fakeSunpayNotify(long)).isCheckValueValid).toBe(true)
  })

  it('S-PAY-03 check_value 被竄改：標記不符', () => {
    const notify = fakeSunpayNotify(NOTIFY_BODY)
    expect(parseNotify(keys, { ...notify, check_value: '0'.repeat(64) }).isCheckValueValid).toBe(false)
  })

  it('別家特店代號：isOurMerchant=false', () => {
    const other = { ...NOTIFY_BODY, head: { ...NOTIFY_BODY.head, web: 'MC00000000' } }
    expect(parseNotify(keys, fakeSunpayNotify(other)).isOurMerchant).toBe(false)
  })

  it('S-PAY-03 不是紅陽私鑰產的（偽造）：解不開直接 throw', () => {
    const attacker = generateKeyPairSync('rsa', {
      modulusLength: 1024,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    expect(() => parseNotify(keys, fakeSunpayNotify(NOTIFY_BODY, DOC_SHA2_SECRET, attacker.privateKey))).toThrow()
  })

  it('rsamsg 長度不是 128 的倍數：throw', () => {
    expect(() => parseNotify(keys, { rsamsg: Buffer.from('short').toString('base64'), check_value: '' })).toThrow(/長度/)
  })
})
