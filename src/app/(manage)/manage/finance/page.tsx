import type { Metadata } from 'next'
import { getAdminCtx } from '@/lib/app-access'
import { monthlyRevenue, type LedgerRow } from '@/lib/finance-stats'
import { FinanceLedger, type LedgerTableRow } from '@/components/manage/finance-ledger'

export const metadata: Metadata = { title: '金流帳務 — 羽升管理後台' }
export const dynamic = 'force-dynamic'

// 金流帳務（Jeff A 案，migration 027）：
// 與紅陽往來的原始交易帳（gateway_transactions）＋ 實收統計 ＋ 標記退款。
// payments 是「用戶視角」，這頁是「金流商視角」—— 月底的數字要跟紅陽對得起來。

const TYPE_LABEL: Record<string, string> = {
  bind_first_charge: '綁卡首付',
  recurring: '月扣',
  refund: '退款',
}

interface RawTx {
  id: string
  user_id: string | null
  payment_id: string | null
  tx_type: string
  amount: number
  order_no: string | null
  gateway_no: string | null
  errcode: string | null
  success: boolean
  note: string | null
  created_at: string
}

export default async function ManageFinancePage() {
  const ctx = await getAdminCtx()
  if (!ctx) return <div className="p-6 text-red-500">無後台權限</div>

  const { data, error } = await ctx.admin
    .from('gateway_transactions')
    .select('id, user_id, payment_id, tx_type, amount, order_no, gateway_no, errcode, success, note, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return (
      <div>
        <h1 className="font-heading text-2xl font-bold text-fg-primary">金流帳務</h1>
        <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-600">
          讀取失敗：{error.message}（migration 027 跑了嗎？）
        </p>
      </div>
    )
  }

  const txs = (data ?? []) as RawTx[]

  // 用戶顯示名（一次撈齊）
  const userIds = [...new Set(txs.map((t) => t.user_id).filter(Boolean))] as string[]
  const userMap = new Map<string, string>()
  if (userIds.length) {
    const { data: users } = await ctx.admin.from('users').select('id, nickname, email').in('id', userIds)
    for (const u of users ?? []) userMap.set(u.id, u.nickname ?? u.email ?? u.id.slice(0, 8))
  }

  // 「可標記退款」= 成功收款、對應 payment 目前仍是 paid
  const paymentIds = [...new Set(txs.filter((t) => t.success && t.tx_type !== 'refund').map((t) => t.payment_id).filter(Boolean))] as string[]
  const paidSet = new Set<string>()
  if (paymentIds.length) {
    const { data: pays } = await ctx.admin.from('payments').select('id, status').in('id', paymentIds)
    for (const p of pays ?? []) if (p.status === 'paid') paidSet.add(p.id)
  }

  const stats = monthlyRevenue(txs as unknown as LedgerRow[])
  const rows: LedgerTableRow[] = txs.map((t) => ({
    id: t.id,
    timeLabel: new Date(t.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }),
    typeLabel: TYPE_LABEL[t.tx_type] ?? t.tx_type,
    txType: t.tx_type,
    amount: t.amount,
    userLabel: t.user_id ? (userMap.get(t.user_id) ?? '—') : '—',
    orderNo: t.order_no ?? '',
    gatewayNo: t.gateway_no ?? '',
    errcode: t.errcode ?? '',
    success: t.success,
    note: t.note ?? '',
    refundablePaymentId:
      t.success && t.tx_type !== 'refund' && t.payment_id && paidSet.has(t.payment_id) ? t.payment_id : null,
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">金流帳務</h1>
      <p className="mt-2 text-sm text-fg-secondary">
        與紅陽的原始交易帳與實收統計（自 2026-09-10 起算，歷史不回填）。
        退款請先在紅陽商家後台人工執行，再回這裡「標記退款」讓帳跟上。
      </p>

      {/* 月統計 */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.length === 0 ? (
          <div className="rounded-xl bg-gray-50 px-5 py-4 text-sm text-fg-muted sm:col-span-2">尚無統計資料</div>
        ) : (
          stats.slice(0, 4).map((m) => (
            <div key={m.month} className="rounded-xl border border-surface-secondary bg-white p-4">
              <div className="text-xs text-fg-muted">{m.month}</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-fg-primary">
                NT$ {m.net.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-fg-secondary">
                收 {m.charged.toLocaleString()} − 退 {m.refunded.toLocaleString()}
                {m.failedCount > 0 && <span className="ml-1 text-red-500">・失敗 {m.failedCount} 筆</span>}
              </div>
            </div>
          ))
        )}
      </div>

      <FinanceLedger rows={rows} />
    </div>
  )
}
