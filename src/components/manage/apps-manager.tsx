'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Archive, Trash2, Copy, X, ExternalLink, RotateCcw, Shield } from 'lucide-react'
import { PLAN_CODES } from '@/lib/plans'

export interface AppRow {
  id: string
  slug: string
  name: string
  tagline: string | null
  icon: string | null
  app_url: string | null
  admin_url: string | null
  db_schema: string
  sso_secret: string | null
  entitlement_key: string | null
  required_plan: string | null
  status: string
  sort_order: number
  user_count: number
  created_at: string
  updated_at: string
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-gray-100 text-gray-600' },
  active: { label: '上架', cls: 'bg-green-100 text-green-700' },
  archived: { label: '已下架', cls: 'bg-red-50 text-red-500' },
}

type FormState = {
  slug: string
  name: string
  tagline: string
  icon: string
  app_url: string
  admin_url: string
  db_schema: string
  required_plan: string
  status: string
  sort_order: number
}

const EMPTY_FORM: FormState = {
  slug: '', name: '', tagline: '', icon: '', app_url: '', admin_url: '', db_schema: '', required_plan: '', status: 'draft', sort_order: 0,
}

interface AppAdminRow {
  user_id: string
  email: string
  name: string
  role: string
}

export function AppsManager({ initialApps, isSuper }: { initialApps: AppRow[]; isSuper: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ type: 'create' } | { type: 'edit'; app: AppRow } | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [newSecrets, setNewSecrets] = useState<{ sso_secret: string; entitlement_key: string; name: string } | null>(null)
  // per-App 管理權限
  const [permsApp, setPermsApp] = useState<AppRow | null>(null)
  const [admins, setAdmins] = useState<AppAdminRow[]>([])
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminRole, setNewAdminRole] = useState('manager')

  const apps = initialApps

  function openCreate() {
    setForm(EMPTY_FORM)
    setError(null)
    setModal({ type: 'create' })
  }

  function openEdit(app: AppRow) {
    setForm({
      slug: app.slug, name: app.name, tagline: app.tagline ?? '', icon: app.icon ?? '',
      app_url: app.app_url ?? '', admin_url: app.admin_url ?? '', db_schema: app.db_schema, required_plan: app.required_plan ?? '',
      status: app.status, sort_order: app.sort_order,
    })
    setError(null)
    setModal({ type: 'edit', app })
  }

  async function submitCreate() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/manage/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: form.slug.trim(), name: form.name.trim(), tagline: form.tagline, icon: form.icon,
          app_url: form.app_url, admin_url: form.admin_url, db_schema: form.db_schema, required_plan: form.required_plan || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || '建立失敗'); return }
      setModal(null)
      if (json.secrets) setNewSecrets({ ...json.secrets, name: form.name })
      router.refresh()
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit() {
    if (modal?.type !== 'edit') return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/manage/apps/${modal.app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(), tagline: form.tagline, icon: form.icon, app_url: form.app_url, admin_url: form.admin_url,
          required_plan: form.required_plan || null, status: form.status, sort_order: Number(form.sort_order) || 0,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || '更新失敗'); return }
      setModal(null)
      router.refresh()
    } catch {
      setError('網路錯誤，請重試')
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(app: AppRow) {
    const next = app.status === 'active' ? 'archived' : 'active'
    setBusy(true)
    try {
      await fetch(`/api/manage/apps/${app.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function removeApp(app: AppRow, hard: boolean) {
    const msg = hard
      ? `⚠️ 硬刪除「${app.name}」會移除註冊與所有會員綁定（App 自身資料庫 schema 不動）。此動作不可復原，確定？`
      : `將「${app.name}」下架？用戶會無法進入，但資料保留、可再上架。`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      await fetch(`/api/manage/apps/${app.id}${hard ? '?hard=1' : ''}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function openPerms(app: AppRow) {
    setPermsApp(app)
    setAdmins([])
    setError(null)
    setNewAdminEmail('')
    const res = await fetch(`/api/manage/apps/${app.id}/admins`)
    const json = await res.json()
    if (res.ok) setAdmins(json.data || [])
  }

  async function addAdmin() {
    if (!permsApp || !newAdminEmail.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/manage/apps/${permsApp.id}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAdminEmail.trim(), role: newAdminRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '指派失敗')
        return
      }
      setNewAdminEmail('')
      await openPerms(permsApp)
    } finally {
      setBusy(false)
    }
  }

  async function removeAdmin(userId: string) {
    if (!permsApp) return
    setBusy(true)
    try {
      await fetch(`/api/manage/apps/${permsApp.id}/admins?userId=${userId}`, { method: 'DELETE' })
      await openPerms(permsApp)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">App 管理</h1>
          <p className="mt-1 text-sm text-gray-500">平台上架的應用（幸福關係等）。新增＝開通一支新 App。</p>
        </div>
        {isSuper && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="size-4" /> 新增 App
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium">網址 / Schema</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">門檻</th>
                <th className="px-4 py-3 text-right font-medium">綁定人數</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    尚無 App。點右上「新增 App」開通第一支，或先套用 migration 011。
                  </td>
                </tr>
              ) : (
                apps.map((app) => {
                  const meta = STATUS_META[app.status] ?? STATUS_META.draft
                  return (
                    <tr key={app.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{app.icon || '📦'}</span>
                          <div>
                            <div className="font-medium text-gray-800">{app.name}</div>
                            <div className="font-mono text-xs text-gray-400">{app.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {app.app_url ? (
                          <a href={app.app_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-purple hover:underline">
                            {app.app_url.replace(/^https?:\/\//, '')} <ExternalLink className="size-3" />
                          </a>
                        ) : <span className="text-xs text-gray-400">—</span>}
                        {app.admin_url && (
                          <div>
                            {/* 走 SSO 而非直接連 admin_url：直接連的話能否進入全看瀏覽器
                                還有沒有該 App 的 session cookie，過期就會被彈到登入頁、
                                而且登入後停在會員中心、回不到原本要去的後台。 */}
                            <a href={`/api/apps/${app.slug}/launch?to=admin`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-600 hover:underline">
                              🛠 課程後台 <ExternalLink className="size-3" />
                            </a>
                          </div>
                        )}
                        <div className="font-mono text-xs text-gray-400">schema: {app.db_schema}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{app.required_plan || '免費'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{app.user_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isSuper && (
                            <button onClick={() => openPerms(app)} disabled={busy} title="管理權限"
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                              <Shield className="size-4" />
                            </button>
                          )}
                          <button onClick={() => toggleStatus(app)} disabled={busy} title={app.status === 'active' ? '下架' : '上架'}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                            {app.status === 'active' ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
                          </button>
                          <button onClick={() => openEdit(app)} disabled={busy} title="編輯"
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                            <Pencil className="size-4" />
                          </button>
                          <button onClick={() => removeApp(app, true)} disabled={busy} title="硬刪除"
                            className="rounded p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增 / 編輯 modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setModal(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">{modal.type === 'create' ? '新增 App（開通）' : `編輯：${modal.app.name}`}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="size-5" /></button>
            </div>

            {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="slug（建立後不可改）">
                  <input value={form.slug} disabled={modal.type === 'edit'} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="happy" className="input disabled:bg-gray-100" />
                </Field>
                <Field label="db schema（留空＝同 slug，鎖定）">
                  <input value={form.db_schema} disabled={modal.type === 'edit'} onChange={(e) => setForm({ ...form, db_schema: e.target.value })}
                    placeholder="happy" className="input disabled:bg-gray-100" />
                </Field>
              </div>
              <div className="grid grid-cols-[1fr_80px] gap-3">
                <Field label="名稱"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="幸福關係" className="input" /></Field>
                <Field label="icon"><input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="💛" className="input" /></Field>
              </div>
              <Field label="一句話介紹"><input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="AI 陪你練習關係與溝通" className="input" /></Field>
              <Field label="App 網址"><input value={form.app_url} onChange={(e) => setForm({ ...form, app_url: e.target.value })} placeholder="https://nexthappy.sakilu-dev.uk" className="input" /></Field>
              <Field label="課程後台入口網址（App 的 admin）"><input value={form.admin_url} onChange={(e) => setForm({ ...form, admin_url: e.target.value })} placeholder="https://nexthappy.sakilu-dev.uk/admin" className="input" /></Field>
              <div className="grid grid-cols-2 gap-3">
                {/* 原本是自由輸入。門檻值打錯不會有任何提示，而 launch 端 fail closed，
                    等於整個 App 被安靜鎖住 —— 改成下拉，讓不合法的值根本輸入不了。
                    這裡顯示代碼而非中文名，因為存進 DB 的就是代碼，
                    而這一區（slug / db_schema / sso_secret）本來就是給工程用的。 */}
                <Field label="進入門檻方案（不限＝免費可進）">
                  <select value={form.required_plan} onChange={(e) => setForm({ ...form, required_plan: e.target.value })} className="input">
                    <option value="">（不限方案）</option>
                    {PLAN_CODES.filter((c) => c !== 'free').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                {modal.type === 'edit' && (
                  <Field label="狀態">
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
                      <option value="draft">草稿</option>
                      <option value="active">上架</option>
                      <option value="archived">已下架</option>
                    </select>
                  </Field>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(null)} disabled={busy} className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50">取消</button>
              <button onClick={modal.type === 'create' ? submitCreate : submitEdit} disabled={busy}
                className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy ? '處理中…' : modal.type === 'create' ? '開通' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 開通後一次性金鑰 */}
      {newSecrets && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-bold text-gray-800">「{newSecrets.name}」已開通 🎉</h3>
            <p className="mb-4 text-sm text-amber-600">以下金鑰只顯示這一次，請立即複製保存到 App 的環境變數。</p>
            <SecretRow label="SSO Secret" value={newSecrets.sso_secret} />
            <SecretRow label="Entitlement Key" value={newSecrets.entitlement_key} />
            <div className="mt-5 flex justify-end">
              <button onClick={() => setNewSecrets(null)} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90">我已保存</button>
            </div>
          </div>
        </div>
      )}

      {/* per-App 管理權限 modal（superadmin） */}
      {permsApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setPermsApp(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">{permsApp.icon || '📦'} {permsApp.name}｜管理權限</h3>
              <button onClick={() => setPermsApp(null)} className="text-gray-400 hover:text-gray-600"><X className="size-5" /></button>
            </div>
            <p className="mb-3 text-xs text-gray-500">指派哪些管理者能管這支 App（superadmin 一律可管全部）。被指派者仍需具備後台 admin 角色才進得了後台。</p>

            {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

            <div className="mb-4 space-y-1">
              {admins.length === 0 ? (
                <div className="rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-400">尚未指派專屬管理者（目前僅 superadmin 可管）</div>
              ) : (
                admins.map((a) => (
                  <div key={a.user_id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <div>
                      <span className="text-gray-800">{a.name || a.email.split('@')[0]}</span>
                      <span className="ml-2 text-xs text-gray-400">{a.email}</span>
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{a.role === 'viewer' ? '唯讀' : '可管'}</span>
                    </div>
                    <button onClick={() => removeAdmin(a.user_id)} disabled={busy} className="rounded p-1 text-red-400 hover:bg-red-50 disabled:opacity-50" title="移除">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-end gap-2 border-t border-gray-100 pt-3">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-gray-500">用 email 指派管理者</span>
                <input value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="admin@example.com" className="input" />
              </label>
              <select value={newAdminRole} onChange={(e) => setNewAdminRole(e.target.value)} className="input w-24">
                <option value="manager">可管</option>
                <option value="viewer">唯讀</option>
              </select>
              <button onClick={addAdmin} disabled={busy || !newAdminEmail.trim()} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                指派
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}

function SecretRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-gray-100 px-2 py-1.5 font-mono text-xs text-gray-700">{value}</code>
        <button onClick={() => navigator.clipboard?.writeText(value)} title="複製" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  )
}
