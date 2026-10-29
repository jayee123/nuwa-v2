// 公版試用預設（trial_defaults 表，一列）—— 後台「系統設定」可改。
// App 留空的欄位用這裡的值（A 方案，見 lib/launch-gate.ts 的 resolveTrialTerms）。
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDefaultDialogLimit, parseTrialDays, type TrialDefaults } from './launch-gate'

/** 讀不到時的退路：等同 035 之前的行為（14 天、不限次數），不讓頁面或進 App 壞掉 */
export const FALLBACK_TRIAL_DEFAULTS: TrialDefaults = { trialDays: 14, trialDialogLimit: null }

export async function getTrialDefaults(admin: SupabaseClient): Promise<TrialDefaults> {
  const { data, error } = await admin
    .from('trial_defaults')
    .select('trial_days, trial_dialog_limit')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) {
    console.error('[trial-defaults] 讀不到公版試用預設（migration 035 跑了嗎？），用退路值', error?.message ?? 'no row')
    return FALLBACK_TRIAL_DEFAULTS
  }
  return { trialDays: data.trial_days, trialDialogLimit: data.trial_dialog_limit ?? null }
}

/** 後台送來的公版預設：天數必填（0–365，0 = 預設關閉試用）；次數留空 = 不限，否則 1–10000 */
export function parseTrialDefaultsInput(
  body: unknown,
): { ok: true; value: TrialDefaults } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: '請求格式錯誤' }
  const { trialDays, trialDialogLimit } = body as { trialDays?: unknown; trialDialogLimit?: unknown }

  const days = parseTrialDays(trialDays)
  if (!days.ok) return days
  if (days.value === null) return { ok: false, error: '預設試用天數必填（0 = 預設關閉試用）' }

  const limit = parseDefaultDialogLimit(trialDialogLimit ?? null)
  if (!limit.ok) return limit

  return { ok: true, value: { trialDays: days.value, trialDialogLimit: limit.value } }
}
