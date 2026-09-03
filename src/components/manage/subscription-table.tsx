'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Subscription {
  id: string
  plan_name: string
  status: string
  starts_at: string
  ends_at: string
  created_at: string
  users: { nickname: string | null; phone: string } | null
  services: { name: string } | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '有效', color: 'bg-brand-teal' },
  expired: { label: '已過期', color: 'bg-fg-muted' },
  cancelled: { label: '已取消', color: 'bg-destructive' },
}

const PLAN_MAP: Record<string, string> = {
  basic: '基本版',
  advanced: '進階版',
  premium: '旗艦版',
}

export function SubscriptionTable({ subscriptions }: { subscriptions: Subscription[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all')
  const [search, setSearch] = useState('')

  const filtered = subscriptions.filter((s) => {
    if (filter === 'active' && s.status !== 'active') return false
    if (filter === 'expired' && s.status !== 'expired') return false
    if (search) {
      const q = search.toLowerCase()
      const name = (s.users?.nickname ?? '').toLowerCase()
      const phone = (s.users?.phone ?? '').toLowerCase()
      const service = (s.services?.name ?? '').toLowerCase()
      if (!name.includes(q) && !phone.includes(q) && !service.includes(q)) return false
    }
    return true
  })

  function handleExport() {
    const headers = ['用戶', '手機', '服務', '方案', '狀態', '開始日期', '到期日期', '建立時間']
    const rows = filtered.map((s) => [
      s.users?.nickname ?? '未知',
      s.users?.phone ?? '',
      s.services?.name ?? '-',
      PLAN_MAP[s.plan_name] ?? s.plan_name,
      STATUS_MAP[s.status]?.label ?? s.status,
      s.starts_at ? new Date(s.starts_at).toLocaleDateString('zh-TW') : '-',
      s.ends_at ? new Date(s.ends_at).toLocaleDateString('zh-TW') : '-',
      s.created_at ? new Date(s.created_at).toLocaleString('zh-TW') : '-',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscriptions_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="mt-6">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="搜尋用戶、手機、服務…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-primary outline-none focus:border-brand-purple"
        />
        <div className="flex gap-1">
          {(['all', 'active', 'expired'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                filter === f
                  ? 'bg-brand-purple text-white'
                  : 'border border-surface-secondary text-fg-secondary hover:bg-surface-secondary/50'
              }`}
            >
              {f === 'all' ? '全部' : f === 'active' ? '有效' : '已過期'}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-fg-muted">共 {filtered.length} 筆</div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary/50"
        >
          <Download className="size-3.5" />
          匯出 CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3">用戶</th>
              <th className="px-5 py-3">服務</th>
              <th className="px-5 py-3">方案</th>
              <th className="px-5 py-3">狀態</th>
              <th className="px-5 py-3">開始日期</th>
              <th className="px-5 py-3">到期日期</th>
              <th className="px-5 py-3">建立時間</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-fg-muted">
                  尚無訂閱記錄
                </td>
              </tr>
            )}
            {filtered.map((s) => {
              const st = STATUS_MAP[s.status] ?? { label: s.status, color: 'bg-fg-muted' }
              const isExpired = s.ends_at && new Date(s.ends_at) < new Date()
              return (
                <tr key={s.id} className="border-b border-surface-secondary last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-fg-primary">{s.users?.nickname ?? '未知'}</p>
                    <p className="text-xs text-fg-muted">{s.users?.phone}</p>
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{s.services?.name ?? '-'}</td>
                  <td className="px-5 py-4 text-fg-secondary">{PLAN_MAP[s.plan_name] ?? s.plan_name}</td>
                  <td className="px-5 py-4">
                    <Badge className={`${isExpired && s.status === 'active' ? 'bg-brand-orange' : st.color} text-xs text-white`}>
                      {isExpired && s.status === 'active' ? '即將到期' : st.label}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {s.starts_at ? new Date(s.starts_at).toLocaleDateString('zh-TW') : '-'}
                  </td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {s.ends_at ? new Date(s.ends_at).toLocaleDateString('zh-TW') : '-'}
                  </td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {s.created_at ? new Date(s.created_at).toLocaleString('zh-TW') : '-'}
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
