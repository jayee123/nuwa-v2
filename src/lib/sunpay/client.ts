/**
 * 呼叫紅陽 SunPay v3：首次付款（取付款連結）、後續付款（月扣）、即時交易查詢（對帳）。
 *
 * 有設轉送站就經 berth 送出（固定 IP），否則直連。
 * 轉送站只負責轉送：請求在這裡就已經簽好、加密好，轉送站拿不到任何紅陽金鑰。
 */
import { buildSignedRequest, type SignedBody } from './crypto'
import { SUNPAY_QUERY_URLS, type SunpayConfig } from './config'

const REQUEST_TIMEOUT_MS = 20_000
/** 手冊 §4.3.1：save_card=2 強制保存卡號（月扣必須） */
const FORCE_SAVE_CARD = '2'
const API_VERSION = '2'

interface SunpayResponse {
  code?: string
  msg?: string
  result?: { pay_code?: string; trade_no?: string }
  resultHtml?: string
}

export interface SunpayCallResult {
  ok: boolean
  /**
   * 紅陽回傳代碼，或我們自己的：
   * - NETWORK／BAD_RESPONSE：結果不明（可能逾時但紅陽其實收單了）
   * - RELAY_REJECTED：轉送站擋下，確定沒送到紅陽
   */
  code: string
  msg: string
}

const UNKNOWN_OUTCOME_CODES = new Set(['NETWORK', 'BAD_RESPONSE'])

/** 結果不明：不能當成失敗（紅陽可能已扣款），要等通知或人工對帳 */
export function isOutcomeUnknown(code: string): boolean {
  return UNKNOWN_OUTCOME_CODES.has(code)
}

/** 轉送站自己擋下的狀態碼（密鑰錯、格式錯）—— 這些確定沒送到紅陽 */
const RELAY_REJECT_STATUSES = new Set([400, 401, 404, 413])

export interface CustomerFields {
  email: string
  /** 已用 toSunpayName 整理過 */
  name: string
  /** 已用 toSunpayPhone 整理過；空字串就不送 */
  phone: string
}

/** token：首次／後續付款；query：即時交易查詢 */
type Endpoint = 'token' | 'query'

/** 轉送站上的路徑，跟紅陽的路徑一致（轉送站只轉這兩條，見 sunpay-relay/server.mjs） */
const RELAY_PATHS: Record<Endpoint, string> = { token: '/v3/token', query: '/v4/query/PaymentCheck' }

function directUrl(config: SunpayConfig, endpoint: Endpoint): string {
  return endpoint === 'token' ? config.tradeUrl : SUNPAY_QUERY_URLS[config.env]
}

