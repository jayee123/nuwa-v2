'use client'

import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Teacher {
  id: string
  name: string
  service_id: string | null
  service_name: string
  system_prompt: string | null
  welcome_msg: string | null
  is_active: boolean
}

interface Service {
  id: string
  name: string
}

export function TeacherManager({
  teachers: initialTeachers,
  services,
}: {
  teachers: Teacher[]
  services: Service[]
}) {
  const [teachers] = useState(initialTeachers)
  const [selectedId, setSelectedId] = useState(teachers[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [editName, setEditName] = useState('')
  const [editService, setEditService] = useState('')
  const [editWelcome, setEditWelcome] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const selected = teachers.find((t) => t.id === selectedId)

  function selectTeacher(t: Teacher) {
    setSelectedId(t.id)
    setEditName(t.name)
    setEditService(t.service_id ?? '')
    setEditWelcome(t.welcome_msg ?? '')
    setEditPrompt(t.system_prompt ?? '')
    setEditActive(t.is_active)
    setMsg(null)
  }

  // Auto-select first
  if (selected && !editName && selectedId === teachers[0]?.id) {
    selectTeacher(selected)
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/manage/teachers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedId,
        name: editName,
        service_id: editService || null,
        welcome_msg: editWelcome || null,
        system_prompt: editPrompt || null,
        is_active: editActive,
      }),
    })
    setSaving(false)
    setMsg(res.ok ? '已儲存' : '儲存失敗')
  }

  const filtered = search
    ? teachers.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : teachers

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-fg-primary">師資管理</h1>
        <Button className="rounded-xl bg-brand-purple text-sm text-white hover:bg-brand-purple/90">
          <Plus className="mr-1.5 size-4" /> 新增教師
        </Button>
      </div>

      <div className="mt-6 flex gap-6">
        {/* Left list */}
        <div className="w-72 shrink-0 space-y-3">
          <div className="flex items-center rounded-xl border border-surface-secondary bg-white px-3">
            <Search className="size-4 text-fg-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋教師..."
              className="h-10 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="space-y-1">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTeacher(t)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors',
                  selectedId === t.id
                    ? 'border-2 border-brand-purple bg-white'
                    : 'border-2 border-transparent bg-white hover:border-surface-secondary'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-brand-purple/20" />
                  <div>
                    <p className="text-sm font-medium text-fg-primary">{t.name}</p>
                    <p className="text-xs text-fg-muted">{t.service_name}</p>
                  </div>
                </div>
                <Badge className={`text-[10px] text-white ${t.is_active ? 'bg-brand-teal' : 'bg-fg-muted'}`}>
                  {t.is_active ? '啟用' : '停用'}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Right editor */}
        {selected && (
          <div className="flex-1 rounded-xl border border-surface-secondary bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold text-fg-primary">教師設定</h2>
              <Badge className="bg-brand-purple text-xs text-white">{editName.split('—')[1]?.trim() || editName}</Badge>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">教師名稱</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">所屬服務</label>
                <select
                  value={editService}
                  onChange={(e) => setEditService(e.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">未指定</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">開場白</label>
                <Input value={editWelcome} onChange={(e) => setEditWelcome(e.target.value)} className="h-10 rounded-lg" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">狀態</label>
                <select
                  value={editActive ? 'true' : 'false'}
                  onChange={(e) => setEditActive(e.target.value === 'true')}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                >
                  <option value="true">啟用</option>
                  <option value="false">停用</option>
                </select>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <label className="text-sm font-medium text-fg-primary">AI 系統提示詞 (System Prompt)</label>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={8}
                className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
              />
            </div>

            {msg && (
              <p className={`mt-4 text-sm ${msg === '已儲存' ? 'text-brand-teal' : 'text-destructive'}`}>{msg}</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" className="rounded-lg text-sm">刪除教師</Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-brand-purple text-sm text-white hover:bg-brand-purple/90"
              >
                {saving ? '儲存中...' : '儲存變更'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
