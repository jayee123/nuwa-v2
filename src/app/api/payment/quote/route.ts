import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSunpayConfig } from '@/lib/sunpay/config'
import { loadCheckoutContext } from '@/lib/sunpay/checkout-context'

// GET /api/payment/quote?plan=advanced&service=xxx
//
// 結帳頁的試算（PAY-22）：只算這次要收多少、算首次付款還是升級，**不建訂單、不連紅陽**。
// 會員在確認畫面按「前往付款」／「確定升級」才呼叫 /api/payment/initiate，
// 並把這裡回的 amount 帶過去比對（定價中途改了就擋下重新確認）。
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const planCode = request.nextUrl.searchParams.get('plan') ?? ''
  const serviceCode = request.nextUrl.searchParams.get('service') ?? ''

  const checkout = await loadCheckoutContext(createAdminClient(), user.id, planCode, serviceCode)
  if (!checkout.ok) return NextResponse.json({ error: checkout.error }, { status: checkout.status })
  const { plan, quote } = checkout

  // 跟 initiate 一樣先看金流設定：沒設定好就先講，不要讓會員按了「前往付款」才失敗
  if (!(await getSunpayConfig()).ok) {
    return NextResponse.json({ error: '付款功能尚未開放，請稍後再試' }, { status: 503 })
  }

  return NextResponse.json({
    planName: plan.name,
    /** 新方案每月全額：升級後到期日起月扣收這個數 */
    monthlyCharge: plan.monthly_charge,
    kind: quote.kind,
    amount: quote.amount,
    ...(quote.kind === 'first' ? {} : { endsAt: quote.endsAt }),
  })
}
