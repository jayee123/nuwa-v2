/**
 * 實收統計的定義鎖定（金流帳務 A 案）。
 * 「實收 = 成功收款 − 退款」只有 finance-stats.ts 一份定義，改動前先改這裡的期望。
 */
import { describe, expect, it } from 'vitest'
import { monthlyRevenue, type LedgerRow } from '../finance-stats'

function row(partial: Partial<LedgerRow>): LedgerRow {
  return { amount: 0, tx_type: 'recurring', success: true, created_at: '2026-09-15T04:00:00Z', ...partial }
}

describe('monthlyRevenue', () => {
  it('實收 = 成功收款 − 退款；退款負值取絕對值', () => {
    const out = monthlyRevenue([
      row({ amount: 1888, tx_type: 'bind_first_charge' }),
      row({ amount: 299, tx_type: 'recurring' }),
      row({ amount: -1888, tx_type: 'refund' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ charged: 2187, refunded: 1888, net: 299 })
  })

  it('失敗列不計金額、只計筆數', () => {
    const out = monthlyRevenue([
      row({ amount: 299, success: false, errcode: 'G0' } as unknown as LedgerRow),
      row({ amount: 1888 }),
    ])
    expect(out[0]).toMatchObject({ charged: 1888, refunded: 0, net: 1888, failedCount: 1 })
  })

  it('按月分組（台北時區切月），新月在前', () => {
    const out = monthlyRevenue([
      row({ amount: 100, created_at: '2026-08-31T20:00:00Z' }), // 台北 9/1 04:00 → 9 月
      row({ amount: 200, created_at: '2026-08-15T04:00:00Z' }), // 8 月
    ])
    expect(out.map((m) => m.month)).toEqual(['2026-09', '2026-08'])
    expect(out[0].charged).toBe(100)
    expect(out[1].charged).toBe(200)
  })

  it('空輸入回空陣列', () => {
    expect(monthlyRevenue([])).toEqual([])
  })
})
