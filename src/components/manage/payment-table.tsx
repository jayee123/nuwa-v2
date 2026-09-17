'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PLAN_FULL_NAME } from '@/lib/plans'

interface Payment {
  id: string
  plan_name: string | null
  amount: number
  status: string
  payment_uid: string | null
  paid_at: string | null
  users: { nickname: string | null; phone: string } | null
}

// plan_name 存的是代碼（premium）。舊資料存的是顯示名（Premium）——
// `?? v` 讓兩種都顯示得出來，正是 lib/plans 的 PLAN_FULL_NAME 設計用意。
// 歷史資料是帳務憑證、不改寫，所以這個 fallback 要長期留著。
const planName = (v: string | null) => PLAN_FULL_NAME[v ?? ''] ?? v ?? '-'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: '已付款', color: 'bg-brand-teal' },
  pending: { label: '待付款', color: 'bg-brand-orange' },
  failed: { label: '失敗', color: 'bg-destructive' },
  refunded: { label: '已退款', color: 'bg-fg-muted' },
}

export function PaymentTable({ payments }: { payments: Payment[] }) {
  // 欄位搜尋（Jeff 2026-09-10：後台所有列表都要能過濾）：
  // 用戶 / 手機 / 方案 / 狀態 / 訂單編號 / 金額，前端過濾（資料已整批在手上）
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = q
    ? payments.filter((p) =>
        [
          p.users?.nickname,
          p.users?.phone,
          planName(p.plan_name),
          STATUS_MAP[p.status]?.label ?? p.status,
          p.payment_uid,
          String(p.amount),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : payments

  function handleExport() {
    const headers = ['用戶', '手機', '方案', '金額', '狀態', '訂單編號', '付款時間']
    const rows = payments.map((p) => [
      p.users?.nickname ?? '未知',
      p.users?.phone ?? '',
      planName(p.plan_name),
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋用戶 / 手機 / 方案 / 狀態 / 訂單編號"
          className="w-72 rounded-lg border border-surface-secondary px-3 py-1.5 text-sm focus:border-brand-purple focus:outline-none"
        />
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
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-fg-muted">
                  {q ? '沒有符合搜尋的付款記錄' : '尚無付款記錄'}
                </td>
              </tr>
            )}
            {shown.map((p) => {
              const st = STATUS_MAP[p.status] ?? STATUS_MAP.pending
              return (
                <tr key={p.id} className="border-b border-surface-secondary last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-fg-primary">{p.users?.nickname ?? '未知'}</p>
                    <p className="text-xs text-fg-muted">{p.users?.phone}</p>
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{planName(p.plan_name)}</td>
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
