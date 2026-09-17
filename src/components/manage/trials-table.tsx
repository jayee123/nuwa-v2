'use client'

import { useState } from 'react'

// 試用紀錄列表（含欄位搜尋，Jeff 2026-09-10：後台所有列表都要能過濾）。
// 資料由 server page 撈好整批傳入，這裡只管顯示與前端過濾。

export interface TrialTableRow {
  id: string
  started_at: string
  expires_at: string
  source: string
  invite_code: string | null
  userName: string
  userContact: string
  appName: string
}

const SOURCE_LABEL: Record<string, string> = {
  invite: '邀請碼',
  open: '公開試用',
}

function fmt(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function daysLeft(expiresAt: string, now: Date): number {
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

export function TrialsTable({ rows }: { rows: TrialTableRow[] }) {
  const [search, setSearch] = useState('')
  const now = new Date()
  const q = search.trim().toLowerCase()
  const shown = q
    ? rows.filter((r) =>
        [
          r.userName,
          r.userContact,
          r.appName,
          SOURCE_LABEL[r.source] ?? r.source,
          r.invite_code,
          daysLeft(r.expires_at, now) > 0 ? '試用中' : '已到期',
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : rows

  return (
    <>
      <div className="mt-6 flex justify-end">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋用戶 / App / 碼 / 狀態"
          className="w-64 rounded-lg border border-surface-secondary px-3 py-1.5 text-sm focus:border-brand-purple focus:outline-none"
        />
      </div>
      {shown.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-fg-muted shadow-sm">
          {q ? '沒有符合搜尋的試用紀錄' : '還沒有任何試用紀錄'}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-surface-secondary bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
                <th className="px-4 py-3">用戶</th>
                <th className="px-4 py-3">App</th>
                <th className="px-4 py-3">來源</th>
                <th className="px-4 py-3">開始</th>
                <th className="px-4 py-3">到期</th>
                <th className="px-4 py-3">狀態</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const left = daysLeft(r.expires_at, now)
                const isActive = left > 0
                return (
                  <tr key={r.id} className="border-b border-surface-secondary/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-fg-primary">{r.userName}</div>
                      <div className="text-xs text-fg-muted">{r.userContact}</div>
                    </td>
                    <td className="px-4 py-3">{r.appName}</td>
                    <td className="px-4 py-3">
                      {SOURCE_LABEL[r.source] ?? r.source}
                      {r.invite_code && <div className="font-mono text-xs text-fg-muted">{r.invite_code}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-secondary">{fmt(r.started_at)}</td>
                    <td className="px-4 py-3 text-xs text-fg-secondary">{fmt(r.expires_at)}</td>
                    <td className="px-4 py-3">
                      {isActive ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            left <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          剩 {left} 天
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                          已到期
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
