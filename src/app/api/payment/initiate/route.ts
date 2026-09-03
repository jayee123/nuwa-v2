import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildBindingParams } from '@/lib/esafe/binding'
import { getPlanByCode } from '@/lib/queries/plans'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { planCode, amount, serviceCode, billing } = await request.json()

  // Get user info + current plan
  const { data: userData } = await admin
    .from('users')
    .select('nickname, phone, email, current_plan')
    .eq('id', user.id)
    .single()

  // Get service with plans
  const { data: service } = await admin
    .from('services')
    .select('id, name, plans')
    .eq('code', serviceCode)
    .single()

  if (!service) return NextResponse.json({ error: '服務不存在' }, { status: 404 })

  // 升級時只扣差額（現方案 monthly_charge）
  let chargeAmount = amount
  const currentPlanCode = userData?.current_plan ?? 'free'
  if (currentPlanCode !== 'free') {
    const currentPlan = await getPlanByCode(currentPlanCode)
    if (currentPlan && amount > currentPlan.monthly_charge) {
      chargeAmount = amount - currentPlan.monthly_charge
    }
  }

  // Generate order ID: YYMMDDHHII + random
  const now = new Date()
  const dateStr = now.toISOString().replace(/[-T:]/g, '').slice(2, 12)
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  const orderId = `V2${dateStr}${rand}`

  // Create payment record (記錄差額)
  const { data: payment, error } = await admin
    .from('payments')
    .insert({
      user_id: user.id,
      service_id: service.id,
      amount: chargeAmount,
      plan_name: planCode,
      payment_uid: orderId,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: '建立付款記錄失敗' }, { status: 500 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const callbackUrl = `${siteUrl}/api/payment/callback`

  const binding = await buildBindingParams({
    amount: chargeAmount,
    orderId,
    customerName: userData?.nickname ?? 'User',
    phone: userData?.phone ?? '',
    email: userData?.email ?? '',
    userId: user.id,
    serviceCode,
    callbackUrl,
    orderInfo: `${service.name ?? serviceCode}:${planCode}`,
  })

  return NextResponse.json({
    paymentId: payment.id,
    esafe: binding,
  })
}
