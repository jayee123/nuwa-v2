import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { params } = await request.json()

  for (const p of params as { key: string; value: string | null }[]) {
    await admin
      .from('system_params')
      .upsert({ key: p.key, value: p.value, updated_at: new Date().toISOString() })
  }

  return NextResponse.json({ success: true })
}
