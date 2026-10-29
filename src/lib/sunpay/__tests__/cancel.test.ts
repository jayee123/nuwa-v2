/**
 * 結帳頁「取消付款」（Steve 10/17 P-N2）：按下去要把待付款標成已取消，不能只是離開頁面。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { cancelPendingPayment } from '../cancel'

interface Row {
  id: string
  user_id: string
  status: string
  payment_uid: string
}

/** 假 Supabase：只實作 cancel.ts 用到的寫法 */
function fakeAdmin(rows: Row[]) {
  const from = () => {
    const filters: Array<(r: Row) => boolean> = []
    let pending: Partial<Row> | null = null
    const matched = () => rows.filter((r) => filters.every((f) => f(r)))
    const q = {
      select: () => {
        if (pending) {
          const hit = matched()
          hit.forEach((r) => Object.assign(r, pending))
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
        }
        return q
      },
      eq: (col: keyof Row, val: string) => {
        filters.push((r) => r[col] === val)
        return q
      },
      maybeSingle: async () => ({ data: matched()[0] ? { ...matched()[0] } : null, error: null }),
      update: (values: Partial<Row>) => {
        pending = values
        return q
      },
    }
    return q
  }
  return { from } as unknown as SupabaseClient
}

const FIRST = 'V3F261017231909T66T84'

function row(overrides: Partial<Row> = {}): Row {
  return { id: 'pay-1', user_id: 'user-1', status: 'pending', payment_uid: FIRST, ...overrides }
}

describe('cancelPendingPayment', () => {
  it('自己的待付款首次付款 → 標成已取消', async () => {
    const rows = [row()]
    expect(await cancelPendingPayment(fakeAdmin(rows), 'user-1', 'pay-1')).toEqual({ ok: true, status: 'cancelled', paymentUid: FIRST })
    expect(rows[0].status).toBe('cancelled')
  })

  it('通知比按鈕先到、已經付款成功 → 不動，回 paid 讓前端跳成功頁', async () => {
    const rows = [row({ status: 'paid' })]
    expect(await cancelPendingPayment(fakeAdmin(rows), 'user-1', 'pay-1')).toEqual({ ok: true, status: 'paid', paymentUid: FIRST })
    expect(rows[0].status).toBe('paid')
  })

  it('已經標失敗 → 不動，維持失敗', async () => {
    const rows = [row({ status: 'failed' })]
    expect(await cancelPendingPayment(fakeAdmin(rows), 'user-1', 'pay-1')).toMatchObject({ ok: true, status: 'failed' })
    expect(rows[0].status).toBe('failed')
  })

  it('別人的付款 → 404，不動', async () => {
    const rows = [row({ user_id: 'user-2' })]
    expect(await cancelPendingPayment(fakeAdmin(rows), 'user-1', 'pay-1')).toMatchObject({ ok: false, httpStatus: 404 })
    expect(rows[0].status).toBe('pending')
  })

  it('升級單（V3U）→ 一樣可以取消', async () => {
    const rows = [row({ payment_uid: 'V3U261018001051XRQ75U' })]
    expect(await cancelPendingPayment(fakeAdmin(rows), 'user-1', 'pay-1')).toMatchObject({ ok: true, status: 'cancelled' })
  })

  it('月扣單（V3R）→ 400，不能從前台取消', async () => {
    const rows = [row({ payment_uid: 'V3R261017090000ABCDEF' })]
    expect(await cancelPendingPayment(fakeAdmin(rows), 'user-1', 'pay-1')).toMatchObject({ ok: false, httpStatus: 400 })
    expect(rows[0].status).toBe('pending')
  })
})
