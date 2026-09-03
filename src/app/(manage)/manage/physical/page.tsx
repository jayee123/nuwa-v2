import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { PhysicalKanban } from '@/components/manage/physical-kanban'

export const metadata: Metadata = { title: '實體課程管理 — 羽升管理後台' }

export default async function ManagePhysicalPage() {
  const admin = createAdminClient()

  const { data: courses } = await admin
    .from('physical_courses')
    .select('*')
    .order('created_at', { ascending: false })

  // Auto-mark courses as completed if class_end has passed
  const now = new Date()
  for (const c of courses ?? []) {
    if (c.class_end && new Date(c.class_end) < now && c.status !== 'completed') {
      await admin.from('physical_courses').update({ status: 'completed' }).eq('id', c.id)
      c.status = 'completed'
    }
  }

  // Get registration counts per course
  const courseIds = (courses ?? []).map((c) => c.id)
  const { data: regCounts } = courseIds.length > 0
    ? await admin
        .from('registrations')
        .select('physical_course_id')
        .in('physical_course_id', courseIds)
    : { data: [] }

  const countMap = new Map<string, number>()
  for (const r of regCounts ?? []) {
    countMap.set(r.physical_course_id, (countMap.get(r.physical_course_id) ?? 0) + 1)
  }

  const enriched = (courses ?? []).map((c) => ({
    ...c,
    reg_count: countMap.get(c.id) ?? 0,
  }))

  return (
    <div>
      <PhysicalKanban courses={enriched} />
    </div>
  )
}
