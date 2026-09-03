'use client'

import { useState, useEffect } from 'react'
import { Bell, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Notification {
  id: string
  type: string
  title: string
  content: string | null
  read_at: string | null
  created_at: string
}

const TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
  system: { label: '系統', icon: '🔔', color: 'bg-brand-purple' },
  payment: { label: '付款', icon: '💳', color: 'bg-brand-teal' },
  course: { label: '課程', icon: '📚', color: 'bg-brand-orange' },
  subscription: { label: '訂閱', icon: '📋', color: 'bg-brand-rose' },
  general: { label: '一般', icon: '📢', color: 'bg-fg-muted' },
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/notifications')
      .then((res) => res.json())
      .then((data) => {
        setNotifications(data.notifications ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  async function markAllRead() {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: 'all' }),
    })
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
      )
    }
  }

  async function markRead(id: string) {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      )
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '剛剛'
    if (mins < 60) return `${mins} 分鐘前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} 小時前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} 天前`
    return new Date(dateStr).toLocaleDateString('zh-TW')
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="size-6 text-brand-purple" />
          <h1 className="font-heading text-2xl font-bold text-fg-primary">通知中心</h1>
          {unreadCount > 0 && (
            <Badge className="bg-destructive text-xs text-white">{unreadCount} 未讀</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary/50"
          >
            <Check className="size-3.5" />
            全部標為已讀
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-fg-muted shadow-sm">載入中…</div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-sm">
          <Bell className="mx-auto mb-3 size-10 text-fg-muted/30" />
          <p className="text-fg-muted">暫無通知</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const t = TYPE_MAP[n.type] ?? TYPE_MAP.general
            return (
              <div
                key={n.id}
                className={`rounded-2xl bg-white px-6 py-4 shadow-sm transition-colors ${
                  n.read_at ? '' : 'border-l-4 border-brand-purple'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-lg">{t.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`${t.color} text-[10px] text-white`}>{t.label}</Badge>
                      <span className="text-[10px] text-fg-muted">{timeAgo(n.created_at)}</span>
                      {!n.read_at && (
                        <span className="size-2 rounded-full bg-brand-purple" />
                      )}
                    </div>
                    <p className={`mt-1 text-sm ${n.read_at ? 'text-fg-secondary' : 'font-medium text-fg-primary'}`}>
                      {n.title}
                    </p>
                    {n.content && (
                      <p className="mt-1 text-xs text-fg-muted">{n.content}</p>
                    )}
                  </div>
                  {!n.read_at && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="shrink-0 rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-surface-secondary hover:text-fg-primary"
                      title="標為已讀"
                    >
                      <Check className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
