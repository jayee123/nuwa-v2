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

  const { type, items } = await request.json()
  // items: [{ id: string, sort_order: number }]

  if (type === 'subjects') {
    for (const item of items) {
      await admin.from('subjects').update({ sort_order: item.sort_order }).eq('id', item.id)
    }
  } else if (type === 'units') {
    for (const item of items) {
      await admin.from('units').update({ sort_order: item.sort_order }).eq('id', item.id)
    }
  }

  return NextResponse.json({ success: true })
}
