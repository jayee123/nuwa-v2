/**
 * 紅陽通知（首次付款／月扣）入帳：判斷要做什麼（純函式）＋ 實際寫 DB。
 *
 * 紅陽 30 分鐘內每 5 分鐘補發一次，同一筆可能來好幾次（手冊 §4.3.3）。
 * 防重複靠「只有還是 pending 的那次能把狀態改掉」的條件更新：
 * 搶到的那次才開訂閱，其他次直接回 success。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordGatewayTx } from '@/lib/esafe/ledger'
import { getPlanByCode } from '@/lib/queries/plans'
import type { NotifyBody } from './crypto'
import { orderKindOf, type OrderKind } from './order'
import { packToken } from './token-store'

const PAY_RESULT_SUCCESS = '10'
const PAY_RESULT_FAILED = '11'

export interface PendingPayment {
  id: string
  user_id: string
  service_id: string | null
  amount: number
  plan_name: string | null
  status: string
  payment_uid: string
}

export type NotifyDecision =
  /** 回 400：紅陽會補發（例如金額對不上，先不要動帳） */
  | { action: 'reject'; reason: string }
  /** 回 success：沒事要做（重複通知、不是新版訂單、已建立） */
  | { action: 'ignore'; reason: string }
  | { action: 'mark_paid'; kind: OrderKind }
  | { action: 'mark_failed'; kind: OrderKind }

export function decideNotify(payment: Pick<PendingPayment, 'amount' | 'status'> | null, body: NotifyBody): NotifyDecision {
  const td = body.td ?? ''
  if (!td) return { action: 'reject', reason: '通知沒有訂單編號' }

  const kind = orderKindOf(td)
  if (!kind) return { action: 'ignore', reason: `不是新版訂單編號：${td}` }
  if (!payment) return { action: 'ignore', reason: `查無訂單：${td}` }
  if (String(payment.amount) !== body.mn) {
    return { action: 'reject', reason: `金額不符：訂單 ${payment.amount}，通知 ${body.mn ?? '（空）'}` }
  }
  // 標成 failed 的單仍可能真的扣到錢（例如月扣請求逾時被記失敗、或同一張單重刷成功），
  // 收到成功通知時以紅陽為準轉成 paid。paid／refunded 則不再動。
  const isOpen = payment.status === 'pending' || payment.status === 'failed'
  if (!isOpen) return { action: 'ignore', reason: `已處理過（${payment.status}）` }

  if (body.pay_result === PAY_RESULT_SUCCESS) return { action: 'mark_paid', kind }
  if (body.pay_result === PAY_RESULT_FAILED) {
    return payment.status === 'pending'
      ? { action: 'mark_failed', kind }
      : { action: 'ignore', reason: '已標記失敗' }
  }
  return { action: 'ignore', reason: `pay_result=${body.pay_result ?? '（空）'}，不是最終結果` }
}

/** 寫進帳務表的原始資料：只留非敏感欄位（不含 token_key、卡號） */
function ledgerRaw(body: NotifyBody): Record<string, unknown> {
  return {
    td: body.td,
    mn: body.mn,
    pay_result: body.pay_result,
    pay_date: body.pay_date,
    pay_time: body.pay_time,
    trade_no: body.trade_no,
    approve_code: body.approve_code,
    save_card_token_result: body.save_card_token_result,
    source: 'sunpay_v3_notify',
  }
}

function txTypeOf(kind: OrderKind): 'bind_first_charge' | 'recurring' {
  return kind === 'first' ? 'bind_first_charge' : 'recurring'
}

function addOneMonth(from: Date): Date {
  const next = new Date(from)
  next.setMonth(next.getMonth() + 1)
  return next
}

async function applyUserPlan(admin: SupabaseClient, userId: string, planCode: string, deadline: Date): Promise<void> {
  const plan = await getPlanByCode(planCode)
  const { error } = await admin
    .from('users')
    .update({
      current_plan: plan?.code ?? planCode,
      // dialog_limit 是舊欄位（額度已改讀 plans＋補發），照舊同步，避免舊畫面顯示 0
      ...(plan ? { dialog_limit: plan.monthly_dialog_count } : {}),
      plan_deadline: deadline.toISOString(),
      next_plan: null,
    })
    .eq('id', userId)
  if (error) throw new Error(`更新會員方案失敗：${error.message}`)
}

/**
 * 首次付款成功：先開新訂閱，再收掉同課程其他 active 的。
 * 順序刻意如此 —— 新訂閱沒開成功就什麼都沒改（可以安全重來）；
 * 收舊的失敗只是多一筆 active，不影響權限，記 log 不中斷。
 */
async function activateSubscription(admin: SupabaseClient, payment: PendingPayment, planCode: string, endsAt: Date): Promise<void> {
  if (!payment.service_id) return
  const { data: created, error: insertError } = await admin
    .from('subscriptions')
    .insert({
      user_id: payment.user_id,
      service_id: payment.service_id,
      plan_name: planCode,
      starts_at: new Date().toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'active',
    })
    .select('id')
    .single()
  if (insertError || !created) throw new Error(`建立訂閱失敗：${insertError?.message ?? '沒有回傳 id'}`)

  const { error: expireError } = await admin
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('user_id', payment.user_id)
    .eq('service_id', payment.service_id)
    .eq('status', 'active')
    .neq('id', created.id)
  if (expireError) console.error('[sunpay/notify] 收掉舊訂閱失敗（新訂閱已開，不影響權限）', expireError.message)
}

async function findActiveSubscription(admin: SupabaseClient, payment: PendingPayment): Promise<{ id: string; ends_at: string } | null> {
  if (!payment.service_id) return null
  const { data: sub, error } = await admin
    .from('subscriptions')
    .select('id, ends_at')
    .eq('user_id', payment.user_id)
    .eq('service_id', payment.service_id)
    .eq('status', 'active')
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`查訂閱失敗：${error.message}`)
  return sub
}

