/**
 * 020 Step 5 — 把「軟刪除」的用戶在 Supabase Auth 端一併停用
 *
 * 背景：
 *   public.users.deleted_at 只擋 app 層登入（login/actions.ts）。
 *   auth.users 端不動的話，「已經持有有效 session 的人」在 token 到期前仍然進得去，
 *   而且未來若新增登入路徑就會漏掉。這支腳本用 Admin API 把對應的 auth 帳號 ban 掉，
 *   ban 會同時讓既有 refresh token 失效。
 *
 * 對象：users.role = 'user' 且 deleted_at IS NOT NULL
 * 可逆：--unban 解除停用（配合 SQL 把 deleted_at 設回 NULL）
 *
 * 前置：先跑完 supabase/migrations/020_users_soft_delete.sql 的 STEP 2（標記 deleted_at）
 *
 * 用法（Node 20+，--env-file 讀 .env.local，不把 service key 寫進 code）：
 *   npx tsx --env-file=.env.local scripts/ban-soft-deleted-users.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/ban-soft-deleted-users.ts
 *   npx tsx --env-file=.env.local scripts/ban-soft-deleted-users.ts --unban
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '缺少環境變數：NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY\n' +
      '請用：npx tsx --env-file=.env.local scripts/ban-soft-deleted-users.ts',
  )
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const UNBAN = process.argv.includes('--unban')

// Supabase 沒有「永久 ban」語法，用 100 年代替
const BAN_FOREVER = '876000h'
const BAN_NONE = 'none'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: users, error } = await admin
    .from('users')
    .select('id, email, nickname')
    .eq('role', 'user')
    .not('deleted_at', 'is', null)

  if (error) {
    console.error('查詢 users 失敗：', error.message)
    process.exit(1)
  }

  const targets = users ?? []
  const action = UNBAN ? '解除停用' : '停用'
  console.log(`對象：${targets.length} 位（role=user 且 deleted_at IS NOT NULL）`)
  console.log(`動作：${action}${DRY_RUN ? '（dry-run，不寫入）' : ''}\n`)

  if (targets.length === 0) return

  let ok = 0
  const failures: string[] = []

  for (const u of targets) {
    const label = `${u.nickname ?? '未命名'} <${u.email ?? 'no-email'}> ${u.id}`

    if (DRY_RUN) {
      console.log(`[dry-run] ${action}：${label}`)
      ok += 1
      continue
    }

    const { error: banError } = await admin.auth.admin.updateUserById(u.id, {
      ban_duration: UNBAN ? BAN_NONE : BAN_FOREVER,
    })

    if (banError) {
      failures.push(`${label} → ${banError.message}`)
      console.error(`❌ ${label}：${banError.message}`)
      continue
    }

    ok += 1
    console.log(`✅ ${action}：${label}`)
  }

  console.log(`\n完成：成功 ${ok} / ${targets.length}，失敗 ${failures.length}`)
  if (failures.length > 0) {
    console.log('失敗清單：')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('腳本執行失敗：', err)
  process.exit(1)
})
