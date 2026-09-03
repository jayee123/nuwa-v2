'use client'

import { useState } from 'react'
import { Save, Plus, X } from 'lucide-react'

interface CourseTemplate {
  id: string
  code: string
  name: string
  total_days: number
}

interface CourseDayRow {
  id: string
  day_number: number
  title: string
  theme: string | null
  course_unit: string | null
  knowledge_point: string | null
  today_task: string | null
  core_tip: string | null
  objectives: string[]
  actions: string[]
  reflection_questions: string[]
  variation_couple: string | null
  variation_parent: string | null
  variation_workplace: string | null
  ai_prompt_extra: string | null
  updated_at: string | null
}

interface CourseDayManagerProps {
  template: CourseTemplate
  days: CourseDayRow[]
}

type EditableFields = Omit<CourseDayRow, 'id' | 'day_number' | 'updated_at'>

function toEditableFields(day: CourseDayRow): EditableFields {
  return {
    title: day.title ?? '',
    theme: day.theme,
    course_unit: day.course_unit,
    knowledge_point: day.knowledge_point,
    today_task: day.today_task,
    core_tip: day.core_tip,
    objectives: Array.isArray(day.objectives) ? day.objectives : [],
    actions: Array.isArray(day.actions) ? day.actions : [],
    reflection_questions: Array.isArray(day.reflection_questions) ? day.reflection_questions : [],
    variation_couple: day.variation_couple,
    variation_parent: day.variation_parent,
    variation_workplace: day.variation_workplace,
    ai_prompt_extra: day.ai_prompt_extra,
  }
}

