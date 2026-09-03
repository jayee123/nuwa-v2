import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

const PAGE_SIZE = 50

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const topicId = request.nextUrl.searchParams.get('topicId')
  const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // --- Mode 1: fetch messages for a specific topic ---
  if (topicId) {
    const { data: messages, count } = await admin
      .from('chat_messages')
      .select('id, role, content, token_count, created_at', { count: 'exact' })
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
      .range(from, to)

    return NextResponse.json({
      messages: messages ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
    })
  }

  // --- Mode 2: list topics with optional filters ---
  const mode = request.nextUrl.searchParams.get('mode')       // unpack | journey | free
  const userId = request.nextUrl.searchParams.get('userId')

  let query = admin
    .from('chat_topics')
    .select('id, user_id, mode, title, unpack_context, updated_at, ended_at, users!inner(nickname, phone)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (mode) {
    query = query.eq('mode', mode)
  }
  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data: topics, count } = await query

  return NextResponse.json({
    topics: topics ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
  })
}
