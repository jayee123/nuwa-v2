'use client'

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'

interface UsageRecord {
  id: string
  tokens_used: number
  /** 成本（TWD）。私版回寫時帶入；公版自身呼叫目前為 null */
  cost_twd: number | null
  date: string
  created_at: string
  user_name: string
  user_phone: string
  /** 用量來自哪一支 App（跨 App 歸戶用）；公版自身為「NUWA 平台」 */
  app_name: string
  service_name: string
  teacher_name: string
}

type GroupBy = 'date' | 'user' | 'app' | 'service'

export function AiUsageDashboard({ records }: { records: UsageRecord[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('date')
  const [search, setSearch] = useState('')

  // Filter by search
  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.user_name.toLowerCase().includes(q) ||
      r.user_phone.includes(q) ||
      r.app_name.toLowerCase().includes(q) ||
      r.service_name.toLowerCase().includes(q) ||
      r.teacher_name.toLowerCase().includes(q)
    )
  })

  // Summary stats
  const totalTokens = filtered.reduce((sum, r) => sum + r.tokens_used, 0)
  const totalCost = filtered.reduce((sum, r) => sum + (r.cost_twd ?? 0), 0)
  const uniqueUsers = new Set(filtered.map((r) => r.user_phone)).size
  const uniqueApps = new Set(filtered.map((r) => r.app_name)).size

  // Grouped data
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { label: string; sub: string; tokens: number; cost: number; count: number; byApp: Map<string, number> }
    >()
    for (const r of filtered) {
      let key: string
      let label: string
      let sub: string
      if (groupBy === 'date') {
        key = r.date
        label = r.date
        sub = ''
      } else if (groupBy === 'user') {
        key = r.user_phone
        label = r.user_name
        sub = r.user_phone
      } else if (groupBy === 'app') {
        key = r.app_name
        label = r.app_name
        sub = ''
      } else {
        key = r.service_name
        label = r.service_name
        sub = ''
      }
      const existing = map.get(key)
      if (existing) {
        existing.tokens += r.tokens_used
        existing.cost += r.cost_twd ?? 0
        existing.count += 1
        existing.byApp.set(r.app_name, (existing.byApp.get(r.app_name) ?? 0) + r.tokens_used)
      } else {
        map.set(key, {
          label,
          sub,
          tokens: r.tokens_used,
          cost: r.cost_twd ?? 0,
          count: 1,
          byApp: new Map([[r.app_name, r.tokens_used]]),
        })
      }
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens)
  }, [filtered, groupBy])

  // Simple bar chart - top 14 entries
  const chartData = grouped.slice(0, 14)
  const maxTokens = Math.max(...chartData.map((d) => d.tokens), 1)

  function handleExport() {
    const headers = ['用戶', '手機', 'App', '服務', '教師', 'Token 數', '成本(TWD)', '日期']
    const rows = filtered.map((r) => [
      r.user_name,
      r.user_phone,
      r.app_name,
      r.service_name,
      r.teacher_name,
      r.tokens_used.toString(),
      (r.cost_twd ?? 0).toFixed(2),
      r.date,
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai_token_usage_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="text-xs text-fg-muted">總 Token 用量</p>
          <p className="mt-1 text-2xl font-bold text-fg-primary">{totalTokens.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="text-xs text-fg-muted">使用人數</p>
          <p className="mt-1 text-2xl font-bold text-fg-primary">{uniqueUsers}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="text-xs text-fg-muted">估算成本</p>
          <p className="mt-1 text-2xl font-bold text-fg-primary">
            NT$ {totalCost.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="text-xs text-fg-muted">涵蓋 App</p>
          <p className="mt-1 text-2xl font-bold text-fg-primary">{uniqueApps}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="搜尋會員、App、服務、教師…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-primary outline-none focus:border-brand-purple"
        />
        <div className="flex gap-1">
          {([
            ['date', '按日期'],
            ['user', '按會員（歸戶）'],
            ['app', '按 App'],
            ['service', '按服務'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setGroupBy(key)}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                groupBy === key
                  ? 'bg-brand-purple text-white'
                  : 'border border-surface-secondary text-fg-secondary hover:bg-surface-secondary/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary/50"
        >
          <Download className="size-3.5" />
          匯出 CSV
        </button>
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="mb-4 text-xs font-medium text-fg-muted">
            Token 用量排行（{groupBy === 'date' ? '按日期' : groupBy === 'user' ? '按用戶' : '按服務'}）
          </p>
          <div className="space-y-2">
            {chartData.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-fg-secondary" title={d.label}>
                  {d.label}
                  {groupBy === 'user' && d.byApp.size > 0 && (
                    <span className="block truncate text-[10px] text-fg-muted">
                      {[...d.byApp.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .map(([app, n]) => `${app} ${n.toLocaleString()}`)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <div className="relative h-6 flex-1 overflow-hidden rounded bg-surface-secondary">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-brand-purple/70 transition-all"
                    style={{ width: `${(d.tokens / maxTokens) * 100}%` }}
                  />
                  <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium text-fg-primary">
                    {d.tokens.toLocaleString()}
                  </span>
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-fg-muted">
                  {d.count} 筆
                  {d.cost > 0 && <span className="ml-1">· NT${d.cost.toFixed(1)}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail table */}
      <div className="overflow-x-auto rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3">會員</th>
              <th className="px-5 py-3">App</th>
              <th className="px-5 py-3">服務</th>
              <th className="px-5 py-3">教師</th>
              <th className="px-5 py-3">Token 數</th>
              <th className="px-5 py-3">成本</th>
              <th className="px-5 py-3">日期</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-fg-muted">
                  尚無使用紀錄
                </td>
              </tr>
            )}
            {filtered.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-b border-surface-secondary last:border-0">
                <td className="px-5 py-4">
                  <p className="font-medium text-fg-primary">{r.user_name}</p>
                  <p className="text-xs text-fg-muted">{r.user_phone}</p>
                </td>
                <td className="px-5 py-4 text-fg-secondary">{r.app_name}</td>
                <td className="px-5 py-4 text-fg-secondary">{r.service_name}</td>
                <td className="px-5 py-4 text-fg-secondary">{r.teacher_name}</td>
                <td className="px-5 py-4 font-medium tabular-nums text-fg-primary">{r.tokens_used.toLocaleString()}</td>
                <td className="px-5 py-4 tabular-nums text-fg-secondary">
                  {r.cost_twd == null ? '—' : `NT$ ${r.cost_twd.toFixed(2)}`}
                </td>
                <td className="px-5 py-4 text-xs text-fg-muted">{r.date}</td>
              </tr>
            ))}
            {filtered.length > 100 && (
              <tr>
                <td colSpan={7} className="px-5 py-3 text-center text-xs text-fg-muted">
                  顯示前 100 筆，共 {filtered.length} 筆（可匯出 CSV 查看全部）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
