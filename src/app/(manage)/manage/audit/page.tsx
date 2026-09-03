import type { Metadata } from 'next'
import { getAdminCtx } from '@/lib/app-access'

export const metadata: Metadata = { title: '操作記錄 — 羽升管理後台' }

const ACTION_LABEL: Record<string, string> = {
  'app.create': '新增 App',
  'app.update': '編輯 App',
  'app.archive': '下架 App',
  'app.delete': '硬刪 App',
  'admin.assign': '指派管理者',
  'admin.remove': '移除管理者',
  'invite.generate': '產生邀請碼',
}

interface LogRow {
  id: string
  actor_id: string | null
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export default async function ManageAuditPage() {
  const ctx = await getAdminCtx()
  if (!ctx) return null

  const { data } = await ctx.admin
    .from('admin_audit_logs')
    .select('id, actor_id, action, target, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(300)
  const logs = (data ?? []) as LogRow[]

  const actorIds = [...new Set(logs.map((l) => l.actor_id).filter(Boolean))] as string[]
  const actorMap = new Map<string, { nickname: string | null; email: string | null }>()
  if (actorIds.length) {
    const { data: actors } = await ctx.admin.from('users').select('id, nickname, email').in('id', actorIds)
    for (const a of actors ?? []) actorMap.set(a.id, { nickname: a.nickname, email: a.email })
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">操作記錄</h1>
      <p className="mt-1 text-sm text-fg-secondary">後台管理者的操作稽核記錄（最近 300 筆）。</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-surface-secondary bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-secondary bg-surface-primary text-left text-fg-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">時間</th>
                <th className="px-4 py-3 font-medium">操作者</th>
                <th className="px-4 py-3 font-medium">操作</th>
                <th className="px-4 py-3 font-medium">對象</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-fg-muted">尚無操作記錄。管理者在後台的操作（新增/編輯/刪除 App、產生邀請碼、調整方案…）會顯示在這裡。</td></tr>
              ) : (
                logs.map((l) => {
                  const actor = l.actor_id ? actorMap.get(l.actor_id) : null
                  return (
                    <tr key={l.id} className="border-b border-surface-secondary/60 last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-fg-muted">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-fg-primary">
                        {actor?.nickname ?? actor?.email ?? '系統'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-brand-purple/10 px-2 py-0.5 text-xs font-medium text-brand-purple">
                          {ACTION_LABEL[l.action] ?? l.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-fg-secondary">{l.target ?? '-'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
