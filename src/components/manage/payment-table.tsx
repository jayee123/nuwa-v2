'use client'

import { Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Payment {
  id: string
  plan_name: string | null
  amount: number
  status: string
  payment_uid: string | null
  paid_at: string | null
  users: { nickname: string | null; phone: string } | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: '已付款', color: 'bg-brand-teal' },
  pending: { label: '待付款', color: 'bg-brand-orange' },
  failed: { label: '失敗', color: 'bg-destructive' },
  refunded: { label: '已退款', color: 'bg-fg-muted' },
}

export function PaymentTable({ payments }: { payments: Payment[] }) {
  function handleExport() {
    const headers = ['用戶', '手機', '方案', '金額', '狀態', '訂單編號', '付款時間']
    const rows = payments.map((p) => [
      p.users?.nickname ?? '未知',
      p.users?.phone ?? '',
      p.plan_name ?? '-',
      `NT$ ${p.amount.toLocaleString()}`,
      STATUS_MAP[p.status]?.label ?? p.status,
      p.payment_uid ?? '-',
      p.paid_at ? new Date(p.paid_at).toLocaleString('zh-TW') : '-',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary/50"
        >
          <Download className="size-3.5" />
          匯出 CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3">用戶</th>
              <th className="px-5 py-3">方案</th>
              <th className="px-5 py-3">金額</th>
              <th className="px-5 py-3">狀態</th>
              <th className="px-5 py-3">訂單編號</th>
              <th className="px-5 py-3">付款時間</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-fg-muted">
                  尚無付款記錄
                </td>
              </tr>
            )}
            {payments.map((p) => {
              const st = STATUS_MAP[p.status] ?? STATUS_MAP.pending
              return (
                <tr key={p.id} className="border-b border-surface-secondary last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-fg-primary">{p.users?.nickname ?? '未知'}</p>
                    <p className="text-xs text-fg-muted">{p.users?.phone}</p>
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{p.plan_name ?? '-'}</td>
                  <td className="px-5 py-4 font-medium text-fg-primary">
                    NT$ {p.amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`${st.color} text-xs text-white`}>{st.label}</Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-fg-muted">{p.payment_uid ?? '-'}</td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {p.paid_at ? new Date(p.paid_at).toLocaleString('zh-TW') : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
