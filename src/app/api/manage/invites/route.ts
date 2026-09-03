import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getAdminCtx } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'

// 公版邀請碼管理（#3a）
// GET  /api/manage/invites  → 列出邀請碼（含狀態）
// POST /api/manage/invites  → 批次產生（superadmin）：{ prefix, count, expires_in_days, note }

function genCode(prefix: string): string {
  const rand = randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
  return `${prefix}${rand}`
}

export async function GET() {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await ctx.admin
    .from('invite_codes')
    .select('code, used_by, used_at, expires_at, note, created_at, app_id')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: apps } = await ctx.admin.from('apps').select('id, name').order('sort_order')
  const appMap = new Map((apps ?? []).map((a) => [a.id as string, a.name as string]))

  const now = Date.now()
  const rows = (data ?? []).map((c) => ({
    code: c.code as string,
    note: (c.note as string | null) ?? null,
    used_at: (c.used_at as string | null) ?? null,
    expires_at: (c.expires_at as string | null) ?? null,
    created_at: c.created_at as string,
    app_id: (c.app_id as string | null) ?? null,
    app_name: c.app_id ? (appMap.get(c.app_id as string) ?? null) : null,
    status: c.used_by
      ? 'used'
      : c.expires_at && new Date(c.expires_at as string).getTime() < now
        ? 'expired'
        : 'available',
  }))
  return NextResponse.json({ data: rows, apps: (apps ?? []).map((a) => ({ id: a.id as string, name: a.name as string })) })
}

export async function POST(request: Request) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能產生邀請碼' }, { status: 403 })

  const body = (await request.json()) as { prefix?: string; count?: number; expires_in_days?: number; note?: string; app_id?: string }
  const prefix = String(body.prefix ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12)
  const count = Math.min(Math.max(Number(body.count) || 1, 1), 200)
  const expiresInDays = Number(body.expires_in_days) || 0
  const expiresAt = expiresInDays > 0 ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null
  const note = body.note ? String(body.note).slice(0, 100) : null
  const appId = body.app_id ? String(body.app_id) : null // null = 不限

  const rows = Array.from({ length: count }, () => ({ code: genCode(prefix), expires_at: expiresAt, note, app_id: appId }))
  const { data, error } = await ctx.admin.from('invite_codes').insert(rows).select('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit(ctx.admin, ctx.userId, 'invite.generate', `${rows.length} 組`, { prefix, count, expiresInDays })
  return NextResponse.json({ data: (data ?? []).map((r) => r.code as string) })
}
