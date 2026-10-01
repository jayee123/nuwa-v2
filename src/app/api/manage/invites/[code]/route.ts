import { NextResponse } from 'next/server'
import { getAdminCtx } from '@/lib/app-access'
import { logAudit } from '@/lib/audit'

// 停用邀請碼
// PATCH /api/manage/invites/:code   body: { action: 'disable' }
//
// 由來：Steve〈新 App 封測測試清單〉§04「碼要能停用 —— 發錯的碼可以作廢，
// 不必等它自然過期」。
//
// 做法：把 expires_at 設成 NOW()（Jeff 2026-09-23 拍板 A 案）。
// 刻意**不**新增 disabled_at 欄位、**不**動 redeem_invite_for_app ——
// 那條 RPC 是存取權的關鍵路徑，我們 9/22 才剛修好過期檢查（migration 028）
// 並在正式 DB 驗證過，不想為了狀態欄的語意再碰它一次。
// 設成已過期就直接沿用 028 已驗證的擋碼邏輯，使用者看到「此邀請碼已過期」。
//
// 代價與取捨：
//   - 狀態欄顯示「已過期」，看不出是自然到期還是被人作廢 ——
//     「誰、什麼時候停用的」記在 audit log，查得到。
//   - **單向、不可復原**：原本的到期日會被覆蓋。需要的話重發一張，碼很便宜。
//
// 附帶好處：這顆按鈕讓「已過期、未使用」的測試碼可以隨時自製 ——
// 發一張新碼、按停用，當場就有。9/21 那次「走到現場才發現沒碼可測」不會再發生。
//
// 權限比照同一頁的「產生」= superadmin：能發碼的人才能殺碼。

export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const ctx = await getAdminCtx()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!ctx.isSuper) return NextResponse.json({ error: '只有 superadmin 能停用邀請碼' }, { status: 403 })

  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: '缺少邀請碼' }, { status: 400 })

  let action = ''
  try {
    const body = (await request.json()) as { action?: unknown }
    if (typeof body.action === 'string') action = body.action
  } catch {
    // 落到下面的檢查
  }
  if (action !== 'disable') {
    return NextResponse.json({ error: '不支援的操作' }, { status: 400 })
  }

  const { data: invite } = await ctx.admin
    .from('invite_codes')
    .select('code, used_by, expires_at, note')
    .eq('code', code)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: '找不到這組邀請碼' }, { status: 404 })
  if (invite.used_by) {
    return NextResponse.json({ error: '這組碼已經被使用，不需要停用' }, { status: 409 })
  }

  const now = new Date()
  if (invite.expires_at && new Date(invite.expires_at as string) <= now) {
    return NextResponse.json({ error: '這組碼已經是過期狀態' }, { status: 409 })
  }

  const { error } = await ctx.admin
    .from('invite_codes')
    .update({ expires_at: now.toISOString() })
    .eq('code', code)
    .is('used_by', null) // 併發保險：停用的瞬間若剛好被兌換，讓兌換勝出

  if (error) {
    console.error('[manage/invites] 停用失敗:', error.message)
    return NextResponse.json({ error: '停用失敗，請稍後再試' }, { status: 500 })
  }

  await logAudit(ctx.admin, ctx.userId, 'invite.disable', code, {
    previous_expires_at: invite.expires_at ?? null, // 原本的到期日（可能是 null＝不過期）
    note: invite.note ?? null,
  })

  return NextResponse.json({ data: { code, expires_at: now.toISOString() } })
}
