import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { RegistrationConfirmForm } from '@/components/course/registration-confirm-form'

export const metadata: Metadata = {
  title: '開課通知確認 — 羽升幸福養成學苑',
}

export default async function RegistrationConfirmPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: course } = await admin
    .from('physical_courses')
    .select('*')
    .eq('id', id)
    .single()

  if (!course) notFound()

  const classDate = course.class_start
    ? new Date(course.class_start).toLocaleDateString('zh-TW')
    : '待定'

  return (
    <div className="w-full">
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="size-16 rounded-full bg-brand-orange/80" />
          </div>

          {/* Title */}
          <h1 className="mt-6 text-center font-heading text-2xl font-bold text-fg-primary">
            開課通知確認
          </h1>
          <p className="mt-2 text-center text-sm text-fg-secondary">
            確認您的 Email 以接收開課通知
          </p>

          {/* Course info card */}
          <div className="mt-6 rounded-xl bg-surface-secondary p-5 text-center">
            <h2 className="font-heading text-lg font-semibold text-fg-primary">
              {course.name}
            </h2>
            <span className="mt-2 inline-block rounded-full bg-brand-orange px-3 py-1 text-xs font-medium text-white">
              即將開課
            </span>
            <p className="mt-2 text-sm text-fg-muted">
              預計開課日：{classDate}
            </p>
          </div>

          {/* Form */}
          <div className="mt-6">
            <RegistrationConfirmForm
              physicalCourseId={id}
              courseName={course.name}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
