'use client'

import { useMemo, useState } from 'react'

interface ProgressRecord {
  id: string
  progress_pct: number
  completed_at: string | null
  updated_at: string
  user_name: string
  user_phone: string
  unit_title: string
  subject_title: string
  course_title: string
  service_name: string
}

type GroupBy = 'user' | 'service' | 'course'

export function ProgressOverview({
  records,
  serviceUnitCounts,
}: {
  records: ProgressRecord[]
  serviceUnitCounts: Record<string, number>
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('user')
  const [search, setSearch] = useState('')

  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      r.user_name.toLowerCase().includes(q) ||
      r.user_phone.includes(q) ||
      r.service_name.toLowerCase().includes(q) ||
      r.course_title.toLowerCase().includes(q)
    )
  })

  // Summary
  const totalCompleted = filtered.filter((r) => r.completed_at).length
  const totalInProgress = filtered.filter((r) => !r.completed_at && r.progress_pct > 0).length
  const uniqueUsers = new Set(filtered.map((r) => r.user_phone)).size

  // Grouped data
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; sub: string; completed: number; total: number; avgPct: number }>()
    for (const r of filtered) {
      let key: string
      let label: string
      let sub: string
      if (groupBy === 'user') {
        key = r.user_phone
        label = r.user_name
        sub = r.user_phone
      } else if (groupBy === 'service') {
        key = r.service_name
        label = r.service_name
        sub = `共 ${serviceUnitCounts[r.service_name] ?? '?'} 單元`
      } else {
        key = r.course_title
        label = r.course_title
        sub = r.service_name
      }
      const existing = map.get(key)
      if (existing) {
        existing.completed += r.completed_at ? 1 : 0
        existing.total += 1
        existing.avgPct = ((existing.avgPct * (existing.total - 1)) + r.progress_pct) / existing.total
      } else {
        map.set(key, {
          label,
          sub,
          completed: r.completed_at ? 1 : 0,
          total: 1,
          avgPct: r.progress_pct,
        })
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filtered, groupBy, serviceUnitCounts])

  return (
    <div className="mt-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="text-xs text-fg-muted">學習用戶數</p>
          <p className="mt-1 text-2xl font-bold text-fg-primary">{uniqueUsers}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="text-xs text-fg-muted">已完成單元</p>
          <p className="mt-1 text-2xl font-bold text-brand-teal">{totalCompleted}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-5">
          <p className="text-xs text-fg-muted">學習中</p>
          <p className="mt-1 text-2xl font-bold text-brand-orange">{totalInProgress}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="搜尋用戶、服務、課程…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-primary outline-none focus:border-brand-purple"
        />
        <div className="flex gap-1">
          {([
            ['user', '按用戶'],
            ['service', '按服務'],
            ['course', '按課程'],
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
      </div>

      {/* Progress bars */}
      <div className="rounded-xl border border-surface-secondary bg-white p-5">
        {grouped.length === 0 ? (
          <p className="py-8 text-center text-fg-muted">尚無學習進度資料</p>
        ) : (
          <div className="space-y-3">
            {grouped.map((g, i) => {
              const pct = Math.round(g.avgPct)
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 shrink-0">
                    <p className="truncate text-sm font-medium text-fg-primary" title={g.label}>
                      {g.label}
                    </p>
                    {g.sub && <p className="truncate text-[10px] text-fg-muted">{g.sub}</p>}
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-surface-secondary">
                    <div
                      className="absolute inset-y-0 left-0 rounded bg-brand-teal/70 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium text-fg-primary">
                      {pct}%
                    </span>
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs text-fg-muted">
                    {g.completed}/{g.total} 完成
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3">用戶</th>
              <th className="px-5 py-3">服務</th>
              <th className="px-5 py-3">章節</th>
              <th className="px-5 py-3">單元</th>
              <th className="px-5 py-3">進度</th>
              <th className="px-5 py-3">完成時間</th>
              <th className="px-5 py-3">最後更新</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-fg-muted">
                  尚無學習進度資料
                </td>
              </tr>
            )}
            {filtered.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-b border-surface-secondary last:border-0">
                <td className="px-5 py-4">
                  <p className="font-medium text-fg-primary">{r.user_name}</p>
                  <p className="text-xs text-fg-muted">{r.user_phone}</p>
                </td>
                <td className="px-5 py-4 text-fg-secondary">{r.service_name}</td>
                <td className="px-5 py-4 text-fg-secondary">{r.subject_title}</td>
                <td className="px-5 py-4 text-fg-secondary">{r.unit_title}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 overflow-hidden rounded bg-surface-secondary">
                      <div
                        className={`h-full rounded ${r.completed_at ? 'bg-brand-teal' : 'bg-brand-orange'}`}
                        style={{ width: `${r.progress_pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-fg-muted">{r.progress_pct}%</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-fg-muted">
                  {r.completed_at ? new Date(r.completed_at).toLocaleString('zh-TW') : '-'}
                </td>
                <td className="px-5 py-4 text-xs text-fg-muted">
                  {new Date(r.updated_at).toLocaleString('zh-TW')}
                </td>
              </tr>
            ))}
            {filtered.length > 100 && (
              <tr>
                <td colSpan={7} className="px-5 py-3 text-center text-xs text-fg-muted">
                  顯示前 100 筆，共 {filtered.length} 筆
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
