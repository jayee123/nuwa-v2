'use client'

import { useState } from 'react'
import { Download, UserCheck, UserX, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Registration {
  id: string
  email: string | null
  status: string
  reminder_sent: boolean
  created_at: string
  users: { nickname: string | null; phone: string; email: string | null } | null
  physical_courses: { name: string; class_start: string | null; status: string } | null
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  registered: { label: '已報名', color: 'bg-brand-teal' },
  cancelled: { label: '已取消', color: 'bg-destructive' },
  attended: { label: '已出席', color: 'bg-brand-purple' },
}

const COURSE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned: { label: '規劃中', color: 'bg-fg-muted' },
  open: { label: '報名中', color: 'bg-brand-orange' },
  completed: { label: '已結束', color: 'bg-fg-muted' },
}

export function RegistrationTable({
  registrations: initial,
  courseNames,
}: {
  registrations: Registration[]
  courseNames: string[]
}) {
  const [registrations, setRegistrations] = useState(initial)
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  const filtered = registrations.filter((r) => {
    if (courseFilter !== 'all' && r.physical_courses?.name !== courseFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = (r.users?.nickname ?? '').toLowerCase()
      const phone = (r.users?.phone ?? '').toLowerCase()
      const email = (r.users?.email ?? r.email ?? '').toLowerCase()
      if (!name.includes(q) && !phone.includes(q) && !email.includes(q)) return false
    }
    return true
  })

  // Stats
  const attendedCount = filtered.filter((r) => r.status === 'attended').length
  const registeredCount = filtered.filter((r) => r.status === 'registered').length

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    try {
      const res = await fetch('/api/manage/registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (res.ok) {
        setRegistrations((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r))
        )
      }
    } finally {
      setUpdating(null)
    }
  }

  function handleExport() {
    const headers = ['用戶', '手機', 'Email', '課程', '課程狀態', '報名狀態', '已提醒', '報名時間']
    const rows = filtered.map((r) => [
      r.users?.nickname ?? '未知',
      r.users?.phone ?? '',
      r.users?.email ?? r.email ?? '',
      r.physical_courses?.name ?? '-',
      COURSE_STATUS_MAP[r.physical_courses?.status ?? '']?.label ?? r.physical_courses?.status ?? '-',
      STATUS_MAP[r.status]?.label ?? r.status,
      r.reminder_sent ? '是' : '否',
      r.created_at ? new Date(r.created_at).toLocaleString('zh-TW') : '-',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registrations_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="mt-6">
      {/* Summary */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-surface-secondary bg-white p-4">
          <p className="text-xs text-fg-muted">總報名數</p>
          <p className="mt-1 text-xl font-bold text-fg-primary">{filtered.length}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-4">
          <p className="text-xs text-fg-muted">已出席</p>
          <p className="mt-1 text-xl font-bold text-brand-purple">{attendedCount}</p>
        </div>
        <div className="rounded-xl border border-surface-secondary bg-white p-4">
          <p className="text-xs text-fg-muted">待出席</p>
          <p className="mt-1 text-xl font-bold text-brand-teal">{registeredCount}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="搜尋用戶、手機、Email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-primary outline-none focus:border-brand-purple"
        />
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-secondary outline-none focus:border-brand-purple"
        >
          <option value="all">全部課程</option>
          {courseNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-surface-secondary bg-white px-3 py-1.5 text-sm text-fg-secondary outline-none focus:border-brand-purple"
        >
          <option value="all">全部狀態</option>
          <option value="registered">已報名</option>
          <option value="attended">已出席</option>
          <option value="cancelled">已取消</option>
        </select>
        <div className="ml-auto text-xs text-fg-muted">共 {filtered.length} 筆</div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-surface-secondary px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface-secondary/50"
        >
          <Download className="size-3.5" />
          匯出 CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3">用戶</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">課程</th>
              <th className="px-5 py-3">開課日期</th>
              <th className="px-5 py-3">課程狀態</th>
              <th className="px-5 py-3">報名狀態</th>
              <th className="px-5 py-3">已提醒</th>
              <th className="px-5 py-3">報名時間</th>
              <th className="px-5 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-fg-muted">
                  尚無報名紀錄
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const st = STATUS_MAP[r.status] ?? { label: r.status, color: 'bg-fg-muted' }
              const cst = COURSE_STATUS_MAP[r.physical_courses?.status ?? ''] ?? {
                label: r.physical_courses?.status ?? '-',
                color: 'bg-fg-muted',
              }
              const isUpdating = updating === r.id
              return (
                <tr key={r.id} className="border-b border-surface-secondary last:border-0">
                  <td className="px-5 py-4">
                    <p className="font-medium text-fg-primary">{r.users?.nickname ?? '未知'}</p>
                    <p className="text-xs text-fg-muted">{r.users?.phone}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-fg-muted">{r.users?.email ?? r.email ?? '-'}</td>
                  <td className="px-5 py-4 text-fg-secondary">{r.physical_courses?.name ?? '-'}</td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {r.physical_courses?.class_start
                      ? new Date(r.physical_courses.class_start).toLocaleDateString('zh-TW')
                      : '-'}
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`${cst.color} text-xs text-white`}>{cst.label}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`${st.color} text-xs text-white`}>{st.label}</Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-fg-muted">{r.reminder_sent ? '✓' : '-'}</td>
                  <td className="px-5 py-4 text-xs text-fg-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleString('zh-TW') : '-'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      {r.status === 'registered' && (
                        <>
                          <button
                            onClick={() => updateStatus(r.id, 'attended')}
                            disabled={isUpdating}
                            className="rounded p-1.5 text-brand-purple transition-colors hover:bg-brand-purple/10 disabled:opacity-50"
                            title="確認出席"
                          >
                            <UserCheck className="size-4" />
                          </button>
                          <button
                            onClick={() => updateStatus(r.id, 'cancelled')}
                            disabled={isUpdating}
                            className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                            title="取消報名"
                          >
                            <UserX className="size-4" />
                          </button>
                        </>
                      )}
                      {(r.status === 'attended' || r.status === 'cancelled') && (
                        <button
                          onClick={() => updateStatus(r.id, 'registered')}
                          disabled={isUpdating}
                          className="rounded p-1.5 text-fg-muted transition-colors hover:bg-surface-secondary disabled:opacity-50"
                          title="恢復為已報名"
                        >
                          <RotateCcw className="size-4" />
                        </button>
                      )}
                    </div>
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
