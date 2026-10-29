/**
 * 對帳排程（BIL-3）：卡在「處理中」的付款，去紅陽即時交易查詢，再決定怎麼處理（純函式）。
 *
 * 要入帳的一律轉成跟紅陽通知一樣的格式，交給 decideNotify／settleNotify ——
 * 跟收到通知走同一條路：金額檢查、只有 pending 搶得到的條件更新、月扣失敗降級規則全部沿用，
 * 對帳和遲到的通知同時來也不會重複入帳。
 *
 * 「查無該筆訂單」不自動標失敗：紅陽還沒確認代碼授權（/v3/token）建的單查不查得到（2026-10-17），
 * 萬一查不到，自動標失敗會把真的扣到錢的單誤殺。先記 log 待人工，紅陽確認後再決定。
 */
import type { PaymentCheckItem } from './client'
import type { NotifyBody } from './crypto'

/** 紅陽通知 30 分鐘內每 5 分鐘補發（代碼授權手冊 §4.3.3）；過了這段還沒結果才去查，不跟通知搶 */
export const RECONCILE_MIN_AGE_MS = 35 * 60 * 1000
/** 交易未完成（開了付款頁沒付）超過這段時間，當作放棄，標失敗 */
export const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000

const QUERY_OK = '00'
const PAY_RESULT = {
  success: '10',
  failed: '11',
  notFound: '12',
  incomplete: '13',
  refunded: '14',
  cancelled: '15',
} as const
/** 交給 decideNotify 時用通知的代碼：10 成功、11 失敗 */
const NOTIFY_FAILED = '11'

export interface ReconcilePayment {
  payment_uid: string
  amount: number
  created_at: string
}

export type ReconcileStep =
  /** 轉成通知格式，交給 decideNotify／settleNotify 入帳 */
  | { action: 'settle'; body: NotifyBody }
  /** 還沒有最終結果，明天再查 */
  | { action: 'wait'; reason: string }
  /** 不自動處理，記 log 待人工到紅陽後台查 */
  | { action: 'review'; reason: string }

function failedBody(payment: ReconcilePayment, item: PaymentCheckItem | null): NotifyBody {
  return {
    td: payment.payment_uid,
    // 失敗不收錢，紅陽查無時也沒有金額；用我們的金額讓 decideNotify 的金額檢查通過
    mn: String(payment.amount),
    pay_result: NOTIFY_FAILED,
    trade_no: item?.trade_no ?? '',
  }
}

export function reconcileStep(payment: ReconcilePayment, item: PaymentCheckItem | null, now: Date): ReconcileStep {
  if (!item) return { action: 'review', reason: '紅陽回應裡沒有這張單' }
  if (item.code !== QUERY_OK) return { action: 'review', reason: `查詢失敗（${item.code}）：${item.error_msg}` }

  const ageMs = now.getTime() - new Date(payment.created_at).getTime()
  switch (item.pay_result) {
    case PAY_RESULT.success:
      return {
        action: 'settle',
        body: {
          td: item.td,
          mn: item.mn,
          pay_result: PAY_RESULT.success,
          trade_no: item.trade_no,
          pay_date: item.pay_date,
          pay_time: item.pay_time,
          approve_code: item.approve_code,
        },
      }
    case PAY_RESULT.failed:
    case PAY_RESULT.cancelled:
      return { action: 'settle', body: failedBody(payment, item) }
    case PAY_RESULT.incomplete:
      return ageMs >= ABANDON_AFTER_MS
        ? { action: 'settle', body: failedBody(payment, item) }
        : { action: 'wait', reason: '紅陽顯示交易未完成' }
    case PAY_RESULT.notFound:
      return { action: 'review', reason: '紅陽查無此單（尚未確認代碼授權的單查不查得到，不自動標失敗）' }
    case PAY_RESULT.refunded:
      return { action: 'review', reason: '紅陽顯示已退款，但這筆在我們這邊還是處理中' }
    default:
      return { action: 'review', reason: `不認得的交易結果 pay_result=${item.pay_result || '（空）'}` }
  }
}
