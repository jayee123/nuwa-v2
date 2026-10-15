/**
 * 後台「本期補發」的輸入規則（2026-10-01）。
 * 補發直接加在使用者本期上限上（dialog_limit_for = 方案 + 補發），
 * 所以次數要是正整數、有上限；原因必填 —— 查帳時要看得出為什麼補。
 */
import { describe, expect, it } from 'vitest'
import { MAX_GRANT_AMOUNT, parseGrantInput } from '../dialog-grant'

describe('parseGrantInput', () => {
  it('正整數 + 原因 → 通過，原因去頭尾空白', () => {
    expect(parseGrantInput({ amount: 10, reason: '  系統異常補償 ' })).toEqual({
      ok: true,
      amount: 10,
      reason: '系統異常補償',
    })
  })

  it('字串數字也收（表單送來的）', () => {
    expect(parseGrantInput({ amount: '5', reason: '客服' })).toMatchObject({ ok: true, amount: 5 })
  })

  it.each([0, -3, 1.5, 'abc', null, undefined, Number.NaN])('次數 %p → 拒絕', (amount) => {
    expect(parseGrantInput({ amount, reason: '客服' })).toMatchObject({ ok: false })
  })

  it('超過上限 → 拒絕', () => {
    expect(parseGrantInput({ amount: MAX_GRANT_AMOUNT + 1, reason: '客服' })).toMatchObject({ ok: false })
    expect(parseGrantInput({ amount: MAX_GRANT_AMOUNT, reason: '客服' })).toMatchObject({ ok: true })
  })

  it.each(['', '   ', null, undefined])('原因 %p → 拒絕', (reason) => {
    expect(parseGrantInput({ amount: 5, reason })).toMatchObject({ ok: false })
  })

  it('原因超過 200 字 → 拒絕', () => {
    expect(parseGrantInput({ amount: 5, reason: '字'.repeat(201) })).toMatchObject({ ok: false })
  })
})
