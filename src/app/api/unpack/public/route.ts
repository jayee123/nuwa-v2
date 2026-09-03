import { streamText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { getSecretParam } from '@/lib/secret-params'
import { buildUnpackPrompt } from '@/lib/unpack/prompts'

const MAX_PUBLIC_TURNS = 3

export async function POST(request: Request) {
  const body = await request.json()
  const { messages, turnCount } = body as {
    messages: { role: string; content?: string; parts?: { type: string; text?: string }[] }[]
    turnCount: number
  }

  if (turnCount > MAX_PUBLIC_TURNS) {
    return new Response(
      JSON.stringify({ error: '免費體驗已結束，請註冊繼續使用', requireSignup: true }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!messages || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: '請提供訊息' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const lastMsg = messages[messages.length - 1]
  const userMessage = lastMsg?.content
    || lastMsg?.parts?.find((p: { type: string; text?: string }) => p.type === 'text')?.text
    || ''

  const systemPrompt = buildUnpackPrompt({
    stage: 'diagnose',
    problemSummary: userMessage.slice(0, 200),
    turnCount,
  })

  const apiKey = await getSecretParam('OPENAI_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API Key 尚未設定' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const openai = createOpenAI({ apiKey })

  const modelMessages: ModelMessage[] = messages.map((m: { role: string; content?: string; parts?: { type: string; text?: string }[] }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content || m.parts?.find((p: { type: string; text?: string }) => p.type === 'text')?.text || '',
  }))

  try {
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
    })

    return result.toUIMessageStreamResponse()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 服務發生未知錯誤'
    return new Response(
      JSON.stringify({ error: `AI 回應失敗：${message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
