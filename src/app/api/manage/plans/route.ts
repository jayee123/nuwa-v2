import { NextResponse } from 'next/server'
import { getAdminCtx } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'

// 公版統一方案維護
// GET    → 列出方案
// POST   → 新增方案（superadmin）
// PATCH  → 更新方案（superadmin，body 帶 id）
// DELETE → 刪除方案（superadmin，?id=）

const NUM_FIELDS = ['price', 'renewal_price', 'monthly_dialog_count', 'monthly_charge', 'sort_order'] as const

export async function GET() {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await ctx.admin.from('plans').select('*').order('sort_order')
  return NextResponse.json({ data: data ?? [], is_super: ctx.isSuper })
}

export async function POST(request: Request) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能維護方案' }, { status: 403 })

  const body = (await request.json()) as Record<string, unknown>
  const code = String(body.code ?? '').toLowerCase().trim()
  if (!code) return NextResponse.json({ error: '請填方案代碼（code）' }, { status: 400 })

  const insert = {
    code,
    name: String(body.name ?? code),
    price: Number(body.price) || 0,
    renewal_price: Number(body.renewal_price) || 0,
    monthly_dialog_count: Number(body.monthly_dialog_count) || 0,
    monthly_charge: Number(body.monthly_charge) || 0,
    sort_order: Number(body.sort_order) || 0,
  }
  const { data, error } = await ctx.admin.from('plans').insert(insert).select('*').single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '方案代碼已存在' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await logAudit(ctx.admin, ctx.userId, 'plan.create', code)
  return NextResponse.json({ data })
}

export async function PATCH(request: Request) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能維護方案' }, { status: 403 })

  const body = (await request.json()) as Record<string, unknown>
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if ('name' in body) updates.name = String(body.name)
  if ('is_active' in body) updates.is_active = !!body.is_active
  for (const f of NUM_FIELDS) if (f in body) updates[f] = Number(body[f]) || 0
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '沒有可更新欄位' }, { status: 400 })
  updates.updated_at = new Date().toISOString()

  const { data, error } = await ctx.admin.from('plans').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit(ctx.admin, ctx.userId, 'plan.update', data?.code ?? id, {
    fields: Object.keys(updates).filter((k) => k !== 'updated_at'),
  })
  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能維護方案' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const { error } = await ctx.admin.from('plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAudit(ctx.admin, ctx.userId, 'plan.delete', id)
  return NextResponse.json({ data: { deleted: true } })
}
