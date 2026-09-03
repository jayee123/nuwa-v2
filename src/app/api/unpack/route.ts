import { streamText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { loadUserMemory, extractMemories } from '@/lib/memory'
import { getSecretParam } from '@/lib/secret-params'
import { buildUnpackPrompt, type UnpackStage } from '@/lib/unpack/prompts'
import { getOptionsForStage, is4sTrigger, isDeepVersionTrigger, type UnpackOption } from '@/lib/unpack/options'

interface UnpackContext {
  relationship_type?: string
  partner_role?: string
  partner_age?: number
  partner_mbti_guess?: string
  partner_mbti_confidence?: string
  user_mbti?: string
  problem_summary?: string
  stage: UnpackStage
  turn_count: number
  user_choice?: string
  fired_layers?: string[]
}

function nextStage(current: UnpackStage, turnCount: number, maxTurns: number, userChoice?: string, userMessage?: string): UnpackStage {
  if (current === 'lead') return 'lead'

  // 4S trigger detection — from any stage, if user says "4S" → go to 4s_handler
  if (userMessage && is4sTrigger(userMessage)) return '4s_handler'

  // Deep version trigger — from any stage, if user says "深度版" → go to path_c
  if (userMessage && isDeepVersionTrigger(userMessage)) return 'path_c'

  if (current === 'diagnose') return 'step2_ab'

  if (current === 'step2_ab') {
    if (userChoice === 'give_mbti' || userChoice === 'understand_other') return 'deep_mbti'
    if (userChoice === '4s') return '4s_handler'
    if (userChoice === 'look_self') return 'step2_ab' // stay, B path handled in prompt
    return 'step2_ab'
  }

  if (current === 'deep_mbti') {
    if (userChoice === '4s') return '4s_handler'
    return 'deep_mbti'
  }

  if (current === '4s_handler') {
    if (userChoice === 'deep_version') return 'path_c'
    if (userChoice === 'try_rehearse') return 'step3_paths'
    return 'step3_paths'
  }

  if (current === 'step3_paths') {
    if (userChoice === 'path_c') return 'path_c'
    if (userChoice === 'path_a' || userChoice === 'path_b') return 'step3_paths'
    return 'step3_paths'
  }

  if (current === 'path_c') {
    return 'lead'
  }

  return current
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await request.json()
  const {
    topicId: existingTopicId,
    messages,
    relationshipType,
    partnerNickname,
    userChoice,
  } = body as {
    topicId?: string
    messages: { role: string; content?: string; parts?: { type: string; text?: string }[] }[]
    relationshipType?: string
    partnerNickname?: string
    userChoice?: string
  }

  if (!messages || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: '請提供訊息' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Extract user message text
  const lastMsg = messages[messages.length - 1]
  const userMessage = lastMsg?.content
    || lastMsg?.parts?.find((p) => p.type === 'text')?.text
    || ''

  // Load max turns setting
  const maxTurnsStr = await getSecretParam('unpack_max_turns_before_lead')
  const maxTurns = parseInt(maxTurnsStr, 10) || 4

  // --- Resolve or create topic ---
  let topicId = existingTopicId
  let ctx: UnpackContext

  if (topicId) {
    // Continue existing unpack topic
    const { data: topic } = await admin
      .from('chat_topics')
      .select('id, unpack_context')
      .eq('id', topicId)
      .eq('user_id', user.id)
      .eq('mode', 'unpack')
      .single()

    if (!topic) {
      return new Response(
        JSON.stringify({ error: '找不到對話' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    ctx = (topic.unpack_context as UnpackContext) ?? {
      stage: 'diagnose' as UnpackStage,
      turn_count: 0,
    }
    // Advance stage
    ctx.turn_count += 1
    ctx.user_choice = userChoice
    ctx.stage = nextStage(ctx.stage, ctx.turn_count, maxTurns, userChoice, userMessage)
  } else {
    // New unpack topic
    ctx = {
      relationship_type: relationshipType || 'parent_child',
      partner_role: partnerNickname || undefined,
      problem_summary: userMessage.slice(0, 200),
      stage: 'diagnose' as UnpackStage,
      turn_count: 1,
    }

    const title = userMessage.slice(0, 30) || '我卡住了'

    const { data: newTopic, error: insertErr } = await admin
      .from('chat_topics')
      .insert({
        user_id: user.id,
        mode: 'unpack',
        title,
        unpack_context: ctx,
      })
      .select('id')
      .single()

    if (insertErr || !newTopic) {
      return new Response(
        JSON.stringify({ error: '建立對話失敗' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    topicId = newTopic.id
  }

  // Save user message
  if (userMessage) {
    await admin.from('chat_messages').insert({
      topic_id: topicId,
      role: 'user',
      content: userMessage,
    })
  }

  // Track fired layers for funnel direction (prevent hook regression)
  if (!ctx.fired_layers) ctx.fired_layers = []
  if (!ctx.fired_layers.includes(ctx.stage)) {
    ctx.fired_layers.push(ctx.stage)
  }

  // Build system prompt
  let systemPrompt = buildUnpackPrompt({
    stage: ctx.stage,
    relationshipType: ctx.relationship_type,
    partnerNickname: ctx.partner_role,
    partnerMbtiGuess: ctx.partner_mbti_guess,
    userMbti: ctx.user_mbti,
    problemSummary: ctx.problem_summary,
    turnCount: ctx.turn_count,
    firedLayers: ctx.fired_layers,
  })

  // Append long-term memory
  const memoryContext = await loadUserMemory(user.id)
  if (memoryContext) {
    systemPrompt += memoryContext
  }

  // OpenAI
  const apiKey = await getSecretParam('OPENAI_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API Key 尚未設定' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const openai = createOpenAI({ apiKey })

  // Convert messages to ModelMessage format (handles both simple {role,content} and UIMessage with parts)
  const modelMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content || m.parts?.find((p) => p.type === 'text')?.text || '',
  }))

  // Prepare options & suggestJourney for the response header
  const options: UnpackOption[] = getOptionsForStage(ctx.stage)
  const suggestJourney = ctx.stage === 'lead'
    ? { relationshipType: ctx.relationship_type ?? 'parent_child', cta: '想要 21 天系統練習嗎？' }
    : undefined

  try {
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
      onFinish: async ({ text, usage }) => {
        // Save assistant message
        await admin.from('chat_messages').insert({
          topic_id: topicId,
          role: 'assistant',
          content: text,
          token_count: usage?.totalTokens ?? 0,
        })

        // Update unpack_context on topic
        await admin
          .from('chat_topics')
          .update({ unpack_context: ctx })
          .eq('id', topicId)

        // Decrement dialog limit
        await admin.rpc('decrement_dialog_limit', { uid: user.id })

        // Token usage tracking
        await admin.from('ai_token_usage').insert({
          user_id: user.id,
          tokens_used: usage?.totalTokens ?? 0,
        })

        // Extract memories
        const allMessages = [
          ...messages.map((m: { role: string; content?: string; parts?: { type: string; text?: string }[] }) => ({
            role: m.role,
            content: m.content || (m.parts?.find((p) => p.type === 'text')?.text ?? ''),
          })),
          { role: 'assistant', content: text },
        ]
        extractMemories({ userId: user.id, topicId: topicId!, messages: allMessages }).catch(() => {})
      },
    })

    // Stream response with metadata in custom headers
    const response = result.toUIMessageStreamResponse()

    // Attach unpack metadata as JSON in a custom header (URI-encoded for non-ASCII safety)
    const meta = JSON.stringify({
      topicId,
      stage: ctx.stage,
      options,
      suggestJourney: suggestJourney ?? null,
    })
    response.headers.set('X-Unpack-Meta', encodeURIComponent(meta))

    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 服務發生未知錯誤'
    return new Response(
      JSON.stringify({ error: `AI 回應失敗：${message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
