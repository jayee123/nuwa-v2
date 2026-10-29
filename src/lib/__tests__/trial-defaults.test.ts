import { describe, expect, it } from 'vitest'
import { parseTrialDefaultsInput } from '../trial-defaults'

describe('parseTrialDefaultsInput — 系統設定「App 試用預設」', () => {
  it('天數＋次數 → 照存', () => {
    expect(parseTrialDefaultsInput({ trialDays: 14, trialDialogLimit: 30 })).toEqual({
      ok: true,
      value: { trialDays: 14, trialDialogLimit: 30 },
    })
  })

  it('次數留空 → 不限（null）', () => {
    expect(parseTrialDefaultsInput({ trialDays: 7, trialDialogLimit: null })).toEqual({
      ok: true,
      value: { trialDays: 7, trialDialogLimit: null },
    })
  })

  it('天數 0 → 全部跟預設的 App 都關閉試用（合法）', () => {
    expect(parseTrialDefaultsInput({ trialDays: 0, trialDialogLimit: null }).ok).toBe(true)
  })

  it('天數必填：留空、負數、超過 365 → 錯誤', () => {
    for (const trialDays of [null, '', -1, 366, '14']) {
      expect(parseTrialDefaultsInput({ trialDays, trialDialogLimit: 30 }).ok).toBe(false)
    }
  })

  it('次數 0 或非數字 → 錯誤（公版不限次數就留空）', () => {
    expect(parseTrialDefaultsInput({ trialDays: 14, trialDialogLimit: 0 }).ok).toBe(false)
    expect(parseTrialDefaultsInput({ trialDays: 14, trialDialogLimit: '30' }).ok).toBe(false)
  })

  it('不是物件 → 錯誤', () => {
    expect(parseTrialDefaultsInput(null).ok).toBe(false)
  })
})
