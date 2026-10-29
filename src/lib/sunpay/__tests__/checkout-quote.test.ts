/**
 * 升級收差價（PAY-20）：差價 = 新方案定價 − 舊方案定價，到期日不變；
 * 差價 0 直接升級不收錢，差價 < 0（定價設錯）不能線上升級。
 */
import { describe, expect, it } from 'vitest'
import { checkoutQuote, PRICE_CHANGED_ERROR, QUOTE_ERROR, verifyExpectedAmount } from '../checkout-quote'

const basic = { code: 'basic', monthly_charge: 300 }
const advanced = { code: 'advanced', monthly_charge: 600 }
const premium = { code: 'premium', monthly_charge: 1000 }
const sub = { ends_at: '2026-11-17T15:59:59.999Z' }

describe('checkoutQuote', () => {
  it('沒有訂閱 → 首次付款，收全額', () => {
    expect(checkoutQuote({ target: basic, current: null, activeSubscription: null })).toEqual({ kind: 'first', amount: 300 })
  })

  it('有方案但沒有進行中的訂閱（例如後台手動給的）→ 首次付款收全額，不收差價', () => {
    expect(checkoutQuote({ target: advanced, current: basic, activeSubscription: null })).toEqual({ kind: 'first', amount: 600 })
  })

  it('基本 → 進階：收差價 300，到期日維持原訂閱的', () => {
    expect(checkoutQuote({ target: advanced, current: basic, activeSubscription: sub })).toEqual({
      kind: 'upgrade',
      amount: 300,
      endsAt: sub.ends_at,
    })
  })

  it('進階 → 旗艦：差價照定價算（新 − 舊），不看這期實際付過多少', () => {
    expect(checkoutQuote({ target: premium, current: advanced, activeSubscription: sub })).toMatchObject({ kind: 'upgrade', amount: 400 })
  })

  it('差價 0（測試價各方案都 NT$5）→ 直接升級不收錢，到期日維持', () => {
    const five = (code: string) => ({ code, monthly_charge: 5 })
    expect(checkoutQuote({ target: five('premium'), current: five('advanced'), activeSubscription: sub })).toEqual({
      kind: 'free_upgrade',
      amount: 0,
      endsAt: sub.ends_at,
    })
  })

  it('新方案比較便宜（定價設錯）→ 擋下，不會算出負數', () => {
    expect(
      checkoutQuote({ target: { code: 'premium', monthly_charge: 100 }, current: advanced, activeSubscription: sub }),
    ).toMatchObject({ kind: 'reject', error: QUOTE_ERROR.cheaperTarget })
  })

  it('同方案 → 擋下', () => {
    expect(checkoutQuote({ target: basic, current: basic, activeSubscription: sub })).toEqual({ kind: 'reject', error: QUOTE_ERROR.sameOrLower })
  })

  it('降級 → 擋下（降級走到期日排程，不走結帳）', () => {
    expect(checkoutQuote({ target: basic, current: advanced, activeSubscription: sub })).toEqual({ kind: 'reject', error: QUOTE_ERROR.sameOrLower })
  })

  it('方案定價不是正整數 → 擋下', () => {
    expect(checkoutQuote({ target: { code: 'basic', monthly_charge: 0 }, current: null, activeSubscription: null })).toMatchObject({
      kind: 'reject',
    })
  })
})

/** PAY-22：確認畫面的金額跟按下付款時伺服器算的不一樣，就擋下重新確認 */
describe('verifyExpectedAmount', () => {
  const first = { kind: 'first', amount: 300 } as const
  const free = { kind: 'free_upgrade', amount: 0, endsAt: sub.ends_at } as const

  it('一樣 → 放行', () => {
    expect(verifyExpectedAmount(300, first)).toEqual({ ok: true })
  })

  it('同價升級確認的是 0 → 放行', () => {
    expect(verifyExpectedAmount(0, free)).toEqual({ ok: true })
  })

  it('中間定價改了 → 擋下，請重新確認', () => {
    expect(verifyExpectedAmount(5, first)).toEqual({ ok: false, error: PRICE_CHANGED_ERROR })
  })

  it('確認的是同價升級，但按下時已經不是（例如訂閱剛到期，變成首次付款）→ 擋下', () => {
    expect(verifyExpectedAmount(0, first)).toEqual({ ok: false, error: PRICE_CHANGED_ERROR })
  })

  it.each([undefined, null, '300', 300.5, -1])('沒帶或格式不對（%s）→ 擋下，不收錢', (expected) => {
    expect(verifyExpectedAmount(expected, first).ok).toBe(false)
  })
})
