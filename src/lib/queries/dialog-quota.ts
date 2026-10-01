import type { createAdminClient } from '@/lib/supabase/admin'
import { dialogPeriod } from '@/lib/dialog-period'

/**
 * 本期 AI 對話額度（跨 App 共用一池，docs/QUOTA-PLAN.md）。
 *
 * 公版自己已經沒有 AI（2026-09-26 決定），這裡只是「顯示」各 App 記進
 * ai_dialog_usage 的已用次數；擋人仍在各 App 端。
 *
 * 週期用 TS 版 dialogPeriod()（有單元測試釘死），上限用 SQL dialog_limit_for()
 * （方案次數 + 本期補發）—— 兩者的錨點規則一致，見 migration 030。
 */
export interface DialogQuota {
  used: number
  limit: number
  /** YYYY-MM-DD */
  periodStart: string
  /** 顯示用，例如 "10/20" */
  nextResetLabel: string
}

export async function getDialogQuota(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  now: Date = new Date(),
): Promise<DialogQuota | null> {
  const [{ data: sub }, { data: u }] = await Promise.all([
    admin
      .from('subscriptions')
      .select('starts_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('ends_at', now.toISOString())
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('users').select('created_at').eq('id', userId).maybeSingle(),
  ])
  const anchor = sub?.starts_at ?? u?.created_at
  if (!anchor) return null

  const period = dialogPeriod(new Date(anchor), now)

  const [{ data: limit, error: limitError }, { data: rows, error: usageError }] = await Promise.all([
    admin.rpc('dialog_limit_for', { p_user: userId, p_period: period.start }),
    admin.from('ai_dialog_usage').select('used').eq('user_id', userId).eq('period_start', period.start),
  ])
  if (limitError || usageError) {
    console.error('[dialog-quota] 讀取失敗:', limitError?.message ?? usageError?.message)
    return null
  }

  const used = (rows ?? []).reduce((sum, r) => sum + (r.used ?? 0), 0)
  const [, m, d] = period.nextReset.split('-')
  return {
    used,
    limit: Number(limit ?? 0),
    periodStart: period.start,
    nextResetLabel: `${Number(m)}/${Number(d)}`,
  }
}

/** 畫面上一句話：「本期已用 3／50 次・10/20 重置」 */
export function dialogQuotaLabel(q: DialogQuota | null): string {
  if (!q) return '本期額度讀取中'
  return `本期已用 ${q.used}／${q.limit} 次・${q.nextResetLabel} 重置`
}
