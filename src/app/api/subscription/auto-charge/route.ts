import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSecretParam } from '@/lib/secret-params'
import { getPlanByCode } from '@/lib/queries/plans'
import { PLAN_FULL_NAME } from '@/lib/plans'
import { recordGatewayTx } from '@/lib/esafe/ledger'
import { getSunpayConfig, type SunpayConfig } from '@/lib/sunpay/config'
import { isOutcomeUnknown, requestSubsequentPayment } from '@/lib/sunpay/client'
import { downgradeAfterRepeatedFailures } from '@/lib/sunpay/settle'
import { generateOrderNo, toSunpayName, toSunpayOrderInfo, toSunpayPhone } from '@/lib/sunpay/order'
import { isTokenExpired, isV3Token, unpackToken, type StoredToken } from '@/lib/sunpay/token-store'

// Cron：到期訂閱自動月扣（紅陽 SunPay v3 代碼後續付款）。
//
// 紅陽的後續付款是非同步的：這裡送出請求、紅陽回 code=00 只代表「收下了」，
// 付款維持 pending，實際成功／失敗由 /api/payment/sunpay/notify 收到通知時入帳並展延訂閱。
// 送出就被拒（code≠00）的，在這裡直接記失敗；逾時等結果不明的維持 pending，不當失敗
//（紅陽可能其實扣到了），等通知或人工對帳。
//
// 同一人只要還有一筆月扣 pending 就不再送 —— 寧可漏扣也不重複扣。
// 兩個排程同時跑時，靠 migration 033 的唯一索引擋住第二筆。

const STALE_PENDING_MS = 24 * 60 * 60 * 1000
const UNIQUE_VIOLATION = '23505'

interface SubUser {
  id: string
  email: string | null
  phone: string | null
  nickname: string | null
  current_plan: string
  next_plan: string | null
  deleted_at: string | null
}

interface ExpiringSub {
  id: string
  service_id: string | null
  users: SubUser | null
}

type ChargeOutcome = 'requested' | 'failed' | 'unknown' | 'skipped' | 'expired'

