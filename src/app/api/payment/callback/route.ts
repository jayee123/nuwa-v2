import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chkValueCallbackRaw } from '@/lib/esafe/chkvalue'
import { getPlanByCode } from '@/lib/queries/plans'

export async function POST(request: Request) {
  const formData = await request.formData()
  const admin = createAdminClient()

  const td = formData.get('Td') as string
  const mnRaw = formData.get('MN') as string  // 保持原始字串算 ChkValue
  const mn = Number(mnRaw)
  const errCode = formData.get('errcode') as string
  const chkValue = formData.get('ChkValue') as string
  const tokenData = formData.get('tokenData') as string
  const buysafeno = formData.get('buysafeno') as string
  const note1 = formData.get('note1') as string // userId
  const note2 = formData.get('note2') as string // serviceCode

  // Verify ChkValue
  const localChk = await chkValueCallbackRaw(mnRaw, td)
  if (chkValue && localChk !== chkValue) {
    console.error('[payment/callback] ChkValue mismatch', { local: localChk, remote: chkValue, mnRaw, td })
    return new Response('ChkValue Error', { status: 400 })
  }

  // Find payment record
  const { data: payment } = await admin
    .from('payments')
    .select('*')
    .eq('payment_uid', td)
    .single()

  if (!payment) {
    return new Response('Payment not found', { status: 404 })
  }

  // Already processed
  if (payment.status === 'paid') {
    return new Response('OK')
  }

  // Check error code (00 = 綁卡成功, 00000 = 扣款成功)
  const errMsg = formData.get('errmsg') as string ?? ''
  if (errCode !== '00' && errCode !== '00000') {
    console.error('[payment/callback] 付款失敗:', { errCode, errMsg, td, mnRaw })
    await admin.from('payments').update({ status: 'failed' }).eq('id', payment.id)
    return new Response(`Payment Failed: ${errCode} - ${decodeURIComponent(errMsg || '未知錯誤')}`)
  }

  const userId = note1 || payment.user_id
  const serviceCode = note2

  // Update payment
  await admin.from('payments').update({
    status: 'paid',
    token_data: tokenData ?? null,
    paid_at: new Date().toISOString(),
  }).eq('id', payment.id)

  // Get service for subscription
  const { data: service } = await admin
    .from('services')
    .select('id')
    .eq('code', serviceCode)
    .single()

  // Create subscription (1 month)
  const now = new Date()
  const endsAt = new Date(now)
  endsAt.setMonth(endsAt.getMonth() + 1)

  if (service) {
    // 先收掉這個 (user, service) 既有的 active 訂閱，再寫新的一筆。
    // 原本是無條件 insert，重複付款 / 重複回呼會累積多筆 active
    // （訂閱管理頁因此把同一課程列了三次）。見 022_dedupe_subscriptions.sql。
    const { error: expireError } = await admin
      .from('subscriptions')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('service_id', service.id)
      .eq('status', 'active')

    if (expireError) {
      // 收不掉舊的就不要再寫新的，否則又製造一筆重複。
      // 付款本身已標記 paid，這裡回 500 讓金流端重送回呼。
      console.error('[payment/callback] 收掉舊訂閱失敗，中止建立新訂閱', {
        userId,
        serviceId: service.id,
        error: expireError.message,
      })
      return new Response('Subscription update failed', { status: 500 })
    }

    const { error: insertError } = await admin.from('subscriptions').insert({
      user_id: userId,
      service_id: service.id,
      plan_name: payment.plan_name,
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'active',
    })

    if (insertError) {
      console.error('[payment/callback] 建立訂閱失敗', {
        userId,
        serviceId: service.id,
        error: insertError.message,
      })
      return new Response('Subscription insert failed', { status: 500 })
    }
  }

  // Update user plan + dialog limit
  // payment.plan_name 現在存 code；舊資料可能是顯示名 → 兩者都對應得到
  const legacyNameMap: Record<string, { plan: string; limit: number }> = {
    '基本方案': { plan: 'basic', limit: 50 },
    '進階方案': { plan: 'advanced', limit: 100 },
    Premium: { plan: 'premium', limit: 200 },
  }
  const pn = payment.plan_name ?? ''
  let planInfo = legacyNameMap[pn] ?? { plan: pn || 'basic', limit: 30 }
  const planRow = await getPlanByCode(planInfo.plan)
  if (planRow) {
    planInfo = { plan: planRow.code, limit: planRow.monthly_dialog_count }
  }

  await admin.from('users').update({
    current_plan: planInfo.plan,
    dialog_limit: planInfo.limit,
    plan_deadline: endsAt.toISOString(),
    next_plan: null, // Clear any scheduled downgrade on upgrade
  }).eq('id', userId)

  // Redirect browser to success page
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return NextResponse.redirect(
    `${siteUrl}/dashboard/subscribe/success?td=${td}`,
    { status: 302 }
  )
}
