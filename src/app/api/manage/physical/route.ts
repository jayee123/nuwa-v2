import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'
import { getSecretParam } from '@/lib/secret-params'
import { MAIL_FROM } from '@/lib/email'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return null
  return admin
}

// POST — create physical course
export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  const { data, error } = await admin
    .from('physical_courses')
    .insert({
      name: body.name,
      description: body.description || null,
      price: body.price,
      location: body.location || null,
      service_code: body.service_code || null,
      course_code: body.course_code || null,
      notice: body.notice || null,
      points_reward: body.points_reward || 0,
      reg_start: body.reg_start || null,
      reg_end: body.reg_end || null,
      class_start: body.class_start || null,
      class_end: body.class_end || null,
      status: body.status || 'planned',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ course: data })
}

// PATCH — update physical course + optionally notify
export async function PATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, notify, ...updates } = body

  // Update course
  const { error } = await admin.from('physical_courses').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If status changed to 'open' and notify requested, send emails
  if (notify && updates.status === 'open') {
    const { data: course } = await admin.from('physical_courses').select('*').eq('id', id).single()
    if (course) {
      await notifyUsersOfOpenRegistration(admin, course)
    }
  }

  return NextResponse.json({ success: true })
}

// DELETE — delete physical course
export async function DELETE(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  await admin.from('physical_courses').delete().eq('id', id)
  return NextResponse.json({ success: true })
}

// Send email notification to all users with email when course opens for registration
async function notifyUsersOfOpenRegistration(
  admin: ReturnType<typeof createAdminClient>,
  course: { id: string; name: string; class_start: string | null; location: string | null; price: number }
) {
  const apiKey = await getSecretParam('RESEND_API_KEY')
  if (!apiKey) return

  // Get all users who have email（020: 軟刪除用戶不寄信）
  const { data: users } = await admin
    .from('users')
    .select('email')
    .is('deleted_at', null)
    .not('email', 'is', null)
    .neq('email', '')

  if (!users || users.length === 0) return

  const classDate = course.class_start
    ? new Date(course.class_start).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
    : '待定'

  // Send in batches (Resend supports up to 100 recipients per call)
  const emails = users.map((u) => u.email).filter(Boolean) as string[]

  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50)
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: MAIL_FROM,
          bcc: batch,
          // bcc 批次寄送時 Resend 仍要求要有 to，這裡放佔位收件人。
          // 這是收件端、不需要通過寄件網域驗證，因此維持根網域即可。
          to: 'noreply@chg2asc.com',
          subject: `【開放報名】${course.name}`,
          html: `
            <h2>實體課程開放報名</h2>
            <p><strong>${course.name}</strong> 現已開放報名！</p>
            <ul>
              <li>上課日期：${classDate}</li>
              ${course.location ? `<li>地點：${course.location}</li>` : ''}
              <li>費用：NT$ ${course.price.toLocaleString()}</li>
            </ul>
            <p>名額有限，歡迎盡早報名！</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://chg2asc.com'}/courses/happy/physical/${course.id}">立即報名 →</a></p>
          `,
        }),
      })
    } catch {
      // log but don't block
    }
  }
}
