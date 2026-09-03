export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { getActiveServices } from '@/lib/queries/services'
import { CourseCard } from '@/components/course/course-card'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = {
  title: '所有課程 — 羽升幸福養成學苑',
  description: '探索所有課程，找到最適合你的學習旅程。',
}

export default async function CoursesPage() {
  const services = await getActiveServices()

  // Check user subscriptions
  let subscribedServiceIds = new Set<string>()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const admin = createAdminClient()
      const { data: subs } = await admin
        .from('subscriptions')
        .select('service_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
      subscribedServiceIds = new Set((subs ?? []).map((s) => s.service_id))
    }
  } catch { /* not logged in */ }

  return (
    <>
      <Header />
      <main className="flex-1 bg-surface-primary px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-heading text-3xl font-bold text-fg-primary">所有課程</h1>
          <p className="mt-2 text-fg-secondary">探索所有課程，找到最適合你的學習旅程。</p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((svc) => {
              const minPrice = svc.plans.length > 0
                ? Math.min(...svc.plans.map((p) => p.price))
                : undefined
              const isHappyApp = svc.code === 'happy'
              return (
                <CourseCard
                  key={svc.code}
                  code={svc.code}
                  title={svc.name}
                  description={svc.description ?? ''}
                  bannerUrl={svc.banner_url}
                  teacherName={svc.teacher_name ?? undefined}
                  teacherAvatar={svc.teacher_avatar}
                  price={minPrice}
                  status={isHappyApp ? 'external' : subscribedServiceIds.has(svc.id) ? 'learn' : 'wait'}
                  externalUrl={isHappyApp ? '/dashboard/apps' : undefined}
                />
              )
            })}
          </div>

          {services.length === 0 && (
            <p className="mt-16 text-center text-fg-muted">尚無課程，敬請期待。</p>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
