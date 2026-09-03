import type { Metadata } from 'next'
import { getAppScope } from '@/lib/app-access'
import { AiUsageDashboard } from '@/components/manage/ai-usage-dashboard'

export const metadata: Metadata = { title: 'AI Token 統計 — 羽升管理後台' }

export default async function ManageAiUsagePage() {
  const scope = await getAppScope()
  if (!scope) return null

  // per-App 管理者只看自己 App 的用量；superadmin（appIds=null）看全部
  let query = scope.admin
    .from('ai_token_usage')
    .select('*, users(nickname, phone), services(name), teachers(name), apps(name)')
  if (scope.appIds) query = query.in('app_id', scope.appIds)
  const { data: records } = await query
    .order('date', { ascending: false })
    .limit(1000)

  const rows = (records ?? []).map((r) => ({
    id: r.id,
    tokens_used: r.tokens_used,
    // 023 之前的舊資料沒有成本；私版回寫的才有
    cost_twd: r.cost_twd == null ? null : Number(r.cost_twd),
    date: r.date,
    created_at: r.created_at,
    user_name: (r.users as { nickname: string | null; phone: string } | null)?.nickname ?? '未知',
    user_phone: (r.users as { nickname: string | null; phone: string } | null)?.phone ?? '',
    // 沒有 app_id 的是公版自身的 AI 呼叫（/chat、/unpack）
    app_name: (r.apps as { name: string } | null)?.name ?? 'NUWA 平台',
    service_name: (r.services as { name: string } | null)?.name ?? '-',
    teacher_name: (r.teachers as { name: string } | null)?.name ?? '-',
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">AI Token 使用統計</h1>
      <AiUsageDashboard records={rows} />
    </div>
  )
}
