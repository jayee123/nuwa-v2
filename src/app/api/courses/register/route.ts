import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSecretParam } from '@/lib/secret-params'
import { MAIL_FROM } from '@/lib/email'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { physicalCourseId, email } = await request.json()
  if (!physicalCourseId) {
    return NextResponse.json({ error: '缺少課程 ID' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check course exists and registration is open
  const { data: course } = await admin
    .from('physical_courses')
    .select('*')
    .eq('id', physicalCourseId)
    .single()

  if (!course) {
    return NextResponse.json({ error: '課程不存在' }, { status: 404 })
  }

  const now = new Date()
  if (course.reg_start && new Date(course.reg_start) > now) {
    return NextResponse.json({ error: '報名尚未開始' }, { status: 400 })
  }
  if (course.reg_end && new Date(course.reg_end) < now) {
    return NextResponse.json({ error: '報名已截止' }, { status: 400 })
  }

  // Check duplicate registration
  const { data: existing } = await admin
    .from('registrations')
    .select('id')
    .eq('user_id', user.id)
    .eq('physical_course_id', physicalCourseId)
    .single()

  if (existing) {
    return NextResponse.json({ error: '您已報名此課程' }, { status: 409 })
  }

  // Create registration
  const { data: reg, error } = await admin
    .from('registrations')
    .insert({
      user_id: user.id,
      physical_course_id: physicalCourseId,
      email: email || null,
      status: 'registered',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: '報名失敗' }, { status: 500 })
  }

  // Send confirmation email (async, don't block response)
  if (email) {
    sendConfirmationEmail(email, course).catch(() => {})
  }

  return NextResponse.json({ success: true, registrationId: reg.id })
}

async function sendConfirmationEmail(
  email: string,
  course: { name: string; location?: string; class_start?: string; notice?: string }
) {
  const apiKey = await getSecretParam('RESEND_API_KEY')
  if (!apiKey) return

  const classDate = course.class_start
    ? new Date(course.class_start).toLocaleDateString('zh-TW')
    : '待定'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: email,
      subject: `【報名確認】${course.name}`,
      html: `
        <h2>報名確認</h2>
        <p>您已成功報名 <strong>${course.name}</strong></p>
        <ul>
          <li>上課日期：${classDate}</li>
          ${course.location ? `<li>地點：${course.location}</li>` : ''}
          ${course.notice ? `<li>注意事項：${course.notice}</li>` : ''}
        </ul>
        <p>如有任何問題，請聯繫 support@chg2asc.com</p>
      `,
    }),
  })
}
