/**
 * 紅陽通知入帳：判斷（decideNotify）＋ 寫 DB（settleNotify）。
 * 寫 DB 的部分用記憶體裡的假 Supabase，只實作這裡用到的查詢寫法。
 */
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const recordGatewayTx = vi.fn(async () => {})
vi.mock('@/lib/esafe/ledger', () => ({ recordGatewayTx: (...args: unknown[]) => recordGatewayTx(...(args as [])) }))
vi.mock('@/lib/queries/plans', () => ({
  getPlanByCode: async (code: string) => ({ code, monthly_dialog_count: 100, monthly_charge: 5 }),
}))

import { decideNotify, settleNotify, type PendingPayment } from '../settle'
import { isV3Token, unpackToken } from '../token-store'

// ─── 假 Supabase ─────────────────────────────────────────

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

/** 讓指定資料表的 update 失敗（模擬 DB 暫時出錯） */
const failingUpdates = new Set<string>()

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number }> {
  private filters: Filter[] = []
  private returning = false
  private countOnly = false
  private orderBy: { col: string; ascending: boolean } | null = null
  private limitN: number | null = null
  private wantsOne = false

  constructor(
    private db: Record<string, Row[]>,
    private table: string,
    private mode: 'select' | 'update' | 'insert',
    private values: Row = {},
  ) {}

  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val)
    return this
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val)
    return this
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]))
    return this
  }
  gte(col: string, val: string) {
    this.filters.push((r) => String(r[col] ?? '') >= val)
    return this
  }
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== 'select') this.returning = true
    if (opts?.head) this.countOnly = true
    return this
  }
  order(col: string, opts: { ascending: boolean }) {
    this.orderBy = { col, ascending: opts.ascending }
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  maybeSingle() {
    this.wantsOne = true
    return this
  }
  single() {
    return this.maybeSingle()
  }

  private run(): { data: unknown; error: { message: string } | null; count?: number } {
    const rows = (this.db[this.table] ??= [])
    if (this.mode === 'insert') {
      const row = { id: `${this.table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...this.values }
      rows.push(row)
      return { data: this.wantsOne ? { id: row.id } : null, error: null }
    }
    if (this.mode === 'update' && failingUpdates.has(this.table)) return { data: null, error: { message: '模擬 DB 錯誤' } }
    let matched = rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.mode === 'update') {
      matched.forEach((r) => Object.assign(r, this.values))
      return { data: this.returning ? matched.map((r) => ({ id: r.id })) : null, error: null }
    }
    if (this.countOnly) return { data: null, error: null, count: matched.length }
    if (this.orderBy) {
      const { col, ascending } = this.orderBy
      matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (ascending ? 1 : -1))
    }
    if (this.limitN !== null) matched = matched.slice(0, this.limitN)
    return { data: this.wantsOne ? (matched[0] ?? null) : matched, error: null }
  }

  then<T1, T2>(
    resolve?: (v: { data: unknown; error: { message: string } | null; count?: number }) => T1 | PromiseLike<T1>,
    reject?: (e: unknown) => T2 | PromiseLike<T2>,
  ) {
    return Promise.resolve(this.run()).then(resolve, reject)
  }
}

function fakeAdmin(db: Record<string, Row[]>): SupabaseClient {
  return {
    from: (table: string) => ({
      select: (cols?: string, opts?: { count?: string; head?: boolean }) => new FakeQuery(db, table, 'select').select(cols, opts),
      update: (values: Row) => new FakeQuery(db, table, 'update', values),
      insert: (values: Row) => new FakeQuery(db, table, 'insert', values),
    }),
  } as unknown as SupabaseClient
}

// ─── 資料 ────────────────────────────────────────────────

const TOKEN_KEY = randomBytes(32).toString('hex')

function firstPayment(): PendingPayment {
  return { id: 'pay-1', user_id: 'user-1', service_id: 'svc-1', amount: 5, plan_name: 'advanced', status: 'pending', payment_uid: 'V3F261012153045K7Q2MX' }
}

function successBody(td = 'V3F261012153045K7Q2MX') {
  return { td, mn: '5', pay_result: '10', trade_no: 'C1', token_key: 'TOKENKEY', token_life: '20281231' }
}

let db: Record<string, Row[]>

beforeEach(() => {
  recordGatewayTx.mockClear()
  failingUpdates.clear()
  db = {
    payments: [{ ...firstPayment() }],
    subscriptions: [{ id: 'sub-old', user_id: 'user-1', service_id: 'svc-1', status: 'active', ends_at: '2026-10-01T00:00:00.000Z' }],
    users: [{ id: 'user-1', current_plan: 'free', next_plan: 'basic' }],
  }
})

// ─── decideNotify ────────────────────────────────────────

describe('decideNotify', () => {
  const pending = { amount: 5, status: 'pending' }

  it('成功通知 → mark_paid，失敗通知 → mark_failed', () => {
    expect(decideNotify(pending, successBody())).toEqual({ action: 'mark_paid', kind: 'first' })
    expect(decideNotify(pending, { ...successBody('V3R2610121530451234AB'), pay_result: '11' })).toEqual({ action: 'mark_failed', kind: 'recurring' })
  })

  it('S-PAY-02 已處理過（paid／refunded）→ ignore', () => {
    expect(decideNotify({ amount: 5, status: 'paid' }, successBody()).action).toBe('ignore')
    expect(decideNotify({ amount: 5, status: 'refunded' }, successBody()).action).toBe('ignore')
  })

  it('標過失敗的單：收到成功通知以紅陽為準 → mark_paid；再收到失敗通知 → ignore', () => {
    expect(decideNotify({ amount: 5, status: 'failed' }, successBody()).action).toBe('mark_paid')
    expect(decideNotify({ amount: 5, status: 'failed' }, { ...successBody(), pay_result: '11' }).action).toBe('ignore')
  })

  it('金額不符 → reject（先不動帳，紅陽會補發）', () => {
    expect(decideNotify(pending, { ...successBody(), mn: '1' }).action).toBe('reject')
  })

  it('沒有訂單編號 → reject', () => {
    expect(decideNotify(pending, { pay_result: '10' }).action).toBe('reject')
  })

  it('舊 esafe 訂單編號、查無訂單、pay_result=12（已建立）→ ignore', () => {
    expect(decideNotify(pending, { ...successBody('V2261012'), mn: '5' }).action).toBe('ignore')
    expect(decideNotify(null, successBody()).action).toBe('ignore')
    expect(decideNotify(pending, { ...successBody(), pay_result: '12' }).action).toBe('ignore')
  })
})

// ─── settleNotify ────────────────────────────────────────

describe('settleNotify：首次付款', () => {
  it('S-PAY-01 成功：付款 paid、token 加密保存、收掉舊訂閱開新的、會員方案更新、入帳', async () => {
    const admin = fakeAdmin(db)
    const outcome = await settleNotify(admin, firstPayment(), successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)

    expect(outcome).toBe('paid')
    const pay = db.payments[0]
    expect(pay.status).toBe('paid')
    expect(isV3Token(pay.token_data as string)).toBe(true)
    expect(unpackToken(pay.token_data as string, TOKEN_KEY)).toMatchObject({ saveCardToken: 'user-1', tokenKey: 'TOKENKEY', tokenLife: '20281231' })

    expect(db.subscriptions.find((s) => s.id === 'sub-old')?.status).toBe('expired')
    const active = db.subscriptions.filter((s) => s.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ user_id: 'user-1', service_id: 'svc-1', plan_name: 'advanced' })

    expect(db.users[0]).toMatchObject({ current_plan: 'advanced', dialog_limit: 100, next_plan: null })
    expect(recordGatewayTx).toHaveBeenCalledWith(admin, expect.objectContaining({ txType: 'bind_first_charge', success: true, gatewayNo: 'C1' }))
  })

  it('帳務原始資料不含 token_key', async () => {
    await settleNotify(fakeAdmin(db), firstPayment(), successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)
    const call = recordGatewayTx.mock.calls[0] as unknown as [unknown, { raw: Record<string, unknown> }]
    expect(JSON.stringify(call[1].raw)).not.toContain('TOKENKEY')
  })

  it('S-PAY-02 同一筆通知來兩次：第二次 already_settled，只開一筆訂閱、只入一次帳', async () => {
    const admin = fakeAdmin(db)
    const decision = { action: 'mark_paid', kind: 'first' } as const
    const results = await Promise.all([
      settleNotify(admin, firstPayment(), successBody(), decision, TOKEN_KEY),
      settleNotify(admin, firstPayment(), successBody(), decision, TOKEN_KEY),
    ])
    expect(results.sort()).toEqual(['already_settled', 'paid'])
    expect(db.subscriptions.filter((s) => s.status === 'active')).toHaveLength(1)
    expect(recordGatewayTx).toHaveBeenCalledTimes(1)
  })

  it('成功但沒有 token_key：照樣開通，帳上註記之後無法月扣', async () => {
    const body = { ...successBody(), token_key: undefined }
    expect(await settleNotify(fakeAdmin(db), firstPayment(), body, { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)).toBe('paid')
    expect(db.payments[0].token_data).toBeUndefined()
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ note: '未取得 token_key，之後無法月扣' }))
  })

  it('標過失敗的單收到成功通知：轉 paid、開通、帳上註記', async () => {
    db.payments[0].status = 'failed'
    const payment = { ...firstPayment(), status: 'failed' }
    expect(await settleNotify(fakeAdmin(db), payment, successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)).toBe('paid')
    expect(db.payments[0].status).toBe('paid')
    expect(db.users[0].current_plan).toBe('advanced')
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ note: expect.stringContaining('原本標記失敗') }))
  })

  it('S-PAY-04 失敗：付款 failed、記失敗帳、不動訂閱與方案', async () => {
    const outcome = await settleNotify(fakeAdmin(db), firstPayment(), { ...successBody(), pay_result: '11' }, { action: 'mark_failed', kind: 'first' }, TOKEN_KEY)
    expect(outcome).toBe('failed')
    expect(db.payments[0].status).toBe('failed')
    expect(db.subscriptions.filter((s) => s.status === 'active').map((s) => s.id)).toEqual(['sub-old'])
    expect(db.users[0].current_plan).toBe('free')
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: false }))
  })
})

describe('settleNotify：月扣', () => {
  function recurringPayment(): PendingPayment {
    return { ...firstPayment(), id: 'pay-2', payment_uid: 'V3R2611011200001234AB', plan_name: 'basic' }
  }

  it('S-PAY-06 成功：從原到期日延一個月、套用排定的方案、入帳 recurring', async () => {
    db.payments.push({ ...recurringPayment() })
    const outcome = await settleNotify(fakeAdmin(db), recurringPayment(), successBody('V3R2611011200001234AB'), { action: 'mark_paid', kind: 'recurring' }, TOKEN_KEY)

    expect(outcome).toBe('paid')
    const sub = db.subscriptions.find((s) => s.id === 'sub-old')
    expect(sub).toMatchObject({ status: 'active', plan_name: 'basic' })
    expect(new Date(String(sub?.ends_at)).getMonth()).toBe(10) // 10/1 → 11/1
    expect(db.users[0]).toMatchObject({ current_plan: 'basic', next_plan: null })
    expect(db.payments.find((p) => p.id === 'pay-2')?.token_data).toBeUndefined() // 月扣不覆寫卡片代碼
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ txType: 'recurring', success: true }))
  })

  it('找不到 active 訂閱（送出後被取消）：錢已收 → 標 paid、帳上註記需人工處理，不讓通知一直失敗', async () => {
    db.payments.push({ ...recurringPayment() })
    db.subscriptions = []
    const outcome = await settleNotify(fakeAdmin(db), recurringPayment(), successBody('V3R2611011200001234AB'), { action: 'mark_paid', kind: 'recurring' }, TOKEN_KEY)
    expect(outcome).toBe('paid_needs_review')
    expect(db.payments.find((p) => p.id === 'pay-2')?.status).toBe('paid')
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ success: true, note: expect.stringContaining('需人工處理') }))
  })

  it('展延訂閱失敗：付款退回 pending；紅陽補發重做後只延一個月（不會多給）', async () => {
    db.payments.push({ ...recurringPayment() })
    const body = successBody('V3R2611011200001234AB')
    const decision = { action: 'mark_paid', kind: 'recurring' } as const

    failingUpdates.add('subscriptions')
    await expect(settleNotify(fakeAdmin(db), recurringPayment(), body, decision, TOKEN_KEY)).rejects.toThrow(/展延訂閱失敗/)
    expect(db.payments.find((p) => p.id === 'pay-2')?.status).toBe('pending')
    expect(recordGatewayTx).not.toHaveBeenCalled()

    failingUpdates.clear()
    expect(await settleNotify(fakeAdmin(db), recurringPayment(), body, decision, TOKEN_KEY)).toBe('paid')
    expect(new Date(String(db.subscriptions[0].ends_at)).getMonth()).toBe(10) // 10/1 → 11/1，不是 12/1
    expect(new Date(String(db.users[0].plan_deadline)).getMonth()).toBe(10)
  })

  it('月扣失敗通知：近 3 天失敗達 2 次就收掉訂閱、降回 free', async () => {
    db.payments.push(
      { ...recurringPayment(), created_at: new Date().toISOString() },
      { id: 'pay-old-fail', user_id: 'user-1', status: 'failed', created_at: new Date().toISOString() },
    )
    db.users[0].current_plan = 'basic'
    const outcome = await settleNotify(fakeAdmin(db), recurringPayment(), { ...successBody('V3R2611011200001234AB'), pay_result: '11' }, { action: 'mark_failed', kind: 'recurring' }, TOKEN_KEY)
    expect(outcome).toBe('failed')
    expect(db.subscriptions[0].status).toBe('expired')
    expect(db.users[0].current_plan).toBe('free')
  })

  it('月扣失敗一次：不降級', async () => {
    db.payments.push({ ...recurringPayment(), created_at: new Date().toISOString() })
    db.users[0].current_plan = 'basic'
    await settleNotify(fakeAdmin(db), recurringPayment(), { ...successBody('V3R2611011200001234AB'), pay_result: '11' }, { action: 'mark_failed', kind: 'recurring' }, TOKEN_KEY)
    expect(db.subscriptions[0].status).toBe('active')
    expect(db.users[0].current_plan).toBe('basic')
  })
})
