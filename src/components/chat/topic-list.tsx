'use client'

import { useState } from 'react'
import { Plus, Pin, Trash2, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Topic {
  id: string
  title: string
  is_pinned: boolean
  updated_at: string
}

interface TopicListProps {
  topics: Topic[]
  activeTopicId: string | null
  onSelect: (topicId: string) => void
  onCreate: () => void
  onDelete: (topicId: string) => void
  onTogglePin: (topicId: string, pinned: boolean) => void
}

export function TopicList({
  topics,
  activeTopicId,
  onSelect,
  onCreate,
  onDelete,
  onTogglePin,
}: TopicListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-fg-inverse">對話記錄</h3>
        <Button
          onClick={onCreate}
          size="icon-xs"
          className="rounded-lg bg-brand-purple text-white hover:bg-brand-purple/90"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {topics.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-fg-muted">
            還沒有對話記錄
            <br />
            點擊上方 + 開始新對話
          </p>
        )}
        {topics.map((topic) => {
          const isActive = topic.id === activeTopicId
          const isHovered = topic.id === hoveredId
          return (
            <div
              key={topic.id}
              onMouseEnter={() => setHoveredId(topic.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(topic.id)}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition-colors',
                isActive
                  ? 'bg-brand-purple/20 text-fg-inverse'
                  : 'text-fg-muted hover:bg-dark-elevated hover:text-fg-inverse'
              )}
            >
              <MessageSquare className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {topic.is_pinned && (
                  <Pin className="mr-1 inline size-3 text-brand-orange" />
                )}
                {topic.title}
              </span>

              {/* Actions on hover */}
              {(isHovered || isActive) && (
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onTogglePin(topic.id, !topic.is_pinned)
                    }}
                    className={cn(
                      'rounded p-1 hover:bg-dark-elevated',
                      topic.is_pinned ? 'text-brand-orange' : 'text-fg-muted'
                    )}
                    title={topic.is_pinned ? '取消釘選' : '釘選'}
                  >
                    <Pin className="size-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(topic.id)
                    }}
                    className="rounded p-1 text-fg-muted hover:bg-dark-elevated hover:text-destructive"
                    title="刪除"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
