/**
 * 後台「本期補發」：客服補償用，寫進 ai_dialog_grants（migration 030）。
 * 補發直接加在本期上限上 —— dialog_limit_for() = 方案次數 + 本期補發加總。
 *
 * 取代舊的「對話點數」欄位（users.dialog_limit）：那是舊制的「剩餘」，
 * 新制額度已經不讀它，在那裡改數字對使用者沒有任何效果。
 */

/** 單次補發上限：最高方案一期 200 次，補一整期以上就不是補償了 */
export const MAX_GRANT_AMOUNT = 200
const MAX_REASON_LENGTH = 200

export type GrantInput =
  | { ok: true; amount: number; reason: string }
  | { ok: false; error: string }

export function parseGrantInput(input: { amount: unknown; reason: unknown }): GrantInput {
  const amount = typeof input.amount === 'string' ? Number(input.amount) : input.amount
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: '補發次數要是正整數' }
  }
  if (amount > MAX_GRANT_AMOUNT) {
    return { ok: false, error: `單次補發最多 ${MAX_GRANT_AMOUNT} 次` }
  }

  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) return { ok: false, error: '請填寫補發原因' }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `原因最多 ${MAX_REASON_LENGTH} 字` }
  }

  return { ok: true, amount, reason }
}
