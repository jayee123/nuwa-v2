import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

// PATCH — update registration status (e.g. attended / cancelled)
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })

  const validStatuses = ['registered', 'attended', 'cancelled']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await admin
    .from('registrations')
    .update({ status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
