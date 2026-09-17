/**
 * 金流帳務的統計純函式（後台「金流帳務」頁用）。
 * 抽成純函式是為了 unit test：實收的定義只在這裡一份。
 */

export interface LedgerRow {
  amount: number
  tx_type: string
  success: boolean
  created_at: string
}

export interface MonthlyRevenue {
  month: string // 'YYYY-MM'
  charged: number // 成功收款總額（正值加總）
  refunded: number // 退款總額（絕對值）
  net: number // 實收 = charged - refunded
  failedCount: number // 失敗往來筆數（不計金額，供異常監看）
}

/**
 * 按月統計實收。
 * - 只有 success 列計入金額；退款列存負值，取絕對值列 refunded
 * - 失敗列不計金額、只計筆數
 * - 月份用台北時間切（帳務對的是台灣的月結）
 */
export function monthlyRevenue(rows: LedgerRow[]): MonthlyRevenue[] {
  const byMonth = new Map<string, MonthlyRevenue>()
  for (const r of rows) {
    const month = new Date(r.created_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 7)
    let m = byMonth.get(month)
    if (!m) {
      m = { month, charged: 0, refunded: 0, net: 0, failedCount: 0 }
      byMonth.set(month, m)
    }
    if (!r.success) {
      m.failedCount += 1
      continue
    }
    if (r.tx_type === 'refund' || r.amount < 0) {
      m.refunded += Math.abs(r.amount)
    } else {
      m.charged += r.amount
    }
    m.net = m.charged - m.refunded
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month))
}
