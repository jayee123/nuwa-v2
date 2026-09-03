import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import { StatsCard } from '@/components/dashboard/stats-card'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { AvatarUpload } from '@/components/dashboard/avatar-upload'

export const metadata: Metadata = {
  title: '個人資訊 — 羽升幸福養成學苑',
  description: '管理你的個人資料與學習統計',
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!userData) redirect('/login')

  const planLabel: Record<string, string> = {
    free: '免費方案',
    basic: '基本方案',
    advanced: '進階方案',
    premium: 'Premium',
  }

  // --- Real stats from DB ---

  // Completed units count
  const { count: completedUnits } = await admin
    .from('user_unit_progress')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .not('completed_at', 'is', null)

  // Monthly active learning days (unit progress + chat messages this month)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthStartStr = monthStart.toISOString()

  const { data: progressDates } = await admin
    .from('user_unit_progress')
    .select('updated_at')
    .eq('user_id', user.id)
    .gte('updated_at', monthStartStr)

  const { data: chatDates } = await admin
    .from('chat_messages')
    .select('created_at, chat_topics!inner(user_id)')
    .eq('chat_topics.user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', monthStartStr)

  // Collect unique active dates this month
  const activeDatesSet = new Set<string>()
  for (const r of progressDates ?? []) {
    activeDatesSet.add(new Date(r.updated_at).toISOString().slice(0, 10))
  }
  for (const r of chatDates ?? []) {
    activeDatesSet.add(new Date(r.created_at).toISOString().slice(0, 10))
  }

  // Estimate monthly study hours: active sessions × 0.5 hr each
  const monthlyHours = Math.round(activeDatesSet.size * 0.5 * 10) / 10

  // Consecutive learning days (count backwards from today)
  const allDates = new Set<string>()
  // Fetch all recent progress and chat activity
  const { data: recentProgress } = await admin
    .from('user_unit_progress')
    .select('updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(90)

  const { data: recentChats } = await admin
    .from('chat_messages')
    .select('created_at, chat_topics!inner(user_id)')
    .eq('chat_topics.user_id', user.id)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(90)

  for (const r of recentProgress ?? []) {
    allDates.add(new Date(r.updated_at).toISOString().slice(0, 10))
  }
  for (const r of recentChats ?? []) {
    allDates.add(new Date(r.created_at).toISOString().slice(0, 10))
  }

  let streak = 0
  const d = new Date()
  for (let i = 0; i < 90; i++) {
    const key = d.toISOString().slice(0, 10)
    if (allDates.has(key)) {
      streak++
    } else if (i > 0) {
      break // allow today to be missing (hasn't studied yet today)
    }
    d.setDate(d.getDate() - 1)
  }

  const STATS = [
    { value: monthlyHours > 0 ? String(monthlyHours) : '0', unit: '小時', label: '本月學習時數' },
    { value: String(streak), unit: '天', label: '連續學習天數' },
    { value: String(completedUnits ?? 0), unit: '節', label: '已完成小節' },
    { value: String(userData.dialog_limit ?? 0), unit: '次', label: '剩餘 AI 對話' },
  ]

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-fg-primary">
            個人資訊
          </h1>
          <Link href="/dashboard/subscribe/happy">
            <Button
              variant="outline"
              className="rounded-xl border-brand-purple text-sm text-brand-purple hover:bg-brand-purple/5"
            >
              {planLabel[userData.current_plan] ?? '升級方案'}
            </Button>
          </Link>
        </div>

        {/* Avatar + name */}
        <div className="mt-6 flex items-center gap-4">
          <AvatarUpload
            currentUrl={userData.avatar_url}
            nickname={userData.nickname ?? ''}
          />
          <div className="ml-2">
            <h2 className="text-lg font-semibold text-fg-primary">
              {userData.nickname ?? '未設定'}
            </h2>
            <p className="text-sm text-fg-muted">{userData.phone}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((stat) => (
            <StatsCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* Profile form */}
        <div className="mt-8">
          <ProfileForm
            defaultValues={{
              nuwaId: userData.id,
              nickname: userData.nickname ?? '',
              email: userData.email ?? '',
              phone: userData.phone,
              gender: userData.gender ?? undefined,
              birthday: userData.birthday ?? undefined,
            }}
          />
        </div>
      </div>
    </div>
  )
}
