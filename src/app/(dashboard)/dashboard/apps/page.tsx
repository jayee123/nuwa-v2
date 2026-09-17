import type { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { PLAN_FULL_NAME, meetsRequiredPlan } from '@/lib/plans'
import { isTrialGrantedEntry } from '@/lib/launch-gate'

export const metadata: Metadata = { title: 'App 服務 — 羽升幸福養成學苑' }
export const dynamic = 'force-dynamic'

// 卡片上要把「進得去的條件」講清楚（Jeff 2026-09-10）：
//   - 進入門檻：required_plan 有值就標「需◯◯方案以上」，別讓人點了才被丟到訂閱頁
//   - 試用狀態：憑試用進場的人要看得到「剩幾天 / 已到期」，別等被擋才發現
function trialDaysLeft(expiresAt: string, now: Date): number {
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

export default async function DashboardAppsPage() {
  const admin = createAdminClient()
  // internal（封測中）也列出來但標記「即將推出」：一般人看得到、點進去會被
  // launch gate 導去輸入邀請碼；持碼的受邀者由此進入（PAYMENT_SPEC §3.2）。
  const { data: apps } = await admin
    .from('apps')
    .select('id, slug, name, tagline, icon, status, required_plan')
    .in('status', ['active', 'internal'])
    .order('sort_order', { ascending: true })

  const list = apps ?? []

  // 當前會員的方案與試用紀錄（登入才有；layout 已擋未登入，這裡仍防禦性處理）
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let currentPlan = 'free'
  const trialByAppId = new Map<string, string>() // app_id → expires_at
  if (user) {
    const [{ data: u }, { data: trials }] = await Promise.all([
      admin.from('users').select('current_plan').eq('id', user.id).maybeSingle(),
      admin.from('user_app_trials').select('app_id, expires_at').eq('user_id', user.id),
    ])
    currentPlan = u?.current_plan ?? 'free'
    for (const t of trials ?? []) trialByAppId.set(t.app_id, t.expires_at)
  }
  const now = new Date()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-fg-primary">App 服務</h1>
        <p className="mt-2 text-sm text-fg-secondary">選擇要進入的應用，登入狀態會自動帶過去、不用再登入一次。</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-fg-muted shadow-sm">目前沒有可用的 App</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((app) => {
            const planMeets = app.required_plan ? meetsRequiredPlan(currentPlan, app.required_plan) : true
            const trialExpiresAt = trialByAppId.get(app.id)
            // 只有「憑試用進場」的人需要看到試用倒數；方案達標者與試用無關
            const showTrial = Boolean(trialExpiresAt) && isTrialGrantedEntry(app.status, planMeets)
            const left = trialExpiresAt ? trialDaysLeft(trialExpiresAt, now) : 0
            return (
              <div key={app.slug} className="flex flex-col rounded-2xl border border-surface-secondary bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="text-3xl">{app.icon || '📦'}</div>
                  {app.status === 'internal' ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                      封測中・即將推出
                    </span>
                  ) : app.required_plan ? (
                    <span className="rounded-full bg-brand-purple/10 px-2.5 py-1 text-xs font-medium text-brand-purple">
                      需{PLAN_FULL_NAME[app.required_plan] ?? app.required_plan}以上
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 font-heading text-lg font-bold text-fg-primary">{app.name}</h2>
                <p className="mt-1 flex-1 text-sm text-fg-secondary">{app.tagline || ''}</p>
                {showTrial && (
                  <p className={`mt-2 text-xs font-medium ${
                    left <= 0 ? 'text-fg-muted' : left <= 3 ? 'text-amber-600' : 'text-brand-purple'
                  }`}>
                    {left <= 0
                      ? '免費試用已到期 — 訂閱後可繼續使用'
                      : `免費試用中・剩 ${left} 天`}
                  </p>
                )}
                <Link
                  href={`/api/apps/${app.slug}/launch`}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  {app.status === 'internal'
                    ? (showTrial && left > 0 ? '進入' : '我有邀請碼')
                    : (showTrial && left <= 0 ? '前往訂閱' : '進入')} <ExternalLink className="size-4" />
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