async function postSigned<T = SunpayResponse>(
  config: SunpayConfig,
  body: SignedBody,
  endpoint: Endpoint = 'token',
): Promise<{ ok: true; json: T } | { ok: false; code: string; msg: string }> {
  const payload = JSON.stringify(buildSignedRequest(config, body))
  const viaRelay = config.relayUrl !== ''
  const url = viaRelay ? `${config.relayUrl}${RELAY_PATHS[endpoint]}` : directUrl(config, endpoint)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (viaRelay) {
    headers.Authorization = `Bearer ${config.relaySecret}`
    headers['X-Sunpay-Env'] = config.env
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (err) {
    return { ok: false, code: 'NETWORK', msg: `連線失敗（${viaRelay ? '轉送站' : '紅陽'}）：${err instanceof Error ? err.message : String(err)}` }
  }

  const text = await res.text()
  if (!res.ok) {
    const code = viaRelay && RELAY_REJECT_STATUSES.has(res.status) ? 'RELAY_REJECTED' : 'NETWORK'
    return { ok: false, code, msg: `HTTP ${res.status}（${viaRelay ? '轉送站' : '紅陽'}）：${text.slice(0, 200)}` }
  }
  try {
    return { ok: true, json: JSON.parse(text) as T }
  } catch {
    return { ok: false, code: 'BAD_RESPONSE', msg: `紅陽回應不是 JSON：${text.slice(0, 200)}` }
  }
}

function customerBody(customer: CustomerFields): Record<string, string> {
  return {
    email: customer.email,
    sna: customer.name,
    ...(customer.phone ? { sdt: customer.phone } : {}),
  }
}

export interface FirstPaymentInput {
  customer: CustomerFields
  amount: number
  orderInfo: string
  orderNo: string
  /** 我們定義的卡片識別碼，月扣要帶同一組（= 付款 id，見 order.ts cardTokenOf） */
  saveCardToken: string
}

export interface FirstPaymentResult extends SunpayCallResult {
  /** 紅陽付款頁連結（手冊：另開新視窗） */
  payUrl?: string
  tradeNo?: string
}

export async function requestFirstPayment(config: SunpayConfig, input: FirstPaymentInput): Promise<FirstPaymentResult> {
  const sent = await postSigned(config, {
    ...customerBody(input.customer),
    mn: String(input.amount),
    order_info: input.orderInfo,
    save_card: FORCE_SAVE_CARD,
    save_card_token: input.saveCardToken,
    td: input.orderNo,
    version: API_VERSION,
  })
  if (!sent.ok) return sent

  const { code = '99', msg = '', result } = sent.json
  const payUrl = result?.pay_code
  return { ok: code === '00' && !!payUrl, code, msg, payUrl, tradeNo: result?.trade_no }
}

export interface SubsequentPaymentInput {
  customer: CustomerFields
  amount: number
  orderInfo: string
  orderNo: string
  saveCardToken: string
  tokenKey: string
}

/**
 * 月扣。⚠️ code=00 只代表「紅陽收下請求」，扣款結果另外由通知（§4.4.3）送來，
 * 所以呼叫端拿到 ok 時付款仍是 pending，由通知端決定成功或失敗。
 */
export async function requestSubsequentPayment(
  config: SunpayConfig,
  input: SubsequentPaymentInput,
): Promise<SunpayCallResult> {
  const sent = await postSigned(config, {
    ...customerBody(input.customer),
    mn: String(input.amount),
    order_info: input.orderInfo,
    save_card_token: input.saveCardToken,
    td: input.orderNo,
    token_key: input.tokenKey,
    version: API_VERSION,
  })
  if (!sent.ok) return sent

  const { code = '99', msg = '', resultHtml } = sent.json
  // 背景月扣沒有使用者可以做 3D 驗證；要求 3D 就當失敗，由人工處理
  if (code === '00' && resultHtml) {
    return { ok: false, code: '3D_REQUIRED', msg: '紅陽要求 3D 驗證，背景月扣無法完成' }
  }
  return { ok: code === '00', code, msg }
}

/** 即時交易查詢回來的一筆（一般金流手冊 V1.1.1 §4.4.2）。卡號前六後四不收 —— 用不到，也不該進帳務或 log */
export interface PaymentCheckItem {
  /** 這一筆的查詢結果：00 成功 */
  code: string
  error_msg: string
  td: string
  trade_no: string
  mn: string
  /** 10 成功／11 失敗／12 查無該筆訂單／13 交易未完成／14 訂單退款／15 交易取消 */
  pay_result: string
  pay_date: string
  pay_time: string
  approve_code: string
  /** 0 未退款／1 處理中／2 完成／3 失敗／4 取消 */
  refund_status: string
  /** 沒退過是可退款金額；退過是可退款餘額 */
  refund_amt: string
}

const CHECK_FIELDS = [
  'code',
  'error_msg',
  'td',
  'trade_no',
  'mn',
  'pay_result',
  'pay_date',
  'pay_time',
  'approve_code',
  'refund_status',
  'refund_amt',
] as const satisfies readonly (keyof PaymentCheckItem)[]

interface PaymentCheckResponse {
  code?: string
  msg?: string
  result?: unknown
}

function toCheckItem(raw: Record<string, unknown>): PaymentCheckItem {
  return Object.fromEntries(
    CHECK_FIELDS.map((field) => [field, raw[field] === null || raw[field] === undefined ? '' : String(raw[field])]),
  ) as unknown as PaymentCheckItem
}

export type PaymentCheckResult = { ok: true; item: PaymentCheckItem | null } | (SunpayCallResult & { ok: false })

/**
 * 用我們的訂單編號查紅陽那邊的交易狀態。
 * 回應是明文 JSON（不用解密）。item=null 代表紅陽回應裡沒有這張單。
 */
export async function queryPayment(config: SunpayConfig, orderNo: string): Promise<PaymentCheckResult> {
  const sent = await postSigned<PaymentCheckResponse>(config, [{ td: orderNo }], 'query')
  if (!sent.ok) return sent

  const { code = '99', msg = '', result } = sent.json
  if (code !== '00') return { ok: false, code, msg }
  const rows = Array.isArray(result) ? result : []
  const match = rows.find(
    (row): row is Record<string, unknown> => !!row && typeof row === 'object' && (row as Record<string, unknown>).td === orderNo,
  )
  return { ok: true, item: match ? toCheckItem(match) : null }
}
