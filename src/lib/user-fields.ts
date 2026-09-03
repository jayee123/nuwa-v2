/**
 * 使用者資料欄位的共用定義（公版 public.users）。
 *
 * 為什麼要有這個檔：
 *   `gender` 在 DB 是 SMALLINT 且沒有 CHECK constraint，1/2 的意義原本只寫在
 *   profile-form.tsx 的 JSX 裡。後台也要能編輯性別之後，同一份對照表就會有兩份，
 *   而兩份遲早會漂移 —— 方案標籤現在就是活生生的例子：同一個 `premium`，
 *   在不同檔案裡分別寫成 Premium / 旗艦 / 旗艦版。
 *
 *   DB 既然擋不住，驗證就必須在 API 做，而驗證與顯示要用同一份定義。
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── 性別 ────────────────────────────────────────────────

export const GENDER_OPTIONS = [
  { value: 1, label: '男性' },
  { value: 2, label: '女性' },
] as const

export type GenderValue = (typeof GENDER_OPTIONS)[number]['value']

export function genderLabel(value: number | null | undefined): string {
  return GENDER_OPTIONS.find((g) => g.value === value)?.label ?? '未設定'
}

export function isValidGender(value: unknown): value is GenderValue {
  return GENDER_OPTIONS.some((g) => g.value === value)
}

// ── Email ───────────────────────────────────────────────

/**
 * 014 之後 email 是 NOT NULL + UNIQUE(lower(email))。
 * 前台個人資訊與後台編輯用戶都能改它，所以驗證邏輯必須共用一份。
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed
}

/**
 * 檢查 email 是否已被「其他」帳號使用（大小寫不敏感，對齊 idx_users_email_lower）。
 *
 * 這是為了給使用者看得懂的訊息；真正的唯一性保證仍在 DB 的 unique index。
 * 兩層都要有 —— 少了 DB 那層會有 race，少了這層使用者只會看到原始 Postgres 錯誤。
 */
export async function isEmailTaken(
  admin: SupabaseClient,
  email: string,
  excludeUserId: string,
): Promise<boolean> {
  // ilike 會把 % 和 _ 當萬用字元，email 裡出現時要跳脫，否則 a_b@x.com 會誤配 axb@x.com
  const pattern = email.replace(/[%_\\]/g, '\\$&')
  const { data } = await admin
    .from('users')
    .select('id')
    .ilike('email', pattern)
    .neq('id', excludeUserId)
    .limit(1)
  return Boolean(data && data.length > 0)
}

/**
 * 把 Postgres 錯誤轉成使用者看得懂的訊息。
 *
 * 原本兩支 route 都直接回 `'更新失敗：' + error.message`，
 * 等於把 DB 的 constraint 名稱、欄位名稱吐到畫面上。
 */
export function friendlyDbError(error: { code?: string } | null | undefined): string {
  if (error?.code === '23505') return '這個 Email 已經被其他帳號使用'
  if (error?.code === '23502') return '必填欄位不可留空'
  return '更新失敗，請稍後再試'
}
