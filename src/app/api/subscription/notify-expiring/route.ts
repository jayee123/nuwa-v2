import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSecretParam } from '@/lib/secret-params'
import { MAIL_FROM } from '@/lib/email'

// Cron: notify users whose subscriptions expire within 3 days
// Trigger: Vercel Cron daily at 07:00 UTC (15:00 TST)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = await getSecretParam('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const apiKey = await getSecretParam('RESEND_API_KEY')

  // Find subscriptions expiring within 3 days
  const today = new Date()
  const threeDaysLater = new Date(today)
  threeDaysLater.setDate(threeDaysLater.getDate() + 3)

  const { data: expiring } = await admin
    .from('subscriptions')
    .select('id, ends_at, services(name, code), users(id, nickname, email)')
    .eq('status', 'active')
    .gte('ends_at', today.toISOString().slice(0, 10) + 'T00:00:00Z')
    .lte('ends_at', threeDaysLater.toISOString().slice(0, 10) + 'T23:59:59Z')

  if (!expiring || expiring.length === 0) {
    return NextResponse.json({ message: 'No expiring subscriptions', notified: 0 })
  }

  let notified = 0

  for (const sub of expiring) {
    const user = sub.users as unknown as { id: string; nickname: string | null; email: string | null } | null
    const service = sub.services as unknown as { name: string; code: string } | null
    if (!user) continue

    // Prevent duplicate: check if we already sent a notification for this subscription
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', 'subscription_expiring')
      .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())

    if ((count ?? 0) > 0) continue

    const expiryDate = new Date(sub.ends_at).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const serviceName = service?.name ?? '訂閱方案'

    // Write in-app notification
    await admin.from('notifications').insert({
      user_id: user.id,
      type: 'subscription_expiring',
      title: '訂閱即將到期',
      content: `您的「${serviceName}」方案將於 ${expiryDate} 到期，請前往訂閱管理續約或升級方案。`,
    })

    // Send email if available
    if (apiKey && user.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: MAIL_FROM,
            to: user.email,
            subject: `【訂閱提醒】您的${serviceName}方案將於 ${expiryDate} 到期`,
            html: `
              <h2>訂閱到期提醒</h2>
              <p>${user.nickname ?? '會員'}您好，</p>
              <p>您的 <strong>${serviceName}</strong> 方案將於 <strong>${expiryDate}</strong> 到期。</p>
              <p>為確保您的學習不中斷，請前往會員中心續約或升級方案：</p>
              <p><a href="https://next.nuwa.chg2asc.com/dashboard/subscribe${service?.code ? `/${service.code}` : ''}">前往訂閱管理</a></p>
              <br/>
              <p>羽升幸福養成學苑 敬上</p>
            `,
          }),
        })
      } catch {
        // Log but don't block
      }
    }

    notified++
  }

  return NextResponse.json({ message: 'Expiry notifications sent', notified })
}
