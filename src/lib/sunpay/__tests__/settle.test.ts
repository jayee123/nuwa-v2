/**
 * 紅陽通知入帳：判斷（decideNotify）＋ 寫 DB（settleNotify）。
 * 寫 DB 的部分用記憶體裡的假 Supabase，只實作這裡用到的查詢寫法。
 */
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const recordGatewayTx = vi.fn(async () => {})
vi.mock('@/lib/gateway-ledger', () => ({ recordGatewayTx: (...args: unknown[]) => recordGatewayTx(...(args as [])) }))
vi.mock('@/lib/queries/plans', () => ({
  getPlanByCode: async (code: string) => ({ code, monthly_dialog_count: 100, monthly_charge: 5 }),
}))

import { decideNotify, paidAtOf, settleFreeUpgrade, settleNotify, type PendingPayment } from '../settle'
import { isV3Token, unpackToken } from '../token-store'

// ─── 假 Supabase ─────────────────────────────────────────

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

/** 讓指定資料表的 update 失敗（模擬 DB 暫時出錯） */
const failingUpdates = new Set<string>()
/** 讓指定資料表的 insert 失敗（模擬 DB 暫時出錯） */
const failingInserts = new Set<string>()

/** 正式庫的 idx_subscriptions_one_active：同會員同課程只能有一筆 active（migration 022 STEP 3） */
function violatesOneActive(table: string, rows: Row[], values: Row): boolean {
  if (table !== 'subscriptions' || values.status !== 'active') return false
  return rows.some((r) => r.status === 'active' && r.user_id === values.user_id && r.service_id === values.service_id)
}

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
  /** 只支援前綴比對（'v3:%'） */
  like(col: string, pattern: string) {
    const prefix = pattern.replace(/%$/, '')
    this.filters.push((r) => typeof r[col] === 'string' && (r[col] as string).startsWith(prefix))
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
      if (failingInserts.has(this.table)) return { data: null, error: { message: '模擬 DB 錯誤' } }
      if (violatesOneActive(this.table, rows, this.values)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint "idx_subscriptions_one_active"' } }
      }
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
  failingInserts.clear()
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

  it('使用者按過取消付款：成功通知以紅陽為準 → mark_paid；失敗通知 → ignore，維持已取消', () => {
    expect(decideNotify({ amount: 5, status: 'cancelled' }, successBody())).toEqual({ action: 'mark_paid', kind: 'first' })
    expect(decideNotify({ amount: 5, status: 'cancelled' }, { ...successBody(), pay_result: '11' })).toEqual({
      action: 'ignore',
      reason: '使用者已取消',
    })
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
    expect(unpackToken(pay.token_data as string, TOKEN_KEY)).toMatchObject({ saveCardToken: 'pay-1', tokenKey: 'TOKENKEY', tokenLife: '20281231' })

    expect(db.subscriptions.find((s) => s.id === 'sub-old')?.status).toBe('expired')
    const active = db.subscriptions.filter((s) => s.status === 'active')
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ user_id: 'user-1', service_id: 'svc-1', plan_name: 'advanced' })

    expect(db.users[0]).toMatchObject({ current_plan: 'advanced', dialog_limit: 100, next_plan: null })
    expect(recordGatewayTx).toHaveBeenCalledWith(admin, expect.objectContaining({ txType: 'bind_first_charge', success: true, gatewayNo: 'C1' }))
  })

  it('已有 active 訂閱（升級）：先收掉舊的再開新的，不撞唯一鍵（10/18 V3F261018001051XRQ75U）', async () => {
    const outcome = await settleNotify(fakeAdmin(db), firstPayment(), successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)
    expect(outcome).toBe('paid')
    expect(db.subscriptions.find((s) => s.id === 'sub-old')?.status).toBe('expired')
    expect(db.subscriptions.filter((s) => s.status === 'active')).toEqual([expect.objectContaining({ plan_name: 'advanced' })])
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ txType: 'bind_first_charge', success: true }))
  })

  it('新訂閱開失敗：舊訂閱改回 active、付款退回 pending、不入帳，補發時可以重來', async () => {
    failingInserts.add('subscriptions')
    await expect(
      settleNotify(fakeAdmin(db), firstPayment(), successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY),
    ).rejects.toThrow(/建立訂閱失敗/)
    expect(db.subscriptions.map((s) => [s.id, s.status])).toEqual([['sub-old', 'active']])
    expect(db.payments[0].status).toBe('pending')
    expect(recordGatewayTx).not.toHaveBeenCalled()

    failingInserts.clear()
    expect(await settleNotify(fakeAdmin(db), firstPayment(), successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)).toBe('paid')
    expect(db.subscriptions.filter((s) => s.status === 'active')).toHaveLength(1)
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

  it('成功但沒有 token_key、會員也沒有其他卡：照樣開通，帳上註記無法月扣、需人工', async () => {
    const body = { ...successBody(), token_key: undefined }
    expect(await settleNotify(fakeAdmin(db), firstPayment(), body, { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)).toBe('paid_needs_review')
    expect(db.payments[0].token_data).toBeUndefined()
    expect(recordGatewayTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ note: '未取得 token_key，這位會員沒有可用的卡，之後無法月扣，需人工請會員到期前重新結帳綁卡' }),
    )
  })

  it('對帳補入帳沒有 token_key，但會員之前付款綁過卡：不標需人工，註記月扣會用哪一筆', async () => {
    db.payments.push({ id: 'pay-0', user_id: 'user-1', status: 'paid', payment_uid: 'V3F261017234728QHAJ8W', token_data: 'v3:old', amount: 5, created_at: '2026-10-17T15:47:28.000Z' })
    const body = { ...successBody(), token_key: undefined }
    const outcome = await settleNotify(fakeAdmin(db), firstPayment(), body, { action: 'mark_paid', kind: 'first' }, TOKEN_KEY, 'reconcile')
    expect(outcome).toBe('paid')
    expect(recordGatewayTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ note: '這次沒有取得卡片代碼，月扣會用 V3F261017234728QHAJ8W 綁的卡' }),
    )
  })

  it('對帳補入帳沒有 token_key，但這筆先前通知時已存了卡片代碼（10/19 XRQ75U）：不標需人工、代碼保留', async () => {
    db.payments[0] = { ...db.payments[0], token_data: 'v3:kept', created_at: '2026-10-17T16:10:51.000Z' }
    const body = { ...successBody(), token_key: undefined }
    const outcome = await settleNotify(fakeAdmin(db), firstPayment(), body, { action: 'mark_paid', kind: 'first' }, TOKEN_KEY, 'reconcile')
    expect(outcome).toBe('paid')
    expect(db.payments[0].token_data).toBe('v3:kept')
    expect(recordGatewayTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ note: '這次沒有取得卡片代碼，月扣會用 V3F261012153045K7Q2MX 綁的卡' }),
    )
  })

  it('對帳查回來的成功（BIL-3）：照樣開通，但沒有 token_key → 需人工，帳務來源標 reconcile', async () => {
    const body = { ...successBody(), token_key: undefined }
    const outcome = await settleNotify(fakeAdmin(db), firstPayment(), body, { action: 'mark_paid', kind: 'first' }, TOKEN_KEY, 'reconcile')
    expect(outcome).toBe('paid_needs_review')
    expect(db.users[0].current_plan).toBe('advanced')
    expect(recordGatewayTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        note: expect.stringContaining('對帳補入帳'),
        raw: expect.objectContaining({ source: 'sunpay_v3_reconcile' }),
      }),
    )
  })

  it('對帳隔天才補入帳（PAY-24）：一個月從紅陽的付款時間起算，不是入帳那天', async () => {
    const body = { ...successBody(), token_key: undefined, pay_date: '20261018', pay_time: '00:17' }
    await settleNotify(fakeAdmin(db), firstPayment(), body, { action: 'mark_paid', kind: 'first' }, TOKEN_KEY, 'reconcile')

    const active = db.subscriptions.find((s) => s.status === 'active')
    expect(active).toMatchObject({ starts_at: '2026-10-17T16:17:00.000Z', ends_at: '2026-11-17T16:17:00.000Z' })
    expect(db.users[0].plan_deadline).toBe('2026-11-17T16:17:00.000Z')
    expect(db.payments[0].paid_at).toBe('2026-10-17T16:17:00.000Z')
  })

  it('對帳查回來的失敗：記失敗帳，訊息與來源標對帳', async () => {
    const body = { ...successBody(), pay_result: '11' }
    expect(await settleNotify(fakeAdmin(db), firstPayment(), body, { action: 'mark_failed', kind: 'first' }, TOKEN_KEY, 'reconcile')).toBe('failed')
    expect(recordGatewayTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ errmsg: expect.stringContaining('對帳查詢'), raw: expect.objectContaining({ source: 'sunpay_v3_reconcile' }) }),
    )
  })

  it('標過失敗的單收到成功通知：轉 paid、開通、帳上註記', async () => {
    db.payments[0].status = 'failed'
    const payment = { ...firstPayment(), status: 'failed' }
    expect(await settleNotify(fakeAdmin(db), payment, successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)).toBe('paid')
    expect(db.payments[0].status).toBe('paid')
    expect(db.users[0].current_plan).toBe('advanced')
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ note: expect.stringContaining('原本標記失敗') }))
  })

  it('按過取消付款的單收到成功通知：錢已扣 → 轉 paid、開通、帳上註記', async () => {
    db.payments[0].status = 'cancelled'
    const payment = { ...firstPayment(), status: 'cancelled' }
    expect(await settleNotify(fakeAdmin(db), payment, successBody(), { action: 'mark_paid', kind: 'first' }, TOKEN_KEY)).toBe('paid')
    expect(db.payments[0].status).toBe('paid')
    expect(db.users[0].current_plan).toBe('advanced')
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ note: expect.stringContaining('按了取消付款') }))
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

