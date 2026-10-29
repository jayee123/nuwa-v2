import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSecretParam } from '@/lib/secret-params'
import { getSunpayConfig, type SunpayConfig } from '@/lib/sunpay/config'
import { queryPayment } from '@/lib/sunpay/client'
import { RECONCILE_MIN_AGE_MS, reconcileStep } from '@/lib/sunpay/reconcile'
import {
  REFUND_CHECK_BATCH,
  REFUND_CHECK_WINDOW_MS,
  needsRefundCheck,
  refundCheckStep,
  type RefundCheckState,
} from '@/lib/sunpay/refund-check'
import { decideNotify, settleNotify, type PendingPayment } from '@/lib/sunpay/settle'

// Cron：對帳（BIL-3）。每天台灣 08:00 跑（v2/vercel.json），排在 09:00 月扣之前 ——
// 月扣遇到同一人還有 pending 的月扣就不送（auto-charge 的 hasChargeInFlight），先對帳才不會卡住。
//
// 找出超過 35 分鐘還在「處理中」的新版付款（紅陽通知 30 分鐘內會補發完），
// 一筆一筆去紅陽即時交易查詢（一般金流手冊 V1.1.1 §4.4），有最終結果就照通知的流程入帳。
// 判斷規則見 lib/sunpay/reconcile.ts。
//
// 接著查「我們標了退款」的單在紅陽是不是真的退完了（BIL-3 後半），結果寫回金流帳務那一列退款，
// 判斷規則見 lib/sunpay/refund-check.ts。
//
// ?dryRun=1：只查、不寫 DB，回傳每一筆會怎麼處理 —— 第一次上線先用這個確認紅陽查得到代碼授權的單。

const BATCH_LIMIT = 30

type ReconcileOutcome = 'paid' | 'failed' | 'waiting' | 'review' | 'query_error'

interface PendingRow extends PendingPayment {
  created_at: string
}

interface Detail {
  td: string
  outcome: ReconcileOutcome
  note: string
}

async function reconcileOne(
  admin: SupabaseClient,
  config: SunpayConfig,
  payment: PendingRow,
  now: Date,
  dryRun: boolean,
): Promise<Detail> {
  const td = payment.payment_uid
  const result = await queryPayment(config, td)
  if (!result.ok) {
    console.error('[reconcile] 查詢失敗，明天再查', { td, code: result.code, msg: result.msg.slice(0, 200) })
    return { td, outcome: 'query_error', note: `${result.code} ${result.msg.slice(0, 100)}` }
  }

  const step = reconcileStep(payment, result.item, now)
  if (step.action === 'wait') return { td, outcome: 'waiting', note: step.reason }
  if (step.action === 'review') {
    console.error('[reconcile] 需人工到紅陽後台確認', { td, reason: step.reason })
    return { td, outcome: 'review', note: step.reason }
  }

  const decision = decideNotify(payment, step.body)
  if (decision.action === 'reject') {
    console.error('[reconcile] 查回來的結果對不上，需人工確認', { td, reason: decision.reason })
    return { td, outcome: 'review', note: decision.reason }
  }
  if (decision.action === 'ignore') return { td, outcome: 'waiting', note: decision.reason }

  const planned: ReconcileOutcome = decision.action === 'mark_paid' ? 'paid' : 'failed'
  if (dryRun) return { td, outcome: planned, note: '試跑，未寫入' }

  const outcome = await settleNotify(admin, payment, step.body, decision, config.tokenKey, 'reconcile')
  if (outcome === 'already_settled') return { td, outcome: 'waiting', note: '通知剛好先入帳了' }
  if (outcome === 'paid_needs_review') {
    console.error('[reconcile] 已補入帳，但需人工處理（見帳務備註）', { td, kind: decision.kind })
  } else {
    console.log('[reconcile] 已補入帳', { td, outcome, kind: decision.kind })
  }
  return { td, outcome: planned, note: outcome }
}

interface RefundLedgerRow {
  id: string
  order_no: string | null
  created_at: string
  raw: Record<string, unknown> | null
}

interface RefundDetail {
  td: string
  state: RefundCheckState | 'query_error'
  needsReview: boolean
  note: string
}

