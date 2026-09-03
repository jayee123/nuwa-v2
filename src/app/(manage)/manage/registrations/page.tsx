import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { RegistrationTable } from '@/components/manage/registration-table'

export const metadata: Metadata = { title: '報名紀錄 — 羽升管理後台' }

export default async function ManageRegistrationsPage() {
  const admin = createAdminClient()
  const { data: registrations } = await admin
    .from('registrations')
    .select('*, users(nickname, phone, email), physical_courses(name, class_start, status)')
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = (registrations ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    reminder_sent: r.reminder_sent,
    created_at: r.created_at,
    users: r.users as { nickname: string | null; phone: string; email: string | null } | null,
    physical_courses: r.physical_courses as { name: string; class_start: string | null; status: string } | null,
  }))

  // Unique course names for filter dropdown
  const courseNames = [...new Set(rows.map((r) => r.physical_courses?.name).filter(Boolean))] as string[]

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">報名紀錄</h1>
      <RegistrationTable registrations={rows} courseNames={courseNames} />
    </div>
  )
}
