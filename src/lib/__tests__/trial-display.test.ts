import { describe, expect, it } from 'vitest'
import { trialBadge, trialOffer } from '../trial-display'

const NOW = new Date('2026-10-15T12:00:00Z')
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000)

describe('trialBadge — 卡片上的試用狀態（天數或次數先到者結束）', () => {
  it('沒設次數上限：只講天數', () => {
    expect(trialBadge({ expiresAt: inDays(10) }, NOW)).toEqual({ text: '免費試用中・剩 10 天', tone: 'active' })
  })

  it('有次數上限：天數與次數都講', () => {
    expect(trialBadge({ expiresAt: inDays(10), dialogsUsed: 3, dialogLimit: 20 }, NOW)).toEqual({
      text: '免費試用中・剩 10 天、17 次對話',
      tone: 'active',
    })
  })

  it('剩 3 天以內或 3 次以內：提醒色', () => {
    expect(trialBadge({ expiresAt: inDays(2) }, NOW).tone).toBe('warning')
    expect(trialBadge({ expiresAt: inDays(10), dialogsUsed: 18, dialogLimit: 20 }, NOW).tone).toBe('warning')
  })

  it('次數先用完：講「次數已用完」，不是「已到期」', () => {
    expect(trialBadge({ expiresAt: inDays(10), dialogsUsed: 20, dialogLimit: 20 }, NOW)).toEqual({
      text: '免費試用對話次數已用完 — 訂閱後可繼續使用',
      tone: 'ended',
    })
  })

  it('天數到了：已到期', () => {
    expect(trialBadge({ expiresAt: inDays(-1), dialogsUsed: 0, dialogLimit: 20 }, NOW)).toEqual({
      text: '免費試用已到期 — 訂閱後可繼續使用',
      tone: 'ended',
    })
  })
})

describe('trialOffer — 開始試用前的說明（按鈕與卡片小字）', () => {
  it('有次數上限：天數與次數都寫', () => {
    expect(trialOffer(14, 30)).toBe('14 天（30 次對話）')
  })

  it('沒設次數上限：只寫天數', () => {
    expect(trialOffer(14, null)).toBe('14 天')
  })
})
