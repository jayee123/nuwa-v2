'use client'

import { useState } from 'react'
import { Search, Download, X, Check, ShieldCheck, Shield, User as UserIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CopyableId } from '@/components/ui/copyable-id'
import { GENDER_OPTIONS, genderLabel } from '@/lib/user-fields'

interface User {
  id: string
  nickname: string | null
  phone: string
  email: string | null
  gender: number | null
  birthday: string | null
  role: string
  current_plan: string
  dialog_limit: number
  plan_deadline: string | null
  created_at: string
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-fg-muted',
  basic: 'bg-brand-teal',
  advanced: 'bg-brand-purple',
  premium: 'bg-brand-orange',
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  superadmin: { label: '系統管理員', color: 'bg-red-500', icon: ShieldCheck },
  admin: { label: '管理人員', color: 'bg-brand-orange', icon: Shield },
  user: { label: '一般用戶', color: 'bg-fg-muted', icon: UserIcon },
}

const PLAN_LABELS: Record<string, string> = {
  free: '免費',
  basic: '基本',
  advanced: '進階',
  premium: '旗艦',
}

export function UserTable({
  users: initialUsers,
  total,
  currentUserRole,
}: {
  users: User[]
  total: number
  currentUserRole: string
}) {
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Edit form state
  const [editRole, setEditRole] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editGender, setEditGender] = useState('')
  const [editBirthday, setEditBirthday] = useState('')
  const [editPlan, setEditPlan] = useState('')
  const [editDialogLimit, setEditDialogLimit] = useState('')
  const [editDeadline, setEditDeadline] = useState('')

  const isSuperAdmin = currentUserRole === 'superadmin'

  const filtered = search
    ? users.filter(
        (u) =>
          u.nickname?.toLowerCase().includes(search.toLowerCase()) ||
          u.phone.includes(search) ||
          u.email?.toLowerCase().includes(search.toLowerCase()) ||
          u.id.toLowerCase().includes(search.toLowerCase())
      )
    : users

  function openEdit(user: User) {
    setEditingUser(user)
    setEditRole(user.role)
    setEditNickname(user.nickname ?? '')
    setEditEmail(user.email ?? '')
    setEditGender(user.gender != null ? String(user.gender) : '')
    setEditBirthday(user.birthday ? user.birthday.slice(0, 10) : '')
    setEditPlan(user.current_plan)
    setEditDialogLimit(String(user.dialog_limit))
    setEditDeadline(user.plan_deadline ? user.plan_deadline.slice(0, 10) : '')
    setSaveMsg(null)
  }

  function closeEdit() {
    setEditingUser(null)
    setSaveMsg(null)
  }

  async function handleSave() {
    if (!editingUser) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/manage/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          role: editRole,
          nickname: editNickname,
          // Email 僅系統管理員可送（API 會再擋一次）——
          // 一般管理人員的 modal 是唯讀，這裡連送都不送，避免無謂的 403。
          ...(isSuperAdmin ? { email: editEmail } : {}),
          gender: editGender === '' ? null : Number(editGender),
          birthday: editBirthday || null,
          current_plan: editPlan,
          dialog_limit: Number(editDialogLimit),
          plan_deadline: editDeadline || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        setSaveMsg({ type: 'error', text: json.error || '更新失敗' })
      } else {
        setSaveMsg({ type: 'success', text: '已儲存' })
        // Update local state
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  role: editRole,
                  nickname: editNickname || u.nickname,
                  email: isSuperAdmin ? editEmail : u.email,
                  gender: editGender === '' ? null : Number(editGender),
                  birthday: editBirthday || null,
                  current_plan: editPlan,
                  dialog_limit: Number(editDialogLimit),
                  plan_deadline: editDeadline || null,
                }
              : u
          )
        )
        setTimeout(closeEdit, 800)
      }
    } catch {
      setSaveMsg({ type: 'error', text: '網路錯誤' })
    } finally {
      setSaving(false)
    }
  }

  function handleExport() {
    const headers = ['用戶名稱', 'NUWA ID', '手機', 'Email', '性別', '生日', '角色', '方案', '點數', '到期日', '註冊時間']
    const rows = filtered.map((u) => [
      u.nickname ?? '',
      u.id,
      u.phone,
      u.email ?? '',
      genderLabel(u.gender),
      u.birthday ? u.birthday.slice(0, 10) : '-',
      ROLE_CONFIG[u.role]?.label ?? u.role,
      PLAN_LABELS[u.current_plan] ?? u.current_plan,
      String(u.dialog_limit),
      u.plan_deadline ? new Date(u.plan_deadline).toLocaleDateString('zh-TW') : '-',
      new Date(u.created_at).toLocaleDateString('zh-TW'),
    ])
    // 值裡出現逗號 / 引號 / 換行時要照 CSV 規則跳脫，否則欄位會錯位
    const escapeCsv = (v: string) => (/["\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const roleInfo = (role: string) => ROLE_CONFIG[role] ?? ROLE_CONFIG.user

  return (
    <div className="mt-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-surface-secondary bg-white px-3">
          <Search className="size-4 text-fg-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋用戶（用戶名稱、手機、Email、NUWA ID）..."
            className="h-10 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <Button
          onClick={handleExport}
          className="rounded-xl bg-brand-purple text-sm text-white hover:bg-brand-purple/90"
        >
          <Download className="mr-1.5 size-4" /> 匯出 CSV
        </Button>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-surface-secondary bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
              <th className="px-5 py-3">用戶名稱</th>
              <th className="px-5 py-3">NUWA ID</th>
              <th className="px-5 py-3">手機</th>
              <th className="px-5 py-3">角色</th>
              <th className="px-5 py-3">方案</th>
              <th className="px-5 py-3">點數</th>
              <th className="px-5 py-3">到期日</th>
              <th className="px-5 py-3">註冊時間</th>
              <th className="px-5 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const ri = roleInfo(u.role)
              return (
                <tr key={u.id} className="border-b border-surface-secondary last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-brand-rose/30" />
                      <div>
                        <p className="font-medium text-fg-primary">{u.nickname ?? '未設定'}</p>
                        <p className="text-xs text-fg-muted">{u.email ?? '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <CopyableId value={u.id} truncate />
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{u.phone}</td>
                  <td className="px-5 py-4">
                    <Badge className={`${ri.color} text-xs text-white`}>
                      {ri.label}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`${PLAN_COLORS[u.current_plan] ?? 'bg-fg-muted'} text-xs text-white`}>
                      {PLAN_LABELS[u.current_plan] ?? u.current_plan}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-fg-secondary">{u.dialog_limit}</td>
                  <td className="px-5 py-4 text-fg-secondary">
                    {u.plan_deadline ? new Date(u.plan_deadline).toLocaleDateString('zh-TW') : '-'}
                  </td>
                  <td className="px-5 py-4 text-fg-muted">
                    {new Date(u.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs text-accent-primary hover:underline"
                    >
                      編輯
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-fg-muted">
        顯示 1-{filtered.length} 筆，共 {total} 筆
      </p>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-fg-primary">編輯用戶</h3>
              <button onClick={closeEdit} className="text-fg-muted hover:text-fg-primary">
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-1 text-sm text-fg-muted">
              {editingUser.phone} · {editingUser.nickname ?? '未設定'}
            </div>
            <div className="mt-1">
              <CopyableId value={editingUser.id} />
            </div>

            <div className="mt-6 space-y-5">
              {/* Role */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">角色</label>
                {isSuperAdmin ? (
                  <div className="flex gap-2">
                    {(['user', 'admin', 'superadmin'] as const).map((r) => {
                      const rc = ROLE_CONFIG[r]
                      const Icon = rc.icon
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setEditRole(r)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                            editRole === r
                              ? 'border-brand-purple bg-brand-purple/10 font-medium text-brand-purple'
                              : 'border-surface-secondary text-fg-secondary hover:bg-surface-secondary'
                          }`}
                        >
                          <Icon className="size-4" />
                          {rc.label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl bg-surface-secondary px-4 py-2.5 text-sm text-fg-muted">
                    {roleInfo(editRole).label}
                    <span className="text-xs">（僅系統管理員可變更）</span>
                  </div>
                )}
              </div>

              {/* 用戶名稱（公版帳號的顯示名；私版後台看到的就是這個值） */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">用戶名稱</label>
                <Input
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              {/* Email —— 與前台「個人資訊」的欄位對齊。
                  014 起 Email 可直接登入，能改別人的 Email 就等於能接管那個帳號，
                  因此比照角色變更限系統管理員；其他人看到唯讀值。 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">Email</label>
                {isSuperAdmin ? (
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                ) : (
                  <div className="flex h-10 items-center rounded-xl bg-surface-secondary px-4 text-sm text-fg-muted">
                    {editEmail || '未設定'}
                    <span className="ml-2 text-xs">（僅系統管理員可變更）</span>
                  </div>
                )}
              </div>

              {/* 性別 + 生日 —— 同樣是為了與前台「個人資訊」一致 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-fg-primary">性別</label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                    className="h-10 w-full rounded-xl border border-surface-secondary px-3 text-sm"
                  >
                    <option value="">未設定</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-fg-primary">生日</label>
                  <Input
                    type="date"
                    value={editBirthday}
                    onChange={(e) => setEditBirthday(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              {/* Plan + Dialog Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-fg-primary">方案</label>
                  <select
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="h-10 w-full rounded-xl border border-surface-secondary px-3 text-sm"
                  >
                    <option value="free">免費</option>
                    <option value="basic">基本</option>
                    <option value="advanced">進階</option>
                    <option value="premium">旗艦</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-fg-primary">對話點數</label>
                  <Input
                    type="number"
                    value={editDialogLimit}
                    onChange={(e) => setEditDialogLimit(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              {/* Plan deadline */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-fg-primary">方案到期日</label>
                <Input
                  type="date"
                  value={editDeadline}
                  onChange={(e) => setEditDeadline(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            {/* Messages */}
            {saveMsg && (
              <div
                className={`mt-4 flex items-center gap-1 rounded-lg px-4 py-2.5 text-sm ${
                  saveMsg.type === 'success'
                    ? 'bg-brand-teal/10 text-fg-primary'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {saveMsg.type === 'success' && <Check className="size-4" />}
                {saveMsg.text}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={closeEdit} className="rounded-xl px-6 text-sm">
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-brand-purple px-6 text-sm text-white hover:bg-brand-purple/90"
              >
                {saving ? '儲存中...' : '儲存變更'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
