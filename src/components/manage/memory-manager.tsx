'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Memory {
  id: string
  category: string
  content: string
  created_at: string
  updated_at: string
  user_name: string
  user_phone: string
}

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  personality: { label: '個性', color: 'bg-brand-purple' },
  preference: { label: '偏好', color: 'bg-brand-teal' },
  relationship: { label: '關係', color: 'bg-brand-orange' },
  goal: { label: '目標', color: 'bg-brand-rose' },
  event: { label: '事件', color: 'bg-fg-muted' },
}

export function MemoryManager({ memories: initial }: { memories: Memory[] }) {
  const [memories, setMemories] = useState(initial)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  const categories = [...new Set(initial.map((m) => m.category))]

  const filtered = memories.filter((m) => {
    if (categoryFilter !== 'all' && m.category !== categoryFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        m.user_name.toLowerCase().includes(q) ||
        m.user_phone.includes(q) ||
        m.content.toLowerCase().includes(q)
      )
    }
    return true
  })

  async function handleDelete(id: string) {
    if (!confirm('確定要刪除這條記憶嗎���')) return
    setDeleting(id)
    try {
      const res = await fetch('/api/manage/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id))
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="mt-6">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="搜尋用戶、手機、內容…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-primary outline-none focus:border-brand-purple"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-secondary outline-none focus:border-brand-purple"
        >
          <option value="all">全部類型</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_MAP[c]?.label ?? c}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-fg-muted">共 {filtered.length} 筆</div>
      </div>

      {/* Memory list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-surface-secondary bg-white px-5 py-12 text-center text-fg-muted">
            尚無記憶資料
          </div>
        )}
        {filtered.map((m) => {
          const cat = CATEGORY_MAP[m.category] ?? { label: m.category, color: 'bg-fg-muted' }
          return (
            <div
              key={m.id}
              className="flex items-start gap-4 rounded-xl border border-surface-secondary bg-white px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <Badge className={`${cat.color} text-[10px] text-white`}>{cat.label}</Badge>
                  <span className="text-xs font-medium text-fg-primary">{m.user_name}</span>
                  <span className="text-xs text-fg-muted">{m.user_phone}</span>
                </div>
                <p className="text-sm text-fg-secondary">{m.content}</p>
                <p className="mt-1 text-[10px] text-fg-muted">
                  建立：{new Date(m.created_at).toLocaleString('zh-TW')}
                  {m.updated_at !== m.created_at && (
                    <> · ���新：{new Date(m.updated_at).toLocaleString('zh-TW')}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deleting === m.id}
                className="shrink-0 rounded-lg p-2 text-fg-muted transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                title="刪除記憶"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
