/**
 * P1 多模式登入 — 把 email 補進 Supabase Auth 帳號
 *
 * 現有帳號都是用 phone 建的（auth.admin.createUser({ phone })），auth.users 內沒有 email，
 * 因此 signInWithPassword({ email }) 會失敗。這支腳本把 users.email 寫進對應的 auth 帳號
 * （email + email_confirm），讓 email 登入可用。
 *
 * 只「加」email、不動 phone，不影響原本的手機登入；email 已確認唯一，不會撞號。
 *
 * 用法：
 *   npx tsx scripts/backfill-auth-email.ts --dry-run   # 只印出會做什麼，不寫入
 *   npx tsx scripts/backfill-auth-email.ts             # 實際寫入
 */

import { createClient } from '@supabase/supabase-js'

// ─── Config ────────────────────────────────────────────────────
// ⚠️ 絕不把金鑰寫死在程式裡（這支曾經寫死 service_role key 並進了版控）。
//    service_role 會繞過所有 RLS，等同資料庫全權。一律走環境變數：
//
//      node --env-file=.env.local scripts/backfill-auth-email.ts --dry-run
//
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '缺少環境變數：NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY\n' +
      '請用：node --env-file=.env.local scripts/backfill-auth-email.ts',
  )
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: users, error } = await admin
    .from('users')
    .select('id, email, phone, nickname')

  if (error) throw error
  if (!users) {
    console.log('沒有讀到任何用戶')
    return
  }

  console.log(`共 ${users.length} 位用戶${DRY_RUN ? '（DRY-RUN，不寫入）' : ''}\n`)

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const u of users) {
    if (!u.email) {
      console.warn(`⚠ 跳過 ${u.nickname ?? u.id}：users.email 為空`)
      skipped++
      continue
    }

    // 讀 auth 帳號現況
    const { data: authRes, error: getErr } = await admin.auth.admin.getUserById(u.id)
    if (getErr || !authRes?.user) {
      console.error(`✗ 找不到 auth 帳號 ${u.id}（${u.email}）：${getErr?.message ?? 'no user'}`)
      failed++
      continue
    }

    // 已有相同 email → 略過
    if (authRes.user.email && authRes.user.email.toLowerCase() === u.email.toLowerCase()) {
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`[dry] 會補 email ${u.email} → auth ${u.id}`)
      updated++
      continue
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(u.id, {
      email: u.email,
      email_confirm: true,
    })
    if (updErr) {
      console.error(`✗ 更新失敗 ${u.email}（${u.id}）：${updErr.message}`)
      failed++
      continue
    }
    console.log(`✓ ${u.email} → auth ${u.id}`)
    updated++
  }

  console.log(
    `\n完成：更新 ${updated}、略過 ${skipped}、失敗 ${failed}${DRY_RUN ? '（DRY-RUN，未實際寫入）' : ''}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
