import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { target, userId, type, title, content } = await request.json()

  if (!title || !type) {
    return NextResponse.json({ error: 'Missing title or type' }, { status: 400 })
  }

  let userIds: string[] = []

  if (target === 'all') {
    // 020: 全體發送不包含軟刪除用戶
    const { data: allUsers } = await admin.from('users').select('id').is('deleted_at', null)
    userIds = (allUsers ?? []).map((u) => u.id)
  } else if (target === 'single' && userId) {
    userIds = [userId]
  } else {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }

  const records = userIds.map((uid) => ({
    user_id: uid,
    type,
    title,
    content: content || null,
  }))

  const { data: inserted } = await admin
    .from('notifications')
    .insert(records)
    .select('*, users(nickname, phone)')

  return NextResponse.json({ notifications: inserted ?? [] })
}
