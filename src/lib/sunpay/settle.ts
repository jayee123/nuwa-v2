/**
 * 紅陽通知（首次付款／月扣）入帳：判斷要做什麼（純函式）＋ 實際寫 DB。
 *
 * 紅陽 30 分鐘內每 5 分鐘補發一次，同一筆可能來好幾次（手冊 §4.3.3）。
 * 防重複靠「只有還是 pending 的那次能把狀態改掉」的條件更新：
 * 搶到的那次才開訂閱，其他次直接回 success。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordGatewayTx } from '@/lib/gateway-ledger'
import { PLAN_FULL_NAME } from '@/lib/plans'
import { getPlanByCode } from '@/lib/queries/plans'
import type { NotifyBody } from './crypto'
import { cardTokenOf, orderKindOf, type OrderKind } from './order'
import { packToken } from './token-store'
import { latestCardPayment } from './card-on-file'

const PAY_RESULT_SUCCESS = '10'
const PAY_RESULT_FAILED = '11'

/**
 * 收到成功通知時以紅陽為準轉成 paid 的狀態。paid／refunded 不再動。
 * - failed：仍可能真的扣到錢（例如月扣請求逾時被記失敗、或同一張單重刷成功）
 * - cancelled：使用者在紅陽視窗付完才回結帳頁按「取消付款」，通知比按鈕晚到
 */
const SETTLEABLE_STATUSES = ['pending', 'failed', 'cancelled']

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
  if (!SETTLEABLE_STATUSES.includes(payment.status)) return { action: 'ignore', reason: `已處理過（${payment.status}）` }

  if (body.pay_result === PAY_RESULT_SUCCESS) return { action: 'mark_paid', kind }
  if (body.pay_result === PAY_RESULT_FAILED) {
    if (payment.status === 'pending') return { action: 'mark_failed', kind }
    return { action: 'ignore', reason: payment.status === 'cancelled' ? '使用者已取消' : '已標記失敗' }
  }
  return { action: 'ignore', reason: `pay_result=${body.pay_result ?? '（空）'}，不是最終結果` }
}

/** 結果從哪來：紅陽通知，或對帳排程去紅陽查回來的（BIL-3） */
export type SettleOrigin = 'notify' | 'reconcile'

const LEDGER_SOURCE: Record<SettleOrigin, string> = { notify: 'sunpay_v3_notify', reconcile: 'sunpay_v3_reconcile' }
const FAILED_MESSAGE: Record<SettleOrigin, string> = {
  notify: '紅陽通知交易失敗',
  reconcile: '對帳查詢：紅陽顯示交易失敗、取消或逾時未完成',
}

/** 寫進帳務表的原始資料：只留非敏感欄位（不含 token_key、卡號） */
function ledgerRaw(body: NotifyBody, origin: SettleOrigin): Record<string, unknown> {
  return {
    td: body.td,
    mn: body.mn,
    pay_result: body.pay_result,
    pay_date: body.pay_date,
    pay_time: body.pay_time,
    trade_no: body.trade_no,
    approve_code: body.approve_code,
    save_card_token_result: body.save_card_token_result,
    source: LEDGER_SOURCE[origin],
  }
}

/** 升級也是重新綁卡＋扣款，記 bind_first_charge（tx_type 有 CHECK 限制，不另開類型），帳上註記升級差價 */
function txTypeOf(kind: OrderKind): 'bind_first_charge' | 'recurring' {
  return kind === 'recurring' ? 'recurring' : 'bind_first_charge'
}

function addOneMonth(from: Date): Date {
  const next = new Date(from)
  next.setMonth(next.getMonth() + 1)
  return next
}

/**
 * 紅陽記錄的付款時間：pay_date（YYYYMMDD）＋ pay_time（HH:MM 或 HH:MM:SS），台灣時間。
 * 首次付款的一個月從這裡起算，不是從入帳那一刻 —— 對帳隔天才補入帳時，會員不會多出一天
 * （PAY-24，Steve 10/20：10/18 付的 XRQ75U 被算成從 10/19 起）。
 * 沒帶、格式不對、或比現在還晚（時鐘誤差）就用現在。
 */
