'use client'

import { useState } from 'react'
import { isTrialActive, trialDialogsLeft, trialFromRow } from '@/lib/launch-gate'

// 試用紀錄列表（含欄位搜尋，Jeff 2026-09-10：後台所有列表都要能過濾）。
// 資料由 server page 撈好整批傳入，這裡只管顯示與前端過濾。

export interface TrialTableRow {
  id: string
  started_at: string
  expires_at: string
  /** 試用期間已用對話次數（migration 034） */
  dialogs_used: number
  /** 開試用當下的次數上限快照；null = 不限 */
  dialog_limit: number | null
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

// 試用＝天數或對話次數先到者結束（M-12）
function trialStatus(r: TrialTableRow, now: Date): 'active' | 'dialogs_used_up' | 'expired' {
  const trial = trialFromRow(r)
  if (isTrialActive(trial, now)) return 'active'
  return trial && trialDialogsLeft(trial) === 0 && daysLeft(r.expires_at, now) > 0 ? 'dialogs_used_up' : 'expired'
}

const STATUS_LABEL = { active: '試用中', dialogs_used_up: '次數用完', expired: '已到期' } as const

export function TrialsTable({ rows: initialRows }: { rows: TrialTableRow[] }) {
  const [search, setSearch] = useState('')
  // 重置會把列刪掉，所以列表要能自己變動（不再直接用 props）
  const [rows, setRows] = useState<TrialTableRow[]>(initialRows)
  // 兩段式確認：第一次點「重置」只是把該列標成待確認，再點一次才真的送出。
  // 不用 window.confirm —— 瀏覽器原生 modal 會擋住整個分頁，也不好測。
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reset(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/manage/trials/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '重置失敗')
        return
      }
      // 不可變更新：產生新陣列，不動原本那個
      setRows((prev) => prev.filter((r) => r.id !== id))
      setConfirmId(null)
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setBusyId(null)
    }
  }

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
          STATUS_LABEL[trialStatus(r, now)],
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
      {error && (
        <p className="mt-2 text-right text-sm text-destructive">{error}</p>
      )}
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
                <th className="px-4 py-3">對話次數</th>
                <th className="px-4 py-3">狀態</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const left = daysLeft(r.expires_at, now)
                const status = trialStatus(r, now)
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
                    <td className="px-4 py-3 text-xs text-fg-secondary tabular-nums">
                      {r.dialogs_used} / {r.dialog_limit ?? '不限'}
                    </td>
                    <td className="px-4 py-3">
                      {status === 'active' ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            left <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          剩 {left} 天
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                          {STATUS_LABEL[status]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {confirmId === r.id ? (
                        <>
                          <button
                            onClick={() => reset(r.id)}
                            disabled={busyId === r.id}
                            className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {busyId === r.id ? '重置中…' : '確定重置'}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            disabled={busyId === r.id}
                            className="ml-2 text-xs text-fg-muted hover:underline disabled:opacity-50"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setConfirmId(r.id); setError(null) }}
                          className="text-xs text-brand-purple hover:underline"
                        >
                          重置試用
                        </button>
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
