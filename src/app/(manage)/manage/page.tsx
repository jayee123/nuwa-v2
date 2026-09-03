import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, DollarSign, Activity, CalendarCheck, MessageSquare, Puzzle, TrendingUp, Cpu, Coins } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/manage/stat-card'

export const metadata: Metadata = { title: '統計總覽 — 羽升管理後台' }
export const dynamic = 'force-dynamic'

export default async function ManageDashboardPage() {
  const admin = createAdminClient()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all stats in parallel
  const [
    usersRes,
    paymentsRes,
    regsRes,
    todayUsersRes,
    unpackTopicsRes,
    journeyTopicsRes,
    active7dRes,
    active30dRes,
    totalMessagesRes,
    aiUsageRes,
  ] = await Promise.all([
    // 020: 統計不計入軟刪除用戶
    admin.from('users').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('payments').select('amount').eq('status', 'paid').gte('created_at', monthStart),
    admin.from('registrations').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    admin.from('users').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', todayStart),
    admin.from('chat_topics').select('id', { count: 'exact', head: true }).eq('mode', 'unpack'),
    admin.from('chat_topics').select('id', { count: 'exact', head: true }).eq('mode', 'journey'),
    admin.from('chat_messages').select('topic_id').eq('role', 'user').gte('created_at', sevenDaysAgo),
    admin.from('chat_messages').select('topic_id').eq('role', 'user').gte('created_at', thirtyDaysAgo),
    admin.from('chat_messages').select('id', { count: 'exact', head: true }),
    // 023: 本月 AI 用量與成本（跨 App 歸戶後為平台層數字）
    admin.from('ai_token_usage').select('tokens_used, cost_twd').gte('date', monthStart.slice(0, 10)),
  ])

  const totalUsers = usersRes.count ?? 0
  const monthlyRevenue = (paymentsRes.data ?? []).reduce((sum, p) => sum + (p.amount || 0), 0)
  const monthlyRegs = regsRes.count ?? 0
  const todayNewUsers = todayUsersRes.count ?? 0
  const unpackTopics = unpackTopicsRes.count ?? 0
  const journeyTopics = journeyTopicsRes.count ?? 0
  const active7d = new Set((active7dRes.data ?? []).map(r => r.topic_id)).size
  const active30d = new Set((active30dRes.data ?? []).map(r => r.topic_id)).size
  const totalMessages = totalMessagesRes.count ?? 0
  const aiRows = aiUsageRes.data ?? []
  const monthlyAiCost = aiRows.reduce((sum, r) => sum + Number(r.cost_twd ?? 0), 0)
  const monthlyAiTokens = aiRows.reduce((sum, r) => sum + Number(r.tokens_used ?? 0), 0)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">統計總覽</h1>

      {/* 營運指標 */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <StatCard
          label="總對話訊息"
          value={totalMessages.toLocaleString()}
          icon={MessageSquare}
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
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="解卡點對話"
          value={unpackTopics.toLocaleString()}
          change="Mode B — 我卡住幫我拆"
          changeType="neutral"
          icon={Puzzle}
        />
        <StatCard
          label="21 天練習"
          value={journeyTopics.toLocaleString()}
          change="Mode A — 刻意練習"
          changeType="neutral"
          icon={TrendingUp}
        />
        <StatCard
          label="7 天活躍對話"
          value={active7d.toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="30 天活躍對話"
          value={active30d.toLocaleString()}
          icon={Cpu}
        />
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

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Revenue chart placeholder */}
        <div className="col-span-2 rounded-xl border border-surface-secondary bg-white p-6">
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

        {/* Mode breakdown */}
        <div className="rounded-xl border border-surface-secondary bg-white p-6">
          <h2 className="font-heading text-lg font-semibold text-fg-primary">對話模式分佈</h2>
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-secondary">解卡點（Mode B）</span>
                <span className="font-medium text-fg-primary">{unpackTopics}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className="h-full rounded-full bg-brand-purple"
                  style={{ width: `${(unpackTopics + journeyTopics) > 0 ? (unpackTopics / (unpackTopics + journeyTopics)) * 100 : 50}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-fg-secondary">21 天練習（Mode A）</span>
                <span className="font-medium text-fg-primary">{journeyTopics}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className="h-full rounded-full bg-brand-teal"
                  style={{ width: `${(unpackTopics + journeyTopics) > 0 ? (journeyTopics / (unpackTopics + journeyTopics)) * 100 : 50}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-6 rounded-lg bg-surface-secondary/50 p-3">
            <p className="text-xs text-fg-muted">
              升維 Stack：L1 解卡點 → L2 21 天練習 → L3 心智成長
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              轉化率：{(unpackTopics + journeyTopics) > 0
                ? `${((journeyTopics / (unpackTopics + journeyTopics)) * 100).toFixed(1)}%`
                : 'N/A'
              } 從解卡進入練習
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
