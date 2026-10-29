import { describe, expect, it } from 'vitest'
import { chargeCutoff, taiwanDate, taiwanDateCompact } from '../charge-schedule'

describe('月扣排程的日期換算（台灣時間）', () => {
  it('UTC 傍晚已經是台灣隔天', () => {
    expect(taiwanDate(new Date('2026-11-14T16:30:00Z'))).toBe('2026-11-15')
    expect(taiwanDateCompact(new Date('2026-11-14T16:30:00Z'))).toBe('20261115')
  })

  it('截止時間 = 台灣今天 23:59:59.999（UTC 15:59:59.999）', () => {
    // 排程在台灣 11/15 09:00（UTC 01:00）跑
    expect(chargeCutoff(new Date('2026-11-15T01:00:00Z'))).toBe('2026-11-15T15:59:59.999Z')
  })

  it('台灣今天稍晚到期的要扣、台灣明天凌晨才到期的不扣', () => {
    const cutoff = chargeCutoff(new Date('2026-11-15T01:00:00Z'))
    expect('2026-11-15T11:25:00.000Z' <= cutoff).toBe(true) // 台灣 11/15 19:25
    expect('2026-11-15T17:00:00.000Z' <= cutoff).toBe(false) // 台灣 11/16 01:00
  })

  it('月底跨月、跨年', () => {
    expect(chargeCutoff(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01T15:59:59.999Z')
  })
})
