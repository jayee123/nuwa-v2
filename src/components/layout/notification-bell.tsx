'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'

interface Notification {
  id: string
  type: string
  title: string
  content: string | null
  read_at: string | null
  created_at: string
}

const TYPE_ICON: Record<string, string> = {
  system: '🔔',
  payment: '💳',
  course: '📚',
  subscription: '📋',
  general: '📢',
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch on first open
  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
        setUnreadCount(data.unreadCount ?? 0)
        setLoaded(true)
      }
    } catch {
      // silent
    }
  }

  // Fetch on mount for badge count
  useEffect(() => {
    fetchNotifications()
  }, [])

  function handleToggle() {
    if (!open && !loaded) {
      fetchNotifications()
    }
    setOpen(!open)
  }

  async function handleMarkAllRead() {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: 'all' }),
    })
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
      )
      setUnreadCount(0)
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
    return `${days} 天前`
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className="relative rounded-lg p-2 text-fg-secondary transition-colors hover:bg-surface-secondary hover:text-fg-primary"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-surface-secondary bg-background shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-secondary px-4 py-3">
            <p className="text-sm font-medium text-fg-primary">通知</p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-brand-purple hover:underline"
              >
                全部標為已讀
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-fg-muted">暫無通知</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-surface-secondary px-4 py-3 last:border-0 ${
                    n.read_at ? '' : 'bg-brand-purple/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm">{TYPE_ICON[n.type] ?? '📢'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm ${n.read_at ? 'text-fg-secondary' : 'font-medium text-fg-primary'}`}>
                          {n.title}
                        </p>
                        {!n.read_at && (
                          <span className="size-1.5 shrink-0 rounded-full bg-brand-purple" />
                        )}
                      </div>
                      {n.content && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{n.content}</p>
                      )}
                      <p className="mt-1 text-[10px] text-fg-muted">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* View all link */}
          <button
            onClick={() => { setOpen(false); router.push('/dashboard/notifications') }}
            className="block w-full border-t border-surface-secondary px-4 py-2.5 text-center text-xs text-brand-purple transition-colors hover:bg-surface-secondary/30"
          >
            查看全部通知
          </button>
        </div>
      )}
    </div>
  )
}
