import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Calendar, Clock, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string; id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const admin = createAdminClient()
  const { data: course } = await admin
    .from('physical_courses')
    .select('name')
    .eq('id', id)
    .single()
  if (!course) return { title: '課程不存在' }
  return { title: `${course.name} — 羽升幸福養成學苑` }
}

export default async function PhysicalCourseDetailPage({
  params,
}: {
  params: Promise<{ code: string; id: string }>
}) {
  const { code, id } = await params
  const admin = createAdminClient()

  const { data: course } = await admin
    .from('physical_courses')
    .select('*')
    .eq('id', id)
    .single()

  if (!course) notFound()

  const now = new Date()
  const regOpen =
    (!course.reg_start || new Date(course.reg_start) <= now) &&
    (!course.reg_end || new Date(course.reg_end) >= now)

  const classDate = course.class_start
    ? new Date(course.class_start).toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '待定'

  const classEndDate = course.class_end
    ? new Date(course.class_end).toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const statusMap: Record<string, { label: string; color: string }> = {
    planned: { label: '即將開課', color: 'bg-brand-orange' },
    open: { label: '報名中', color: 'bg-brand-teal' },
    closed: { label: '報名截止', color: 'bg-fg-muted' },
    completed: { label: '已結束', color: 'bg-fg-muted' },
  }
  const statusInfo = statusMap[course.status] ?? statusMap.planned

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-surface-primary">
        <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
          <Link
            href={`/courses/${code}`}
            className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg-primary"
          >
            <ArrowLeft className="size-4" />
            回到課程頁
          </Link>

          <div className="mt-6 rounded-2xl bg-white p-8 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between">
              <h1 className="font-heading text-2xl font-bold text-fg-primary">
                {course.name}
              </h1>
              <Badge className={`${statusInfo.color} text-xs text-white`}>
                {statusInfo.label}
              </Badge>
            </div>

            {course.description && (
              <p className="mt-4 text-sm leading-relaxed text-fg-secondary">
                {course.description}
              </p>
            )}

            {/* Details */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm text-fg-secondary">
                <Calendar className="size-4 text-brand-purple" />
                <span>
                  {classDate}
                  {classEndDate ? ` — ${classEndDate}` : ''}
                </span>
              </div>
              {course.location && (
                <div className="flex items-center gap-3 text-sm text-fg-secondary">
                  <MapPin className="size-4 text-brand-purple" />
                  <span>{course.location}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-fg-secondary">
                <Clock className="size-4 text-brand-purple" />
                <span>NT$ {course.price.toLocaleString()}</span>
              </div>
            </div>

            {/* Notice */}
            {course.notice && (
              <div className="mt-6 rounded-xl bg-surface-secondary p-4 text-sm leading-relaxed text-fg-secondary">
                <strong className="text-fg-primary">注意事項：</strong>
                <br />
                {course.notice}
              </div>
            )}

            {/* CTA */}
            <div className="mt-8">
              {regOpen ? (
                <Link href={`/dashboard/physical/${id}/confirm`}>
                  <Button className="h-12 w-full rounded-xl bg-brand-purple text-base font-medium text-white hover:bg-brand-purple/90">
                    立即報名
                  </Button>
                </Link>
              ) : (
                <Button
                  disabled
                  className="h-12 w-full rounded-xl text-base opacity-50"
                >
                  {course.status === 'completed' ? '課程已結束' : '報名尚未開放'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
