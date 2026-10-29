import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { PLAN_FULL_NAME, meetsRequiredPlan } from '@/lib/plans'
import { decideLaunch, isTrialGrantedEntry, resolveTrialTerms, trialFromRow, type TrialState } from '@/lib/launch-gate'
import { getTrialDefaults } from '@/lib/trial-defaults'
import { TRIAL_BADGE_CLASS, trialBadge, trialOffer } from '@/lib/trial-display'
import { StartTrialLabel } from '@/components/apps/start-trial-label'

export const metadata: Metadata = { title: 'App 服務 — 羽升幸福養成學苑' }
export const dynamic = 'force-dynamic'

// 卡片上要把「進得去的條件」講清楚（Jeff 2026-09-10）：
//   - 進入門檻：required_plan 有值就標「需◯◯方案以上」，別讓人點了才被丟到訂閱頁
//   - 試用狀態：憑試用進場的人要看得到「剩幾天 / 已到期」，別等被擋才發現
// （天數與次數的文字在 lib/trial-display.ts，首頁共用）

// 按鈕文案跟著 launch gate 的判斷走，不要自己另算一套（Steve 2026-09-23 發現 02）。
//
// 原本寫死「進入」，但在「門檻 ≥ 基本、使用者未達標、還沒試用過」的 App 上，
// 點下去的那一瞬間就**永久用掉**他對這支 App 唯一一次的試用機會
// （UNIQUE(user_id, app_id)），畫面上卻一個字都沒提。真實使用者很可能
// 只是想點進去看一眼長什麼樣。
//
// 反過來也不能無條件改成「開始試用」：門檻「不限」的 App（planMeets 恆 true）
// 免費會員是直接進場、根本不開試用，寫「開始 N 天免費試用」就是假訊息。
// 所以交給 decideLaunch —— 只有它回 create_trial_and_enter 才是真的會燒掉試用。
function launchLabel(decision: { kind: string }, trialDays: number, trialDialogLimit: number | null): ReactNode {
  switch (decision.kind) {
    case 'create_trial_and_enter':
      return <StartTrialLabel offer={trialOffer(trialDays, trialDialogLimit)} />
    case 'need_invite':
      return '我有邀請碼'
    case 'go_subscribe':
      return '前往訂閱'
    default:
      return '進入' // enter / unavailable（unavailable 不會被列出來）
  }
}

export default async function DashboardAppsPage() {
  const admin = createAdminClient()
  // internal（封測中）也列出來但標記「即將推出」：一般人看得到、點進去會被
  // launch gate 導去輸入邀請碼；持碼的受邀者由此進入（PAYMENT_SPEC §3.2）。
  const { data: apps } = await admin
    .from('apps')
    .select('id, slug, name, tagline, icon, status, required_plan, trial_days, trial_dialog_limit')
    .in('status', ['active', 'internal'])
    .order('sort_order', { ascending: true })

  const list = apps ?? []
  const trialDefaults = await getTrialDefaults(admin)

  // 當前會員的方案與試用紀錄（登入才有；layout 已擋未登入，這裡仍防禦性處理）
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let currentPlan = 'free'
  const trialByAppId = new Map<string, TrialState>()
  if (user) {
    const [{ data: u }, { data: trials }] = await Promise.all([
      admin.from('users').select('current_plan').eq('id', user.id).maybeSingle(),
      admin.from('user_app_trials').select('app_id, expires_at, dialogs_used, dialog_limit').eq('user_id', user.id),
    ])
    currentPlan = u?.current_plan ?? 'free'
    for (const t of trials ?? []) {
      const trial = trialFromRow(t)
      if (trial) trialByAppId.set(t.app_id, trial)
    }
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
            const trial = trialByAppId.get(app.id) ?? null
            // 只有「憑試用進場」的人需要看到試用倒數；方案達標者與試用無關
            const showTrial = trial !== null && isTrialGrantedEntry(app.status, planMeets)
            const badge = trial ? trialBadge(trial, now) : null
            const terms = resolveTrialTerms(app, trialDefaults)
            const decision = decideLaunch({ status: app.status, planMeets, trialDays: terms.days, trial, now })
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
                {showTrial && badge && (
                  <p className={`mt-2 text-xs font-medium ${TRIAL_BADGE_CLASS[badge.tone]}`}>{badge.text}</p>
                )}
                {/* 一定要用 <a>，不能用 next/link：<Link> 在畫面上出現就會預先抓取 href，
                    等於替使用者打了一次 launch —— 只是打開這頁，試用就被開掉了
                    （2026-10-15 happy 門檻改「基本」後實際發生；首頁本來就用 <a>）。 */}
                <a
                  href={`/api/apps/${app.slug}/launch`}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-purple px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  {launchLabel(decision, terms.days, terms.dialogLimit)} <ExternalLink className="size-4 shrink-0" />
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
