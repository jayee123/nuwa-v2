import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { MemoryManager } from '@/components/manage/memory-manager'

export const metadata: Metadata = { title: 'AI 記憶管理 — 羽升管理後台' }

export default async function ManageMemoryPage() {
  const admin = createAdminClient()

  const { data: memories } = await admin
    .from('user_memory')
    .select('*, users(nickname, phone)')
    .order('created_at', { ascending: false })
    .limit(500)

  const rows = (memories ?? []).map((m) => ({
    id: m.id,
    category: m.category,
    content: m.content,
    created_at: m.created_at,
    updated_at: m.updated_at,
    user_name: (m.users as { nickname: string | null; phone: string } | null)?.nickname ?? '未知',
    user_phone: (m.users as { nickname: string | null; phone: string } | null)?.phone ?? '',
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">AI 記憶管理</h1>
      <MemoryManager memories={rows} />
    </div>
  )
}
