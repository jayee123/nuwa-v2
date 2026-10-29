/**
 * 後台「方案到期日」跟訂閱 ends_at 一起改（BIL-4）。
 * 月扣排程看 subscriptions.ends_at，後台原本只改 users.plan_deadline，改了不會影響扣款。
 */
import { describe, expect, it } from 'vitest'
import { chargeCutoff } from '@/lib/sunpay/charge-schedule'
import { deadlineInputValue, deadlineInstant, planDeadlineChange } from '../plan-deadline'

describe('deadlineInstant', () => {
  it('存成台灣那天的最後一刻', () => {
    expect(deadlineInstant('2026-10-17')).toBe('2026-10-17T15:59:59.999Z')
  })

  it('選今天 → 落在今天月扣的範圍內（今天或下一次排程會扣）', () => {
    const morning = new Date('2026-10-17T00:30:00Z') // 台灣 08:30
    expect(deadlineInstant('2026-10-17')! <= chargeCutoff(morning)).toBe(true)
  })

  it('選明天 → 今天不扣', () => {
    const morning = new Date('2026-10-17T00:30:00Z')
    expect(deadlineInstant('2026-10-18')! <= chargeCutoff(morning)).toBe(false)
  })

  it.each(['2026-02-31', '2026-13-01', '2026/10/17', '20261017', ''])('%p 不是合法日期 → null', (date) => {
    expect(deadlineInstant(date)).toBeNull()
  })
})

describe('deadlineInputValue', () => {
  it('編輯視窗顯示台灣日期，跟列表一致（不是 UTC 日期）', () => {
    // 付款寫進去的時間：台灣 11/17 05:00 = UTC 11/16 21:00
    expect(deadlineInputValue('2026-11-16T21:00:00Z')).toBe('2026-11-17')
  })

  it('存進去再讀出來是同一天', () => {
    expect(deadlineInputValue(deadlineInstant('2026-10-17'))).toBe('2026-10-17')
  })

  it('沒有到期日 → 空字串', () => {
    expect(deadlineInputValue(null)).toBe('')
  })
})

describe('planDeadlineChange', () => {
  const paidDeadline = '2026-11-16T21:00:00Z' // 付款入帳寫的，台灣 11/17

  it('日期沒變（例如只改暱稱）→ 兩邊都不動，不會截掉付款寫的精確時間', () => {
    expect(planDeadlineChange('2026-11-17', paidDeadline, ['sub-1'])).toEqual({ action: 'none' })
  })

  it('有一筆進行中的訂閱 → 同一個時間寫進那筆訂閱', () => {
    expect(planDeadlineChange('2026-10-17', paidDeadline, ['sub-1'])).toEqual({
      action: 'set',
      deadline: '2026-10-17T15:59:59.999Z',
      subscriptionId: 'sub-1',
    })
  })

  it('沒有進行中的訂閱 → 只改會員的到期日', () => {
    expect(planDeadlineChange('2026-10-17', null, [])).toEqual({
      action: 'set',
      deadline: '2026-10-17T15:59:59.999Z',
      subscriptionId: null,
    })
  })

  it('兩筆以上進行中的訂閱 → 擋下來，不猜要改哪筆', () => {
    expect(planDeadlineChange('2026-10-17', paidDeadline, ['sub-1', 'sub-2'])).toMatchObject({ action: 'reject' })
  })

  it.each(['', null])('清空（%p）且有進行中的訂閱 → 擋下來', (input) => {
    expect(planDeadlineChange(input, paidDeadline, ['sub-1'])).toMatchObject({ action: 'reject' })
  })

  it('清空且沒有訂閱 → 清掉會員的到期日', () => {
    expect(planDeadlineChange('', paidDeadline, [])).toEqual({ action: 'set', deadline: null, subscriptionId: null })
  })

  it('本來就沒有、也沒填 → 不動', () => {
    expect(planDeadlineChange('', null, [])).toEqual({ action: 'none' })
  })

  it.each(['2026-02-31', 'abc', 20261017, {}])('格式不對（%p）→ 擋下來', (input) => {
    expect(planDeadlineChange(input, null, [])).toMatchObject({ action: 'reject' })
  })
})
