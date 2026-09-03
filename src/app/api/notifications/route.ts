import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — fetch user's recent notifications
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, title, content, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length

  return NextResponse.json({ notifications: notifications ?? [], unreadCount })
}

// PATCH — mark notifications as read
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await request.json()

  if (ids === 'all') {
    // Mark all unread as read
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)
  } else if (Array.isArray(ids) && ids.length > 0) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('id', ids)
  }

  return NextResponse.json({ success: true })
}
