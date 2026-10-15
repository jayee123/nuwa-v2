import { describe, expect, it } from 'vitest'
import { parseBillingCycle } from '../billing-cycle'

describe('parseBillingCycle', () => {
  it('沒帶或帶 monthly → 月繳', () => {
    expect(parseBillingCycle(undefined)).toEqual({ ok: true, billing: 'monthly' })
    expect(parseBillingCycle('monthly')).toEqual({ ok: true, billing: 'monthly' })
  })

  it('yearly → 擋下（年繳暫停販售）', () => {
    expect(parseBillingCycle('yearly')).toEqual({ ok: false, error: '年繳暫停販售，請改選月繳' })
  })

  it('其他值 → 擋下', () => {
    expect(parseBillingCycle('weekly').ok).toBe(false)
    expect(parseBillingCycle(12).ok).toBe(false)
  })
})
