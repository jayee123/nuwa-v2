import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { NotificationManager } from '@/components/manage/notification-manager'

export const metadata: Metadata = { title: '通知管理 — 羽升管理後台' }

export default async function ManageNotificationsPage() {
  const admin = createAdminClient()

  const { data: notifications } = await admin
    .from('notifications')
    .select('*, users(nickname, phone)')
    .order('created_at', { ascending: false })
    .limit(300)

  const rows = (notifications ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    content: n.content,
    read_at: n.read_at,
    created_at: n.created_at,
    user_name: (n.users as { nickname: string | null; phone: string } | null)?.nickname ?? '未知',
    user_phone: (n.users as { nickname: string | null; phone: string } | null)?.phone ?? '',
  }))

  // Fetch users for the send form（020: 軟刪除用戶不列入收件人）
  const { data: users } = await admin
    .from('users')
    .select('id, nickname, phone')
    .is('deleted_at', null)
    .order('nickname')

  const userList = (users ?? []).map((u) => ({
    id: u.id,
    label: `${u.nickname ?? '未命名'} (${u.phone})`,
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">通知管理</h1>
      <NotificationManager notifications={rows} users={userList} />
    </div>
  )
}
