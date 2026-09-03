import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole, isSuperAdmin } from '@/lib/roles'
import {
  friendlyDbError,
  isEmailTaken,
  isValidGender,
  normalizeEmail,
} from '@/lib/user-fields'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(me?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 })

  // Role change requires superadmin
  if (updates.role !== undefined) {
    if (!isSuperAdmin(me?.role)) {
      return NextResponse.json({ error: '只有系統管理員可以變更角色' }, { status: 403 })
    }

    // Cannot downgrade yourself
    if (id === user.id) {
      return NextResponse.json({ error: '無法變更自己的角色' }, { status: 400 })
    }

    // Validate role value
    const validRoles = ['user', 'admin', 'superadmin']
    if (!validRoles.includes(updates.role)) {
      return NextResponse.json({ error: '無效的角色' }, { status: 400 })
    }
  }

  // Email 是登入身分（014 起 Email 可直接登入）。能改別人的 Email，
  // 就等於能接管那個帳號 —— 一般管理人員只要把系統管理員的 Email 改成自己的，
  // 再走一次「忘記密碼」就進得去。因此比照角色變更，限系統管理員。
  if (updates.email !== undefined && !isSuperAdmin(me?.role)) {
    return NextResponse.json({ error: '只有系統管理員可以變更 Email' }, { status: 403 })
  }

  // Only allow updating specific fields
  const allowed: Record<string, unknown> = {}
  if (updates.role !== undefined) allowed.role = updates.role

  if (updates.nickname !== undefined) {
    const nickname = typeof updates.nickname === 'string' ? updates.nickname.trim() : ''
    if (!nickname) return NextResponse.json({ error: '請輸入用戶名稱' }, { status: 400 })
    if (nickname.length > 50) {
      return NextResponse.json({ error: '用戶名稱最多 50 字' }, { status: 400 })
    }
    allowed.nickname = nickname
  }

  // email / gender / birthday：與前台「個人資訊」對齊，共用 lib/user-fields 的驗證
  if (updates.email !== undefined) {
    const email = normalizeEmail(updates.email)
    if (!email) return NextResponse.json({ error: '請輸入有效的 Email' }, { status: 400 })
    if (await isEmailTaken(admin, email, id)) {
      return NextResponse.json({ error: '這個 Email 已經被其他帳號使用' }, { status: 409 })
    }
    allowed.email = email
  }

  if (updates.gender !== undefined) {
    if (updates.gender === null || updates.gender === '') {
      allowed.gender = null
    } else {
      const n = Number(updates.gender)
      // users.gender 是 SMALLINT 且沒有 CHECK constraint，DB 擋不住，只能在這裡擋
      if (!isValidGender(n)) {
        return NextResponse.json({ error: '性別欄位的值不正確' }, { status: 400 })
      }
      allowed.gender = n
    }
  }

  if (updates.birthday !== undefined) {
    const birthday = updates.birthday || null
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      return NextResponse.json({ error: '生日格式不正確' }, { status: 400 })
    }
    allowed.birthday = birthday
  }
  if (updates.dialog_limit !== undefined) allowed.dialog_limit = Number(updates.dialog_limit)
  if (updates.current_plan !== undefined) allowed.current_plan = updates.current_plan
  if (updates.plan_deadline !== undefined) allowed.plan_deadline = updates.plan_deadline || null

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await admin.from('users').update(allowed).eq('id', id)
  if (error) {
    // 原始 Postgres 錯誤只進 server log，不吐給前端
    console.error('[PATCH /api/manage/users] update failed:', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
