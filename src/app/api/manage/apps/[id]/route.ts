import { NextResponse } from 'next/server'
import { getAdminCtx, canManageApp } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'
import { GATEABLE_PLAN_CODES, isGateablePlan } from '@/lib/plans'
import { parseTrialDays, parseTrialDialogLimit } from '@/lib/launch-gate'

// Market App Registry 單一 App 操作
// PATCH  /api/manage/apps/:id        → 修改（限有權管理該 App 者；slug/db_schema 鎖定）
// DELETE /api/manage/apps/:id        → 軟刪下架（限有權管理者）
// DELETE /api/manage/apps/:id?hard=1 → 硬刪（限 superadmin）

const EDITABLE = ['name', 'tagline', 'icon', 'app_url', 'admin_url', 'required_plan', 'status', 'sort_order', 'trial_days', 'trial_dialog_limit'] as const
// internal = 封測（migration 025）：首頁顯示「即將推出」，只有持該 App 邀請碼者進得去
const VALID_STATUS = ['draft', 'internal', 'active', 'archived']

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  if (!(await canManageApp(ctx, id))) return NextResponse.json({ error: '無權管理此 App' }, { status: 403 })

  const body = (await request.json()) as Record<string, unknown>
  const updates: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in body) updates[k] = body[k]

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位（slug / db_schema 不可修改）' }, { status: 400 })
  }
  if (updates.status && !VALID_STATUS.includes(updates.status as string)) {
    return NextResponse.json({ error: `status 必須是 ${VALID_STATUS.join(' / ')}` }, { status: 400 })
  }
  // 試用條件 = 公版預設 + App 覆寫（A 方案，migration 035）：
  //   試用天數   留空 = 公版預設；0 = 關閉此 App 的免費試用（launch 端直接導訂閱頁）
  //   試用次數   留空 = 公版預設；0 = 這支 App 不限次數
  // 天數或次數先到者結束（M-12）。已存在的試用不追溯（開試用時定死，見 PAYMENT_BOUNDARIES §B.1）。
  for (const [field, parse] of [['trial_days', parseTrialDays], ['trial_dialog_limit', parseTrialDialogLimit]] as const) {
    if (!(field in updates)) continue
    const parsed = parse(updates[field])
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    updates[field] = parsed.value
  }
  // 同 POST：門檻值不合法時 launch 端會 fail closed，把整個 App 安靜鎖住
  if (updates.required_plan && !isGateablePlan(updates.required_plan)) {
    return NextResponse.json(
      { error: `進入門檻方案必須是 ${GATEABLE_PLAN_CODES.join(' / ')} 其中之一；不限方案請留空` },
      { status: 400 },
    )
  }
  updates.updated_at = new Date().toISOString()

  const { data, error: e } = await ctx.admin.from('apps').update(updates).eq('id', id).select('*').single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到此 App' }, { status: 404 })
  await logAudit(ctx.admin, ctx.userId, 'app.update', id, { fields: Object.keys(updates).filter((k) => k !== 'updated_at') })
  return NextResponse.json({ data })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const hard = new URL(request.url).searchParams.get('hard') === '1'

  if (hard) {
    if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能硬刪 App' }, { status: 403 })
    const { error: e } = await ctx.admin.from('apps').delete().eq('id', id)
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    await logAudit(ctx.admin, ctx.userId, 'app.delete', id)
    return NextResponse.json({ data: { deleted: true } })
  }

  if (!(await canManageApp(ctx, id))) return NextResponse.json({ error: '無權管理此 App' }, { status: 403 })
  const { data, error: e } = await ctx.admin
    .from('apps')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  await logAudit(ctx.admin, ctx.userId, 'app.archive', id)
  return NextResponse.json({ data })
}
