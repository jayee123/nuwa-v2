import { NextResponse } from 'next/server'
import { getAdminCtx } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'

// 重置試用 —— 刪掉一筆 user_app_trials
// DELETE /api/manage/trials/:id
//
// 由來：Steve〈新 App 封測測試清單〉「測試帳號會被燒掉」。
// UNIQUE(user_id, app_id) 讓「一個帳號一支 App 只能試用一次」成為**永久**限制，
// 換新碼、等到期都沒用 —— 刪掉這一列是唯一的解除方式。幸福關係封測一輪就
// 燒掉四個帳號（琳琳、子奇、Jeff、李淑枝）。
//
// 兩種用途：
//   ① 測試：測完把帳號還原成乾淨狀態，不必一直開新信箱
//   ② 客服：使用者試用期間遇到系統問題沒用到，補一次給他
//
// 權限：superadmin。
//
// 原本設計成 admin —— 理由是「這要當第一線客服工具，卡在 superadmin 等於沒人能用」。
// Steve 2026-09-23 指出按破壞性排是反的：重置會**永久刪掉一列**，停用碼只要重發就好，
// 反而是後者比較嚴。客服團隊還沒成形，那個「給第一線用」的前提現在並不成立，
// 所以先從嚴。**等客服團隊真的建立後再放寬回 admin。**
//
// 不論哪個層級，代價都由 audit log 承擔：刪除前的整列快照寫進 detail，
// 誤刪查得回原始資料（包含原到期日與當初兌換的碼）。

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能重置試用' }, { status: 403 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: '缺少試用紀錄 id' }, { status: 400 })

  // 先撈快照 —— 刪掉就查不回來了，audit 必須在刪除前取得完整內容
  const { data: trial } = await ctx.admin
    .from('user_app_trials')
    .select('id, user_id, app_id, started_at, expires_at, source, invite_code, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!trial) {
    return NextResponse.json({ error: '找不到這筆試用紀錄（可能已被其他人重置）' }, { status: 404 })
  }

  const { error } = await ctx.admin.from('user_app_trials').delete().eq('id', id)
  if (error) {
    console.error('[manage/trials] 重置失敗:', error.message)
    return NextResponse.json({ error: '重置失敗，請稍後再試' }, { status: 500 })
  }

  await logAudit(ctx.admin, ctx.userId, 'trial.reset', id, { ...trial })

  return NextResponse.json({ data: { id } })
}
