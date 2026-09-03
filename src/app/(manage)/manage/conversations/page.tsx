import type { Metadata } from 'next'
import { getAppScope } from '@/lib/app-access'
import { ConversationViewer } from '@/components/manage/conversation-viewer'

export const metadata: Metadata = { title: 'AI 對話紀錄 — 羽升管理後台' }

export default async function ManageConversationsPage() {
  const scope = await getAppScope()
  if (!scope) return null

  // per-App 管理者只看自己 App 的對話；superadmin（appIds=null）看全部
  let query = scope.admin
    .from('chat_topics')
    .select('*, users(nickname, phone), teachers(name), chat_messages(id)')
  if (scope.appIds) query = query.in('app_id', scope.appIds)
  const { data: topics } = await query
    .order('updated_at', { ascending: false })
    .limit(300)

  const rows = (topics ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    is_pinned: t.is_pinned,
    created_at: t.created_at,
    updated_at: t.updated_at,
    mode: (t as { mode?: string }).mode ?? 'free',
    unpack_context: (t as { unpack_context?: Record<string, unknown> }).unpack_context ?? null,
    user_name: (t.users as { nickname: string | null; phone: string } | null)?.nickname ?? '未知',
    user_phone: (t.users as { nickname: string | null; phone: string } | null)?.phone ?? '',
    teacher_name: (t.teachers as { name: string } | null)?.name ?? '-',
    message_count: Array.isArray(t.chat_messages) ? t.chat_messages.length : 0,
  }))

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-fg-primary">AI 對話紀錄</h1>
      <ConversationViewer topics={rows} />
    </div>
  )
}
