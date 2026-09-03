'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeft,
  MessageSquare,
  List,
} from 'lucide-react'
import Link from 'next/link'
import { ProgressRing } from '@/components/course/progress-ring'
import { UnitList } from '@/components/course/unit-list'
import { VideoPlayer } from '@/components/course/video-player'
import { ChatPanel } from '@/components/chat/chat-panel'
import { TopicList } from '@/components/chat/topic-list'
import { Button } from '@/components/ui/button'

interface Unit {
  id: string
  title: string
  content_url?: string | null
  completed?: boolean
}

interface Chapter {
  id: string
  title: string
  units: Unit[]
}

interface Topic {
  id: string
  title: string
  is_pinned: boolean
  updated_at: string
}

interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface LearningDashboardProps {
  serviceName: string
  serviceId: string
  serviceCode: string
  teacherId: string | null
  chapters: Chapter[]
  units: Unit[]
  initialUnitId: string | null
  dialogLimit: number
  readonly?: boolean
}

export function LearningDashboard({
  serviceName,
  serviceId,
  serviceCode,
  teacherId,
  chapters,
  units,
  initialUnitId,
  dialogLimit,
  readonly = false,
}: LearningDashboardProps) {
  const [activeUnitId, setActiveUnitId] = useState(initialUnitId)
  const [showOutline, setShowOutline] = useState(true)
  const [showChat, setShowChat] = useState(true)
  const [showTopicList, setShowTopicList] = useState(false)

  // Topic state
  const [topics, setTopics] = useState<Topic[]>([])
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
  const [historyMessages, setHistoryMessages] = useState<HistoryMessage[]>([])
  const [loadingTopics, setLoadingTopics] = useState(true)

  const activeUnit = units.find((u) => u.id === activeUnitId)
  const activeIndex = units.findIndex((u) => u.id === activeUnitId)
  const prevUnit = activeIndex > 0 ? units[activeIndex - 1] : null
  const nextUnit = activeIndex < units.length - 1 ? units[activeIndex + 1] : null
  const completedCount = units.filter((u) => u.completed).length
  const progressPercent = units.length > 0 ? Math.round((completedCount / units.length) * 100) : 0

  // --- Load topics ---
  const fetchTopics = useCallback(async () => {
    if (readonly) { setLoadingTopics(false); return }
    try {
      const res = await fetch(`/api/chat/topics?serviceId=${serviceId}`)
      const data = await res.json()
      setTopics(data.topics ?? [])
    } catch { /* ignore */ } finally { setLoadingTopics(false) }
  }, [serviceId, readonly])

  useEffect(() => { fetchTopics() }, [fetchTopics])

  useEffect(() => {
    if (!readonly && !loadingTopics && topics.length > 0 && !activeTopicId) {
      handleSelectTopic(topics[0].id)
    }
  }, [loadingTopics, topics]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelectTopic(topicId: string) {
    setActiveTopicId(topicId)
    try {
      const res = await fetch(`/api/chat/topics/${topicId}`)
      const data = await res.json()
      setHistoryMessages(
        (data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      )
    } catch { setHistoryMessages([]) }
  }

  async function handleCreateTopic() {
    try {
      const res = await fetch('/api/chat/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, teacherId, title: '新對話' }),
      })
      const data = await res.json()
      if (data.topic) {
        setTopics((prev) => [data.topic, ...prev])
        handleSelectTopic(data.topic.id)
      }
    } catch { /* ignore */ }
  }

  async function handleDeleteTopic(topicId: string) {
    try {
      await fetch(`/api/chat/topics/${topicId}`, { method: 'DELETE' })
      setTopics((prev) => prev.filter((t) => t.id !== topicId))
      if (activeTopicId === topicId) { setActiveTopicId(null); setHistoryMessages([]) }
    } catch { /* ignore */ }
  }

  async function handleTogglePin(topicId: string, pinned: boolean) {
    try {
      await fetch(`/api/chat/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: pinned }),
      })
      setTopics((prev) =>
        prev
          .map((t) => (t.id === topicId ? { ...t, is_pinned: pinned } : t))
          .sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          })
      )
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-screen flex-col bg-dark-bg text-fg-inverse">
      {/* Guest banner */}
      {readonly && (
        <div className="flex items-center justify-center gap-4 bg-brand-orange/90 px-4 py-2 text-sm font-medium text-white">
          <span>您正在免費體驗模式，註冊即可完整使用 AI 家教與對話功能</span>
          <Link href="/register">
            <Button size="sm" className="rounded-lg bg-white text-brand-orange hover:bg-white/90">立即註冊</Button>
          </Link>
        </div>
      )}

      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-dark-elevated bg-dark-surface px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-dark-elevated hover:text-fg-inverse"
          >
            <ArrowLeft className="size-4" />
            返回
          </Link>
          <span className="text-sm font-medium text-fg-inverse">{serviceName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowOutline(!showOutline)}
            className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-dark-elevated hover:text-fg-inverse"
            title={showOutline ? '隱藏課程目錄' : '顯示課程目錄'}
          >
            {showOutline ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>
          {!readonly && (
            <button
              onClick={() => setShowChat(!showChat)}
              className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-dark-elevated hover:text-fg-inverse"
              title={showChat ? '隱藏對話面板' : '顯示對話面板'}
            >
              {showChat ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Left — Course Outline */}
        {showOutline && (
          <aside className="flex w-72 shrink-0 flex-col border-r border-dark-elevated bg-dark-surface">
            {/* Progress */}
            <div className="flex items-center gap-3 border-b border-dark-elevated px-4 py-3">
              <ProgressRing percent={progressPercent} size={40} strokeWidth={3} />
              <div>
                <p className="text-xs font-medium text-fg-inverse">{progressPercent}% 完成</p>
                <p className="text-[10px] text-fg-muted">{completedCount} / {units.length} 小節</p>
              </div>
            </div>
            {/* Unit list */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <UnitList
                chapters={chapters}
                activeUnitId={activeUnitId ?? undefined}
                onSelectUnit={setActiveUnitId}
              />
            </div>
          </aside>
        )}

        {/* Center — Video + Controls */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Video */}
          <div className="relative min-h-0 flex-1 bg-black">
            <VideoPlayer url={activeUnit?.content_url ?? null} />
          </div>

          {/* Video controls bar */}
          <div className="flex items-center justify-between border-t border-dark-elevated bg-dark-surface px-5 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-fg-inverse">
                {activeUnit?.title ?? '選擇課程單元'}
              </h2>
              <p className="mt-0.5 text-[10px] text-fg-muted">
                第 {activeIndex + 1} / {units.length} 課
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!prevUnit}
                onClick={() => prevUnit && setActiveUnitId(prevUnit.id)}
                className="rounded-lg border-white/20 bg-transparent text-xs text-white hover:bg-white/10 disabled:opacity-30"
              >
                <ChevronLeft className="mr-1 size-3.5" /> 上一課
              </Button>
              <Button
                size="sm"
                disabled={!nextUnit}
                onClick={() => nextUnit && setActiveUnitId(nextUnit.id)}
                className="rounded-lg bg-brand-purple text-xs text-white hover:bg-brand-purple/90 disabled:opacity-30"
              >
                下一課 <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        </main>

        {/* Right — Chat Panel */}
        {!readonly && showChat && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-dark-elevated">
            {showTopicList ? (
              <div className="flex h-full flex-col bg-dark-surface">
                <div className="flex items-center justify-between border-b border-dark-elevated px-4 py-2">
                  <span className="text-xs font-medium text-fg-muted">對話記錄</span>
                  <button
                    onClick={() => setShowTopicList(false)}
                    className="rounded p-1 text-fg-muted hover:bg-dark-elevated hover:text-fg-inverse"
                  >
                    <PanelRightClose className="size-4" />
                  </button>
                </div>
                <TopicList
                  topics={topics}
                  activeTopicId={activeTopicId}
                  onSelect={(id) => { handleSelectTopic(id); setShowTopicList(false) }}
                  onCreate={() => { handleCreateTopic(); setShowTopicList(false) }}
                  onDelete={handleDeleteTopic}
                  onTogglePin={handleTogglePin}
                />
              </div>
            ) : (
              <div className="flex h-full flex-col">
                {/* Chat header */}
                <div className="flex items-center gap-2 border-b border-dark-elevated bg-dark-surface px-3 py-2">
                  <button
                    onClick={() => setShowTopicList(true)}
                    className="rounded p-1 text-fg-muted hover:bg-dark-elevated hover:text-fg-inverse"
                    title="對話記錄"
                  >
                    <List className="size-4" />
                  </button>
                  <MessageSquare className="size-3.5 text-brand-purple" />
                  <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                    {topics.find((t) => t.id === activeTopicId)?.title ?? '新對話'}
                  </span>
                  <span className="shrink-0 rounded bg-brand-purple/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-purple">
                    {dialogLimit} 點
                  </span>
                </div>
                {/* Chat body */}
                <div className="min-h-0 flex-1">
                  <ChatPanel
                    topicId={activeTopicId}
                    teacherId={teacherId}
                    serviceId={serviceId}
                    initialMessages={historyMessages}
                    dayLabel="Day 7/21"
                  />
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
