/**
 * 退款對帳（BIL-3 後半）：後台「標記退款」是人工宣告，對帳排程去紅陽查 refund_status 確認真的退了。
 */
import { describe, expect, it } from 'vitest'
import type { PaymentCheckItem } from '../client'
import { needsRefundCheck, refundCheckBadge, refundCheckOf, refundCheckStep } from '../refund-check'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-24T00:00:00.000Z')
const MARKED = new Date('2026-10-20T03:45:55.000Z') // 10/20 Steve 標記退款

function item(overrides: Partial<PaymentCheckItem>): PaymentCheckItem {
  return {
    code: '00',
    error_msg: '',
    td: 'V3F261018001051XRQ75U',
    trade_no: 'C261018001052286283',
    mn: '5',
    pay_result: '10',
    pay_date: '20261018',
    pay_time: '00:17',
    approve_code: 'A1',
    refund_status: '1',
    refund_amt: '0',
    ...overrides,
  }
}

describe('refundCheckStep', () => {
  it('退款完成（refund_status=2）→ 確認，不必人工', () => {
    expect(refundCheckStep(item({ refund_status: '2' }), MARKED, NOW)).toMatchObject({
      state: 'confirmed',
      needs_review: false,
      refund_status: '2',
      checked_at: NOW.toISOString(),
    })
  })

  it('當天未請款就退刷，紅陽顯示交易取消（pay_result=15）→ 等同退款完成（10/20 V3R）', () => {
    expect(refundCheckStep(item({ pay_result: '15', refund_status: '0' }), MARKED, NOW)).toMatchObject({ state: 'confirmed', needs_review: false })
  })

  it('已請款的單還在處理中 → 明天再查，不必人工（10/20 QHAJ8W、XRQ75U）', () => {
    expect(refundCheckStep(item({ refund_status: '1' }), MARKED, NOW)).toMatchObject({ state: 'processing', needs_review: false })
  })

  it('處理中超過 14 天 → 需人工', () => {
    const later = new Date(MARKED.getTime() + 15 * DAY)
    expect(refundCheckStep(item({ refund_status: '1' }), MARKED, later)).toMatchObject({ state: 'processing', needs_review: true })
  })

  it('我們標了退款、紅陽卻是未退款（refund_status=0）→ 需人工', () => {
    expect(refundCheckStep(item({ refund_status: '0' }), MARKED, NOW)).toMatchObject({ state: 'not_refunded', needs_review: true })
  })

  it.each([
    ['3', 'failed'],
    ['4', 'cancelled'],
  ] as const)('refund_status=%s → %s，錢沒退回，需人工', (status, state) => {
    expect(refundCheckStep(item({ refund_status: status }), MARKED, NOW)).toMatchObject({ state, needs_review: true })
  })

  it('不認得的退款狀態 → 需人工，不當成完成', () => {
    expect(refundCheckStep(item({ refund_status: '' }), MARKED, NOW)).toMatchObject({ state: 'unknown', needs_review: true })
  })

  it('紅陽回應裡沒有這張單：剛標記先等，超過 3 天才需人工', () => {
    expect(refundCheckStep(null, MARKED, new Date(MARKED.getTime() + DAY))).toMatchObject({ state: 'unknown', needs_review: false })
    expect(refundCheckStep(null, MARKED, new Date(MARKED.getTime() + 4 * DAY))).toMatchObject({ state: 'unknown', needs_review: true })
  })

  it('這一筆查詢失敗 → 明天再查，不標需人工', () => {
    expect(refundCheckStep(item({ code: '06', error_msg: 'td 錯誤' }), MARKED, NOW)).toMatchObject({ state: 'unknown', needs_review: false })
  })
})

describe('needsRefundCheck', () => {
  const confirmed = { sunpay_refund_check: { state: 'confirmed' } }

  it('還沒查過、或查過但還沒完成 → 要查', () => {
    expect(needsRefundCheck(null, MARKED, NOW)).toBe(true)
    expect(needsRefundCheck({ sunpay_refund_check: { state: 'processing' } }, MARKED, NOW)).toBe(true)
  })

  it('紅陽已確認完成 → 不再查', () => {
    expect(needsRefundCheck(confirmed, MARKED, NOW)).toBe(false)
  })

  it('標記超過 60 天 → 不再查', () => {
    expect(needsRefundCheck(null, MARKED, new Date(MARKED.getTime() + 61 * DAY))).toBe(false)
  })
})

describe('refundCheckBadge（帳務頁退款列）', () => {
  it('還沒查過', () => {
    expect(refundCheckBadge(null)).toEqual({ label: '紅陽：尚未確認（每天 08:00 對帳時查）', tone: 'wait' })
  })

  it('完成 / 處理中 / 需人工', () => {
    const at = (state: Parameters<typeof refundCheckStep>[0]) => refundCheckStep(state, MARKED, NOW)
    expect(refundCheckBadge(at(item({ refund_status: '2' })))).toEqual({ label: '紅陽：退款完成 ✅（10/24 確認）', tone: 'ok' })
    expect(refundCheckBadge(at(item({ refund_status: '1' })))).toEqual({ label: '紅陽：退款處理中 ⏳（10/24 查）', tone: 'wait' })
    expect(refundCheckBadge(at(item({ refund_status: '0' })))).toMatchObject({ tone: 'alert', label: expect.stringContaining('需人工') })
  })

  it('raw 裡沒有對帳結果 → null', () => {
    expect(refundCheckOf(null)).toBeNull()
    expect(refundCheckOf({ stage: 'request_pay_url' })).toBeNull()
  })
})
