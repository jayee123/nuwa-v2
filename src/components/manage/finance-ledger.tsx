'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 金流帳務明細（A 案）：與紅陽往來的原始交易帳 + 標記退款。
// 「標記退款」不向紅陽發起任何請求 —— 先在紅陽商家後台人工退款，再回這裡標記。

export interface LedgerTableRow {
  id: string
  timeLabel: string
  typeLabel: string
  txType: string
  amount: number
  userLabel: string
  orderNo: string
  gatewayNo: string
  errcode: string
  success: boolean
  note: string
  /** 可標記退款的 payments.id（成功收款且該筆 payment 仍為 paid 時才有值） */
  refundablePaymentId: string | null
}

export function FinanceLedger({ rows }: { rows: LedgerTableRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const q = search.trim().toLowerCase()
  const shown = q
    ? rows.filter((r) =>
        [r.userLabel, r.typeLabel, r.orderNo, r.gatewayNo, r.errcode, String(r.amount), r.note]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : rows

  async function markRefund(paymentId: string) {
    const note = window.prompt(
      '確認已在「紅陽商家後台」完成退款了嗎？\n這裡只做帳務標記，不會向紅陽發起退款。\n\n可填退款原因（可留空）：',
    )
    if (note === null) return // 取消
    setBusyId(paymentId)
    setError(null)
    try {
      const res = await fetch('/api/manage/finance/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, note }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '標記失敗')
        return
      }
      router.refresh()
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋用戶 / 類型 / 單號 / 金額 / 錯誤碼"
          className="w-72 rounded-lg border border-surface-secondary px-3 py-1.5 text-sm focus:border-brand-purple focus:outline-none"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-surface-secondary bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-4 py-3">時間</th>
              <th className="px-4 py-3">類型</th>
              <th className="px-4 py-3">用戶</th>
              <th className="px-4 py-3 text-right">金額</th>
              <th className="px-4 py-3">我方單號 / 紅陽交易號</th>
              <th className="px-4 py-3">結果</th>
              <th className="px-4 py-3 text-right">動作</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-muted">
                  {q ? '沒有符合搜尋的交易' : '還沒有帳務紀錄（統計自本功能上線起算，歷史資料不回填）'}
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className="border-b border-surface-secondary/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-muted">{r.timeLabel}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.txType === 'refund'
                          ? 'bg-red-50 text-red-600'
                          : r.txType === 'recurring'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-brand-purple/10 text-brand-purple'
                      }`}
                    >
                      {r.typeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-primary">{r.userLabel}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${r.amount < 0 ? 'text-red-600' : 'text-fg-primary'}`}>
                    {r.amount < 0 ? '−' : ''}NT$ {Math.abs(r.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-secondary">
                    {r.orderNo || '-'}
                    {r.gatewayNo && <div className="text-fg-muted">{r.gatewayNo}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.success ? (
                      <span className="text-green-700">成功{r.errcode && r.errcode !== '00' && r.errcode !== '00000' ? `（errcode ${r.errcode}⚠️）` : ''}</span>
                    ) : (
                      <span className="text-red-600">失敗 {r.errcode || ''}</span>
                    )}
                    {r.note && <div className="text-fg-muted">{r.note}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.refundablePaymentId ? (
                      <button
                        onClick={() => markRefund(r.refundablePaymentId!)}
                        disabled={busyId === r.refundablePaymentId}
                        title="僅做帳務標記，不會向紅陽發起退款"
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyId === r.refundablePaymentId ? '標記中…' : '標記退款'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
