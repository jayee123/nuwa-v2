import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getAdminCtx, getAccessibleAppIds } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'
import { PLAN_CODES, isPlanCode } from '@/lib/plans'

// Market App Registry 管理 API
// GET  /api/manage/apps  → App 清單（依登入者權限過濾；superadmin 看全部）
// POST /api/manage/apps  → 新增（開通）一支 App（限 superadmin），回傳一次性完整金鑰

function maskSecret(s: string | null): string | null {
  return s ? `${s.slice(0, 8)}••••••` : null
}

const SLUG_RE = /^[a-z][a-z0-9_-]{1,30}$/

export async function GET() {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const accessible = await getAccessibleAppIds(ctx) // null = 全部（superadmin）
  if (accessible !== null && accessible.length === 0) {
    return NextResponse.json({ data: [], is_super: false })
  }

  let query = ctx.admin
    .from('apps')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (accessible !== null) query = query.in('id', accessible)

  const { data: apps, error: qErr } = await query
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const { data: bindings } = await ctx.admin.from('user_apps').select('app_id')
  const countByApp = new Map<string, number>()
  for (const b of bindings ?? []) countByApp.set(b.app_id, (countByApp.get(b.app_id) ?? 0) + 1)

  const result = (apps ?? []).map((a) => ({
    ...a,
    sso_secret: maskSecret(a.sso_secret),
    entitlement_key: maskSecret(a.entitlement_key),
    user_count: countByApp.get(a.id) ?? 0,
  }))
  return NextResponse.json({ data: result, is_super: ctx.isSuper })
}

export async function POST(request: Request) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能新增 App' }, { status: 403 })

  const body = await request.json()
  const { slug, name, tagline, icon, app_url, admin_url, db_schema, required_plan } = body as Record<string, string | undefined>

  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'slug 格式不符（小寫字母開頭、2-31 字、限 a-z0-9_-）' }, { status: 400 })
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: '請填 App 名稱' }, { status: 400 })
  }
  // 門檻值打錯不會有任何提示，而 launch 端 fail closed，等於整個 App 被安靜鎖住。
  // UI 已改為下拉，這裡再擋一次（API 可被直接呼叫）。
  if (required_plan && !isPlanCode(required_plan)) {
    return NextResponse.json(
      { error: `進入門檻方案必須是 ${PLAN_CODES.join(' / ')} 其中之一，或留空` },
      { status: 400 },
    )
  }
  const schema = (db_schema || slug).toLowerCase()

  const ssoSecret = `sso_${randomBytes(24).toString('hex')}`
  const entitlementKey = `ent_${randomBytes(24).toString('hex')}`

  const { data, error: insErr } = await ctx.admin
    .from('apps')
    .insert({
      slug,
      name: name.trim(),
      tagline: tagline || null,
      icon: icon || null,
      app_url: app_url || null,
      admin_url: admin_url || null,
      db_schema: schema,
      sso_secret: ssoSecret,
      entitlement_key: entitlementKey,
      required_plan: required_plan || null,
      status: 'draft',
    })
    .select('*')
    .single()

  if (insErr) {
    if (insErr.code === '23505') return NextResponse.json({ error: 'slug 已存在' }, { status: 409 })
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  await logAudit(ctx.admin, ctx.userId, 'app.create', slug)

  return NextResponse.json({
    data: { ...data, sso_secret: maskSecret(data.sso_secret), entitlement_key: maskSecret(data.entitlement_key) },
    secrets: { sso_secret: ssoSecret, entitlement_key: entitlementKey },
  })
}
