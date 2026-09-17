import type { Metadata } from 'next'
import { getAdminCtx } from '@/lib/app-access'
import { TrialsTable, type TrialTableRow } from '@/components/manage/trials-table'

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
  users: { nickname: string | null; email: string | null; phone: string | null } | null
  apps: { name: string; slug: string } | null
}

export default async function ManageTrialsPage() {
  const ctx = await getAdminCtx()
  if (!ctx) {
    return <div className="p-6 text-red-500">無後台權限</div>
  }

  const { data } = await ctx.admin
    .from('user_app_trials')
    .select('id, started_at, expires_at, source, invite_code, users(nickname, email, phone), apps(name, slug)')
    .order('expires_at', { ascending: true })

  const raw = (data ?? []) as unknown as TrialRow[]
  const now = new Date()
  const rows: TrialTableRow[] = raw.map((r) => ({
    id: r.id,
    started_at: r.started_at,
    expires_at: r.expires_at,
    source: r.source,
    invite_code: r.invite_code,
    userName: r.users?.nickname ?? '—',
    userContact: r.users?.email ?? r.users?.phone ?? '',
    appName: r.apps?.name ?? r.apps?.slug ?? '—',
  }))
  const activeCount = rows.filter((r) => new Date(r.expires_at) > now).length

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">試用紀錄</h1>
      <p className="mt-2 text-sm text-fg-secondary">
        誰在試用哪支 App、還剩幾天。「誰還沒兌換」請看邀請碼頁的未使用碼。
      </p>

      <div className="mt-6 flex gap-3">
        <div className="rounded-xl bg-green-50 px-5 py-3 text-sm">
          試用中 <span className="ml-1 text-lg font-bold text-green-700">{activeCount}</span>
        </div>
        <div className="rounded-xl bg-gray-100 px-5 py-3 text-sm">
          已到期 <span className="ml-1 text-lg font-bold text-gray-600">{rows.length - activeCount}</span>
        </div>
      </div>

      <TrialsTable rows={rows} />
    </div>
  )
}
