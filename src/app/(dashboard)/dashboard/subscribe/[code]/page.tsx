import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SubscribePlans } from '@/components/payment/subscribe-plans'
import { getActivePlans } from '@/lib/queries/plans'
import { getDialogQuota, dialogQuotaLabel } from '@/lib/queries/dialog-quota'

export const metadata: Metadata = { title: 'AI 對話方案 — 羽升幸福養成學苑' }

export default async function SubscribePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: service } = await admin
    .from('services')
    .select('id, code, name, plans')
    .eq('code', code)
    .single()

  if (!service) notFound()

  let currentPlan = 'free'
  let quotaLabel = ''
  let nextPlan: string | null = null
  let planDeadline: string | null = null
  if (user) {
    const [{ data: userData }, quota] = await Promise.all([
      admin.from('users').select('current_plan, next_plan, plan_deadline').eq('id', user.id).single(),
      // 本期 AI 對話（各 App 共用一池）；舊的 users.dialog_limit 不再顯示
      getDialogQuota(admin, user.id),
    ])
    currentPlan = userData?.current_plan ?? 'free'
    quotaLabel = dialogQuotaLabel(quota)
    nextPlan = userData?.next_plan ?? null
    planDeadline = userData?.plan_deadline ?? null
  }

  // 統一方案（plans 表），以 code 為 key
  const planRows = await getActivePlans()
  const plans = planRows.map((p) => ({
    code: p.code,
    name: p.name,
    price: p.monthly_charge,
    period: '月',
    features: [] as string[],
    recommended: p.code === 'advanced',
    dialog_limit: p.monthly_dialog_count,
  }))

  return (
    <div className="w-full">
      <main className="flex justify-center px-4 py-8">
        <div className="w-full max-w-5xl">
          <SubscribePlans
            serviceCode={code}
            serviceName={service.name}
            plans={plans}
            currentPlan={currentPlan}
            quotaLabel={quotaLabel}
            nextPlan={nextPlan}
            planDeadline={planDeadline}
          />
        </div>
      </main>
    </div>
  )
}
