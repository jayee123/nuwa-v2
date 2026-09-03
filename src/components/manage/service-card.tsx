'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { ImagePlus, Loader2, Pencil, X, Plus, Trash2 } from 'lucide-react'

interface Plan {
  name: string
  price: number
  period: string
  dialog_limit?: number
}

interface ServiceCardProps {
  id: string
  name: string
  code: string
  description: string | null
  bannerUrl: string | null
  isActive: boolean
  plans: Plan[]
}

export function ServiceCard({ id, name: initName, code, description: initDesc, bannerUrl, isActive: initActive, plans: initPlans }: ServiceCardProps) {
  const [banner, setBanner] = useState(bannerUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initName)
  const [description, setDescription] = useState(initDesc ?? '')
  const [isActive, setIsActive] = useState(initActive)
  const [plans, setPlans] = useState<Plan[]>(initPlans)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('serviceId', id)
    try {
      const res = await fetch('/api/manage/services/banner', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) setError(data.error)
      else setBanner(data.bannerUrl + '?t=' + Date.now())
    } catch {
      setError('上傳失敗')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function updatePlan(index: number, field: keyof Plan, value: string | number) {
    setPlans((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function addPlan() {
    setPlans((prev) => [...prev, { name: '', price: 0, period: '月', dialog_limit: 30 }])
  }

  function removePlan(index: number) {
    setPlans((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const res = await fetch('/api/manage/services', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, description, plans, is_active: isActive }),
    })
    setSaving(false)
    if (res.ok) {
      setSaveMsg('已儲存')
      setEditing(false)
    } else {
      setSaveMsg('儲存失敗')
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-secondary bg-background">
      {/* Banner */}
      <div
        className="relative flex min-h-[120px] items-center justify-center bg-surface-secondary/50 cursor-pointer group"
        onClick={() => inputRef.current?.click()}
      >
        {banner ? (
          <Image src={banner} alt={name} width={400} height={225} className="w-full h-auto object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 py-10 text-fg-muted">
            <ImagePlus className="size-8" />
            <span className="text-xs">點擊上傳封面</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
          <span className="text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? '' : '更換封面'}
          </span>
        </div>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} className="hidden" />
      </div>

      {/* Content */}
      <div className="p-5">
        {!editing ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-fg-primary">{name}</h2>
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${isActive ? 'bg-brand-teal' : 'bg-fg-muted'}`} />
                <button onClick={() => setEditing(true)} className="rounded p-1 text-fg-muted hover:bg-surface-secondary hover:text-fg-primary">
                  <Pencil className="size-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-fg-muted">code: {code}</p>
            <p className="mt-2 line-clamp-2 text-sm text-fg-secondary">{description}</p>
            <div className="mt-4 space-y-1">
              {plans.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <span className="text-fg-secondary">{p.name}</span>
                  <span className="font-medium text-fg-primary">NT$ {p.price} / {p.period}（{p.dialog_limit ?? '-'} 次）</span>
                </div>
              ))}
            </div>
            {saveMsg && <p className={`mt-2 text-xs ${saveMsg === '已儲存' ? 'text-brand-teal' : 'text-destructive'}`}>{saveMsg}</p>}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-fg-primary">編輯方案</p>
              <button onClick={() => setEditing(false)} className="rounded p-1 text-fg-muted hover:text-fg-primary">
                <X className="size-4" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-fg-muted">名稱</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-surface-secondary px-2.5 py-1.5 text-sm outline-none focus:border-brand-purple" />
            </div>

            <div>
              <label className="text-[10px] text-fg-muted">說明</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="mt-0.5 w-full rounded-lg border border-surface-secondary px-2.5 py-1.5 text-sm outline-none focus:border-brand-purple" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-brand-purple" />
              啟用
            </label>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-fg-muted">方案定價</label>
                <button onClick={addPlan} className="flex items-center gap-1 text-[10px] text-brand-purple hover:underline">
                  <Plus className="size-3" /> 新增
                </button>
              </div>
              <div className="mt-1 space-y-2">
                {plans.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={p.name} onChange={(e) => updatePlan(i, 'name', e.target.value)} placeholder="方案名"
                      className="w-20 rounded border border-surface-secondary px-2 py-1 text-xs outline-none focus:border-brand-purple" />
                    <input type="number" value={p.price} onChange={(e) => updatePlan(i, 'price', Number(e.target.value))} placeholder="價格"
                      className="w-16 rounded border border-surface-secondary px-2 py-1 text-xs outline-none focus:border-brand-purple" />
                    <input value={p.period} onChange={(e) => updatePlan(i, 'period', e.target.value)} placeholder="週期"
                      className="w-12 rounded border border-surface-secondary px-2 py-1 text-xs outline-none focus:border-brand-purple" />
                    <input type="number" value={p.dialog_limit ?? 30} onChange={(e) => updatePlan(i, 'dialog_limit', Number(e.target.value))} placeholder="對話次數"
                      className="w-14 rounded border border-surface-secondary px-2 py-1 text-xs outline-none focus:border-brand-purple" title="對話次數" />
                    <button onClick={() => removePlan(i)} className="rounded p-1 text-fg-muted hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full rounded-lg bg-brand-purple py-1.5 text-sm font-medium text-white hover:bg-brand-purple/90 disabled:opacity-50">
              {saving ? '儲存中…' : '儲存'}
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
