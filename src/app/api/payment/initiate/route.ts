import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanByCode } from '@/lib/queries/plans'
import { parseBillingCycle } from '@/lib/billing-cycle'
import { recordGatewayTx } from '@/lib/esafe/ledger'
import { getSunpayConfig } from '@/lib/sunpay/config'
import { requestFirstPayment } from '@/lib/sunpay/client'
import { generateOrderNo, toSunpayName, toSunpayOrderInfo, toSunpayPhone } from '@/lib/sunpay/order'

// 發起首次付款（紅陽 SunPay v3 代碼授權）：
// 建 pending 付款 → 向紅陽取付款連結 → 前端另開視窗付款、輪詢 /api/payment/status。
// 付款結果由 /api/payment/sunpay/notify 入帳。
//
// 金額一律由伺服器依方案表計算 —— 以前收前端傳來的 amount，改請求就能用 1 元買最高方案。
// 只賣月繳（年繳暫停，見 lib/billing-cycle.ts）。

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let input: { planCode?: unknown; serviceCode?: unknown; billing?: unknown }
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  const planCode = typeof input.planCode === 'string' ? input.planCode : ''
  const serviceCode = typeof input.serviceCode === 'string' ? input.serviceCode : ''
  const billingCycle = parseBillingCycle(input.billing)
  if (!billingCycle.ok) return NextResponse.json({ error: billingCycle.error }, { status: 400 })

  const plan = planCode ? await getPlanByCode(planCode) : null
  if (!plan || !plan.is_active || plan.code === 'free') {
    return NextResponse.json({ error: '找不到此方案' }, { status: 400 })
  }

  const configResult = await getSunpayConfig()
  if (!configResult.ok) {
    console.error('[payment/initiate] 金流設定不完整', configResult.problems)
    return NextResponse.json({ error: '付款功能尚未開放，請稍後再試' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('nickname, phone, email, current_plan')
    .eq('id', user.id)
    .single()
  const email = userData?.email ?? user.email ?? ''
  if (!email) return NextResponse.json({ error: '帳號沒有 Email，無法付款' }, { status: 400 })

  const { data: service } = await admin.from('services').select('id, name').eq('code', serviceCode).single()
  if (!service) return NextResponse.json({ error: '服務不存在' }, { status: 404 })

  // 升級只收差額（扣掉現有方案的每月收費）—— 沿用舊規則
  const fullPrice = plan.monthly_charge
  let chargeAmount = fullPrice
  const currentPlanCode = userData?.current_plan ?? 'free'
  if (currentPlanCode !== 'free') {
    const currentPlan = await getPlanByCode(currentPlanCode)
    if (currentPlan && fullPrice > currentPlan.monthly_charge) {
      chargeAmount = fullPrice - currentPlan.monthly_charge
    }
  }
  if (!Number.isInteger(chargeAmount) || chargeAmount <= 0) {
    return NextResponse.json({ error: '金額計算錯誤，請聯絡客服' }, { status: 400 })
  }

  const orderNo = generateOrderNo('first')
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

  const result = await requestFirstPayment(configResult.config, {
    customer: {
      email,
      name: toSunpayName(userData?.nickname),
      phone: toSunpayPhone(userData?.phone),
    },
    amount: chargeAmount,
    orderInfo: toSunpayOrderInfo(`${service.name ?? serviceCode} ${plan.name}`),
    orderNo,
    saveCardToken: user.id,
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

  return NextResponse.json({ paymentId: payment.id, payUrl: result.payUrl })
}