export function CourseDayManager({ template, days }: CourseDayManagerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [form, setForm] = useState<EditableFields>(() =>
    days.length > 0 ? toEditableFields(days[0]) : toEditableFields({} as CourseDayRow)
  )
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const selectedDay = days[selectedIndex] ?? null

  function selectDay(index: number) {
    setSelectedIndex(index)
    setForm(toEditableFields(days[index]))
    setToast(null)
  }

  function updateField(field: keyof EditableFields, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateListItem(field: 'objectives' | 'actions' | 'reflection_questions', index: number, value: string) {
    setForm((prev) => {
      const list = [...prev[field]]
      list[index] = value
      return { ...prev, [field]: list }
    })
  }

  function addListItem(field: 'objectives' | 'actions' | 'reflection_questions') {
    setForm((prev) => ({ ...prev, [field]: [...prev[field], ''] }))
  }

  function removeListItem(field: 'objectives' | 'actions' | 'reflection_questions', index: number) {
    setForm((prev) => {
      const list = prev[field].filter((_, i) => i !== index)
      return { ...prev, [field]: list }
    })
  }

  async function handleSave() {
    if (!selectedDay) return
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch('/api/manage/course-days', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedDay.id, ...form }),
      })
      if (res.ok) {
        setToast({ type: 'success', message: '儲存成功' })
      } else {
        const data = await res.json()
        setToast({ type: 'error', message: data.error ?? '儲存失敗' })
      }
    } catch {
      setToast({ type: 'error', message: '網路錯誤，請稍後再試' })
    } finally {
      setSaving(false)
    }
  }

  if (days.length === 0) {
    return <p className="mt-6 text-fg-secondary">此模板尚未建立每日課程內容</p>
  }

  return (
    <div className="mt-6 flex gap-6">
      {/* Left sidebar — day list */}
      <div className="w-56 shrink-0">
        <div className="rounded-xl border border-surface-secondary bg-white">
          <div className="border-b border-surface-secondary px-4 py-3">
            <p className="text-sm font-medium text-fg-primary">{template.name}</p>
            <p className="text-xs text-fg-secondary">{template.total_days} 天課程</p>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {days.map((day, index) => (
              <button
                key={day.id}
                onClick={() => selectDay(index)}
                className={`flex w-full items-start gap-2 border-b border-surface-secondary px-4 py-3 text-left text-sm transition-colors last:border-b-0 ${
                  index === selectedIndex
                    ? 'bg-brand-purple/10 font-medium text-brand-purple'
                    : 'text-fg-primary hover:bg-surface-secondary/50'
                }`}
              >
                <span className="shrink-0 text-fg-secondary">Day {day.day_number}</span>
                <span className="truncate">{day.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — edit form */}
      <div className="min-w-0 flex-1">
        <div className="rounded-xl border border-surface-secondary bg-white p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-fg-primary">
              Day {selectedDay.day_number}：{form.title || '(未命名)'}
            </h2>
            {selectedDay.updated_at && (
              <span className="text-xs text-fg-secondary">
                上次更新：{new Date(selectedDay.updated_at).toLocaleString('zh-TW')}
              </span>
            )}
          </div>

          {/* Toast */}
          {toast && (
            <div
              className={`mb-4 rounded-lg px-4 py-2 text-sm ${
                toast.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {toast.message}
            </div>
          )}

          <div className="space-y-8">
            {/* Section 1: 基本資訊 */}
            <Section title="基本資訊">
              <Field label="標題 (title)">
                <input
                  type="text"
                  value={form.title ?? ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
              <Field label="主題 (theme)">
                <input
                  type="text"
                  value={form.theme ?? ''}
                  onChange={(e) => updateField('theme', e.target.value)}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
              <Field label="課程單元 (course_unit)">
                <input
                  type="text"
                  value={form.course_unit ?? ''}
                  onChange={(e) => updateField('course_unit', e.target.value)}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
            </Section>

            {/* Section 2: AI 教學內容 */}
            <Section title="AI 教學內容">
              <Field label="知識點 (knowledge_point)">
                <textarea
                  value={form.knowledge_point ?? ''}
                  onChange={(e) => updateField('knowledge_point', e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
              <Field label="今日任務 (today_task)">
                <textarea
                  value={form.today_task ?? ''}
                  onChange={(e) => updateField('today_task', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
              <Field label="核心提示 (core_tip)">
                <textarea
                  value={form.core_tip ?? ''}
                  onChange={(e) => updateField('core_tip', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
            </Section>

            {/* Section 3: 互動內容 */}
            <Section title="互動內容">
              <EditableList
                label="學習目標 (objectives)"
                items={form.objectives}
                onChange={(i, v) => updateListItem('objectives', i, v)}
                onAdd={() => addListItem('objectives')}
                onRemove={(i) => removeListItem('objectives', i)}
              />
              <EditableList
                label="行動建議 (actions)"
                items={form.actions}
                onChange={(i, v) => updateListItem('actions', i, v)}
                onAdd={() => addListItem('actions')}
                onRemove={(i) => removeListItem('actions', i)}
              />
              <EditableList
                label="反思問題 (reflection_questions)"
                items={form.reflection_questions}
                onChange={(i, v) => updateListItem('reflection_questions', i, v)}
                onAdd={() => addListItem('reflection_questions')}
                onRemove={(i) => removeListItem('reflection_questions', i)}
              />
            </Section>

            {/* Section 4: 關係類型變體 */}
            <Section title="關係類型變體">
              <Field label="伴侶 (variation_couple)">
                <textarea
                  value={form.variation_couple ?? ''}
                  onChange={(e) => updateField('variation_couple', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
              <Field label="親子 (variation_parent)">
                <textarea
                  value={form.variation_parent ?? ''}
                  onChange={(e) => updateField('variation_parent', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
              <Field label="職場 (variation_workplace)">
                <textarea
                  value={form.variation_workplace ?? ''}
                  onChange={(e) => updateField('variation_workplace', e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
              </Field>
            </Section>

            {/* Section 5: AI 額外指令 */}
            <Section title="AI 額外指令">
              <Field label="額外指令 (ai_prompt_extra)">
                <textarea
                  value={form.ai_prompt_extra ?? ''}
                  onChange={(e) => updateField('ai_prompt_extra', e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
                />
                <p className="mt-1 text-xs text-fg-secondary">管理員可在此新增額外的 AI 回覆指令</p>
              </Field>
            </Section>
          </div>

          {/* Save button */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-purple px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-purple/90 disabled:opacity-50"
            >
              <Save className="size-4" />
              {saving ? '儲存中…' : '儲存變更'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Sub-components ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-4 border-b border-surface-secondary pb-2 text-sm font-semibold text-fg-primary">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-fg-secondary">{label}</label>
      {children}
    </div>
  )
}

function EditableList({
  label,
  items,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string
  items: string[]
  onChange: (index: number, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-fg-secondary">{label}</label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(index, e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-surface-secondary px-3 py-2 text-sm text-fg-primary focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
            />
            <button
              onClick={() => onRemove(index)}
              className="shrink-0 rounded-lg p-2 text-fg-secondary transition-colors hover:bg-red-50 hover:text-red-500"
              title="移除"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-brand-purple transition-colors hover:bg-brand-purple/10"
        >
          <Plus className="size-3.5" />
          新增項目
        </button>
      </div>
    </div>
  )
}
