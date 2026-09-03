import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProgressOverview } from '@/components/manage/progress-overview'

export const metadata: Metadata = { title: '學習進度 — 羽升管理後台' }

export default async function ManageProgressPage() {
  const admin = createAdminClient()

  // Fetch all progress records with user + unit info
  const { data: progress } = await admin
    .from('user_unit_progress')
    .select('*, users(nickname, phone), units(title, subject_id, subjects(title, course_id, courses(title, service_id, services(name))))')
    .order('updated_at', { ascending: false })
    .limit(1000)

  // Fetch total units count per service for completion rate calculation
  const { data: allUnits } = await admin
    .from('units')
    .select('id, subject_id, subjects(course_id, courses(service_id, services(name)))')

  const rows = (progress ?? []).map((p) => {
    const units = p.units as {
      title: string
      subject_id: string
      subjects: { title: string; course_id: string; courses: { title: string; service_id: string; services: { name: string } } }
    } | null
    return {
      id: p.id,
      progress_pct: p.progress_pct,
      completed_at: p.completed_at,
      updated_at: p.updated_at,
      user_name: (p.users as { nickname: string | null; phone: string } | null)?.nickname ?? '未知',
      user_phone: (p.users as { nickname: string | null; phone: string } | null)?.phone ?? '',
      unit_title: units?.title ?? '-',
      subject_title: units?.subjects?.title ?? '-',
      course_title: units?.subjects?.courses?.title ?? '-',
      service_name: units?.subjects?.courses?.services?.name ?? '-',
    }
  })

  // Build service → total units map
  const serviceUnitCounts: Record<string, number> = {}
  for (const u of allUnits ?? []) {
    const subjects = u.subjects as unknown as { course_id: string; courses: { service_id: string; services: { name: string } } } | null
    const svcName = subjects?.courses?.services?.name
    if (svcName) {
      serviceUnitCounts[svcName] = (serviceUnitCounts[svcName] ?? 0) + 1
    }
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">學習進度</h1>
      <ProgressOverview records={rows} serviceUnitCounts={serviceUnitCounts} />
    </div>
  )
}
