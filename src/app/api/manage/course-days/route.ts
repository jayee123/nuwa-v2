import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return null
  return admin
}

const ALLOWED_FIELDS = new Set([
  'title',
  'theme',
  'course_unit',
  'knowledge_point',
  'today_task',
  'core_tip',
  'objectives',
  'actions',
  'reflection_questions',
  'evening_questions',
  'mbti_cognitive_fns',
  'variation_couple',
  'variation_parent',
  'variation_workplace',
  'special_content',
  'ai_prompt_extra',
])

// GET — list all course days for a template
export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const templateCode = searchParams.get('template') ?? 'happy_v1'

  const { data: template } = await admin
    .from('course_templates')
    .select('id, code, name, total_days')
    .eq('code', templateCode)
    .single()

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const { data: days } = await admin
    .from('course_days')
    .select('*')
    .eq('template_id', template.id)
    .order('day_number')

  return NextResponse.json({ template, days: days ?? [] })
}

// PATCH — update a single course day
export async function PATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, ...fields } = body

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // Filter to allowed fields only
  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(key)) {
      updates[key] = value
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await admin
    .from('course_days')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
