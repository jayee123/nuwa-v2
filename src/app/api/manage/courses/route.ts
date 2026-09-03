import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return null
  return admin
}

// GET — full curriculum for a service
export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const serviceId = searchParams.get('serviceId')
  if (!serviceId) return NextResponse.json({ error: 'Missing serviceId' }, { status: 400 })

  const { data: courses } = await admin
    .from('courses')
    .select('id')
    .eq('service_id', serviceId)
    .order('sort_order')
    .limit(1)

  if (!courses || courses.length === 0) {
    return NextResponse.json({ chapters: [] })
  }

  const courseId = courses[0].id

  const { data: subjects } = await admin
    .from('subjects')
    .select('id, title, sort_order')
    .eq('course_id', courseId)
    .order('sort_order')

  const subjectIds = (subjects ?? []).map((s) => s.id)
  const { data: units } = subjectIds.length > 0
    ? await admin
        .from('units')
        .select('id, subject_id, title, content_url, sort_order')
        .in('subject_id', subjectIds)
        .order('sort_order')
    : { data: [] }

  const chapters = (subjects ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    sort_order: s.sort_order,
    units: (units ?? []).filter((u) => u.subject_id === s.id),
  }))

  return NextResponse.json({ courseId, chapters })
}

// POST — create subject (chapter) or unit
export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  if (body.type === 'subject') {
    const { courseId, title, sort_order } = body
    const { data, error } = await admin
      .from('subjects')
      .insert({ course_id: courseId, title, sort_order: sort_order ?? 0 })
      .select('id, title, sort_order')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ subject: data })
  }

  if (body.type === 'unit') {
    const { subjectId, title, sort_order } = body
    const { data, error } = await admin
      .from('units')
      .insert({ subject_id: subjectId, title, sort_order: sort_order ?? 0 })
      .select('id, title, content_url, sort_order')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ unit: data })
  }

  if (body.type === 'course') {
    const { serviceId, title } = body
    const { data, error } = await admin
      .from('courses')
      .insert({ service_id: serviceId, title, sort_order: 0 })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ course: data })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

// PATCH — update subject or unit
export async function PATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  if (body.type === 'subject') {
    const { id, title } = body
    await admin.from('subjects').update({ title }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  if (body.type === 'unit') {
    const { id, ...updates } = body
    delete updates.type
    await admin.from('units').update(updates).eq('id', id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

// DELETE — delete subject or unit
export async function DELETE(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const id = searchParams.get('id')

  if (!type || !id) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  if (type === 'subject') {
    await admin.from('subjects').delete().eq('id', id)
  } else if (type === 'unit') {
    await admin.from('units').delete().eq('id', id)
  }

  return NextResponse.json({ success: true })
}
