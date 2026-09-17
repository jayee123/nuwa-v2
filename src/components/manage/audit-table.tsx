'use client'

import { useState } from 'react'

// 操作記錄列表（含欄位搜尋，Jeff 2026-09-10：後台所有列表都要能過濾）。
// server page 撈好、翻譯好操作者與動作標籤後整批傳入。

export interface AuditTableRow {
  id: string
  timeLabel: string
  actorLabel: string
  actionLabel: string
  target: string
}

export function AuditTable({ rows }: { rows: AuditTableRow[] }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = q
    ? rows.filter((r) =>
        [r.timeLabel, r.actorLabel, r.actionLabel, r.target].some((v) => v.toLowerCase().includes(q)),
      )
    : rows

  return (
    <>
      <div className="mt-6 flex justify-end">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋操作者 / 動作 / 對象"
          className="w-64 rounded-lg border border-surface-secondary px-3 py-1.5 text-sm focus:border-brand-purple focus:outline-none"
        />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-surface-secondary bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-secondary bg-surface-primary text-left text-fg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">時間</th>
                <th className="px-4 py-3 font-medium">操作者</th>
                <th className="px-4 py-3 font-medium">操作</th>
                <th className="px-4 py-3 font-medium">對象</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-fg-muted">
                    {q
                      ? '沒有符合搜尋的操作記錄'
                      : '尚無操作記錄。管理者在後台的操作（新增/編輯/刪除 App、產生邀請碼、調整方案…）會顯示在這裡。'}
                  </td>
                </tr>
              ) : (
                shown.map((l) => (
                  <tr key={l.id} className="border-b border-surface-secondary/60 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-fg-muted">{l.timeLabel}</td>
                    <td className="px-4 py-3 text-fg-primary">{l.actorLabel}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-brand-purple/10 px-2 py-0.5 text-xs font-medium text-brand-purple">
                        {l.actionLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-secondary">{l.target}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
