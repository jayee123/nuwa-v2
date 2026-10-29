/**
 * 結帳要收多少、算首次付款還是升級（純函式，PAY-20，Jeff 2026-10-18 定）。
 *
 * - 沒有進行中的訂閱 → 首次付款，收新方案全額，從付款當天起算一個月
 * - 有進行中的訂閱、選更高的方案 → 升級：一樣跳紅陽重新刷卡（重新綁卡，之後月扣用這張），
 *   只收「新方案定價 − 舊方案定價」，到期日維持原訂閱的，到期後月扣收新方案全額
 * - 差價 = 0（例如測試價各方案都一樣）→ 直接升級、不經紅陽、不收錢，留一筆 NT$0 的升級紀錄
 *   （Jeff 10/18 改定；不換卡，之後月扣照用原本綁的卡收新方案全額）
 * - 差價 < 0（定價設錯：高等級比較便宜）→ 不能線上升級，請聯絡客服
 * - 有進行中的訂閱、選同等或更低的方案 → 擋下；降級走 /api/subscription/downgrade 排程
 *
 * 舊規則是只要 current_plan 不是 free 就收差價、但入帳照樣從當天重算一個月，
 * 等於付差價拿整個月；沒有訂閱（例如後台手動給的方案）也照收差價。兩個都改掉。
 */
import { PLAN_LEVEL } from '@/lib/plans'

export interface QuotePlan {
  code: string
  monthly_charge: number
}

export interface QuoteInput {
  target: QuotePlan
  /** 會員目前的方案（users.current_plan 對到的 plans 列）；free 或查不到傳 null */
  current: QuotePlan | null
  /** 同課程進行中、還沒到期的訂閱 */
  activeSubscription: { ends_at: string } | null
}

export type CheckoutQuote =
  | { kind: 'first'; amount: number }
  | { kind: 'upgrade'; amount: number; endsAt: string }
  | { kind: 'free_upgrade'; amount: 0; endsAt: string }
  | { kind: 'reject'; error: string }

export const QUOTE_ERROR = {
  sameOrLower: '目前的方案已經是這個等級以上；要降級請在方案頁選擇，會在到期日後生效。',
  cheaperTarget: '新方案的價格比目前方案低，無法線上升級，請聯絡客服。',
  invalidAmount: '金額計算錯誤，請聯絡客服。',
} as const

function validAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0
}

export function checkoutQuote({ target, current, activeSubscription }: QuoteInput): CheckoutQuote {
  if (!activeSubscription || !current) {
    return validAmount(target.monthly_charge)
      ? { kind: 'first', amount: target.monthly_charge }
      : { kind: 'reject', error: QUOTE_ERROR.invalidAmount }
  }

  if ((PLAN_LEVEL[target.code] ?? 0) <= (PLAN_LEVEL[current.code] ?? 0)) {
    return { kind: 'reject', error: QUOTE_ERROR.sameOrLower }
  }
  const difference = target.monthly_charge - current.monthly_charge
  if (difference === 0) return { kind: 'free_upgrade', amount: 0, endsAt: activeSubscription.ends_at }
  if (difference < 0) return { kind: 'reject', error: QUOTE_ERROR.cheaperTarget }
  if (!validAmount(difference)) return { kind: 'reject', error: QUOTE_ERROR.invalidAmount }
  return { kind: 'upgrade', amount: difference, endsAt: activeSubscription.ends_at }
}

export const PRICE_CHANGED_ERROR = '價格已更新，請重新確認金額後再付款。'

/**
 * 結帳確認畫面上的金額，跟按下「前往付款」那一刻伺服器算的要一樣（PAY-22）。
 * 中間定價被改、或會員在別的分頁升了級，就擋下請他重新確認 —— 不照新的金額收。
 * expected 是前端送來的（不可信），只拿來比對，收費金額永遠用伺服器算的。
 */
export function verifyExpectedAmount(
  expected: unknown,
  quote: Exclude<CheckoutQuote, { kind: 'reject' }>,
): { ok: true } | { ok: false; error: string } {
  if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) {
    return { ok: false, error: '請重新整理頁面，確認金額後再付款。' }
  }
  return expected === quote.amount ? { ok: true } : { ok: false, error: PRICE_CHANGED_ERROR }
}
