'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, GripVertical, FolderOpen, Plus, Save, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SortableUnitList } from '@/components/manage/sortable-unit-list'
import { SortableChapterList } from '@/components/manage/sortable-chapter-list'
import { cn } from '@/lib/utils'

interface Unit {
  id: string
  title: string
  content_url: string | null
  sort_order: number
}

interface Chapter {
  id: string
  title: string
  sort_order: number
  units: Unit[]
}

interface Service {
  id: string
  code: string
  name: string
}

export function CourseEditor({
  services,
  initialServiceId,
  initialChapters,
  initialCourseId,
}: {
  services: Service[]
  initialServiceId: string
  initialChapters: Chapter[]
  initialCourseId: string | null
}) {
  const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId)
  const [courseId, setCourseId] = useState(initialCourseId)
  const [chapters, setChapters] = useState(initialChapters)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialChapters[0]?.units[0]?.id ?? null)
  const [openChapters, setOpenChapters] = useState<Set<string>>(
    new Set(initialChapters.map((c) => c.id))
  )
  const [loading, setLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  // Unit edit state
  const [editTitle, setEditTitle] = useState('')
  const [editUrl, setEditUrl] = useState('')

  const selectedUnit = chapters.flatMap((c) => c.units).find((u) => u.id === selectedUnitId)
  const selectedService = services.find((s) => s.id === selectedServiceId)

  // Sync edit fields when selecting a unit
  useEffect(() => {
    if (selectedUnit) {
      setEditTitle(selectedUnit.title)
      setEditUrl(selectedUnit.content_url ?? '')
    }
  }, [selectedUnitId]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Load curriculum when service changes ---
  const loadCurriculum = useCallback(async (serviceId: string) => {
    setLoading(true)
    setSaveMsg(null)
    try {
      const res = await fetch(`/api/manage/courses?serviceId=${serviceId}`)
      const data = await res.json()
      setCourseId(data.courseId ?? null)
      setChapters(data.chapters ?? [])
      setSelectedUnitId(data.chapters?.[0]?.units?.[0]?.id ?? null)
      setOpenChapters(new Set((data.chapters ?? []).map((c: Chapter) => c.id)))
    } catch {
      setChapters([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleServiceChange(serviceId: string) {
    setSelectedServiceId(serviceId)
    loadCurriculum(serviceId)
  }

  function toggleChapter(id: string) {
    setOpenChapters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // --- Add chapter ---
  async function handleAddChapter() {
    if (!courseId) {
      // Create course first
      const res = await fetch('/api/manage/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'course', serviceId: selectedServiceId, title: '新課程' }),
      })
      const data = await res.json()
      if (!data.course) return
      setCourseId(data.course.id)
    }

    const newSortOrder = chapters.length + 1
    const res = await fetch('/api/manage/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'subject',
        courseId: courseId,
        title: `第${chapters.length + 1}章：新章節`,
        sort_order: newSortOrder,
      }),
    })
    const data = await res.json()
    if (data.subject) {
      const newChapter: Chapter = { ...data.subject, units: [] }
      setChapters((prev) => [...prev, newChapter])
      setOpenChapters((prev) => new Set([...prev, newChapter.id]))
    }
  }

  // --- Add unit ---
  async function handleAddUnit(chapterId: string) {
    const chapter = chapters.find((c) => c.id === chapterId)
    const newSortOrder = (chapter?.units.length ?? 0) + 1
    const res = await fetch('/api/manage/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'unit',
        subjectId: chapterId,
        title: '新單元',
        sort_order: newSortOrder,
      }),
    })
    const data = await res.json()
    if (data.unit) {
      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapterId ? { ...c, units: [...c.units, { ...data.unit, subject_id: chapterId }] } : c
        )
      )
      setSelectedUnitId(data.unit.id)
    }
  }

  // --- Delete chapter ---
  async function handleDeleteChapter(chapterId: string) {
    if (!confirm('刪除章節會同時刪除所有單元，確定嗎？')) return
    await fetch(`/api/manage/courses?type=subject&id=${chapterId}`, { method: 'DELETE' })
    setChapters((prev) => prev.filter((c) => c.id !== chapterId))
    if (chapters.find((c) => c.id === chapterId)?.units.some((u) => u.id === selectedUnitId)) {
      setSelectedUnitId(null)
    }
  }

  // --- Delete unit ---
  async function handleDeleteUnit() {
    if (!selectedUnitId || !confirm('確定刪除此單元？')) return
    await fetch(`/api/manage/courses?type=unit&id=${selectedUnitId}`, { method: 'DELETE' })
    setChapters((prev) =>
      prev.map((c) => ({
        ...c,
        units: c.units.filter((u) => u.id !== selectedUnitId),
      }))
    )
    setSelectedUnitId(null)
  }

  // --- Save unit ---
  async function handleSaveUnit() {
    if (!selectedUnitId) return
    setSaveMsg(null)
    const res = await fetch('/api/manage/courses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'unit',
        id: selectedUnitId,
        title: editTitle,
        content_url: editUrl || null,
      }),
    })
    if (res.ok) {
      setChapters((prev) =>
        prev.map((c) => ({
          ...c,
          units: c.units.map((u) =>
            u.id === selectedUnitId ? { ...u, title: editTitle, content_url: editUrl || null } : u
          ),
        }))
      )
      setSaveMsg('已儲存')
      setTimeout(() => setSaveMsg(null), 2000)
    } else {
      setSaveMsg('儲存失敗')
    }
  }

  // --- Reorder units ---
  async function handleReorderUnits(chapterId: string, reordered: { id: string; title: string }[]) {
    // Update local state immediately
    setChapters((prev) =>
      prev.map((c) =>
        c.id === chapterId
          ? {
              ...c,
              units: reordered.map((u, i) => {
                const original = c.units.find((o) => o.id === u.id)!
                return { ...original, sort_order: i + 1 }
              }),
            }
          : c
      )
    )

    // Persist to DB
    await fetch('/api/manage/courses/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'units',
        items: reordered.map((u, i) => ({ id: u.id, sort_order: i + 1 })),
      }),
    })
  }

  // --- Reorder chapters ---
  async function handleReorderChapters(reordered: { id: string; title: string }[]) {
    setChapters((prev) => {
      const chapterMap = new Map(prev.map((c) => [c.id, c]))
      return reordered.map((r, i) => {
        const original = chapterMap.get(r.id)!
        return { ...original, sort_order: i + 1 }
      })
    })

    await fetch('/api/manage/courses/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'subjects',
        items: reordered.map((c, i) => ({ id: c.id, sort_order: i + 1 })),
      }),
    })
  }

  // --- Rename chapter (inline) ---
  async function handleRenameChapter(chapterId: string, newTitle: string) {
    await fetch('/api/manage/courses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'subject', id: chapterId, title: newTitle }),
    })
    setChapters((prev) =>
      prev.map((c) => (c.id === chapterId ? { ...c, title: newTitle } : c))
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-bold text-fg-primary">線上課程管理</h1>
          <span className="text-lg text-fg-muted">/</span>
          <select
            value={selectedServiceId}
            onChange={(e) => handleServiceChange(e.target.value)}
            className="rounded-lg border border-input bg-white px-3 py-1.5 text-sm font-medium text-fg-primary"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="mt-12 text-center text-sm text-fg-muted">載入中...</div>
      ) : (
        <div className="mt-6 flex gap-6">
          {/* Left — tree */}
          <div className="w-96 shrink-0 rounded-xl border border-surface-secondary bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg-primary">課程架構</h2>
              <Button onClick={handleAddChapter} size="sm" variant="outline" className="rounded-lg text-xs">
                <Plus className="mr-1 size-3" /> 新增章節
              </Button>
            </div>
            <div className="mt-4">
              <SortableChapterList
                chapters={chapters}
                onReorder={handleReorderChapters}
              >
                {(ch, { dragHandleProps }) => {
                  const fullChapter = chapters.find((c) => c.id === ch.id)!
                  return (
                    <div>
                      <div className="group flex items-center gap-1">
                        <button
                          {...dragHandleProps}
                          className="cursor-grab px-1 py-2 text-fg-muted hover:text-fg-primary active:cursor-grabbing"
                        >
                          <GripVertical className="size-4" />
                        </button>
                        <button
                          onClick={() => toggleChapter(ch.id)}
                          className="flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-secondary"
                        >
                          <FolderOpen className="size-4 text-fg-muted" />
                          <span className="flex-1 font-medium text-fg-primary">{ch.title}</span>
                          <ChevronDown className={cn('size-4 text-fg-muted transition-transform', openChapters.has(ch.id) && 'rotate-180')} />
                        </button>
                        <button
                          onClick={() => handleDeleteChapter(ch.id)}
                          className="hidden rounded p-1 text-fg-muted hover:text-destructive group-hover:block"
                          title="刪除章節"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {openChapters.has(ch.id) && (
                        <div className="ml-6">
                          <SortableUnitList
                            units={fullChapter.units}
                            selectedUnitId={selectedUnitId}
                            onSelectUnit={setSelectedUnitId}
                            onReorder={(reordered) => handleReorderUnits(ch.id, reordered)}
                          />
                          <button
                            onClick={() => handleAddUnit(ch.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:text-fg-primary"
                          >
                            <Plus className="size-3.5" /> 新增單元
                          </button>
                        </div>
                      )}
                    </div>
                  )
                }}
              </SortableChapterList>
              {chapters.length === 0 && (
                <p className="py-8 text-center text-xs text-fg-muted">
                  尚無課程架構，點擊「新增章節」開始
                </p>
              )}
            </div>
          </div>

          {/* Right — unit editor */}
          <div className="flex-1 rounded-xl border border-surface-secondary bg-white p-6">
            {selectedUnit ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-fg-primary">單元編輯</h2>
                  <Badge className="bg-brand-purple text-xs text-white">{selectedUnit.title}</Badge>
                </div>

                <div className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-fg-primary">單元標題</label>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-10 rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-fg-primary">影片連結</label>
                    <Input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="https://youtu.be/abc123..."
                      className="h-10 rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-fg-primary">教材附件</label>
                    <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-surface-secondary py-8">
                      <p className="text-sm text-fg-muted">拖換上傳或點擊選擇檔案（PDF / PPTX）</p>
                    </div>
                  </div>
                </div>

                {saveMsg && (
                  <p className={`mt-4 flex items-center gap-1 text-sm ${saveMsg === '已儲存' ? 'text-brand-teal' : 'text-destructive'}`}>
                    {saveMsg === '已儲存' && <Check className="size-4" />}
                    {saveMsg}
                  </p>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <Button onClick={handleDeleteUnit} variant="outline" className="rounded-lg text-sm">
                    <Trash2 className="mr-1.5 size-4" /> 刪除單元
                  </Button>
                  <Button onClick={handleSaveUnit} className="rounded-lg bg-brand-purple text-sm text-white hover:bg-brand-purple/90">
                    <Save className="mr-1.5 size-4" /> 儲存
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-fg-muted">
                選擇左側單元進行編輯
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
