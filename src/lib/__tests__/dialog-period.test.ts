/**
 * AI 對話額度週期（QUOTA-PLAN.md §資料設計 3）。
 *
 * 週期從「錨點日」起算，不是每月 1 號（Steve §4.4）：月中訂閱的人
 * 第一個月不會只拿到幾天。錨點 = 有效訂閱的 starts_at，沒有訂閱 = 註冊日。
 *
 * 所有日期以台灣時間的「日曆日」計 —— 使用者看到「10/20 重置」，
 * 那個 10/20 是台灣的 10/20。SQL 版 dialog_period_start() 照這份規則寫。
 */
import { describe, expect, it } from 'vitest'
import { dialogPeriod } from '../dialog-period'

// 台灣時間 → Date（測試好讀）
const tw = (s: string) => new Date(`${s}+08:00`)

describe('dialogPeriod —— 一般情況', () => {
  it('錨點日還沒到 → 本期從上個月的錨點日起算', () => {
    const p = dialogPeriod(tw('2026-09-20T10:00:00'), tw('2026-10-05T12:00:00'))
    expect(p.start).toBe('2026-09-20')
    expect(p.nextReset).toBe('2026-10-20')
  })

  it('錨點日已過 → 本期從這個月的錨點日起算', () => {
    const p = dialogPeriod(tw('2026-09-20T10:00:00'), tw('2026-10-25T12:00:00'))
    expect(p.start).toBe('2026-10-20')
    expect(p.nextReset).toBe('2026-11-20')
  })

  it('今天就是錨點日 → 今天開始新的一期', () => {
    const p = dialogPeriod(tw('2026-09-20T10:00:00'), tw('2026-10-20T00:00:01'))
    expect(p.start).toBe('2026-10-20')
  })

  it('剛訂閱當天 → 本期就是今天', () => {
    const p = dialogPeriod(tw('2026-09-20T10:00:00'), tw('2026-09-20T23:59:00'))
    expect(p.start).toBe('2026-09-20')
    expect(p.nextReset).toBe('2026-10-20')
  })

  it('錨點是 1 號 → 行為等同自然月', () => {
    const p = dialogPeriod(tw('2026-01-01T00:00:00'), tw('2026-09-15T00:00:00'))
    expect(p.start).toBe('2026-09-01')
    expect(p.nextReset).toBe('2026-10-01')
  })
})

describe('dialogPeriod —— 月底夾擠（最容易錯的地方）', () => {
  it('錨點 31 號，碰到 30 天的月份 → 取該月最後一天', () => {
    const p = dialogPeriod(tw('2026-01-31T10:00:00'), tw('2026-04-30T12:00:00'))
    expect(p.start).toBe('2026-04-30')
    expect(p.nextReset).toBe('2026-05-31')
  })

  it('錨點 31 號，2 月 → 夾到 28 號', () => {
    const p = dialogPeriod(tw('2026-01-31T10:00:00'), tw('2026-03-01T12:00:00'))
    expect(p.start).toBe('2026-02-28')
    expect(p.nextReset).toBe('2026-03-31')
  })

  it('夾擠只影響該月，不會把錨點永久往前挪', () => {
    // 2/28 那期結束後，下一期要回到 3/31，而不是 3/28
    const p = dialogPeriod(tw('2026-01-31T10:00:00'), tw('2026-03-31T09:00:00'))
    expect(p.start).toBe('2026-03-31')
  })

  it('閏年 2 月 → 夾到 29 號', () => {
    const p = dialogPeriod(tw('2027-12-31T10:00:00'), tw('2028-03-10T12:00:00'))
    expect(p.start).toBe('2028-02-29')
    expect(p.nextReset).toBe('2028-03-31')
  })
})

describe('dialogPeriod —— 跨年與時區', () => {
  it('跨年：12 月錨點日還沒到，1 月初屬於上一年 12 月那期', () => {
    const p = dialogPeriod(tw('2026-03-15T10:00:00'), tw('2027-01-05T12:00:00'))
    expect(p.start).toBe('2026-12-15')
    expect(p.nextReset).toBe('2027-01-15')
  })

  it('用台灣日曆日：UTC 還是前一天、台灣已經是錨點日 → 算新的一期', () => {
    // 台灣 10/20 07:00 = UTC 10/19 23:00
    const p = dialogPeriod(tw('2026-09-20T10:00:00'), new Date('2026-10-19T23:00:00Z'))
    expect(p.start).toBe('2026-10-20')
  })

  it('錨點本身跨時區：UTC 9/19 晚上 = 台灣 9/20 → 錨點日是 20 號', () => {
    const p = dialogPeriod(new Date('2026-09-19T20:00:00Z'), tw('2026-10-25T12:00:00'))
    expect(p.start).toBe('2026-10-20')
  })
})

describe('dialogPeriod —— 防呆', () => {
  it('錨點在未來（資料異常）→ 從錨點日起算，不回傳比錨點更早的期', () => {
    const p = dialogPeriod(tw('2026-12-01T00:00:00'), tw('2026-10-05T00:00:00'))
    expect(p.start).toBe('2026-12-01')
  })
})