function todayInTaiwan(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

async function expireToFree(admin: SupabaseClient, subId: string, userId: string): Promise<void> {
  await admin.from('subscriptions').update({ status: 'expired' }).eq('id', subId)
  await admin.from('users').update({ current_plan: 'free', dialog_limit: 0, next_plan: null }).eq('id', userId)
}

async function hasChargeInFlight(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('payments')
    .select('payment_uid, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .like('payment_uid', 'V3R%')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data) return false
  if (Date.now() - new Date(data.created_at).getTime() > STALE_PENDING_MS) {
    console.error('[auto-charge] 月扣超過一天還沒有結果，需人工對帳（紅陽後台查這張單）', { userId, td: data.payment_uid })
  }
  return true
}

async function latestStoredToken(
  admin: SupabaseClient,
  userId: string,
  tokenKey: string,
): Promise<{ token: StoredToken; lastAmount: number } | { error: 'none' | 'unreadable' }> {
  const { data: lastPayment } = await admin
    .from('payments')
    .select('token_data, amount')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .like('token_data', 'v3:%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!lastPayment?.token_data || !isV3Token(lastPayment.token_data)) return { error: 'none' }
  try {
    return { token: unpackToken(lastPayment.token_data, tokenKey), lastAmount: lastPayment.amount }
  } catch {
    return { error: 'unreadable' }
  }
}

async function chargeOne(admin: SupabaseClient, config: SunpayConfig, sub: ExpiringSub, today: string): Promise<ChargeOutcome> {
  const user = sub.users
  if (!user) return 'skipped'

  // 已刪除的會員不扣款，訂閱直接收掉
  if (user.deleted_at) {
    await admin.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id)
    return 'expired'
  }
  if (await hasChargeInFlight(admin, user.id)) return 'skipped'

  const stored = await latestStoredToken(admin, user.id, config.tokenKey)
  if ('error' in stored) {
    if (stored.error === 'unreadable') {
      // 解不開多半是 SUNPAY_TOKEN_KEY 被換掉 —— 是我們的設定問題，不能因此把會員降級
      console.error('[auto-charge] 卡片代碼解不開，請檢查 SUNPAY_TOKEN_KEY', { userId: user.id })
      await recordGatewayTx(admin, {
        userId: user.id,
        txType: 'recurring',
        amount: 0,
        errcode: 'TOKEN_UNREADABLE',
        errmsg: '卡片代碼解不開（SUNPAY_TOKEN_KEY 可能被更換）',
        success: false,
      })
      return 'failed'
    }
    await recordGatewayTx(admin, {
      userId: user.id,
      txType: 'recurring',
      amount: 0,
      errcode: 'NO_TOKEN',
      errmsg: '沒有新版卡片代碼，訂閱到期不續扣',
      success: false,
    })
    await expireToFree(admin, sub.id, user.id)
    return 'expired'
  }
  if (isTokenExpired(stored.token.tokenLife, today)) {
    await expireToFree(admin, sub.id, user.id)
    return 'expired'
  }

  const hasScheduledChange = !!user.next_plan && user.next_plan !== user.current_plan
  const planCode = hasScheduledChange ? user.next_plan! : user.current_plan
  const plan = await getPlanByCode(planCode)
  const amount = plan && plan.monthly_charge > 0 ? plan.monthly_charge : stored.lastAmount
  const orderNo = generateOrderNo('recurring')

  // 計畫名稱存代碼（free/basic/advanced/premium），同首次付款
  const { data: payment, error: insertError } = await admin
    .from('payments')
    .insert({
      user_id: user.id,
      service_id: sub.service_id,
      amount,
      plan_name: planCode,
      payment_uid: orderNo,
      status: 'pending',
    })
    .select('id')
    .single()
  if (insertError?.code === UNIQUE_VIOLATION) return 'skipped' // 另一個排程剛送出這個人的月扣
  if (insertError || !payment) {
    console.error('[auto-charge] 建立付款記錄失敗', { userId: user.id, error: insertError?.message })
    return 'failed'
  }

  const result = await requestSubsequentPayment(config, {
    customer: {
      email: user.email ?? '',
      name: toSunpayName(user.nickname),
      phone: toSunpayPhone(user.phone),
    },
    amount,
    orderInfo: toSunpayOrderInfo(
      `自動扣款 ${PLAN_FULL_NAME[planCode] ?? planCode}${hasScheduledChange ? '（方案變更）' : ''}`,
    ),
    orderNo,
    saveCardToken: stored.token.saveCardToken,
    tokenKey: stored.token.tokenKey,
  })
  if (result.ok) return 'requested'

  if (isOutcomeUnknown(result.code)) {
    console.error('[auto-charge] 月扣結果不明，維持 pending 等通知或人工對帳', { userId: user.id, orderNo, code: result.code })
    await recordGatewayTx(admin, {
      userId: user.id,
      paymentId: payment.id,
      txType: 'recurring',
      amount,
      orderNo,
      errcode: result.code,
      errmsg: result.msg.slice(0, 500),
      success: false,
      raw: { stage: 'request_recurring', source: 'sunpay_v3' },
      note: '結果不明：付款維持 pending，等紅陽通知；沒有通知就到紅陽後台查這張單',
    })
    return 'unknown'
  }

  await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id).eq('status', 'pending')
  await recordGatewayTx(admin, {
    userId: user.id,
    paymentId: payment.id,
    txType: 'recurring',
    amount,
    orderNo,
    errcode: result.code,
    errmsg: result.msg.slice(0, 500),
    success: false,
    raw: { stage: 'request_recurring', source: 'sunpay_v3' },
  })
  await downgradeAfterRepeatedFailures(admin, user.id, sub.service_id)
  return 'failed'
}

export async function GET(request: Request) {
  const cronSecret = await getSecretParam('CRON_SECRET')
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configResult = await getSunpayConfig()
  if (!configResult.ok) {
    // 設定不完整就整批不動 —— 不能因為我們的設定問題把會員降級
    console.error('[auto-charge] 金流設定不完整，本次不扣款', configResult.problems)
    return NextResponse.json({ error: '金流設定不完整', problems: configResult.problems }, { status: 500 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: expiring, error } = await admin
    .from('subscriptions')
    .select('id, service_id, users(id, email, phone, nickname, current_plan, next_plan, deleted_at)')
    .eq('status', 'active')
    .lte('ends_at', today + 'T23:59:59Z')
  if (error) {
    console.error('[auto-charge] 查詢到期訂閱失敗', error.message)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  const counts: Record<ChargeOutcome, number> = { requested: 0, failed: 0, unknown: 0, skipped: 0, expired: 0 }
  const twToday = todayInTaiwan()
  for (const sub of (expiring ?? []) as unknown as ExpiringSub[]) {
    try {
      counts[await chargeOne(admin, configResult.config, sub, twToday)]++
    } catch (err) {
      console.error('[auto-charge] 處理訂閱時發生錯誤', { subId: sub.id, error: err instanceof Error ? err.message : err })
      counts.failed++
    }
  }

  return NextResponse.json({ message: 'Auto-charge complete', ...counts })
}
