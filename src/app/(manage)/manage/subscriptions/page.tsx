import type { Metadata } from 'next'
import { getAppScope } from '@/lib/app-access'
import { SubscriptionTable } from '@/components/manage/subscription-table'

export const metadata: Metadata = { title: '訂閱管理 — 羽升管理後台' }

export default async function ManageSubscriptionsPage() {
  const scope = await getAppScope()
  if (!scope) return null

  // per-App 管理者只看自己 App 的訂閱；superadmin（appIds=null）看全部
  let query = scope.admin.from('subscriptions').select('*, users(nickname, phone), services(name)')
  if (scope.appIds) query = query.in('app_id', scope.appIds)
  const { data: subscriptions } = await query
    .order('created_at', { ascending: false })
    .limit(300)

  const rows = (subscriptions ?? []).map((s) => ({
    id: s.id,
    plan_name: s.plan_name,
    status: s.status,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    created_at: s.created_at,
    users: s.users as { nickname: string | null; phone: string } | null,
    services: s.services as { name: string } | null,
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">訂閱管理</h1>
      <SubscriptionTable subscriptions={rows} />
    </div>
  )
}
