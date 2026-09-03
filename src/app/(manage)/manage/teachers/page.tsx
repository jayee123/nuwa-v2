import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { TeacherManager } from '@/components/manage/teacher-manager'

export const metadata: Metadata = { title: '師資管理 — 羽升管理後台' }

export default async function ManageTeachersPage() {
  const admin = createAdminClient()

  const [teachersRes, servicesRes] = await Promise.all([
    admin.from('teachers').select('*, services(name)').order('created_at'),
    admin.from('services').select('id, name').eq('is_active', true).order('sort_order'),
  ])

  return (
    <div>
      <TeacherManager
        teachers={(teachersRes.data ?? []).map((t) => ({
          ...t,
          service_name: (t.services as { name: string } | null)?.name ?? '',
        }))}
        services={servicesRes.data ?? []}
      />
    </div>
  )
}