export type SettleOutcome = 'paid' | 'paid_needs_review' | 'failed' | 'already_settled'

const FAILURE_WINDOW_DAYS = 3
const MAX_RECENT_FAILURES = 2
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 月扣近期失敗達上限就把該課程訂閱收掉、會員降回 free（沿用舊規則：3 天內失敗 2 次）。
 * 月扣請求當下被拒、或紅陽通知扣款失敗，兩條路都呼叫這裡。
 */
export async function downgradeAfterRepeatedFailures(admin: SupabaseClient, userId: string, serviceId: string | null): Promise<void> {
  const { count } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'failed')
    .gte('created_at', new Date(Date.now() - FAILURE_WINDOW_DAYS * DAY_MS).toISOString())
  if ((count ?? 0) < MAX_RECENT_FAILURES) return

  if (serviceId) {
    await admin.from('subscriptions').update({ status: 'expired' }).eq('user_id', userId).eq('service_id', serviceId).eq('status', 'active')
  }
  await admin.from('users').update({ current_plan: 'free', dialog_limit: 0, next_plan: null }).eq('id', userId)
}

async function settleFailed(
  admin: SupabaseClient,
  payment: PendingPayment,
  body: NotifyBody,
  kind: OrderKind,
): Promise<SettleOutcome> {
  const { data: claimed } = await admin
    .from('payments')
    .update({ status: 'failed' })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')
  if (!claimed || claimed.length === 0) return 'already_settled'

  await recordGatewayTx(admin, {
    userId: payment.user_id,
    paymentId: payment.id,
    txType: txTypeOf(kind),
    amount: payment.amount,
    orderNo: payment.payment_uid,
    gatewayNo: body.trade_no || null,
    errcode: body.pay_result ?? null,
    errmsg: '紅陽通知交易失敗',
    success: false,
    raw: ledgerRaw(body),
  })
  if (kind === 'recurring') await downgradeAfterRepeatedFailures(admin, payment.user_id, payment.service_id)
  return 'failed'
}

/**
 * 依 decideNotify 的結果寫 DB。
 *
 * 成功時的順序：搶下付款（pending/failed → paid）→ 會員方案 → 訂閱。
 * 會員方案與訂閱的寫法都可以重做而結果相同（到期日由「原本的訂閱」算出，訂閱最後才改），
 * 所以中途出錯就把付款退回 pending 再 throw，路由回 500，紅陽補發時整段重來不會多給。
 */
export async function settleNotify(
  admin: SupabaseClient,
  payment: PendingPayment,
  body: NotifyBody,
  decision: Extract<NotifyDecision, { action: 'mark_paid' | 'mark_failed' }>,
  tokenKeyHex: string,
): Promise<SettleOutcome> {
  if (decision.action === 'mark_failed') return settleFailed(admin, payment, body, decision.kind)

  const tokenData =
    decision.kind === 'first' && body.token_key
      ? packToken(
          {
            saveCardToken: payment.user_id,
            tokenKey: body.token_key,
            tokenLife: body.token_life ?? '',
            boundAt: new Date().toISOString(),
          },
          tokenKeyHex,
        )
      : null

  const { data: claimed, error: claimError } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), ...(tokenData ? { token_data: tokenData } : {}) })
    .eq('id', payment.id)
    .in('status', ['pending', 'failed'])
    .select('id')
  if (claimError) throw new Error(`更新付款狀態失敗：${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'already_settled'

  const planCode = payment.plan_name || 'basic'
  const notes: string[] = []
  if (payment.status === 'failed') notes.push('原本標記失敗，依紅陽成功通知改為已付款')

  try {
    if (decision.kind === 'first') {
      const endsAt = addOneMonth(new Date())
      await applyUserPlan(admin, payment.user_id, planCode, endsAt)
      await activateSubscription(admin, payment, planCode, endsAt)
    } else {
      const sub = await findActiveSubscription(admin, payment)
      if (!sub) {
        // 送出月扣後訂閱被取消或帳號被刪：錢已收，不能讓通知一直失敗重送 —— 標 paid、留帳待人工處理
        notes.push('月扣成功但找不到 active 訂閱，需人工處理（退款或補開）')
      } else {
        const endsAt = addOneMonth(new Date(sub.ends_at))
        await applyUserPlan(admin, payment.user_id, planCode, endsAt)
        const { error: extendError } = await admin
          .from('subscriptions')
          .update({ ends_at: endsAt.toISOString(), plan_name: planCode })
          .eq('id', sub.id)
        if (extendError) throw new Error(`展延訂閱失敗：${extendError.message}`)
      }
    }
  } catch (err) {
    await admin.from('payments').update({ status: 'pending', paid_at: null }).eq('id', payment.id).eq('status', 'paid')
    throw err
  }

  if (decision.kind === 'first' && !tokenData) {
    console.error('[sunpay/notify] 首次付款成功但沒有 token_key，這位會員之後無法月扣', { td: payment.payment_uid })
    notes.push('未取得 token_key，之後無法月扣')
  }

  await recordGatewayTx(admin, {
    userId: payment.user_id,
    paymentId: payment.id,
    txType: txTypeOf(decision.kind),
    amount: payment.amount,
    orderNo: payment.payment_uid,
    gatewayNo: body.trade_no || null,
    errcode: body.pay_result ?? null,
    success: true,
    raw: ledgerRaw(body),
    note: notes.length > 0 ? notes.join('；') : null,
  })
  return notes.some((n) => n.includes('需人工')) ? 'paid_needs_review' : 'paid'
}