/** 查一筆退款在紅陽的狀態，寫回帳務那一列的 raw.sunpay_refund_check（試跑不寫） */
async function checkRefundOne(
  admin: SupabaseClient,
  config: SunpayConfig,
  row: RefundLedgerRow,
  now: Date,
  dryRun: boolean,
): Promise<RefundDetail> {
  const td = row.order_no ?? ''
  const result = await queryPayment(config, td)
  if (!result.ok) {
    console.error('[reconcile/refund] 查詢失敗，明天再查', { td, code: result.code, msg: result.msg.slice(0, 200) })
    return { td, state: 'query_error', needsReview: false, note: `${result.code} ${result.msg.slice(0, 100)}` }
  }

  const record = refundCheckStep(result.item, new Date(row.created_at), now)
  if (record.needs_review) console.error('[reconcile/refund] 退款需人工到紅陽後台確認', { td, reason: record.reason })
  if (dryRun) return { td, state: record.state, needsReview: record.needs_review, note: `試跑，未寫入：${record.reason}` }

  const { error } = await admin
    .from('gateway_transactions')
    .update({ raw: { ...(row.raw ?? {}), sunpay_refund_check: record } })
    .eq('id', row.id)
  if (error) console.error('[reconcile/refund] 寫回帳務失敗，明天再查', { td, error: error.message })
  return { td, state: record.state, needsReview: record.needs_review, note: record.reason }
}

async function reconcileRefunds(admin: SupabaseClient, config: SunpayConfig, now: Date, dryRun: boolean) {
  // 60 天內標的退款不多，全撈回來在這裡挑「還沒確認完成」的，比用 JSON 欄位過濾直觀
  const { data, error } = await admin
    .from('gateway_transactions')
    .select('id, order_no, created_at, raw')
    .eq('tx_type', 'refund')
    .like('order_no', 'V3%')
    .gte('created_at', new Date(now.getTime() - REFUND_CHECK_WINDOW_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    console.error('[reconcile/refund] 查詢退款帳失敗', error.message)
    return { checked: 0, confirmed: 0, waiting: 0, review: 0, error: true, details: [] as RefundDetail[] }
  }

  const due = ((data ?? []) as RefundLedgerRow[])
    .filter((row) => needsRefundCheck(row.raw, new Date(row.created_at), now))
    .slice(0, REFUND_CHECK_BATCH)
  const details: RefundDetail[] = []
  for (const row of due) {
    try {
      details.push(await checkRefundOne(admin, config, row, now, dryRun))
    } catch (err) {
      console.error('[reconcile/refund] 處理時發生錯誤，明天再查', { td: row.order_no, error: err instanceof Error ? err.message : err })
      details.push({ td: row.order_no ?? '', state: 'query_error', needsReview: false, note: '處理時發生錯誤' })
    }
  }
  return {
    checked: details.length,
    confirmed: details.filter((d) => d.state === 'confirmed').length,
    waiting: details.filter((d) => d.state !== 'confirmed' && !d.needsReview).length,
    review: details.filter((d) => d.needsReview).length,
    error: false,
    details,
  }
}

export async function GET(request: Request) {
  const cronSecret = await getSecretParam('CRON_SECRET')
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configResult = await getSunpayConfig()
  if (!configResult.ok) {
    console.error('[reconcile] 金流設定不完整，本次不對帳', configResult.problems)
    return NextResponse.json({ error: '金流設定不完整', problems: configResult.problems }, { status: 500 })
  }

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
  const admin = createAdminClient()
  const now = new Date()
  const { data: pending, error } = await admin
    .from('payments')
    .select('id, user_id, service_id, amount, plan_name, status, payment_uid, created_at')
    .eq('status', 'pending')
    .or('payment_uid.like.V3F%,payment_uid.like.V3U%,payment_uid.like.V3R%')
    .lte('created_at', new Date(now.getTime() - RECONCILE_MIN_AGE_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT)
  if (error) {
    console.error('[reconcile] 查詢處理中付款失敗', error.message)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  const counts: Record<ReconcileOutcome, number> = { paid: 0, failed: 0, waiting: 0, review: 0, query_error: 0 }
  const details: Detail[] = []
  for (const payment of (pending ?? []) as PendingRow[]) {
    try {
      const detail = await reconcileOne(admin, configResult.config, payment, now, dryRun)
      counts[detail.outcome]++
      details.push(detail)
    } catch (err) {
      console.error('[reconcile] 處理時發生錯誤，明天再查', { td: payment.payment_uid, error: err instanceof Error ? err.message : err })
      counts.query_error++
    }
  }

  const { details: refundDetails, ...refunds } = await reconcileRefunds(admin, configResult.config, now, dryRun)

  return NextResponse.json({
    message: 'Reconcile complete',
    dryRun,
    ...counts,
    refunds,
    ...(dryRun ? { details, refundDetails } : {}),
  })
}
