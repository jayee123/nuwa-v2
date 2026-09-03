import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { CourseEditor } from '@/components/manage/course-editor'

export const metadata: Metadata = { title: '線上課程管理 — 羽升管理後台' }

export default async function ManageCoursesPage() {
  const admin = createAdminClient()

  const { data: services } = await admin
    .from('services')
    .select('id, code, name')
    .eq('is_active', true)
    .order('sort_order')

  const firstService = services?.[0]
  let chapters: { id: string; title: string; sort_order: number; units: { id: string; title: string; content_url: string | null; sort_order: number }[] }[] = []
  let courseId: string | null = null

  if (firstService) {
    const { data: courses } = await admin
      .from('courses')
      .select('id')
      .eq('service_id', firstService.id)
      .order('sort_order')
      .limit(1)

    if (courses?.[0]) {
      courseId = courses[0].id

      const { data: subjects } = await admin
        .from('subjects')
        .select('id, title, sort_order')
        .eq('course_id', courseId)
        .order('sort_order')

      if (subjects) {
        const subjectIds = subjects.map((s) => s.id)
        const { data: units } = subjectIds.length > 0
          ? await admin
              .from('units')
              .select('id, subject_id, title, content_url, sort_order')
              .in('subject_id', subjectIds)
              .order('sort_order')
          : { data: [] }

        chapters = subjects.map((s) => ({
          id: s.id,
          title: s.title,
          sort_order: s.sort_order,
          units: (units ?? []).filter((u) => u.subject_id === s.id),
        }))
      }
    }
  }

  return (
    <CourseEditor
      services={services ?? []}
      initialServiceId={firstService?.id ?? ''}
      initialChapters={chapters}
      initialCourseId={courseId}
    />
  )
}
