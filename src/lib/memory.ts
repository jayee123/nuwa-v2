import { createAdminClient } from '@/lib/supabase/admin'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { getSecretParam } from '@/lib/secret-params'

const MEMORY_CATEGORIES = ['personality', 'preference', 'relationship', 'goal', 'event'] as const

/**
 * Load user's long-term memory and format as system prompt context
 */
export async function loadUserMemory(userId: string): Promise<string> {
  const admin = createAdminClient()

  const { data: memories } = await admin
    .from('user_memory')
    .select('category, content, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (!memories || memories.length === 0) return ''

  const grouped = new Map<string, string[]>()
  for (const m of memories) {
    const arr = grouped.get(m.category) ?? []
    arr.push(m.content)
    grouped.set(m.category, arr)
  }

  const categoryLabels: Record<string, string> = {
    personality: '用戶個性特質',
    preference: '用戶偏好',
    relationship: '關係狀況',
    goal: '學習目標',
    event: '重要事件',
  }

  let context = '\n\n--- 用戶記憶（長期）---\n'
  for (const [cat, items] of grouped) {
    context += `【${categoryLabels[cat] ?? cat}】\n`
    for (const item of items.slice(0, 5)) {
      context += `- ${item}\n`
    }
  }
  context += '---\n請在回答時自然地參考以上記憶，不要直接提及「我看到你的記憶」。\n'

  return context
}

/**
 * After a conversation, extract key memories from the messages
 * Called asynchronously after AI response completes
 */
export async function extractMemories(opts: {
  userId: string
  topicId: string
  messages: { role: string; content: string }[]
}) {
  const { userId, topicId, messages } = opts

  // Only extract if there are enough messages (at least 3 exchanges)
  if (messages.length < 6) return

  // Take the last 10 messages for extraction
  const recentMessages = messages.slice(-10)
  const conversation = recentMessages
    .map((m) => `${m.role === 'user' ? '用戶' : 'AI'}：${m.content}`)
    .join('\n')

  try {
    const apiKey = await getSecretParam('OPENAI_API_KEY')
    if (!apiKey) return

    const openai = createOpenAI({ apiKey })
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: `你是一個記憶提取助手。從以下對話中提取值得長期記住的用戶資訊。

每條記憶用以下 JSON 格式回傳（一行一條）：
{"category": "personality|preference|relationship|goal|event", "content": "簡短描述"}

規則：
- personality: 用戶的 MBTI 類型、性格特點、溝通風格
- preference: 用戶的學習偏好、喜好
- relationship: 用戶的伴侶/家人/同事關係狀況
- goal: 用戶想達成的目標
- event: 重要的生活事件（吵架、升遷、搬家等）

只提取確定的事實，不要猜測。如果沒有值得記住的內容，回傳空行。
最多提取 3 條記憶。`,
      prompt: conversation,
    })

    if (!text.trim()) return

    const admin = createAdminClient()
    const lines = text.trim().split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const memory = JSON.parse(line.trim())
        if (!memory.category || !memory.content) continue
        if (!MEMORY_CATEGORIES.includes(memory.category)) continue

        // Check for duplicate/similar memory
        const { data: existing } = await admin
          .from('user_memory')
          .select('id, content')
          .eq('user_id', userId)
          .eq('category', memory.category)
          .limit(10)

        // Simple dedup: if content is very similar, update instead of insert
        const similar = (existing ?? []).find((e) =>
          e.content.includes(memory.content.slice(0, 20)) ||
          memory.content.includes(e.content.slice(0, 20))
        )

        if (similar) {
          await admin
            .from('user_memory')
            .update({ content: memory.content, source_topic_id: topicId })
            .eq('id', similar.id)
        } else {
          await admin.from('user_memory').insert({
            user_id: userId,
            category: memory.category,
            content: memory.content,
            source_topic_id: topicId,
          })
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  } catch (err) {
    console.error('Memory extraction failed:', err)
  }
}
