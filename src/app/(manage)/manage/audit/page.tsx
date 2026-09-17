import type { Metadata } from 'next'
import { getAdminCtx } from '@/lib/app-access'
import { AuditTable } from '@/components/manage/audit-table'

export const metadata: Metadata = { title: '操作記錄 — 羽升管理後台' }

const ACTION_LABEL: Record<string, string> = {
  'app.create': '新增 App',
  'app.update': '編輯 App',
  'app.archive': '下架 App',
  'app.delete': '硬刪 App',
  'admin.assign': '指派管理者',
  'admin.remove': '移除管理者',
  'invite.generate': '產生邀請碼',
  'payment.mark_refunded': '標記退款',
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

  const rows = logs.map((l) => {
    const actor = l.actor_id ? actorMap.get(l.actor_id) : null
    return {
      id: l.id,
      timeLabel: new Date(l.created_at).toLocaleString(),
      actorLabel: actor?.nickname ?? actor?.email ?? '系統',
      actionLabel: ACTION_LABEL[l.action] ?? l.action,
      target: l.target ?? '-',
    }
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">操作記錄</h1>
      <p className="mt-1 text-sm text-fg-secondary">後台管理者的操作稽核記錄（最近 300 筆）。</p>
      <AuditTable rows={rows} />
    </div>
  )
}