describe('settleNotify：升級補差價（PAY-20）', () => {
  const UPGRADE_TD = 'V3U261018001051XRQ75U'
  function upgradePayment(): PendingPayment {
    return { ...firstPayment(), id: 'pay-3', payment_uid: UPGRADE_TD, plan_name: 'premium', amount: 400 }
  }
  const upgradeBody = () => ({ ...successBody(UPGRADE_TD), mn: '400' })
  const decision = { action: 'mark_paid', kind: 'upgrade' } as const

  beforeEach(() => {
    db.payments.push({ ...upgradePayment() })
    db.subscriptions = [
      { id: 'sub-cur', user_id: 'user-1', service_id: 'svc-1', status: 'active', plan_name: 'advanced', starts_at: '2026-10-17T15:50:00.000Z', ends_at: '2026-11-17T15:50:00.000Z' },
    ]
    db.users[0].current_plan = 'advanced'
  })

  it('decideNotify：V3U 成功通知 → mark_paid upgrade', () => {
    expect(decideNotify({ amount: 400, status: 'pending' }, upgradeBody())).toEqual(decision)
  })

  it('成功：原訂閱改方案、開始日與到期日不動（額度週期不變），會員方案跟著改、到期日維持', async () => {
    expect(await settleNotify(fakeAdmin(db), upgradePayment(), upgradeBody(), decision, TOKEN_KEY)).toBe('paid')
    expect(db.subscriptions).toEqual([
      expect.objectContaining({ id: 'sub-cur', status: 'active', plan_name: 'premium', starts_at: '2026-10-17T15:50:00.000Z', ends_at: '2026-11-17T15:50:00.000Z' }),
    ])
    expect(db.users[0]).toMatchObject({ current_plan: 'premium', plan_deadline: '2026-11-17T15:50:00.000Z', next_plan: null })
  })

  it('成功：保存新的卡片代碼（之後月扣用這張），帳上記綁卡首付、註記升級差價', async () => {
    await settleNotify(fakeAdmin(db), upgradePayment(), upgradeBody(), decision, TOKEN_KEY)
    const pay = db.payments.find((p) => p.id === 'pay-3')!
    expect(pay.status).toBe('paid')
    expect(unpackToken(pay.token_data as string, TOKEN_KEY)).toMatchObject({ saveCardToken: 'pay-3', tokenKey: 'TOKENKEY' })
    expect(recordGatewayTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ txType: 'bind_first_charge', amount: 400, success: true, note: expect.stringContaining('升級差價：進階方案 → 旗艦方案') }),
    )
  })

  it('找不到進行中的訂閱（付款期間剛好到期）：錢已收 → 標 paid、不改方案、帳上註記需人工處理', async () => {
    db.subscriptions = []
    expect(await settleNotify(fakeAdmin(db), upgradePayment(), upgradeBody(), decision, TOKEN_KEY)).toBe('paid_needs_review')
    expect(db.payments.find((p) => p.id === 'pay-3')?.status).toBe('paid')
    expect(db.users[0].current_plan).toBe('advanced')
    expect(recordGatewayTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ note: expect.stringContaining('需人工處理') }))
  })

  it('改訂閱失敗：付款退回 pending、不入帳，紅陽補發時重來', async () => {
    failingUpdates.add('subscriptions')
    await expect(settleNotify(fakeAdmin(db), upgradePayment(), upgradeBody(), decision, TOKEN_KEY)).rejects.toThrow(/升級訂閱失敗/)
    expect(db.payments.find((p) => p.id === 'pay-3')?.status).toBe('pending')
    expect(db.users[0].current_plan).toBe('advanced')
    expect(recordGatewayTx).not.toHaveBeenCalled()
  })
})

