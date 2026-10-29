/**
 * 退款對帳（BIL-3 後半，Steve 10/20 建議、Jeff 10/23 定）：
 * 後台「標記退款」是人工宣告，不是從紅陽查回來的事實。已請款的單在紅陽要幾天才「退款完成」，
 * 萬一最後沒退成，帳面說退了、會員其實沒拿到錢，而且沒有任何機制會發現。
 *
 * 所以對帳排程每天也去查「我們標了退款」的單（即時交易查詢的 refund_status，一般金流手冊 V1.1.1 §4.4.2），
 * 結果寫回金流帳務那一列退款的 raw.sunpay_refund_check，帳務頁照它顯示紅陽的狀態。
 * 紅陽確認完成就不再查；沒退、退款失敗、取消退款、處理太久都標需人工。
 *
 * 反方向（紅陽退了、我們還是已付款）這次不查（Jeff 10/23 選 2B），等紅陽回覆查詢頻率限制再說。
 */
import type { PaymentCheckItem } from './client'

/** 標記退款後多久內每天查；超過就不再查（帳務頁留最後一次結果） */
export const REFUND_CHECK_WINDOW_MS = 60 * 24 * 60 * 60 * 1000
/** 已請款的單退款要等紅陽與銀行作業；處理中超過這段還沒完成就請人去紅陽後台看 */
export const REFUND_PROCESSING_ALERT_MS = 14 * 24 * 60 * 60 * 1000
/** 查不到這張單超過這段就請人看（剛標記時紅陽可能還沒反映） */
export const REFUND_MISSING_ALERT_MS = 3 * 24 * 60 * 60 * 1000
/** 每天最多查幾筆退款，跟處理中付款的對帳分開算 */
export const REFUND_CHECK_BATCH = 20

const REFUND_STATUS = { none: '0', processing: '1', done: '2', failed: '3', cancelled: '4' } as const
/** 當天還沒請款就退刷：紅陽直接「交易取消」，等同退款完成（10/20 V3R261020091949PU2T3D） */
const PAY_RESULT_CANCELLED = '15'

export type RefundCheckState = 'confirmed' | 'processing' | 'not_refunded' | 'failed' | 'cancelled' | 'unknown'

/** 存在金流帳務退款列 raw.sunpay_refund_check */
export interface RefundCheckRecord {
  state: RefundCheckState
  needs_review: boolean
  reason: string
  refund_status: string
  refund_amt: string
  pay_result: string
  checked_at: string
}

export function refundCheckStep(item: PaymentCheckItem | null, markedAt: Date, now: Date): RefundCheckRecord {
  const age = now.getTime() - markedAt.getTime()
  const base = {
    refund_status: item?.refund_status ?? '',
    refund_amt: item?.refund_amt ?? '',
    pay_result: item?.pay_result ?? '',
    checked_at: now.toISOString(),
  }
  if (!item) {
    return { ...base, state: 'unknown', needs_review: age >= REFUND_MISSING_ALERT_MS, reason: '紅陽回應裡沒有這張單' }
  }
  if (item.code !== '00') {
    return { ...base, state: 'unknown', needs_review: false, reason: `查詢失敗（${item.code}）：${item.error_msg}` }
  }
  if (item.pay_result === PAY_RESULT_CANCELLED || item.refund_status === REFUND_STATUS.done) {
    return { ...base, state: 'confirmed', needs_review: false, reason: '紅陽已完成退款' }
  }
  switch (item.refund_status) {
    case REFUND_STATUS.processing:
      return age >= REFUND_PROCESSING_ALERT_MS
        ? { ...base, state: 'processing', needs_review: true, reason: '紅陽退款處理超過 14 天，請到紅陽後台確認' }
        : { ...base, state: 'processing', needs_review: false, reason: '紅陽退款處理中' }
    case REFUND_STATUS.none:
      return { ...base, state: 'not_refunded', needs_review: true, reason: '我們標了退款，紅陽卻沒有退款紀錄（可能沒在紅陽後台退刷）' }
    case REFUND_STATUS.failed:
      return { ...base, state: 'failed', needs_review: true, reason: '紅陽退款失敗，錢沒有退回給會員' }
    case REFUND_STATUS.cancelled:
      return { ...base, state: 'cancelled', needs_review: true, reason: '紅陽的退款被取消，錢沒有退回給會員' }
    default:
      return { ...base, state: 'unknown', needs_review: true, reason: `不認得的退款狀態 refund_status=${item.refund_status || '（空）'}` }
  }
}

/** 已經確認完成的就不必再查 */
export function needsRefundCheck(raw: unknown, markedAt: Date, now: Date): boolean {
  if (now.getTime() - markedAt.getTime() > REFUND_CHECK_WINDOW_MS) return false
  return refundCheckOf(raw)?.state !== 'confirmed'
}

/** 從金流帳務 raw 取出上一次的退款對帳結果 */
export function refundCheckOf(raw: unknown): RefundCheckRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = (raw as Record<string, unknown>).sunpay_refund_check
  return record && typeof record === 'object' ? (record as RefundCheckRecord) : null
}

export interface RefundCheckBadge {
  label: string
  tone: 'ok' | 'wait' | 'alert'
}

/** 帳務頁退款列下面那一行 */
export function refundCheckBadge(record: RefundCheckRecord | null): RefundCheckBadge {
  if (!record) return { label: '紅陽：尚未確認（每天 08:00 對帳時查）', tone: 'wait' }
  const date = new Date(record.checked_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' })
  if (record.state === 'confirmed') return { label: `紅陽：退款完成 ✅（${date} 確認）`, tone: 'ok' }
  if (!record.needs_review) return { label: `紅陽：${record.state === 'processing' ? '退款處理中 ⏳' : '還查不到 ⏳'}（${date} 查）`, tone: 'wait' }
  return { label: `紅陽：${record.reason} 🔴 需人工（${date} 查）`, tone: 'alert' }
}
