import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeTokenPayment } from '@/lib/esafe/payment'
import { decrypt } from '@/lib/esafe/crypto'
import { getSecretParam } from '@/lib/secret-params'
import { getPlanByCode } from '@/lib/queries/plans'
import { PLAN_FULL_NAME } from '@/lib/plans'
import { recordGatewayTx } from '@/lib/esafe/ledger'

// Cron: auto-charge expiring subscriptions
// Trigger: Vercel Cron daily at 00:00 UTC
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = await getSecretParam('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Find subscriptions expiring today or already expired but still active
  const today = new Date().toISOString().slice(0, 10)
  const { data: expiring } = await admin
    .from('subscriptions')
    .select('*, users(id, phone, nickname, current_plan, next_plan), services(id, code, name, plans)')
    .eq('status', 'active')
    .lte('ends_at', today + 'T23:59:59Z')

  if (!expiring || expiring.length === 0) {
    return NextResponse.json({ message: 'No expiring subscriptions', charged: 0 })
  }

  let charged = 0
  let failed = 0

  // PLAN_FULL_NAME 只給 orderInfo（金流閘道收據上人看的品名）用。
  // ⚠️ 寫進 DB 的 plan_name 一律存「代碼」（free/basic/advanced/premium），
  //    跟 initiate / callback 同一條規則 —— 這裡曾經把顯示名（'Premium'）寫進
  //    payments / subscriptions，導致同一欄混存兩種值，後台對不到標籤、
  //    對帳要靠 callback 的 legacyNameMap 硬翻。歷史資料不改寫（帳務憑證），
  //    但新資料不准再混。
  const CODE_TO_NAME = PLAN_FULL_NAME
  const DEFAULT_LIMITS: Record<string, number> = {
    basic: 50,
    advanced: 100,
    premium: 200,
  }

  for (const sub of expiring) {
    const user = sub.users as { id: string; phone: string; nickname: string | null; current_plan: string; next_plan?: string | null } | null
    if (!user) continue

    const service = sub.services as { id: string; code: string; name: string; plans: unknown } | null

    // Determine the plan to charge for (next_plan or current_plan)
    const hasScheduledChange = user.next_plan && user.next_plan !== user.current_plan
    const effectivePlanCode = hasScheduledChange ? user.next_plan! : user.current_plan
    const effectivePlanName = CODE_TO_NAME[effectivePlanCode] ?? CODE_TO_NAME[user.current_plan] ?? '基本方案'

    // 從 plans 表（code）取每月收費與對話次數
    let chargeAmount = 0
    let dialogLimit = DEFAULT_LIMITS[effectivePlanCode] ?? 30
    const planRow = await getPlanByCode(effectivePlanCode)
    if (planRow) {
      chargeAmount = planRow.monthly_charge
      dialogLimit = planRow.monthly_dialog_count
    }

    // Find the latest payment with tokenData for this user
    const { data: lastPayment } = await admin
      .from('payments')
      .select('token_data, plan_name, amount')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .not('token_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!lastPayment?.token_data) {
      // No token — mark subscription as expired
      await admin.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id)
      await admin.from('users').update({ current_plan: 'free', dialog_limit: 0, next_plan: null }).eq('id', user.id)
      continue
    }

    // Use the looked-up price, fallback to last payment amount
    if (chargeAmount <= 0) chargeAmount = lastPayment.amount

    try {
      // Decrypt token data
      const tokenInfo = await decrypt(lastPayment.token_data) as {
        paymentToken?: string
        verificationCode?: string
        tokenExpiryDate?: string
      }

      if (!tokenInfo.paymentToken) {
        await admin.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id)
        await admin.from('users').update({ current_plan: 'free', dialog_limit: 0, next_plan: null }).eq('id', user.id)
        continue
      }

      // Generate order number
      const orderNo = `REC_${Date.now()}_${Math.floor(Math.random() * 1000)}`

      // Execute payment with the effective plan's price
      const gatewayResult = await executeTokenPayment({
        paymentToken: tokenInfo.paymentToken,
        verificationCode: tokenInfo.verificationCode ?? '',
        tokenExpiryDate: tokenInfo.tokenExpiryDate ?? '',
        userId: user.id,
        price: chargeAmount,
        orderNo,
        orderInfo: `自動扣款 — ${effectivePlanName}${hasScheduledChange ? '（方案變更）' : ''}`,
      })
      // ⚠️ 既有行為：只要 executeTokenPayment 沒 throw 就當成功，回傳的 errcode
      //    並未檢查（紅陽回失敗碼但 HTTP 200 時，訂閱仍會被展延）。
      //    這是金流主線的判斷，A 案不動它 —— 只把 errcode 如實記進帳，
      //    帳上看得到「成功處理但 errcode 非 00」的異常列。修正列入 Steve 金流規格書。
      const gatewayErrcode =
        typeof (gatewayResult as { errcode?: unknown })?.errcode === 'string'
          ? ((gatewayResult as { errcode?: string }).errcode ?? null)
          : null

      // Extend subscription by 1 month
      const newEndsAt = new Date(sub.ends_at)
      newEndsAt.setMonth(newEndsAt.getMonth() + 1)

      await admin.from('subscriptions').update({
        ends_at: newEndsAt.toISOString(),
        plan_name: effectivePlanCode, // 存代碼，同 callback 建訂閱那條路
      }).eq('id', sub.id)

      // Update user: apply plan change if scheduled, reset next_plan
      await admin.from('users').update({
        current_plan: effectivePlanCode,
        dialog_limit: dialogLimit,
        plan_deadline: newEndsAt.toISOString(),
        next_plan: null, // Clear scheduled change after applying
      }).eq('id', user.id)

      // Record payment
      const { data: paymentRow } = await admin.from('payments').insert({
        user_id: user.id,
        service_id: service?.id,
        amount: chargeAmount,
        plan_name: effectivePlanCode, // 存代碼，同 initiate 首次付款那條路
        payment_uid: orderNo,
        status: 'paid',
        paid_at: new Date().toISOString(),
      }).select('id').single()

      // 金流帳務（migration 027）：月扣入帳。raw 由 ledger 端剔除敏感欄位。
      await recordGatewayTx(admin, {
        userId: user.id,
        paymentId: paymentRow?.id ?? null,
        txType: 'recurring',
        amount: chargeAmount,
        orderNo,
        errcode: gatewayErrcode,
        success: true,
        raw: (gatewayResult ?? null) as Record<string, unknown> | null,
      })

      charged++
    } catch (e) {
      console.error('Auto-charge failed for user', user.id, e)
      failed++

      // 金流帳務：扣款失敗也留帳（以後查「為什麼這個人扣款失敗」不用翻 log）
      await recordGatewayTx(admin, {
        userId: user.id,
        txType: 'recurring',
        amount: chargeAmount,
        errcode: null,
        errmsg: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
        success: false,
      })

      // Mark as failed after 3 retries (check recent failures)
      const { count } = await admin
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'failed')
        .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())

      if ((count ?? 0) >= 2) {
        await admin.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id)
        await admin.from('users').update({ current_plan: 'free', dialog_limit: 0, next_plan: null }).eq('id', user.id)
      }
    }
  }

  return NextResponse.json({ message: 'Auto-charge complete', charged, failed })
}
