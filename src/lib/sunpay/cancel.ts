/**
 * 結帳頁「取消付款」：使用者明示放棄，把自己那筆還在待付款的首次付款／升級標成 cancelled。
 *
 * - 只搶 pending（條件更新）：紅陽通知先到、已經是 paid／failed 就不動，回目前狀態讓前端照著走
 * - 只收使用者自己發起的首次付款（V3F）與升級（V3U）：月扣單不是使用者發起的，不能從前台取消
 * - 使用者若其實已在紅陽視窗付完，晚到的成功通知仍會把 cancelled 轉成 paid（見 settle.ts）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { orderKindOf } from './order'

export type CancelResult =
  /** status：取消後（或沒搶到時）這筆付款目前的狀態 */
  | { ok: true; status: string; paymentUid: string }
  | { ok: false; httpStatus: 404 | 400 | 500; error: string }

export async function cancelPendingPayment(admin: SupabaseClient, userId: string, paymentId: string): Promise<CancelResult> {
  const { data: payment } = await admin
    .from('payments')
    .select('id, status, payment_uid')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!payment) return { ok: false, httpStatus: 404, error: '找不到這筆付款' }
  const kind = orderKindOf(payment.payment_uid ?? '')
  if (kind !== 'first' && kind !== 'upgrade') return { ok: false, httpStatus: 400, error: '這筆付款不能取消' }

  const { data: claimed, error } = await admin
    .from('payments')
    .update({ status: 'cancelled' })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')
  if (error) {
    console.error('[payment/cancel] 更新失敗', { td: payment.payment_uid, error: error.message })
    return { ok: false, httpStatus: 500, error: '取消失敗，請稍後再試' }
  }
  if (claimed && claimed.length > 0) return { ok: true, status: 'cancelled', paymentUid: payment.payment_uid }

  // 沒搶到：通知已經先把狀態改掉了（或本來就取消過），回最新狀態
  const { data: latest } = await admin.from('payments').select('status').eq('id', payment.id).maybeSingle()
  return { ok: true, status: latest?.status ?? payment.status, paymentUid: payment.payment_uid }
}
