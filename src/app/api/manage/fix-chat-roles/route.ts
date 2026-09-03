import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'

/**
 * POST — Fix chat_messages roles for topics where all messages are 'user'.
 * Uses alternating pattern: messages within a topic alternate user → assistant.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: u } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!isAdminRole(u?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all topics
  const { data: topics } = await admin
    .from('chat_topics')
    .select('id')

  let fixedTopics = 0
  let fixedMessages = 0

  for (const topic of topics ?? []) {
    // Get messages for this topic, ordered by time
    const { data: messages } = await admin
      .from('chat_messages')
      .select('id, role, token_count')
      .eq('topic_id', topic.id)
      .order('created_at', { ascending: true })

    if (!messages || messages.length === 0) continue

    // Check if all messages have role='user' (broken data)
    const allUser = messages.every((m) => m.role === 'user')
    if (!allUser) continue // Already has correct roles, skip

    // Fix: alternate user → assistant starting from first message
    let topicFixed = false
    for (let i = 0; i < messages.length; i++) {
      const expectedRole = i % 2 === 0 ? 'user' : 'assistant'
      if (messages[i].role !== expectedRole) {
        await admin
          .from('chat_messages')
          .update({ role: expectedRole })
          .eq('id', messages[i].id)
        fixedMessages++
        topicFixed = true
      }
    }
    if (topicFixed) fixedTopics++
  }

  return NextResponse.json({
    success: true,
    message: `修正完成：${fixedTopics} 個對話主題、${fixedMessages} 則訊息`,
    fixedTopics,
    fixedMessages,
  })
}
