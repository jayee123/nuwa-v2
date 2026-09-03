import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — list topics for a service
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const serviceId = searchParams.get('serviceId')
  if (!serviceId) return NextResponse.json({ error: 'Missing serviceId' }, { status: 400 })

  const admin = createAdminClient()

  // Get teacher for this service
  const { data: teacher } = await admin
    .from('teachers')
    .select('id')
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .single()

  const { data: topics } = await admin
    .from('chat_topics')
    .select('id, title, is_pinned, updated_at')
    .eq('user_id', user.id)
    .eq('teacher_id', teacher?.id ?? '')
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  return NextResponse.json({ topics: topics ?? [] })
}

// POST — create a new topic
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { serviceId, teacherId, title } = await request.json()
  const admin = createAdminClient()

  const { data: topic, error } = await admin
    .from('chat_topics')
    .insert({
      user_id: user.id,
      teacher_id: teacherId,
      title: title || '新對話',
      mode: teacherId ? 'journey' : 'free',
    })
    .select('id, title, is_pinned, updated_at')
    .single()

  if (error) return NextResponse.json({ error: '建立失敗' }, { status: 500 })

  return NextResponse.json({ topic })
}
