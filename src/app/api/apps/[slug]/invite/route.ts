import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 邀請碼兌換 —— 封測（internal）App 的入口
// POST /api/apps/:slug/invite  body: { code: string }
//
// 兌換時機是「點 App 時」而不是註冊時（定案文件 §06）。
// 「標記碼已用」與「建 trial」的原子性在 DB 端 redeem_invite_for_app 內完成
// （migration 025，PAYMENT_BOUNDARIES §C.2）—— 這裡只做輸入驗證與錯誤翻譯。
//
// 錯誤訊息刻意不區分「碼不存在」與「碼已被用」（防列舉，§D）。

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  let code = ''
  try {
    const body = (await request.json()) as { code?: unknown }
    if (typeof body.code === 'string') code = body.code.trim().toUpperCase()
  } catch {
    // 落到下面的空值檢查
  }
  if (!code || code.length > 64) {
    return NextResponse.json({ error: '請輸入邀請碼' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: u } = await admin
    .from('users')
    .select('deleted_at')
    .eq('id', user.id)
    .maybeSingle()
  if (!u || u.deleted_at) {
    return NextResponse.json({ error: '帳號狀態異常，請重新登入' }, { status: 403 })
  }

  // 兌換只對 internal / active 的 App 有意義；draft / archived 一律當不存在
  const { data: app } = await admin
    .from('apps')
    .select('id, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!app || !['active', 'internal'].includes(app.status)) {
    return NextResponse.json({ error: '找不到這個 App' }, { status: 404 })
  }

  const { data: expiresAt, error } = await admin.rpc('redeem_invite_for_app', {
    p_code: code,
    p_user_id: user.id,
    p_app_id: app.id,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('INVITE_INVALID')) {
      return NextResponse.json({ error: '邀請碼無效或已被使用' }, { status: 400 })
    }
    if (msg.includes('INVITE_WRONG_APP')) {
      return NextResponse.json({ error: '這組邀請碼不適用於此 App' }, { status: 400 })
    }
    if (msg.includes('APP_NOT_FOUND')) {
      return NextResponse.json({ error: '找不到這個 App' }, { status: 404 })
    }
    // UNIQUE(user_id, app_id)：同帳號同 App 已有試用（含已到期）→ 不重開（§A6 註3）
    if (error.code === '23505' || msg.includes('user_app_trials')) {
      return NextResponse.json({ error: '這個帳號已經用過此 App 的試用，無法重複兌換' }, { status: 409 })
    }
    console.error('[apps/invite] 兌換失敗:', msg)
    return NextResponse.json({ error: '兌換失敗，請稍後再試' }, { status: 500 })
  }

  // 成功：前端導去 launch（此時 trial 未到期，gate 會放行）
  return NextResponse.json({ data: { expires_at: expiresAt, launch: `/api/apps/${slug}/launch` } })
}
