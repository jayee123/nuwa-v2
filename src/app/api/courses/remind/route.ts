import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSecretParam } from '@/lib/secret-params'
import { MAIL_FROM } from '@/lib/email'

// Cron: send reminder emails 1 day before class starts
// Trigger: Vercel Cron daily at 09:00 UTC (17:00 TST)
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = await getSecretParam('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const apiKey = await getSecretParam('RESEND_API_KEY')
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  // Find courses starting tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStart = new Date(tomorrow.setHours(0, 0, 0, 0)).toISOString()
  const tomorrowEnd = new Date(tomorrow.setHours(23, 59, 59, 999)).toISOString()

  const { data: courses } = await admin
    .from('physical_courses')
    .select('id, name, location, class_start')
    .gte('class_start', tomorrowStart)
    .lte('class_start', tomorrowEnd)

  if (!courses || courses.length === 0) {
    return NextResponse.json({ message: 'No courses tomorrow', sent: 0 })
  }

  let totalSent = 0

  for (const course of courses) {
    // Get registrations that haven't been reminded
    const { data: regs } = await admin
      .from('registrations')
      .select('id, email')
      .eq('physical_course_id', course.id)
      .eq('status', 'registered')
      .eq('reminder_sent', false)

    if (!regs || regs.length === 0) continue

    const classDate = new Date(course.class_start!).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    for (const reg of regs) {
      if (!reg.email) continue

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: MAIL_FROM,
            to: reg.email,
            subject: `【課前提醒】${course.name} 明天開課`,
            html: `
              <h2>課前提醒</h2>
              <p>您報名的 <strong>${course.name}</strong> 將於明天開課：</p>
              <ul>
                <li>時間：${classDate}</li>
                ${course.location ? `<li>地點：${course.location}</li>` : ''}
              </ul>
              <p>期待與您見面！</p>
            `,
          }),
        })

        await admin
          .from('registrations')
          .update({ reminder_sent: true })
          .eq('id', reg.id)

        totalSent++
      } catch {
        // Log but don't block
      }
    }
  }

  return NextResponse.json({ message: 'Reminders sent', sent: totalSent })
}
