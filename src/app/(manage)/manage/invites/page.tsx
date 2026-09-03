'use client'

import { useEffect, useState, useCallback } from 'react'

interface InviteRow {
  code: string
  note: string | null
  used_at: string | null
  expires_at: string | null
  created_at: string
  app_id: string | null
  app_name: string | null
  status: 'available' | 'used' | 'expired'
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  available: { label: '可用', cls: 'bg-green-100 text-green-700' },
  used: { label: '已使用', cls: 'bg-gray-100 text-gray-600' },
  expired: { label: '已過期', cls: 'bg-red-50 text-red-500' },
}

export default function ManageInvitesPage() {
  const [rows, setRows] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('TRIAL-')
  const [count, setCount] = useState(10)
  const [days, setDays] = useState(0)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [justMade, setJustMade] = useState<string[]>([])
  const [apps, setApps] = useState<{ id: string; name: string }[]>([])
  const [appId, setAppId] = useState('') // '' = 不限

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/manage/invites')
      const json = await res.json()
      if (res.ok) { setRows(json.data || []); setApps(json.apps || []) }
      else setError(json.error || '讀取失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function generate() {
    setBusy(true)
    setError(null)
    setJustMade([])
    try {
      const res = await fetch('/api/manage/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, count, expires_in_days: days, note: note || null, app_id: appId || null }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || '產生失敗'); return }
      setJustMade(json.data || [])
      await load()
    } finally {
      setBusy(false)
    }
  }

  const available = rows.filter((r) => r.status === 'available')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">邀請碼</h1>
      <p className="mt-1 text-sm text-fg-secondary">公版試用門檻。使用者在註冊時輸入，一碼一用。</p>

      {/* 產生 */}
      <div className="mt-5 rounded-xl border border-surface-secondary bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-fg-muted">前綴
            <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} className="input mt-1 w-32" placeholder="TRIAL-" />
          </label>
          <label className="text-xs text-fg-muted">數量
            <input type="number" value={count} min={1} max={200} onChange={(e) => setCount(Number(e.target.value))} className="input mt-1 w-20" />
          </label>
          <label className="text-xs text-fg-muted">有效天數（0=不過期）
            <input type="number" value={days} min={0} onChange={(e) => setDays(Number(e.target.value))} className="input mt-1 w-24" />
          </label>
          <label className="text-xs text-fg-muted">限定 App
            <select value={appId} onChange={(e) => setAppId(e.target.value)} className="input mt-1 w-32">
              <option value="">不限</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="flex-1 text-xs text-fg-muted">備註
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1 w-full" placeholder="例：8月說明會" />
          </label>
          <button onClick={generate} disabled={busy} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? '產生中…' : '產生'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {justMade.length > 0 && (
          <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-green-700">已產生 {justMade.length} 組</span>
              <button onClick={() => navigator.clipboard?.writeText(justMade.join('\n'))} className="text-xs text-brand-purple hover:underline">複製全部</button>
            </div>
            <code className="block overflow-x-auto whitespace-pre font-mono text-xs text-gray-700">{justMade.join('\n')}</code>
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm text-fg-secondary">共 {rows.length} 組，可用 <b className="text-green-700">{available.length}</b> 組</p>
        {available.length > 0 && (
          <button onClick={() => navigator.clipboard?.writeText(available.map((r) => r.code).join('\n'))} className="text-xs text-brand-purple hover:underline">複製全部可用碼</button>
        )}
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-surface-secondary bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-secondary bg-surface-primary text-left text-fg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">邀請碼</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">限定 App</th>
                <th className="px-4 py-3 font-medium">備註</th>
                <th className="px-4 py-3 font-medium">到期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted">讀取中…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-fg-muted">尚無邀請碼。用上方「產生」建立一批。</td></tr>
              ) : (
                rows.map((r) => {
                  const meta = STATUS_META[r.status]
                  return (
                    <tr key={r.code} className="border-b border-surface-secondary/60 last:border-0">
                      <td className="px-4 py-3 font-mono text-fg-primary">{r.code}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span></td>
                      <td className="px-4 py-3 text-xs text-fg-secondary">{r.app_name ?? '不限'}</td>
                      <td className="px-4 py-3 text-xs text-fg-muted">{r.note ?? '-'}</td>
                      <td className="px-4 py-3 text-xs text-fg-muted">{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '不過期'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
