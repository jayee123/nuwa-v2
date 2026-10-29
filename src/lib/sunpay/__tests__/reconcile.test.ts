/**
 * 對帳（BIL-3）：紅陽即時交易查詢的結果 → 入帳／等待／待人工。
 */
import { describe, expect, it } from 'vitest'
import type { PaymentCheckItem } from '../client'
import { ABANDON_AFTER_MS, reconcileStep } from '../reconcile'
import { decideNotify } from '../settle'

const NOW = new Date('2026-10-17T00:00:00Z')
const payment = { payment_uid: 'V3F261016213849KAH9F2', amount: 5, created_at: '2026-10-16T13:38:49Z' }
const oldPayment = { ...payment, created_at: new Date(NOW.getTime() - ABANDON_AFTER_MS - 1000).toISOString() }

function item(overrides: Partial<PaymentCheckItem>): PaymentCheckItem {
  return {
    code: '00',
    error_msg: '',
    td: payment.payment_uid,
    trade_no: 'C261016213850123456',
    mn: '5',
    pay_result: '10',
    pay_date: '20261016',
    pay_time: '21:40',
    approve_code: 'A1B2C3',
    refund_status: '0',
    refund_amt: '5',
    ...overrides,
  }
}

describe('reconcileStep', () => {
  it('交易成功：轉成成功通知，帶紅陽的金額與交易編號', () => {
    const step = reconcileStep(payment, item({}), NOW)
    expect(step).toEqual({
      action: 'settle',
      body: {
        td: payment.payment_uid,
        mn: '5',
        pay_result: '10',
        trade_no: 'C261016213850123456',
        pay_date: '20261016',
        pay_time: '21:40',
        approve_code: 'A1B2C3',
      },
    })
  })

  it('成功但金額跟我們不一樣：交給 decideNotify 擋下（不入帳）', () => {
    const step = reconcileStep(payment, item({ mn: '999' }), NOW)
    if (step.action !== 'settle') throw new Error('應該要 settle')
    expect(decideNotify({ amount: 5, status: 'pending' }, step.body).action).toBe('reject')
  })

  it.each([
    ['11', '交易失敗'],
    ['15', '交易取消'],
  ])('%s（%s）：轉成失敗通知，decideNotify 會標失敗', (payResult) => {
    const step = reconcileStep(payment, item({ pay_result: payResult, mn: '' }), NOW)
    expect(step).toMatchObject({ action: 'settle', body: { pay_result: '11', mn: '5' } })
    if (step.action !== 'settle') throw new Error('應該要 settle')
    expect(decideNotify({ amount: 5, status: 'pending' }, step.body)).toEqual({ action: 'mark_failed', kind: 'first' })
  })

  it('交易未完成、還沒滿一天：先等', () => {
    expect(reconcileStep(payment, item({ pay_result: '13' }), NOW).action).toBe('wait')
  })

  it('交易未完成、超過一天：當作放棄，標失敗', () => {
    expect(reconcileStep(oldPayment, item({ pay_result: '13' }), NOW)).toMatchObject({
      action: 'settle',
      body: { pay_result: '11' },
    })
  })

  it('查無該筆訂單：不自動標失敗，待人工（紅陽還沒確認代碼授權的單查不查得到）', () => {
    expect(reconcileStep(oldPayment, item({ pay_result: '12' }), NOW).action).toBe('review')
  })

  it('紅陽顯示已退款、但我們還是處理中：待人工', () => {
    expect(reconcileStep(payment, item({ pay_result: '14' }), NOW).action).toBe('review')
  })

  it('回應裡沒有這張單、或這筆查詢失敗：待人工', () => {
    expect(reconcileStep(payment, null, NOW).action).toBe('review')
    expect(reconcileStep(payment, item({ code: '06', error_msg: '擇一' }), NOW).action).toBe('review')
  })

  it('不認得的交易結果：待人工', () => {
    expect(reconcileStep(payment, item({ pay_result: '' }), NOW).action).toBe('review')
  })
})
