import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseBillingCycle } from '@/lib/billing-cycle'
import { recordGatewayTx } from '@/lib/gateway-ledger'
import { getSunpayConfig } from '@/lib/sunpay/config'
import { requestFirstPayment } from '@/lib/sunpay/client'
import { settleFreeUpgrade } from '@/lib/sunpay/settle'
import { verifyExpectedAmount } from '@/lib/sunpay/checkout-quote'
import { loadCheckoutContext } from '@/lib/sunpay/checkout-context'
import { cardTokenOf, generateOrderNo, toSunpayName, toSunpayOrderInfo, toSunpayPhone } from '@/lib/sunpay/order'

// 發起首次付款（紅陽 SunPay v3 代碼授權）：
// 建 pending 付款 → 向紅陽取付款連結 → 前端另開視窗付款、輪詢 /api/payment/status。
// 結帳頁先用 /api/payment/quote 試算給會員確認，按下「前往付款」才呼叫這支建單（PAY-22）。
// 付款結果由 /api/payment/sunpay/notify 入帳。
//
// 金額一律由伺服器依方案表計算 —— 以前收前端傳來的 amount，改請求就能用 1 元買最高方案。
// 已有進行中的訂閱就是升級：只收差價、到期日不變；定價相同就不經紅陽直接升級（規則見 lib/sunpay/checkout-quote.ts）。
// 只賣月繳（年繳暫停，見 lib/billing-cycle.ts）。

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: { planCode?: unknown; serviceCode?: unknown; billing?: unknown; expectedAmount?: unknown }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  const planCode = typeof input.planCode === 'string' ? input.planCode : ''
  const serviceCode = typeof input.serviceCode === 'string' ? input.serviceCode : ''
  const billingCycle = parseBillingCycle(input.billing)
  if (!billingCycle.ok) return NextResponse.json({ error: billingCycle.error }, { status: 400 })

  const configResult = await getSunpayConfig()
  if (!configResult.ok) {
    console.error('[payment/initiate] 金流設定不完整', configResult.problems)
    return NextResponse.json({ error: '付款功能尚未開放，請稍後再試' }, { status: 503 })
  }

  const admin = createAdminClient()
  const checkout = await loadCheckoutContext(admin, user.id, planCode, serviceCode)
  if (!checkout.ok) return NextResponse.json({ error: checkout.error }, { status: checkout.status })
  const { plan, service, user: userData, quote } = checkout

  const email = userData?.email ?? user.email ?? ''
  if (!email) return NextResponse.json({ error: '帳號沒有 Email，無法付款' }, { status: 400 })

  // 確認畫面的金額跟現在算的不一樣就不建單（PAY-22）：409 讓結帳頁重新試算給會員看
  const expected = verifyExpectedAmount(input.expectedAmount, quote)
  if (!expected.ok) return NextResponse.json({ error: expected.error, code: 'price_changed' }, { status: 409 })
  const chargeAmount = quote.amount

  const orderNo = generateOrderNo(quote.kind === 'free_upgrade' ? 'upgrade' : quote.kind)
  const { data: payment, error } = await admin
    .from('payments')
    .insert({
      user_id: user.id,
      service_id: service.id,
      amount: chargeAmount,
      plan_name: plan.code,
      payment_uid: orderNo,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error || !payment) return NextResponse.json({ error: '建立付款記錄失敗' }, { status: 500 })

  if (quote.kind === 'free_upgrade') {
    const outcome = await settleFreeUpgrade(admin, {
      id: payment.id,
      user_id: user.id,
      service_id: service.id,
      amount: 0,
      plan_name: plan.code,
      status: 'pending',
      payment_uid: orderNo,
    })
    if (outcome === 'failed') return NextResponse.json({ error: '升級失敗，請稍後再試或聯絡客服' }, { status: 500 })
    return NextResponse.json({ kind: quote.kind, paymentUid: orderNo, amount: 0, endsAt: quote.endsAt })
  }

  const result = await requestFirstPayment(configResult.config, {
    customer: {
      email,
      name: toSunpayName(userData?.nickname),
      phone: toSunpayPhone(userData?.phone),
    },
    amount: chargeAmount,
    orderInfo: toSunpayOrderInfo(`${service.name ?? serviceCode} ${plan.name}${quote.kind === 'upgrade' ? ' 升級差價' : ''}`),
    orderNo,
    saveCardToken: cardTokenOf(payment.id),
  })

  if (!result.ok || !result.payUrl) {
    console.error('[payment/initiate] 紅陽拒絕首次付款請求', { orderNo, code: result.code, msg: result.msg })
    await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id)
    await recordGatewayTx(admin, {
      userId: user.id,
      paymentId: payment.id,
      txType: 'bind_first_charge',
      amount: chargeAmount,
      orderNo,
      errcode: result.code,
      errmsg: result.msg.slice(0, 500),
      success: false,
      raw: { stage: 'request_pay_url', source: 'sunpay_v3' },
    })
    return NextResponse.json({ error: `無法建立付款（${result.code}），請稍後再試` }, { status: 502 })
  }

  return NextResponse.json({
    paymentId: payment.id,
    payUrl: result.payUrl,
    amount: chargeAmount,
    kind: quote.kind,
    ...(quote.kind === 'upgrade' ? { endsAt: quote.endsAt } : {}),
  })
}
