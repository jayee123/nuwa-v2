import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: '訂閱管理 — 羽升幸福養成學苑' }

const PLAN_LABEL: Record<string, string> = {
  free: '免費',
  basic: '基本',
  advanced: '進階',
  premium: 'Premium',
}

export default async function SubscribeManagePage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  let currentPlan = 'free'
  let dialogLimit = 0

  if (user) {
    const { data: userData } = await admin
      .from('users')
      .select('current_plan, dialog_limit')
      .eq('id', user.id)
      .single()
    currentPlan = userData?.current_plan ?? 'free'
    dialogLimit = userData?.dialog_limit ?? 0
  }

  // 只需要知道「有沒有有效訂閱」與「最晚到期日」。
  // 課程內容一律在 App 裡進行，這裡不再逐課程列卡片
  // （同一課程可能有多筆 subscriptions，逐筆列會出現重複卡片）。
  const { data: activeSubs } = user
    ? await admin
        .from('subscriptions')
        .select('ends_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('ends_at', { ascending: false })
        .limit(1)
    : { data: [] }

  const endsAt = activeSubs?.[0]?.ends_at ?? null
  const hasActiveSub = Boolean(endsAt)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-fg-primary">訂閱管理</h1>
          <Badge className="bg-brand-purple text-xs text-white">
            目前方案：{PLAN_LABEL[currentPlan] ?? currentPlan}
          </Badge>
        </div>

        {hasActiveSub ? (
          <>
            <div className="mt-6 rounded-xl border border-surface-secondary p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-brand-teal text-[10px] text-white">使用中</Badge>
                <span className="text-sm text-fg-secondary">
                  已訂閱至 {new Date(endsAt!).toLocaleDateString('zh-TW')}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-fg-muted">方案</dt>
                  <dd className="text-fg-primary">{PLAN_LABEL[currentPlan] ?? currentPlan}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">AI 對話點數</dt>
                  <dd className="tabular-nums text-fg-primary">可用 {dialogLimit} 次</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard/apps" prefetch={false}>
                <Button className="rounded-xl bg-brand-purple text-sm text-white hover:bg-brand-purple/90">
                  進入 App
                </Button>
              </Link>
              <Link href="/dashboard/subscribe/happy">
                <Button variant="outline" className="rounded-xl text-sm">
                  更改方案
                </Button>
              </Link>
            </div>

            <p className="mt-4 text-xs text-fg-muted">
              所有課程內容都在 App 裡進行，點「進入 App」會自動帶著你的登入狀態過去。
            </p>
          </>
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm text-fg-muted">尚無訂閱</p>
            <Link href="/dashboard/subscribe/happy">
              <Button className="mt-4 rounded-xl bg-brand-purple text-sm text-white hover:bg-brand-purple/90">
                選擇方案
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
