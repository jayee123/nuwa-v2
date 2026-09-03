import type { Metadata } from 'next'
import { getAppScope } from '@/lib/app-access'
import { PaymentTable } from '@/components/manage/payment-table'

export const metadata: Metadata = { title: '付款記錄 — 羽升管理後台' }

export default async function ManagePaymentsPage() {
  const scope = await getAppScope()
  if (!scope) return null

  // per-App 管理者只看自己 App 的交易；superadmin（appIds=null）看全部
  let query = scope.admin.from('payments').select('*, users(nickname, phone)')
  if (scope.appIds) query = query.in('app_id', scope.appIds)
  const { data: payments } = await query
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (payments ?? []).map((p) => ({
    id: p.id,
    plan_name: p.plan_name,
    amount: p.amount,
    status: p.status,
    payment_uid: p.payment_uid,
    paid_at: p.paid_at,
    users: p.users as { nickname: string | null; phone: string } | null,
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">付款記錄</h1>
      <PaymentTable payments={rows} />
    </div>
  )
}
