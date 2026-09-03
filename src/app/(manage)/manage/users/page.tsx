import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UserTable } from '@/components/manage/user-table'

export const metadata: Metadata = { title: '用戶管理 — 羽升管理後台' }

export default async function ManageUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  // Get current user's role
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user!.id)
    .single()

  // 020: 軟刪除（deleted_at）的用戶不出現在後台列表
  const { data: users, count } = await admin
    .from('users')
    .select('id, nickname, phone, email, gender, birthday, role, current_plan, dialog_limit, plan_deadline, created_at', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">用戶管理</h1>
      <UserTable users={users ?? []} total={count ?? 0} currentUserRole={me?.role ?? 'user'} />
    </div>
  )
}
