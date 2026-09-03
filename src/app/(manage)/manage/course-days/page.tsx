import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { CourseDayManager } from '@/components/manage/course-day-manager'

export const metadata: Metadata = { title: '21 天課程管理 — 羽升管理後台' }

export default async function ManageCourseDaysPage() {
  const admin = createAdminClient()

  const { data: templates } = await admin
    .from('course_templates')
    .select('id, code, name, total_days')
    .eq('is_active', true)
    .order('created_at')
    .limit(1)

  const template = templates?.[0] ?? null

  let days: Record<string, unknown>[] = []
  if (template) {
    const { data } = await admin
      .from('course_days')
      .select('*')
      .eq('template_id', template.id)
      .order('day_number')
    days = data ?? []
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">21 天課程管理</h1>
      {template ? (
        <CourseDayManager template={template} days={days as never[]} />
      ) : (
        <p className="mt-6 text-fg-secondary">尚未建立課程模板</p>
      )}
    </div>
  )
}
