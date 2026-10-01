import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, DollarSign, CalendarCheck, Coins } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/manage/stat-card'

export const metadata: Metadata = { title: '統計總覽 — 羽升管理後台' }
export const dynamic = 'force-dynamic'

export default async function ManageDashboardPage() {
  const admin = createAdminClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  // Fetch all stats in parallel
  // 2026-09-26 決定：公版自己的 AI 已移除，chat_topics / chat_messages 的統計一併拿掉
  //（那兩張表觀察一週後會刪）。AI 用量只剩各 App 回寫的 ai_token_usage。
  const [usersRes, paymentsRes, regsRes, todayUsersRes, aiUsageRes] = await Promise.all([
    // 020: 統計不計入軟刪除用戶
    admin.from('users').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('payments').select('amount').eq('status', 'paid').gte('created_at', monthStart),
    admin.from('registrations').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    admin.from('users').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', todayStart),
    // 023: 本月 AI 用量與成本（跨 App 歸戶後為平台層數字）
    admin.from('ai_token_usage').select('tokens_used, cost_twd').gte('date', monthStart.slice(0, 10)),
  ])

  const totalUsers = usersRes.count ?? 0
  const monthlyRevenue = (paymentsRes.data ?? []).reduce((sum, p) => sum + (p.amount || 0), 0)
  const monthlyRegs = regsRes.count ?? 0
  const todayNewUsers = todayUsersRes.count ?? 0
  const aiRows = aiUsageRes.data ?? []
  const monthlyAiCost = aiRows.reduce((sum, r) => sum + Number(r.cost_twd ?? 0), 0)
  const monthlyAiTokens = aiRows.reduce((sum, r) => sum + Number(r.tokens_used ?? 0), 0)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">統計總覽</h1>

      {/* 營運指標 */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="總用戶數"
          value={totalUsers.toLocaleString()}
          change={`今日新增 ${todayNewUsers}`}
          changeType="neutral"
          icon={Users}
        />
        <StatCard
          label="本月營收"
          value={`NT$ ${monthlyRevenue.toLocaleString()}`}
          icon={DollarSign}
        />
        <StatCard
          label="本月報名"
          value={monthlyRegs.toLocaleString()}
          icon={CalendarCheck}
        />
      </div>

      {/* AI 指標 */}
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-fg-primary">AI 使用統計</h2>
        <Link
          href="/manage/ai-usage"
          className="text-sm text-brand-purple hover:underline"
        >
          查看用量明細（按會員歸戶）→
        </Link>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 023：跨 App 歸戶後，AI 成本是平台層數字 —— 點進去看各會員 / 各 App 拆分 */}
        <Link href="/manage/ai-usage" className="block transition-opacity hover:opacity-80">
          <StatCard
            label="本月 AI 成本"
            value={`NT$ ${monthlyAiCost.toFixed(2)}`}
            change={`${monthlyAiTokens.toLocaleString()} tokens`}
            changeType="neutral"
            icon={Coins}
          />
        </Link>
      </div>

      <div className="mt-8 grid gap-6">
        {/* Revenue chart placeholder */}
        <div className="rounded-xl border border-surface-secondary bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold text-fg-primary">營收趨勢</h2>
            <div className="flex gap-1 rounded-lg bg-surface-secondary p-1 text-xs">
              <button className="rounded-md bg-white px-3 py-1 font-medium text-fg-primary shadow-sm">月</button>
              <button className="px-3 py-1 text-fg-muted">週</button>
            </div>
          </div>
          <div className="mt-8 flex h-48 items-end justify-around gap-3">
            {[40, 55, 65, 85, 30, 35].map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-lg ${i === 3 ? 'bg-brand-purple' : 'bg-surface-secondary'}`}
                  style={{ height: `${h}%` }}
                />
                <span className={`text-xs ${i === 3 ? 'font-bold text-fg-primary' : 'text-fg-muted'}`}>
                  {i + 1}月
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* 「對話模式分佈」卡片隨公版 AI 移除（2026-09-26）一起拿掉 */}
      </div>
    </div>
  )
}