export function paidAtOf(body: Pick<NotifyBody, 'pay_date' | 'pay_time'>, now: Date): Date {
  const date = body.pay_date?.trim() ?? ''
  const time = body.pay_time?.trim() ?? ''
  if (!/^\d{8}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return now
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.length === 5 ? `${time}:00` : time}+08:00`
  const paidAt = new Date(iso)
  if (Number.isNaN(paidAt.getTime()) || paidAt > now) return now
  return paidAt
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
 * 首次付款成功：先收掉同課程 active 的舊訂閱，再開新的。
 *
 * 順序不能反過來：正式庫有 idx_subscriptions_one_active（同會員同課程只能一筆 active，
 * migration 022 STEP 3），先開新的會撞唯一鍵 —— 10/18 升級單 V3F261018001051XRQ75U
 * 就是這樣，紅陽補發 7 次全部失敗，錢收了、訂閱沒開。
 * 新訂閱開失敗就把剛收掉的改回 active 再 throw，等於沒改，紅陽補發或對帳可以安全重來。
 */
async function activateSubscription(
  admin: SupabaseClient,
  payment: PendingPayment,
  planCode: string,
  startsAt: Date,
  endsAt: Date,
): Promise<void> {
  if (!payment.service_id) return
  const { data: expired, error: expireError } = await admin
    .from('subscriptions')
    .update({ status: 'expired' })
    .eq('user_id', payment.user_id)
    .eq('service_id', payment.service_id)
    .eq('status', 'active')
    .select('id')
  if (expireError) throw new Error(`收掉舊訂閱失敗：${expireError.message}`)

  const { data: created, error: insertError } = await admin
    .from('subscriptions')
    .insert({
      user_id: payment.user_id,
      service_id: payment.service_id,
      plan_name: planCode,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'active',
    })
    .select('id')
    .single()
  if (insertError || !created) {
    await restoreSubscriptions(admin, (expired ?? []).map((s: { id: string }) => s.id))
    throw new Error(`建立訂閱失敗：${insertError?.message ?? '沒有回傳 id'}`)
  }
}

async function restoreSubscriptions(admin: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await admin.from('subscriptions').update({ status: 'active' }).in('id', ids)
  if (error) console.error('[sunpay/notify] 新訂閱沒開成，舊訂閱也改不回 active，需人工處理', { ids, error: error.message })
}

async function findActiveSubscription(
  admin: SupabaseClient,
  payment: PendingPayment,
): Promise<{ id: string; ends_at: string; plan_name: string | null } | null> {
  if (!payment.service_id) return null
  const { data: sub, error } = await admin
    .from('subscriptions')
    .select('id, ends_at, plan_name')
    .eq('user_id', payment.user_id)
    .eq('service_id', payment.service_id)
    .eq('status', 'active')
    .order('ends_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`查訂閱失敗：${error.message}`)
  return sub
}

/**
 * 升級（PAY-20）：原訂閱直接改方案，開始日與到期日都不動 ——
 * 只收了差價（或定價相同不收錢），不能重算一個月；額度週期的錨點是訂閱開始日，不動才不會讓已用次數歸零。
 * 回傳要記在帳上的註記；找不到進行中的訂閱回 null。
 */
async function applyUpgrade(admin: SupabaseClient, payment: PendingPayment, planCode: string): Promise<string | null> {
  const sub = await findActiveSubscription(admin, payment)
  if (!sub) return null

  const originalPlan = sub.plan_name
  const from = PLAN_FULL_NAME[originalPlan ?? ''] ?? originalPlan ?? '原方案'
  const { error } = await admin.from('subscriptions').update({ plan_name: planCode }).eq('id', sub.id)
  if (error) throw new Error(`升級訂閱失敗：${error.message}`)
  try {
    await applyUserPlan(admin, payment.user_id, planCode, new Date(sub.ends_at))
  } catch (err) {
    // 訂閱改回原方案，不留「訂閱升了、會員沒升」的半套狀態
    await admin.from('subscriptions').update({ plan_name: originalPlan }).eq('id', sub.id)
    throw err
  }
  return `升級差價：${from} → ${PLAN_FULL_NAME[planCode] ?? planCode}，到期日不變`
}

/**
 * 定價相同的升級（PAY-20，Jeff 10/18：升方案、留紀錄、不收錢）：不經紅陽，結帳當下直接改方案。
 * 付款列由 initiate 以 NT$0、pending 建好；改成了標 paid，改不成標 failed。
 * 沒有經過金流，不記金流帳務；也不存卡片代碼，之後月扣照用原本綁的卡。
 */
export async function settleFreeUpgrade(admin: SupabaseClient, payment: PendingPayment): Promise<'paid' | 'failed'> {
  const planCode = payment.plan_name || 'basic'
  try {
    const note = await applyUpgrade(admin, payment, planCode)
    if (!note) throw new Error('找不到進行中的訂閱')
  } catch (err) {
    console.error('[payment/initiate] 免付款升級失敗', { td: payment.payment_uid, error: err instanceof Error ? err.message : err })
    await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id).eq('status', 'pending')
    return 'failed'
  }
  const { error } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', payment.id)
    .eq('status', 'pending')
  // 方案已經升上去了，只是紀錄沒標成 —— 記 log 待人工補，不讓使用者看到失敗
  if (error) console.error('[payment/initiate] 免付款升級已生效，但紀錄標 paid 失敗，需人工處理', { td: payment.payment_uid, error: error.message })
  return 'paid'
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
  origin: SettleOrigin,
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
    errmsg: FAILED_MESSAGE[origin],
    success: false,
    raw: ledgerRaw(body, origin),
  })
  if (kind === 'recurring') await downgradeAfterRepeatedFailures(admin, payment.user_id, payment.service_id)
  return 'failed'
}

/**
 * 這次入帳沒拿到 token_key 時的帳務備註。
 * 會員還有能月扣的卡（之前的付款、或這筆先前通知時就存了）→ 寫出會用哪一筆，不必人工；
 * 一張都沒有才標需人工，請會員到期前重新結帳綁卡。
 */
async function missingTokenNote(admin: SupabaseClient, payment: PendingPayment, origin: SettleOrigin): Promise<string> {
  const card = await latestCardPayment(admin, payment.user_id)
  if (card) return `這次沒有取得卡片代碼，月扣會用 ${card.payment_uid} 綁的卡`
  console.error('[sunpay/notify] 付款成功但沒有 token_key，這位會員也沒有其他可用的卡，之後無法月扣', { td: payment.payment_uid, origin })
  const prefix = origin === 'reconcile' ? '對帳補入帳：查詢不會帶 token_key' : '未取得 token_key'
  return `${prefix}，這位會員沒有可用的卡，之後無法月扣，需人工請會員到期前重新結帳綁卡`
}

/**
 * 依 decideNotify 的結果寫 DB。
 *
 * 成功時的順序：搶下付款（pending/failed/cancelled → paid）→ 會員方案 → 訂閱（升級是訂閱 → 會員方案）。
 * 會員方案與訂閱的寫法都可以重做而結果相同（到期日由「原本的訂閱」算出，訂閱最後才改），
 * 所以中途出錯就把付款退回 pending 再 throw，路由回 500，紅陽補發時整段重來不會多給。
 */
export async function settleNotify(
  admin: SupabaseClient,
  payment: PendingPayment,
  body: NotifyBody,
  decision: Extract<NotifyDecision, { action: 'mark_paid' | 'mark_failed' }>,
  tokenKeyHex: string,
  origin: SettleOrigin = 'notify',
): Promise<SettleOutcome> {
  if (decision.action === 'mark_failed') return settleFailed(admin, payment, body, decision.kind, origin)

  const tokenData =
    decision.kind !== 'recurring' && body.token_key
      ? packToken(
          {
            saveCardToken: cardTokenOf(payment.id),
            tokenKey: body.token_key,
            tokenLife: body.token_life ?? '',
            boundAt: new Date().toISOString(),
          },
          tokenKeyHex,
        )
      : null

  const paidAt = paidAtOf(body, new Date())
  const { data: claimed, error: claimError } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: paidAt.toISOString(), ...(tokenData ? { token_data: tokenData } : {}) })
    .eq('id', payment.id)
    .in('status', SETTLEABLE_STATUSES)
    .select('id')
  if (claimError) throw new Error(`更新付款狀態失敗：${claimError.message}`)
  if (!claimed || claimed.length === 0) return 'already_settled'

  const planCode = payment.plan_name || 'basic'
  const notes: string[] = []
  if (payment.status === 'failed') notes.push('原本標記失敗，依紅陽成功通知改為已付款')
  if (payment.status === 'cancelled') notes.push('使用者按了取消付款，但紅陽回報付款成功，改為已付款')

  try {
    if (decision.kind === 'first') {
      const endsAt = addOneMonth(paidAt)
      await applyUserPlan(admin, payment.user_id, planCode, endsAt)
      await activateSubscription(admin, payment, planCode, paidAt, endsAt)
    } else if (decision.kind === 'upgrade') {
      // 付款期間剛好到期被收掉：只收了差價，不能當首次付款開一個月 —— 標 paid、留帳待人工處理
      notes.push((await applyUpgrade(admin, payment, planCode)) ?? '升級差價已收，但找不到進行中的訂閱，需人工處理（退款或補開）')
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

  if (decision.kind !== 'recurring' && !tokenData) {
    // 對帳查回來的一定沒有 token_key（查詢不回傳），只有通知會帶。
    // 先查月扣實際會用的卡（跟 auto-charge 同一個查法），真的沒有才標需人工 —— 10/19 曾沒查就誤報
    notes.push(await missingTokenNote(admin, payment, origin))
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
    raw: ledgerRaw(body, origin),
    note: notes.length > 0 ? notes.join('；') : null,
  })
  return notes.some((n) => n.includes('需人工')) ? 'paid_needs_review' : 'paid'
}
