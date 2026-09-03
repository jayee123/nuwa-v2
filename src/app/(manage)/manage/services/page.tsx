'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, Plus } from 'lucide-react'

interface Plan {
  id: string
  code: string
  name: string
  price: number
  renewal_price: number
  monthly_dialog_count: number
  monthly_charge: number
  sort_order: number
  is_active: boolean
}

type Draft = { code: string; name: string; price: number; renewal_price: number; monthly_dialog_count: number; monthly_charge: number }
const EMPTY_DRAFT: Draft = { code: '', name: '', price: 0, renewal_price: 0, monthly_dialog_count: 0, monthly_charge: 0 }

export default function ManageServicesPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [isSuper, setIsSuper] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/manage/plans')
      const json = await res.json()
      if (res.ok) { setPlans(json.data || []); setIsSuper(!!json.is_super) }
      else setError(json.error || '讀取失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function setField(id: string, field: keyof Plan, value: string | number | boolean) {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  async function saveRow(p: Plan) {
    setSavingId(p.id); setError(null)
    try {
      const res = await fetch('/api/manage/plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: p.id, name: p.name, price: p.price, renewal_price: p.renewal_price,
          monthly_dialog_count: p.monthly_dialog_count, monthly_charge: p.monthly_charge, is_active: p.is_active,
        }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error || '儲存失敗')
    } finally {
      setSavingId(null)
    }
  }

  async function removeRow(p: Plan) {
    if (!confirm(`刪除方案「${p.name}」？`)) return
    setBusy(true)
    try {
      await fetch(`/api/manage/plans?id=${p.id}`, { method: 'DELETE' })
      await load()
    } finally { setBusy(false) }
  }

  async function createPlan() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/manage/plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || '新增失敗'); return }
      setCreating(false); setDraft(EMPTY_DRAFT); await load()
    } finally { setBusy(false) }
  }

  const numCls = 'w-20 rounded border border-surface-secondary px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand-purple disabled:bg-surface-secondary/40'

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-fg-primary">方案定價</h1>
          <p className="mt-1 text-sm text-fg-secondary">公版統一服務方案 — 全平台共用。{isSuper ? '可直接編輯後儲存。' : '（僅 superadmin 可編輯）'}</p>
        </div>
        {isSuper && !creating && (
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-lg bg-brand-purple px-3 py-2 text-sm font-medium text-white hover:opacity-90">
            <Plus className="size-4" /> 新增方案
          </button>
        )}
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {creating && (
        <div className="mt-4 rounded-xl border border-brand-purple/30 bg-white p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-fg-muted">代碼<input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="input mt-1 w-24" placeholder="basic" /></label>
            <label className="text-xs text-fg-muted">名稱<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input mt-1 w-40" placeholder="方案名稱" /></label>
            <label className="text-xs text-fg-muted">方案價<input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className="input mt-1 w-20" /></label>
            <label className="text-xs text-fg-muted">續約價<input type="number" value={draft.renewal_price} onChange={(e) => setDraft({ ...draft, renewal_price: Number(e.target.value) })} className="input mt-1 w-20" /></label>
            <label className="text-xs text-fg-muted">對話次數<input type="number" value={draft.monthly_dialog_count} onChange={(e) => setDraft({ ...draft, monthly_dialog_count: Number(e.target.value) })} className="input mt-1 w-20" /></label>
            <label className="text-xs text-fg-muted">月費<input type="number" value={draft.monthly_charge} onChange={(e) => setDraft({ ...draft, monthly_charge: Number(e.target.value) })} className="input mt-1 w-20" /></label>
            <button onClick={createPlan} disabled={busy} className="rounded-lg bg-brand-purple px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">建立</button>
            <button onClick={() => { setCreating(false); setDraft(EMPTY_DRAFT) }} className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600">取消</button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-surface-secondary bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-secondary bg-surface-primary text-left text-fg-secondary">
              <tr>
                <th className="px-3 py-3 font-medium">方案名稱</th>
                <th className="px-3 py-3 text-right font-medium">方案價格</th>
                <th className="px-3 py-3 text-right font-medium">續約價格</th>
                <th className="px-3 py-3 text-right font-medium">每月對話次數</th>
                <th className="px-3 py-3 text-right font-medium">每月收費</th>
                <th className="px-3 py-3 text-center font-medium">啟用</th>
                {isSuper && <th className="px-3 py-3 text-right font-medium">操作</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted">讀取中…</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted">尚無方案。按右上「新增方案」建立。</td></tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="border-b border-surface-secondary/60 last:border-0">
                    <td className="px-3 py-2">
                      <input value={p.name} disabled={!isSuper} onChange={(e) => setField(p.id, 'name', e.target.value)} className="w-44 rounded border border-surface-secondary px-2 py-1 text-sm outline-none focus:border-brand-purple disabled:bg-surface-secondary/40" />
                      <span className="ml-2 font-mono text-xs text-fg-muted">{p.code}</span>
                    </td>
                    <td className="px-3 py-2 text-right"><input type="number" value={p.price} disabled={!isSuper} onChange={(e) => setField(p.id, 'price', Number(e.target.value))} className={numCls} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={p.renewal_price} disabled={!isSuper} onChange={(e) => setField(p.id, 'renewal_price', Number(e.target.value))} className={numCls} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={p.monthly_dialog_count} disabled={!isSuper} onChange={(e) => setField(p.id, 'monthly_dialog_count', Number(e.target.value))} className={numCls} /></td>
                    <td className="px-3 py-2 text-right"><input type="number" value={p.monthly_charge} disabled={!isSuper} onChange={(e) => setField(p.id, 'monthly_charge', Number(e.target.value))} className={numCls} /></td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={p.is_active} disabled={!isSuper} onChange={(e) => setField(p.id, 'is_active', e.target.checked)} className="accent-brand-purple" /></td>
                    {isSuper && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveRow(p)} disabled={savingId === p.id} className="rounded-lg bg-brand-purple px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                            {savingId === p.id ? '儲存中…' : '儲存'}
                          </button>
                          <button onClick={() => removeRow(p)} disabled={busy} className="rounded p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50"><Trash2 className="size-4" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
