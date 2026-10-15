import { NextResponse } from 'next/server'
import { getAdminCtx } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'
import { parseGrantInput } from '@/lib/dialog-grant'
import { getDialogQuota } from '@/lib/queries/dialog-quota'

// 本期補發 AI 對話次數 —— 客服補償
// POST /api/manage/users/:id/grants  { amount, reason }
//
// 補在使用者「當期」：period_start 由後端依錨點現算，不收前端傳的值，
// 免得補到已經過去（或還沒開始）的週期、看起來成功卻沒效果。
//
// 權限：admin。只會增加額度、不刪任何東西；誰補的、為什麼補，
// 同時記在 ai_dialog_grants.granted_by／reason 與 audit log。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const input = parseGrantInput({ amount: body?.amount, reason: body?.reason })
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  const { data: target } = await ctx.admin
    .from('users')
    .select('id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: '找不到這個用戶' }, { status: 404 })

  const before = await getDialogQuota(ctx.admin, id)
  if (!before) return NextResponse.json({ error: '讀不到這個用戶的本期額度，請稍後再試' }, { status: 500 })

  const { error } = await ctx.admin.from('ai_dialog_grants').insert({
    user_id: id,
    period_start: before.periodStart,
    amount: input.amount,
    reason: input.reason,
    granted_by: ctx.userId,
  })
  if (error) {
    console.error('[POST /api/manage/users/:id/grants] insert failed:', error)
    return NextResponse.json({ error: '補發失敗，請稍後再試' }, { status: 500 })
  }

  await logAudit(ctx.admin, ctx.userId, 'dialog.grant', id, {
    amount: input.amount,
    reason: input.reason,
    period_start: before.periodStart,
  })

  const after = await getDialogQuota(ctx.admin, id)
  return NextResponse.json({ quota: after })
}
