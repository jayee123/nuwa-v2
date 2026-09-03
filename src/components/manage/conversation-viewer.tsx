'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ChevronLeft, Pin, Download, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Topic {
  id: string
  title: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  mode: string
  unpack_context: Record<string, unknown> | null
  user_name: string
  user_phone: string
  teacher_name: string
  message_count: number
}

interface Message {
  id: string
  role: string
  content: string
  token_count: number
  created_at: string
}

export function ConversationViewer({ topics }: { topics: Topic[] }) {
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<'all' | 'unpack' | 'journey' | 'free'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalMessages, setTotalMessages] = useState(0)

  const filtered = topics.filter((t) => {
    // Mode filter
    if (modeFilter !== 'all' && t.mode !== modeFilter) return false
    // Search filter
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.user_name.toLowerCase().includes(q) ||
      t.user_phone.includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.teacher_name.toLowerCase().includes(q)
    )
  })

  const modeCounts = {
    all: topics.length,
    unpack: topics.filter((t) => t.mode === 'unpack').length,
    journey: topics.filter((t) => t.mode === 'journey').length,
    free: topics.filter((t) => t.mode === 'free' || !t.mode).length,
  }

  const MODE_LABELS: Record<string, { label: string; color: string }> = {
    unpack: { label: '解卡點', color: 'bg-brand-purple text-white' },
    journey: { label: '21 天', color: 'bg-brand-teal text-white' },
    free: { label: '自由聊', color: 'bg-surface-secondary text-fg-secondary' },
  }

  async function fetchMessages(topicId: string, page: number) {
    setLoadingId(topicId)
    try {
      const res = await fetch(`/api/manage/conversations?topicId=${topicId}&page=${page}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages ?? [])
        setCurrentPage(data.page)
        setTotalPages(data.totalPages)
        setTotalMessages(data.total)
      }
    } finally {
      setLoadingId(null)
    }
  }

  async function toggleExpand(topicId: string) {
    if (expandedId === topicId) {
      setExpandedId(null)
      setMessages([])
      return
    }
    setExpandedId(topicId)
    setCurrentPage(1)
    await fetchMessages(topicId, 1)
  }

  async function goToPage(page: number) {
    if (!expandedId || page < 1 || page > totalPages) return
    await fetchMessages(expandedId, page)
  }

  // Fix chat roles
  const [fixing, setFixing] = useState(false)
  const [fixResult, setFixResult] = useState<string | null>(null)

  async function handleFixRoles() {
    if (!confirm('確定要修正所有對話的角色標籤嗎？')) return
    setFixing(true)
    setFixResult(null)
    try {
      const res = await fetch('/api/manage/fix-chat-roles', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setFixResult(`✅ ${data.message}`)
      } else {
        setFixResult(`❌ ${data.error ?? '修正失敗'}`)
      }
    } catch {
      setFixResult('❌ 網路錯誤')
    } finally {
      setFixing(false)
    }
  }

  // Stats
  const totalMsgCount = filtered.reduce((sum, t) => sum + t.message_count, 0)

  function handleExport() {
    const headers = ['用戶', '手機', '教師', '主題', '訊息數', '最後更新']
    const rows = filtered.map((t) => [
      t.user_name,
      t.user_phone,
      t.teacher_name,
      t.title,
      t.message_count.toString(),
      new Date(t.updated_at).toLocaleString('zh-TW'),
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversations_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="mt-6">
      {/* Summary */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-surface-secondary bg-white p-4">
          <p className="text-xs text-fg-muted">對話主題數</p>
          <p className="mt-1 text-xl font-bold text-fg-primary">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-4">
          <p className="text-xs text-fg-muted">總訊息數</p>
          <p className="mt-1 text-xl font-bold text-fg-primary">{totalMsgCount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-4">
          <p className="text-xs text-fg-muted">參與用戶</p>
          <p className="mt-1 text-xl font-bold text-fg-primary">
            {new Set(filtered.map((t) => t.user_phone)).size}
          </p>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-secondary p-1">
        {([
          ['all', '全部', modeCounts.all],
          ['unpack', '解卡點', modeCounts.unpack],
          ['journey', '21 天練習', modeCounts.journey],
          ['free', '自由聊', modeCounts.free],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setModeFilter(key as typeof modeFilter)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              modeFilter === key
                ? 'bg-white text-fg-primary shadow-sm'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {label}
            <span className="ml-1.5 text-[10px] opacity-60">{count}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="搜尋用戶、手機、主題、教師…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-primary outline-none focus:border-brand-purple"
        />
        <div className="ml-auto flex items-center gap-2">
          {fixResult && <span className="text-xs">{fixResult}</span>}
          <button
            onClick={handleFixRoles}
            disabled={fixing}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {fixing ? '修正中…' : '修正角色標籤'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary/50"
          >
            <Download className="size-3.5" />
            匯出 CSV
          </button>
        </div>
      </div>

      {/* Topic list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-surface-secondary bg-white px-5 py-12 text-center text-fg-muted">
            尚無對話紀錄
          </div>
        )}
        {filtered.map((t) => {
          const isExpanded = expandedId === t.id
          return (
            <div key={t.id} className="overflow-hidden rounded-xl border border-surface-secondary bg-white">
              {/* Topic row */}
              <button
                onClick={() => toggleExpand(t.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-secondary/30"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 shrink-0 text-fg-muted" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${MODE_LABELS[t.mode]?.color ?? 'bg-surface-secondary text-fg-muted'}`}>
                      {MODE_LABELS[t.mode]?.label ?? t.mode}
                    </Badge>
                    <span className="truncate text-sm font-medium text-fg-primary">{t.title}</span>
                    {t.is_pinned && <Pin className="size-3 text-brand-orange" />}
                    <span className="flex items-center gap-1 text-[10px] text-fg-muted">
                      <MessageCircle className="size-3" />
                      {t.message_count}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-fg-muted">
                    <span>{t.user_name}（{t.user_phone}）</span>
                    <span>教師：{t.teacher_name}</span>
                    {t.mode === 'unpack' && t.unpack_context && (
                      <span className="text-brand-purple">
                        {(t.unpack_context as { stage?: string }).stage ?? ''}
                        {(t.unpack_context as { problem_summary?: string }).problem_summary
                          ? ` · ${((t.unpack_context as { problem_summary: string }).problem_summary).slice(0, 20)}…`
                          : ''}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-fg-muted">
                  {new Date(t.updated_at).toLocaleString('zh-TW')}
                </span>
              </button>

              {/* Expanded messages */}
              {isExpanded && (
                <div className="border-t border-surface-secondary bg-surface-primary/50 px-5 py-4">
                  {loadingId === t.id ? (
                    <p className="text-center text-sm text-fg-muted">載入中…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-fg-muted">此對話尚無訊息</p>
                  ) : (
                    <>
                      <div className="max-h-[32rem] space-y-3 overflow-y-auto">
                        {messages.map((m, idx) => {
                          // 判斷是否為 AI 回覆：
                          // 1. role 正確標記為 assistant
                          // 2. token_count > 0（有 token 計數的一定是 AI）
                          // 3. 舊資料全部是 user 時，用交替模式（偶數=用戶、奇數=AI）
                          const allSameRole = messages.every((msg) => msg.role === 'user')
                          const isAI = m.role === 'assistant' || m.token_count > 0 || (allSameRole && idx % 2 === 1)
                          return (
                          <div
                            key={m.id}
                            className={`rounded-lg p-3 text-sm ${
                              isAI
                                ? 'mr-8 bg-white text-fg-secondary'
                                : 'ml-8 bg-brand-purple/10 text-fg-primary'
                            }`}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <Badge
                                className={`text-[10px] ${
                                  isAI ? 'bg-brand-teal text-white' : 'bg-brand-purple text-white'
                                }`}
                              >
                                {isAI ? 'AI' : '用戶'}
                              </Badge>
                              <span className="text-[10px] text-fg-muted">
                                {new Date(m.created_at).toLocaleString('zh-TW')}
                              </span>
                              {m.token_count > 0 && (
                                <span className="text-[10px] text-fg-muted">{m.token_count} tokens</span>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          </div>
                          )
                        })}
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="mt-3 flex items-center justify-center gap-2 border-t border-surface-secondary pt-3">
                          <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage <= 1}
                            className="rounded p-1 text-fg-muted transition-colors hover:bg-surface-secondary disabled:opacity-30"
                          >
                            <ChevronLeft className="size-4" />
                          </button>
                          <span className="text-xs text-fg-muted">
                            第 {currentPage} / {totalPages} 頁（共 {totalMessages} 則訊息）
                          </span>
                          <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage >= totalPages}
                            className="rounded p-1 text-fg-muted transition-colors hover:bg-surface-secondary disabled:opacity-30"
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
