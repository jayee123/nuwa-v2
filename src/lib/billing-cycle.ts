/**
 * 付款週期。
 *
 * 年繳暫停販售（Jeff 2026-10-13）：以前年繳收 12 個月的錢、卻只開 1 個月訂閱
 *（首次付款與月扣都固定 +1 個月）。訂閱期間跟著週期走之前，只賣月繳。
 */
export type BillingCycle = 'monthly'

export type BillingCycleResult = { ok: true; billing: BillingCycle } | { ok: false; error: string }

export function parseBillingCycle(input: unknown): BillingCycleResult {
  if (input === undefined || input === null || input === 'monthly') return { ok: true, billing: 'monthly' }
  if (input === 'yearly') return { ok: false, error: '年繳暫停販售，請改選月繳' }
  return { ok: false, error: '付款週期不正確' }
}
