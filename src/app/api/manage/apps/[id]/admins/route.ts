import { NextResponse } from 'next/server'
import { getAdminCtx, canManageApp } from '@/lib/app-access'

// 某支 App 的「可管理它的管理者」清單
// GET    /api/manage/apps/:id/admins          → 列出（有權管理該 App 者可看）
// POST   /api/manage/apps/:id/admins          → 依 email 指派（限 superadmin）body:{email,role}
// DELETE /api/manage/apps/:id/admins?userId=  → 移除（限 superadmin）

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  if (!(await canManageApp(ctx, id))) return NextResponse.json({ error: '無權管理此 App' }, { status: 403 })

  const { data, error } = await ctx.admin
    .from('app_admins')
    .select('user_id, role, created_at, users(email, name)')
    .eq('app_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (data ?? []).map((r) => {
    const u = r.users as { email?: string; name?: string } | null
    return { user_id: r.user_id, role: r.role, created_at: r.created_at, email: u?.email ?? '', name: u?.name ?? '' }
  })
  return NextResponse.json({ data: result })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx?.isSuper) return NextResponse.json({ error: '只有 superadmin 能指派 App 管理權限' }, { status: 403 })
  const { id } = await params

  const { email, role } = (await request.json()) as { email?: string; role?: string }
  if (!email?.trim()) return NextResponse.json({ error: '請填 email' }, { status: 400 })
  const r = role === 'viewer' ? 'viewer' : 'manager'

  const { data: u } = await ctx.admin.from('users').select('id, role').eq('email', email.trim()).maybeSingle()
  if (!u) return NextResponse.json({ error: '找不到此 email 的用戶' }, { status: 404 })

  const { error } = await ctx.admin
    .from('app_admins')
    .upsert({ user_id: u.id, app_id: id, role: r }, { onConflict: 'user_id,app_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 提示：被指派者仍需有後台 admin 角色才進得了 /manage（此處只設 App 範圍）
  return NextResponse.json({ data: { ok: true, is_backend_admin: u.role === 'admin' || u.role === 'superadmin' } })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx?.isSuper) return NextResponse.json({ error: '只有 superadmin 能移除 App 管理權限' }, { status: 403 })
  const { id } = await params
  const userId = new URL(request.url).searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: '缺 userId' }, { status: 400 })

  const { error } = await ctx.admin.from('app_admins').delete().eq('app_id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
