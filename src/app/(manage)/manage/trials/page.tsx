import type { Metadata } from 'next'
import { getAdminCtx } from '@/lib/app-access'

export const metadata: Metadata = { title: '試用紀錄 — 羽升管理後台' }
export const dynamic = 'force-dynamic'

// 試用狀況可見性（Steve 測試回報・發現 06）：
// 封測 20 人時要知道「誰兌換了、誰快到期」—— 之前只能進資料庫查。
// 「誰還沒兌換」看邀請碼頁的未使用碼即可，這裡不重複。

interface TrialRow {
  id: string
  started_at: string
  expires_at: string
  source: string
  invite_code: string | null
  users: { nickname: string | null; email: string | null; phone: string | null; current_plan: string } | null
  apps: { name: string; slug: string } | null
}

const SOURCE_LABEL: Record<string, string> = {
  invite: '邀請碼',
  open: '公開試用',
}

function fmt(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function daysLeft(expiresAt: string, now: Date): number {
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

export default async function ManageTrialsPage() {
  const ctx = await getAdminCtx()
  if (!ctx) {
    return <div className="p-6 text-red-500">無後台權限</div>
  }

  const { data } = await ctx.admin
    .from('user_app_trials')
    .select('id, started_at, expires_at, source, invite_code, users(nickname, email, phone, current_plan), apps(name, slug)')
    .order('expires_at', { ascending: true })

  const rows = (data ?? []) as unknown as TrialRow[]
  const now = new Date()
  const active = rows.filter((r) => new Date(r.expires_at) > now)
  const expired = rows.filter((r) => new Date(r.expires_at) <= now)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">試用紀錄</h1>
      <p className="mt-2 text-sm text-fg-secondary">
        誰在試用哪支 App、還剩幾天。「誰還沒兌換」請看邀請碼頁的未使用碼。
      </p>

      <div className="mt-6 flex gap-3">
        <div className="rounded-xl bg-green-50 px-5 py-3 text-sm">
          試用中 <span className="ml-1 text-lg font-bold text-green-700">{active.length}</span>
        </div>
        <div className="rounded-xl bg-gray-100 px-5 py-3 text-sm">
          已到期 <span className="ml-1 text-lg font-bold text-gray-600">{expired.length}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-8 text-center text-sm text-fg-muted shadow-sm">
          還沒有任何試用紀錄
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-surface-secondary bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-secondary text-left text-xs text-fg-muted">
                <th className="px-4 py-3">用戶</th>
                <th className="px-4 py-3">App</th>
                <th className="px-4 py-3">來源</th>
                <th className="px-4 py-3">開始</th>
                <th className="px-4 py-3">到期</th>
                <th className="px-4 py-3">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const left = daysLeft(r.expires_at, now)
                const isActive = left > 0
                return (
                  <tr key={r.id} className="border-b border-surface-secondary/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-fg-primary">{r.users?.nickname ?? '—'}</div>
                      <div className="text-xs text-fg-muted">{r.users?.email ?? r.users?.phone ?? ''}</div>
                    </td>
                    <td className="px-4 py-3">{r.apps?.name ?? r.apps?.slug ?? '—'}</td>
                    <td className="px-4 py-3">
                      {SOURCE_LABEL[r.source] ?? r.source}
                      {r.invite_code && (
                        <div className="font-mono text-xs text-fg-muted">{r.invite_code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-secondary">{fmt(r.started_at)}</td>
                    <td className="px-4 py-3 text-xs text-fg-secondary">{fmt(r.expires_at)}</td>
                    <td className="px-4 py-3">
                      {isActive ? (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            left <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          剩 {left} 天
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                          已到期
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
