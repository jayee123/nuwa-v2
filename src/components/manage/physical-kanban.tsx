'use client'

import { useState } from 'react'
import { Plus, Calendar, MapPin, X, Mail, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Course {
  id: string
  name: string
  description: string | null
  price: number
  location: string | null
  service_code: string | null
  notice: string | null
  points_reward: number
  reg_start: string | null
  reg_end: string | null
  class_start: string | null
  class_end: string | null
  status: string
  reg_count: number
}

const COLUMNS = [
  { status: 'planned', label: '規劃中', color: 'bg-fg-muted' },
  { status: 'open', label: '報名中', color: 'bg-brand-orange' },
  { status: 'ongoing', label: '進行中', color: 'bg-brand-teal' },
  { status: 'completed', label: '已結束', color: 'bg-brand-rose' },
]

const EMPTY_FORM = {
  name: '',
  description: '',
  price: 0,
  location: '',
  service_code: '',
  notice: '',
  points_reward: 0,
  reg_start: '',
  reg_end: '',
  class_start: '',
  class_end: '',
  status: 'planned',
}

export function PhysicalKanban({ courses: initial }: { courses: Course[] }) {
  const [courses, setCourses] = useState(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function setField(key: string, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowCreate(true)
    setMsg(null)
  }

  function openEdit(course: Course) {
    setForm({
      name: course.name,
      description: course.description ?? '',
      price: course.price,
      location: course.location ?? '',
      service_code: course.service_code ?? '',
      notice: course.notice ?? '',
      points_reward: course.points_reward,
      reg_start: course.reg_start?.slice(0, 16) ?? '',
      reg_end: course.reg_end?.slice(0, 16) ?? '',
      class_start: course.class_start?.slice(0, 16) ?? '',
      class_end: course.class_end?.slice(0, 16) ?? '',
      status: course.status,
    })
    setEditId(course.id)
    setShowCreate(true)
    setMsg(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setMsg('請輸入課程名稱'); return }
    setSaving(true)
    setMsg(null)

    const payload = {
      ...form,
      price: Number(form.price) || 0,
      points_reward: Number(form.points_reward) || 0,
      reg_start: form.reg_start || null,
      reg_end: form.reg_end || null,
      class_start: form.class_start || null,
      class_end: form.class_end || null,
    }

    if (editId) {
      // Check if status changed to 'open' → ask to notify
      const oldCourse = courses.find((c) => c.id === editId)
      const statusChangedToOpen = oldCourse?.status !== 'open' && form.status === 'open'
      let notify = false
      if (statusChangedToOpen) {
        notify = confirm('課程狀態改為「報名中」，是否發送 Email 通知有留信箱的會員？')
      }

      const res = await fetch('/api/manage/physical', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, notify, ...payload }),
      })
      if (res.ok) {
        setCourses((prev) =>
          prev.map((c) => (c.id === editId ? { ...c, ...payload } : c))
        )
        setMsg(notify ? '已儲存並發送通知' : '已儲存')
        setShowCreate(false)
      } else {
        setMsg('儲存失敗')
      }
    } else {
      const res = await fetch('/api/manage/physical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.course) {
        setCourses((prev) => [{ ...data.course, reg_count: 0 }, ...prev])
        setShowCreate(false)
      } else {
        setMsg(data.error || '建立失敗')
      }
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('確定刪除此課程？相關報名記錄也會一併刪除。')) return
    await fetch(`/api/manage/physical?id=${id}`, { method: 'DELETE' })
    setCourses((prev) => prev.filter((c) => c.id !== id))
    if (editId === id) setShowCreate(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-fg-primary">實體課程管理</h1>
        <Button onClick={openCreate} className="rounded-xl bg-brand-purple text-sm text-white hover:bg-brand-purple/90">
          <Plus className="mr-1.5 size-4" /> 新增課程
        </Button>
      </div>

      {/* Kanban */}
      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const items = courses.filter((c) => c.status === col.status)
          return (
            <div key={col.status} className="w-72 shrink-0">
              <div className="flex items-center gap-2 rounded-t-xl bg-white px-4 py-3">
                <div className={`size-2.5 rounded-full ${col.color}`} />
                <span className="text-sm font-medium text-fg-primary">{col.label}</span>
                <span className="ml-auto rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-fg-muted">
                  {items.length}
                </span>
              </div>
              <div className="min-h-[120px] space-y-2 rounded-b-xl bg-surface-secondary/50 p-2">
                {items.map((course) => (
                  <div
                    key={course.id}
                    onClick={() => openEdit(course)}
                    className="cursor-pointer rounded-xl border border-surface-secondary bg-white p-4 transition-shadow hover:shadow-sm"
                  >
                    <h3 className="text-sm font-medium text-fg-primary">{course.name}</h3>
                    {course.class_start && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
                        <Calendar className="size-3" />
                        {new Date(course.class_start).toLocaleDateString('zh-TW')}
                      </div>
                    )}
                    {course.location && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                        <MapPin className="size-3" />
                        {course.location}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-brand-orange">
                        NT$ {course.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-fg-muted">{course.reg_count} 人</span>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="py-8 text-center text-xs text-fg-muted">無課程</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create / Edit Panel */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-fg-primary">
                {editId ? '編輯課程' : '新增實體課程'}
              </h2>
              <button onClick={() => setShowCreate(false)} className="text-fg-muted hover:text-fg-primary">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-fg-primary">課程名稱 *</label>
                <Input value={form.name} onChange={(e) => setField('name', e.target.value)} className="h-10 rounded-lg" />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-fg-primary">課程說明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Price */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">費用 (NT$)</label>
                  <Input type="number" value={form.price} onChange={(e) => setField('price', e.target.value)} className="h-10 rounded-lg" />
                </div>
                {/* Location */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">上課地點</label>
                  <Input value={form.location} onChange={(e) => setField('location', e.target.value)} className="h-10 rounded-lg" />
                </div>
                {/* Class start */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">開課時間</label>
                  <Input type="datetime-local" value={form.class_start} onChange={(e) => setField('class_start', e.target.value)} className="h-10 rounded-lg" />
                </div>
                {/* Class end */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">結束時間</label>
                  <Input type="datetime-local" value={form.class_end} onChange={(e) => setField('class_end', e.target.value)} className="h-10 rounded-lg" />
                </div>
                {/* Reg start */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">報名開始</label>
                  <Input type="datetime-local" value={form.reg_start} onChange={(e) => setField('reg_start', e.target.value)} className="h-10 rounded-lg" />
                </div>
                {/* Reg end */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">報名截止</label>
                  <Input type="datetime-local" value={form.reg_end} onChange={(e) => setField('reg_end', e.target.value)} className="h-10 rounded-lg" />
                </div>
                {/* Status */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">狀態</label>
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.status} value={c.status}>{c.label}</option>
                    ))}
                  </select>
                </div>
                {/* Points reward */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-fg-primary">報名贈送點數</label>
                  <Input type="number" value={form.points_reward} onChange={(e) => setField('points_reward', e.target.value)} className="h-10 rounded-lg" />
                </div>
              </div>

              {/* Notice */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-fg-primary">注意事項</label>
                <textarea
                  value={form.notice}
                  onChange={(e) => setField('notice', e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
                />
              </div>

              {/* Info: notify on status change */}
              {editId && form.status === 'open' && (
                <div className="flex items-start gap-2 rounded-lg bg-brand-orange/10 px-4 py-3 text-sm text-fg-secondary">
                  <Mail className="mt-0.5 size-4 shrink-0 text-brand-orange" />
                  <span>儲存時若狀態改為「報名中」，系統會詢問是否發送 Email 通知所有留有信箱的會員。</span>
                </div>
              )}
            </div>

            {msg && (
              <p className={`mt-4 text-sm ${msg.includes('失敗') ? 'text-destructive' : 'text-brand-teal'}`}>{msg}</p>
            )}

            <div className="mt-6 flex justify-between">
              <div>
                {editId && (
                  <Button
                    onClick={() => handleDelete(editId)}
                    variant="outline"
                    className="rounded-lg text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="mr-1.5 size-4" /> 刪除課程
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button onClick={() => setShowCreate(false)} variant="outline" className="rounded-lg text-sm">
                  取消
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-brand-purple text-sm text-white hover:bg-brand-purple/90"
                >
                  {saving ? '儲存中...' : editId ? '儲存變更' : '建立課程'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