describe('settleFreeUpgrade：定價相同的升級，不經紅陽不收錢（PAY-20）', () => {
  function freeUpgrade(): PendingPayment {
    return { ...firstPayment(), id: 'pay-4', payment_uid: 'V3U261018090000ABCDEF', plan_name: 'premium', amount: 0 }
  }

  beforeEach(() => {
    db.payments.push({ ...freeUpgrade() })
    db.subscriptions = [
      { id: 'sub-cur', user_id: 'user-1', service_id: 'svc-1', status: 'active', plan_name: 'advanced', starts_at: '2026-10-17T15:50:00.000Z', ends_at: '2026-11-17T15:50:00.000Z' },
    ]
    db.users[0].current_plan = 'advanced'
  })

  it('升方案、到期日不變，NT$0 付款紀錄標已付款、沒有卡片代碼，不記金流帳', async () => {
    expect(await settleFreeUpgrade(fakeAdmin(db), freeUpgrade())).toBe('paid')
    expect(db.subscriptions).toEqual([expect.objectContaining({ id: 'sub-cur', plan_name: 'premium', ends_at: '2026-11-17T15:50:00.000Z' })])
    expect(db.users[0]).toMatchObject({ current_plan: 'premium', plan_deadline: '2026-11-17T15:50:00.000Z' })
    const pay = db.payments.find((p) => p.id === 'pay-4')!
    expect(pay).toMatchObject({ status: 'paid', amount: 0 })
    expect(pay.paid_at).toBeTruthy()
    expect(pay.token_data).toBeUndefined() // 月扣照用原本那張卡
    expect(recordGatewayTx).not.toHaveBeenCalled()
  })

  it('找不到進行中的訂閱 → 紀錄標失敗、不改方案', async () => {
    db.subscriptions = []
    expect(await settleFreeUpgrade(fakeAdmin(db), freeUpgrade())).toBe('failed')
    expect(db.payments.find((p) => p.id === 'pay-4')?.status).toBe('failed')
    expect(db.users[0].current_plan).toBe('advanced')
  })

  it('改會員方案失敗 → 訂閱改回原方案、紀錄標失敗，不留半套', async () => {
    failingUpdates.add('users')
    expect(await settleFreeUpgrade(fakeAdmin(db), freeUpgrade())).toBe('failed')
    expect(db.subscriptions[0].plan_name).toBe('advanced')
    expect(db.payments.find((p) => p.id === 'pay-4')?.status).toBe('failed')
  })

  it('改訂閱失敗 → 紀錄標失敗、會員方案不動', async () => {
    failingUpdates.add('subscriptions')
    expect(await settleFreeUpgrade(fakeAdmin(db), freeUpgrade())).toBe('failed')
    expect(db.payments.find((p) => p.id === 'pay-4')?.status).toBe('failed')
    expect(db.users[0].current_plan).toBe('advanced')
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

describe('paidAtOf：紅陽付款時間（PAY-24）', () => {
  const now = new Date('2026-10-19T00:51:34.000Z')

  it('YYYYMMDD + HH:MM，台灣時間', () => {
    expect(paidAtOf({ pay_date: '20261018', pay_time: '00:17' }, now).toISOString()).toBe('2026-10-17T16:17:00.000Z')
  })

  it('也接受 HH:MM:SS', () => {
    expect(paidAtOf({ pay_date: '20261018', pay_time: '00:17:45' }, now).toISOString()).toBe('2026-10-17T16:17:45.000Z')
  })

  it.each<[{ pay_date?: string; pay_time?: string }, string]>([
    [{}, '沒帶'],
    [{ pay_date: '2026-10-18', pay_time: '00:17' }, '日期格式不對'],
    [{ pay_date: '20261018', pay_time: '0017' }, '時間格式不對'],
    [{ pay_date: '20261399', pay_time: '00:17' }, '不存在的日期'],
    [{ pay_date: '20261020', pay_time: '09:00' }, '比現在還晚'],
  ])('%o（%s）→ 用現在', (body) => {
    expect(paidAtOf(body, now)).toBe(now)
  })
})
