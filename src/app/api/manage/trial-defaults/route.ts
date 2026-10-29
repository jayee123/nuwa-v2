import { NextResponse } from 'next/server'
import { getAdminCtx } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'
import { parseTrialDefaultsInput } from '@/lib/trial-defaults'

// 公版試用預設（A 方案，migration 035）
// PUT /api/manage/trial-defaults  body: { trialDays, trialDialogLimit }
// App 的試用天數／次數留空時用這組值；改動不追溯已開的試用（開試用時定死）。

export async function PUT(request: Request) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }
  const parsed = parseTrialDefaultsInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { trialDays, trialDialogLimit } = parsed.value
  const { error } = await ctx.admin
    .from('trial_defaults')
    .upsert({ id: 1, trial_days: trialDays, trial_dialog_limit: trialDialogLimit, updated_at: new Date().toISOString() })
  if (error) {
    console.error('[manage/trial-defaults] 寫入失敗', error.message)
    return NextResponse.json({ error: '儲存失敗，資料庫沒有寫入，請稍後再試' }, { status: 500 })
  }

  await logAudit(ctx.admin, ctx.userId, 'trial_defaults.update', 'trial_defaults', { trialDays, trialDialogLimit })
  return NextResponse.json({ success: true, data: parsed.value })
}
