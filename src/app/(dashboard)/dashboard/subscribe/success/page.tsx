import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: '付款成功 — 羽升幸福養成學苑' }

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ td?: string }>
}) {
  const { td } = await searchParams
  const admin = createAdminClient()

  let payment: { plan_name: string | null; amount: number; paid_at: string | null } | null = null
  let serviceName = ''
  let userEmail = ''
  let endsAt = ''

  if (td) {
    const { data } = await admin
      .from('payments')
      .select('plan_name, amount, paid_at, service_id, user_id')
      .eq('payment_uid', td)
      .single()
    payment = data

    if (data?.service_id) {
      const { data: svc } = await admin.from('services').select('name').eq('id', data.service_id).single()
      serviceName = svc?.name ?? ''
    }
    if (data?.user_id) {
      const { data: user } = await admin.from('users').select('email, plan_deadline').eq('id', data.user_id).single()
      userEmail = user?.email ?? ''
      endsAt = user?.plan_deadline
        ? new Date(user.plan_deadline).toLocaleDateString('zh-TW')
        : ''
    }
  }

  return (
    <div className="w-full">
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm text-center">
          {/* Icon */}
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand-teal/20">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-teal/30">
              <Check className="size-6 text-brand-teal" />
            </div>
          </div>

          <h1 className="mt-6 font-heading text-2xl font-bold text-fg-primary">付款成功！</h1>
          <p className="mt-2 text-sm text-fg-secondary">感謝您的訂閱，現在就開始學習吧</p>

          {/* Order details */}
          {payment && (
            <div className="mt-6 rounded-xl bg-surface-secondary p-5 text-left">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-fg-muted">課程名稱</span>
                  <span className="font-medium text-fg-primary">{serviceName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">訂閱方案</span>
                  <span className="font-medium text-fg-primary">{payment.plan_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fg-muted">金額</span>
                  <span className="font-semibold text-brand-orange">NT$ {payment.amount.toLocaleString()}</span>
                </div>
                {endsAt && (
                  <div className="flex justify-between">
                    <span className="text-fg-muted">有效期至</span>
                    <span className="font-medium text-fg-primary">{endsAt}</span>
                  </div>
                )}
                {userEmail && (
                  <div className="flex justify-between">
                    <span className="text-fg-muted">通知信箱</span>
                    <span className="text-fg-primary">{userEmail}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-8 flex gap-3">
            <Link href="/dashboard/apps" className="flex-1">
              <Button className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90">
                進入 App
              </Button>
            </Link>
            <Link href="/" className="flex-1">
              <Button variant="outline" className="h-12 w-full rounded-xl text-base">
                回到首頁
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
