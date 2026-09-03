import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  friendlyDbError,
  isEmailTaken,
  isValidGender,
  normalizeEmail,
} from '@/lib/user-fields'

// PATCH /api/auth/profile —— 會員自己更新個人資訊
//
// 可改：用戶名稱（nickname）/ Email / 性別 / 生日
// 不可改：手機、NUWA ID、角色、方案、點數（後者是後台的事）
//
// ⚠️ email 自 014 起是 NOT NULL + UNIQUE(lower(email))。
//    原本這支直接寫 `email: body.email || null`，使用者把 Email 清空按儲存
//    就會撞 not-null constraint，而錯誤訊息是把原始 Postgres 文字接在
//    「更新失敗：」後面吐回畫面。唯一性同理。兩者都在這裡先擋掉。

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const body = await request.json()
  const admin = createAdminClient()

  // ── 用戶名稱 ──
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : ''
  if (!nickname) {
    return NextResponse.json({ error: '請輸入用戶名稱' }, { status: 400 })
  }
  if (nickname.length > 50) {
    return NextResponse.json({ error: '用戶名稱最多 50 字' }, { status: 400 })
  }

  // ── Email（必填、需唯一）──
  const email = normalizeEmail(body.email)
  if (!email) {
    return NextResponse.json({ error: '請輸入有效的 Email' }, { status: 400 })
  }
  if (await isEmailTaken(admin, email, user.id)) {
    return NextResponse.json(
      { error: '這個 Email 已經被其他帳號使用' },
      { status: 409 },
    )
  }

  // ── 性別（DB 沒有 CHECK constraint，只能在這裡擋）──
  let gender: number | null = null
  if (body.gender != null && body.gender !== '') {
    const n = Number(body.gender)
    if (!isValidGender(n)) {
      return NextResponse.json({ error: '性別欄位的值不正確' }, { status: 400 })
    }
    gender = n
  }

  // ── 生日 ──
  const birthday = typeof body.birthday === 'string' && body.birthday ? body.birthday : null
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return NextResponse.json({ error: '生日格式不正確' }, { status: 400 })
  }

  const { error } = await admin
    .from('users')
    .update({ nickname, email, gender, birthday })
    .eq('id', user.id)

  if (error) {
    // 原始錯誤只進 server log，不吐給使用者
    console.error('[PATCH /api/auth/profile] update failed:', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
