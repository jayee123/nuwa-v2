'use client'

import { useState } from 'react'
import { Send, Bell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Notification {
  id: string
  type: string
  title: string
  content: string | null
  read_at: string | null
  created_at: string
  user_name: string
  user_phone: string
}

interface UserOption {
  id: string
  label: string
}

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  system: { label: '系統', color: 'bg-brand-purple' },
  payment: { label: '付款', color: 'bg-brand-teal' },
  course: { label: '課程', color: 'bg-brand-orange' },
  subscription: { label: '訂閱', color: 'bg-brand-rose' },
  general: { label: '一般', color: 'bg-fg-muted' },
}

export function NotificationManager({
  notifications: initial,
  users,
}: {
  notifications: Notification[]
  users: UserOption[]
}) {
  const [notifications, setNotifications] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [sending, setSending] = useState(false)

  // Send form state
  const [target, setTarget] = useState<'all' | 'single'>('all')
  const [selectedUser, setSelectedUser] = useState('')
  const [nType, setNType] = useState('system')
  const [nTitle, setNTitle] = useState('')
  const [nContent, setNContent] = useState('')

  async function handleSend() {
    if (!nTitle.trim()) return alert('請輸入通知標題')
    if (target === 'single' && !selectedUser) return alert('請選擇用戶')

    setSending(true)
    try {
      const res = await fetch('/api/manage/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          userId: target === 'single' ? selectedUser : undefined,
          type: nType,
          title: nTitle,
          content: nContent || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setNotifications((prev) => [...(data.notifications ?? []).map((n: Notification & { users?: { nickname: string | null; phone: string } | null }) => ({
          ...n,
          user_name: n.users?.nickname ?? '未知',
          user_phone: n.users?.phone ?? '',
        })), ...prev])
        setShowForm(false)
        setNTitle('')
        setNContent('')
        setSelectedUser('')
      } else {
        alert('發送失敗')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Send button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-purple/90"
        >
          <Send className="size-4" />
          發送通知
        </button>
      </div>

      {/* Send form */}
      {showForm && (
        <div className="rounded-xl border border-surface-secondary bg-white p-5 space-y-4">
          <h2 className="text-sm font-medium text-fg-primary">發送新通知</h2>

          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="target"
                checked={target === 'all'}
                onChange={() => setTarget('all')}
                className="accent-brand-purple"
              />
              全部用戶
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="target"
                checked={target === 'single'}
                onChange={() => setTarget('single')}
                className="accent-brand-purple"
              />
              指定用戶
            </label>
          </div>

          {target === 'single' && (
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full rounded-lg border border-surface-secondary bg-white px-3 py-2 text-sm outline-none focus:border-brand-purple"
            >
              <option value="">選擇用戶…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={nType}
            onChange={(e) => setNType(e.target.value)}
            className="rounded-lg border border-surface-secondary bg-white px-3 py-2 text-sm outline-none focus:border-brand-purple"
          >
            {Object.entries(TYPE_MAP).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="通知標題"
            value={nTitle}
            onChange={(e) => setNTitle(e.target.value)}
            className="w-full rounded-lg border border-surface-secondary bg-white px-3 py-2 text-sm outline-none focus:border-brand-purple"
          />
          <textarea
            placeholder="通知內容（選填）"
            value={nContent}
            onChange={(e) => setNContent(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-surface-secondary bg-white px-3 py-2 text-sm outline-none focus:border-brand-purple"
          />

          <div className="flex gap-2">
            <button
              onClick={handleSend}
              disabled={sending}
              className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-purple/90 disabled:opacity-50"
            >
              {sending ? '發送中…' : '確認發送'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-surface-secondary px-4 py-2 text-sm text-fg-secondary transition-colors hover:bg-surface-secondary/50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Notification list */}
      <div className="overflow-x-auto rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3">用戶</th>
              <th className="px-5 py-3">類型</th>
              <th className="px-5 py-3">標題</th>
              <th className="px-5 py-3">內容</th>
              <th className="px-5 py-3">已讀</th>
              <th className="px-5 py-3">發送時間</th>
            </tr>
          </thead>
          <tbody>
            {notifications.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-fg-muted">
                  尚無通知紀錄
                </td>
              </tr>
            )}
            {notifications.map((n) => {
              const t = TYPE_MAP[n.type] ?? { label: n.type, color: 'bg-fg-muted' }
              return (
                <tr key={n.id} className="border-b border-surface-secondary last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-fg-primary">{n.user_name}</p>
                    <p className="text-xs text-fg-muted">{n.user_phone}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`${t.color} text-[10px] text-white`}>{t.label}</Badge>
                  </td>
                  <td className="px-5 py-4 text-fg-primary">{n.title}</td>
                  <td className="max-w-48 truncate px-5 py-4 text-xs text-fg-muted">{n.content ?? '-'}</td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {n.read_at ? (
                      <span className="text-brand-teal">✓ {new Date(n.read_at).toLocaleString('zh-TW')}</span>
                    ) : (
                      <span className="text-fg-muted">未讀</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {new Date(n.created_at).toLocaleString('zh-TW')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
