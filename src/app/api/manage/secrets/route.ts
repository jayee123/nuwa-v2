import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

// GET — fetch all secret params (masked values)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: params } = await admin
    .from('secret_params')
    .select('key, value, description, updated_at')
    .order('key')

  // Mask values: show only last 4 chars
  const masked = (params ?? []).map((p) => ({
    key: p.key,
    description: p.description,
    updated_at: p.updated_at,
    hasValue: !!p.value,
    maskedValue: p.value
      ? (p.value.length > 4 ? '••••••••' + p.value.slice(-4) : '••••')
      : '',
  }))

  return NextResponse.json({ params: masked })
}

// PUT — update secret param values
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { params } = await request.json()

  for (const p of params as { key: string; value: string }[]) {
    // Skip if value is empty (don't overwrite with empty)
    if (!p.value) continue

    await admin
      .from('secret_params')
      .upsert({
        key: p.key,
        value: p.value,
        updated_at: new Date().toISOString(),
      })
  }

  return NextResponse.json({ success: true })
}
