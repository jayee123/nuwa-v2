import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — load messages for a topic
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Verify topic belongs to user
  const { data: topic } = await admin
    .from('chat_topics')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!topic || topic.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: messages } = await admin
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('topic_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: messages ?? [] })
}

// PATCH — update topic (rename, pin/unpin)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const admin = createAdminClient()

  // Verify ownership
  const { data: topic } = await admin
    .from('chat_topics')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!topic || topic.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = body.title
  if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned

  await admin.from('chat_topics').update(updates).eq('id', id)

  return NextResponse.json({ success: true })
}

// DELETE — delete topic (messages cascade)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: topic } = await admin
    .from('chat_topics')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!topic || topic.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await admin.from('chat_topics').delete().eq('id', id)

  return NextResponse.json({ success: true })
}
