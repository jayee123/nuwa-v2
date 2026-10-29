import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'
import { parseSecretParams, saveSecretParams } from '@/lib/secret-params-save'

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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  const parsed = parseSecretParams(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const result = await saveSecretParams(admin, parsed.params)
  if (!result.ok) {
    // 只記 key 名稱與錯誤訊息，不記值
    console.error('[manage/secrets] 寫入失敗', { keys: parsed.params.map((p) => p.key), error: result.error })
    return NextResponse.json({ error: '儲存失敗，資料庫沒有寫入，請稍後再試' }, { status: 500 })
  }

  return NextResponse.json({ success: true, savedKeys: result.savedKeys })
}
