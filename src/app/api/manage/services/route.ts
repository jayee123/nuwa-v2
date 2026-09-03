import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

// GET — fetch service by code (public, for checkout page)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const admin = createAdminClient()
  const { data: service } = await admin
    .from('services')
    .select('id, code, name, plans')
    .eq('code', code)
    .single()

  if (!service) return NextResponse.json({ error: '服務不存在' }, { status: 404 })

  const plans = typeof service.plans === 'string' ? JSON.parse(service.plans) : (service.plans ?? [])
  return NextResponse.json({ plans, serviceName: service.name })
}

// PATCH — update service fields
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, name, description, plans, is_active, sort_order } = await request.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (plans !== undefined) updates.plans = plans
  if (is_active !== undefined) updates.is_active = is_active
  if (sort_order !== undefined) updates.sort_order = sort_order

  const { error } = await admin
    .from('services')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
