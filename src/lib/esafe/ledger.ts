import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 金流帳務：gateway_transactions 的寫入口（migration 027，Jeff A 案）。
 *
 * 鐵律：**記帳失敗絕不能弄壞金流主線** —— 這裡永不 throw，失敗只記 error log。
 * 寧可少一筆帳（之後可從紅陽後台補對），也不能讓用戶的付款流程 500。
 *
 * 敏感欄位（tokenData / ChkValue / 卡號類）由呼叫端負責「不要傳進 raw」，
 * 本函式再防禦性剔除一次 —— 卡片 token 永不入這張表。
 */

const SENSITIVE_KEYS = ['tokenData', 'ChkValue', 'chkValue', 'token_data', 'paymentToken']

export interface GatewayTxInput {
  userId?: string | null
  paymentId?: string | null
  txType: 'bind_first_charge' | 'recurring' | 'refund'
  /** 收款正值、退款負值 */
  amount: number
  orderNo?: string | null
  gatewayNo?: string | null
  errcode?: string | null
  errmsg?: string | null
  success: boolean
  raw?: Record<string, unknown> | null
  note?: string | null
  createdBy?: string | null
}

function stripSensitive(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (SENSITIVE_KEYS.includes(k)) continue
    out[k] = v
  }
  return out
}

export async function recordGatewayTx(admin: SupabaseClient, tx: GatewayTxInput): Promise<void> {
  try {
    const { error } = await admin.from('gateway_transactions').insert({
      user_id: tx.userId ?? null,
      payment_id: tx.paymentId ?? null,
      tx_type: tx.txType,
      amount: tx.amount,
      order_no: tx.orderNo ?? null,
      gateway_no: tx.gatewayNo ?? null,
      errcode: tx.errcode ?? null,
      errmsg: tx.errmsg ?? null,
      success: tx.success,
      raw: stripSensitive(tx.raw),
      note: tx.note ?? null,
      created_by: tx.createdBy ?? null,
    })
    // 23505 = 撞 idx_gateway_tx_dedupe（紅陽雙回調 / 重送），本來就該只記一次
    if (error && error.code !== '23505') {
      console.error('[ledger] gateway_transactions 寫入失敗（不影響金流主線，請補查）:', error.message)
    }
  } catch (e) {
    console.error('[ledger] gateway_transactions 寫入異常（不影響金流主線，請補查）:', e)
  }
}

export { stripSensitive }
