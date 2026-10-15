/**
 * 紅陽 SunPay v3「信用卡代碼授權」的簽章與加解密（純函式，不碰 DB／網路）。
 * 依「紅陽科技金流服務-信用卡代碼授權技術串接手冊 V1.0.4」§4.2。
 * 移植自私版 nexthappy 7/15 的 src/lib/payment/sunpay.ts（Jeff 已在正式區跑通）。
 *
 * 請求：{ head, body } 依 ASCII 排序 → JSON → URL encode
 *   - rsamsg      = 用紅陽公鑰分段 RSA 加密後 base64
 *   - check_value = sha256(URL encode 字串 + SHA2 密鑰)
 * 通知：紅陽用私鑰加密 rsamsg，我們用公鑰解開。
 *   能用公鑰解開（PKCS#1 v1.5 type 1 填充驗得過）就代表是紅陽私鑰產的 ——
 *   這本身就是簽章，check_value 是第二道。
 */
import { constants, createHash, publicDecrypt, publicEncrypt } from 'crypto'

export interface SunpaySigningKeys {
  /** 紅陽特店代號 */
  web: string
  /** SHA2 密鑰（簽 check_value） */
  sha2Secret: string
  /** 紅陽 RSA 公鑰（PEM） */
  rsaPublicKeyPem: string
}

export interface SignedRequest {
  web: string
  send_time: string
  rsamsg: string
  check_value: string
}

/** 1024-bit RSA：明文每段最多 117 byte（128 - 11 PKCS#1 填充），密文每段 128 byte */
const RSA_PLAIN_CHUNK = 117
const RSA_CIPHER_CHUNK = 128
const TW_OFFSET_MS = 8 * 3600 * 1000

/** 後台貼的單行 base64 公鑰轉 PEM；已是 PEM 就原樣回傳 */
export function toPem(key: string): string {
  const trimmed = key.trim()
  if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed
  const lines = trimmed.replace(/\s+/g, '').match(/.{1,64}/g) ?? []
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`
}

/** 依 ASCII 升序遞迴排序 key（body 在 head 前，因 'b' < 'h'） */
function sortByAscii(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((key) => {
        const val = obj[key]
        const isPlainObject = val !== null && typeof val === 'object' && !Array.isArray(val)
        return [key, isPlainObject ? sortByAscii(val as Record<string, unknown>) : val]
      }),
  )
}

/** PHP urlencode 相容（紅陽是 PHP）：空白 → '+'，另外編碼 ! ~ * ' ( ) */
export function phpUrlencode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/~/g, '%7E')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
}

function phpUrldecode(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, '%20'))
}

/** check_value = sha256(URL encode 字串 + SHA2 密鑰)，小寫 hex */
export function calcCheckValue(encoded: string, sha2Secret: string): string {
  return createHash('sha256').update(encoded + sha2Secret).digest('hex')
}

function encryptRsamsg(encoded: string, publicKeyPem: string): string {
  const data = Buffer.from(encoded, 'utf8')
  const parts: Buffer[] = []
  for (let i = 0; i < data.length; i += RSA_PLAIN_CHUNK) {
    parts.push(
      publicEncrypt(
        { key: publicKeyPem, padding: constants.RSA_PKCS1_PADDING },
        data.subarray(i, i + RSA_PLAIN_CHUNK),
      ),
    )
  }
  return Buffer.concat(parts).toString('base64')
}

/** 通知解密：base64 → 每 128 byte 用公鑰解開 → 原始 URL encode 字串（驗簽要用它） */
function decryptRsamsgRaw(rsamsgBase64: string, publicKeyPem: string): string {
  const cipher = Buffer.from(rsamsgBase64, 'base64')
  if (cipher.length === 0 || cipher.length % RSA_CIPHER_CHUNK !== 0) {
    throw new Error(`rsamsg 長度不正確（${cipher.length} byte）`)
  }
  const parts: Buffer[] = []
  for (let i = 0; i < cipher.length; i += RSA_CIPHER_CHUNK) {
    parts.push(
      publicDecrypt(
        { key: publicKeyPem, padding: constants.RSA_PKCS1_PADDING },
        cipher.subarray(i, i + RSA_CIPHER_CHUNK),
      ),
    )
  }
  return Buffer.concat(parts).toString('utf8')
}

/**
 * send_time：fffssmmHHyyyyMMdd（毫秒3 秒2 分2 時2 年4 月2 日2）。
 * 必須是台灣時間 —— 紅陽判斷發起時間逾 120 秒即無效，Vercel 跑 UTC。
 */
export function genSendTime(now: Date = new Date()): string {
  const tw = new Date(now.getTime() + TW_OFFSET_MS)
  const p = (n: number, w: number) => String(n).padStart(w, '0')
  return (
    p(tw.getUTCMilliseconds(), 3) +
    p(tw.getUTCSeconds(), 2) +
    p(tw.getUTCMinutes(), 2) +
    p(tw.getUTCHours(), 2) +
    p(tw.getUTCFullYear(), 4) +
    p(tw.getUTCMonth() + 1, 2) +
    p(tw.getUTCDate(), 2)
  )
}

/** 把 body 包成可 POST 給紅陽的 { web, send_time, rsamsg, check_value } */
export function buildSignedRequest(
  keys: SunpaySigningKeys,
  body: Record<string, string>,
  now: Date = new Date(),
): SignedRequest {
  const sendTime = genSendTime(now)
  const encoded = phpUrlencode(JSON.stringify(sortByAscii({ body, head: { send_time: sendTime, web: keys.web } })))
  return {
    web: keys.web,
    send_time: sendTime,
    rsamsg: encryptRsamsg(encoded, keys.rsaPublicKeyPem),
    check_value: calcCheckValue(encoded, keys.sha2Secret),
  }
}

/** 通知 body（手冊 §4.3.3／§4.4.3） */
export interface NotifyBody {
  approve_code?: string
  card_no?: string
  mn?: string
  pay_date?: string
  /** 10 成功／11 失敗／12 已建立 */
  pay_result?: string
  pay_time?: string
  td?: string
  trade_no?: string
  save_card_token_result?: string
  /** 只有首次付款會帶 */
  token_key?: string
  /** YYYYMMDD，等同信用卡到期日 */
  token_life?: string
}

export interface ParsedNotify {
  /** 解開後 head.web 是不是我們的特店代號 */
  isOurMerchant: boolean
  /** check_value 是否相符（第二道；解得開本身已證明來自紅陽） */
  isCheckValueValid: boolean
  body: NotifyBody
}

/** 解開並驗證通知。解不開（不是紅陽私鑰產的、或格式壞掉）直接 throw。 */
export function parseNotify(
  keys: SunpaySigningKeys,
  payload: { rsamsg: string; check_value: string },
): ParsedNotify {
  const raw = decryptRsamsgRaw(payload.rsamsg, keys.rsaPublicKeyPem)
  const decoded = JSON.parse(phpUrldecode(raw)) as { head?: { web?: string }; body?: NotifyBody }
  return {
    isOurMerchant: decoded.head?.web === keys.web,
    isCheckValueValid: calcCheckValue(raw, keys.sha2Secret) === payload.check_value,
    body: decoded.body ?? {},
  }
}
