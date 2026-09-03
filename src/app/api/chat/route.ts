import { streamText, convertToModelMessages } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { loadUserMemory, extractMemories } from '@/lib/memory'
import { getSecretParam } from '@/lib/secret-params'
import { getCourseDay } from '@/lib/course/getCourseContent'
import { BRAND_INTEGRITY_BLOC, MBTI_BALANCE_BLOC, WEEK_STRUCTURE_BLOC, BLINDSPOT_DETECTION_BLOC, TWO_LAYER_SEPARATION_BLOC, GOLDEN_EXAMPLE_BLOC, W2_DISCIPLINE_BLOC, isW2Day, buildDayLockBloc } from '@/lib/ai/quality-blocs'

interface MbtiProfileData {
  blindspot: string
  desire: string
  landmine: string
  unlock: string
}

function buildJourneyPrompt(journey: {
  mbti_self: string | null
  mbti_partner: string | null
  mbti_confidence: string | null
  partner_nickname: string | null
  relationship_type: string
  goal_statement: string | null
  current_day: number
}, userName: string, recentMemories: { day_number: number; emotion_note: string | null; key_insight: string | null; partner_obs: string | null; follow_up: string | null }[], selfProfile: MbtiProfileData | null, partnerProfile: MbtiProfileData | null) {
  const day = journey.current_day
  const relType = (journey.relationship_type || 'couple') as 'couple' | 'parent_child' | 'workplace'
  const todayTask = getCourseDay(relType, day)

  const relLabel = relType === 'couple' ? '伴侶' : relType === 'parent_child' ? '親子' : '職場'

  const memoryText = recentMemories.length > 0
    ? recentMemories.map((m) => {
      let line = `Day ${m.day_number}：${m.emotion_note ?? '未填'}。洞察：${m.key_insight ?? '無'}`
      if (m.partner_obs) line += `。對方反應：${m.partner_obs}`
      if (m.follow_up) line += `。追蹤：${m.follow_up}`
      return line
    }).join('\n')
    : '這是第一次對話'

  let prompt = `你是「小羽」，羽升幸福養成學苑的 AI 關係練習教練。\n\n`
  prompt += `【學員檔案】\n`
  prompt += `姓名：${userName}\n`
  prompt += `自己的 MBTI：${journey.mbti_self ?? '未設定'}\n`
  prompt += `對方（${journey.partner_nickname ?? '對方'}）MBTI：${journey.mbti_partner ?? '未設定'}（信心度：${journey.mbti_confidence ?? 'guess'}）\n`
  prompt += `關係類型：${relLabel}\n`
  prompt += `今天是第 ${day} 天（共 21 天）\n`
  prompt += `學員目標：${journey.goal_statement ?? '未設定'}\n\n`

  if (partnerProfile) {
    prompt += `【對方 MBTI 深度檔案】\n`
    prompt += `渴望：${partnerProfile.desire}\n`
    prompt += `地雷：${partnerProfile.landmine}\n`
    prompt += `盲點：${partnerProfile.blindspot}\n`
    prompt += `解鎖方式：${partnerProfile.unlock}\n\n`
  }
  if (selfProfile) {
    prompt += `【學員自己的 MBTI 盲點】${selfProfile.blindspot}\n\n`
  }

  prompt += `【近期練習記憶】\n${memoryText}\n\n`

  if (todayTask) {
    prompt += `【今日課程 Day ${day}：${todayTask.title}】\n`
    prompt += `主題：${todayTask.theme}\n`
    prompt += `核心提示：${todayTask.coreTip}\n`
    prompt += `今日行動：${todayTask.actions.join('；')}\n`
    prompt += `反思問題：${todayTask.reflectionQuestions.join('；')}\n`
    if (todayTask.variationTip) {
      prompt += `【${relLabel}關係專屬提示】${todayTask.variationTip}\n`
    }
    if (todayTask.mbtiCognitiveFunctions) {
      prompt += `\n【今日 MBTI 認知功能】\n`
      for (const [code, fn] of Object.entries(todayTask.mbtiCognitiveFunctions)) {
        prompt += `${code}（${fn.name}）：「${fn.dialogue}」→ ${fn.howToUnderstand}\n`
      }
    }
    prompt += '\n'
  }

  prompt += `【你的原則】\n`
  prompt += `- 溫暖幽默，像懂 MBTI 的好朋友\n`
  prompt += `- 永遠先接住情緒，再給建議\n`
  prompt += `- 建議具體、今天就能做到\n`
  prompt += `- MBTI 是傾向非標籤；偵測到衝突關鍵詞時自動觸發觀察提醒\n`
  prompt += `- 記得學員說過的事，展現你在乎\n`
  prompt += `- 根據今日課程主題引導對話，幫助學員完成今日練習\n\n`
  prompt += `衝突觸發關鍵詞：沉默、走開、不理、冷戰、吵架、生氣、不說話、翻臉\n`
  prompt += `觸發時在回應中插入：「這個反應符合你平常對他的理解嗎？」+ MBTI 視角解讀\n\n`

  // Quality control blocs
  if (todayTask) {
    prompt += buildDayLockBloc(day, todayTask.theme)
  }
  prompt += WEEK_STRUCTURE_BLOC
  prompt += BRAND_INTEGRITY_BLOC
  prompt += MBTI_BALANCE_BLOC
  prompt += BLINDSPOT_DETECTION_BLOC
  prompt += TWO_LAYER_SEPARATION_BLOC
  prompt += GOLDEN_EXAMPLE_BLOC
  if (isW2Day(day)) {
    prompt += W2_DISCIPLINE_BLOC
  }

  prompt += `\n【排版格式】\n`
  prompt += `- 每段 80-150 字，段與段之間空一行\n`
  prompt += `- 像在 LINE 聊天一樣，一段一段的感覺\n`
  prompt += `- 回覆 100-200 字，繁體中文，口語自然，不用 markdown。`

  return prompt
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

  const { messages, topicId, teacherId, serviceId } = await request.json()

  // Check dialog limit
  const { data: userData } = await admin
    .from('users')
    .select('dialog_limit, nickname')
    .eq('id', user.id)
    .single()

  if (userData && userData.dialog_limit <= 0) {
    return new Response(
      JSON.stringify({ error: '對話點數不足，請升級方案' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Try to load active journey for this service
  let systemPrompt = ''
  const { data: journey } = await admin
    .from('journeys')
    .select('*')
    .eq('user_id', user.id)
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (journey) {
    // Load recent daily memories for context
    const { data: recentMemories } = await admin
      .from('daily_memories')
      .select('day_number, emotion_note, key_insight, partner_obs, follow_up')
      .eq('journey_id', journey.id)
      .order('day_number', { ascending: false })
      .limit(3)

    // Load MBTI profiles
    let selfProfile: MbtiProfileData | null = null
    let partnerProfile: MbtiProfileData | null = null

    if (journey.mbti_self) {
      const { data } = await admin.from('mbti_profiles').select('blindspot, desire, landmine, unlock').eq('mbti_type', journey.mbti_self).single()
      selfProfile = data
    }
    if (journey.mbti_partner) {
      const { data } = await admin.from('mbti_profiles').select('blindspot, desire, landmine, unlock').eq('mbti_type', journey.mbti_partner).single()
      partnerProfile = data
    }

    systemPrompt = buildJourneyPrompt(
      journey,
      userData?.nickname ?? '學員',
      recentMemories ?? [],
      selfProfile,
      partnerProfile
    )
  } else {
    // Fallback: use teacher's system prompt
    if (teacherId) {
      const { data: teacher } = await admin
        .from('teachers')
        .select('system_prompt, name')
        .eq('id', teacherId)
        .single()
      if (teacher?.system_prompt) {
        systemPrompt = teacher.system_prompt
      }
    }
    if (!systemPrompt) {
      systemPrompt = '你是「小羽」，羽升幸福養成學苑的 AI 關係練習教練。用繁體中文回答，溫暖幽默，像懂 MBTI 的好朋友。回覆 100-200 字，口語自然，不用 markdown。'
    }
  }

  // Load long-term memory
  const memoryContext = await loadUserMemory(user.id)
  if (memoryContext) {
    systemPrompt += memoryContext
  }

  // Save user message (handle both content and parts format from AI SDK v6)
  if (topicId && messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role === 'user') {
      const msgContent = lastMsg.content
        || (lastMsg.parts?.find((p: { type: string; text?: string }) => p.type === 'text')?.text)
        || ''
      if (msgContent) {
        await admin.from('chat_messages').insert({
          topic_id: topicId,
          role: 'user',
          content: msgContent,
        })
      }
    }
  }

  const apiKey = await getSecretParam('OPENAI_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API Key 尚未設定' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  const openai = createOpenAI({ apiKey })

  // Convert UI messages (parts format) to model messages (content format)
  const modelMessages = await convertToModelMessages(messages)

  try {
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
      onFinish: async ({ text, usage }) => {
        if (topicId) {
          await admin.from('chat_messages').insert({
            topic_id: topicId,
            role: 'assistant',
            content: text,
            token_count: usage?.totalTokens ?? 0,
          })
        }

        await admin.rpc('decrement_dialog_limit', { uid: user.id })

        if (serviceId && teacherId) {
          await admin.from('ai_token_usage').insert({
            user_id: user.id,
            teacher_id: teacherId,
            service_id: serviceId,
            tokens_used: usage?.totalTokens ?? 0,
          })
        }

        if (topicId) {
          const allMessages = [
            ...messages.map((m: { role: string; content?: string; parts?: { type: string; text?: string }[] }) => ({
              role: m.role,
              content: m.content || (m.parts?.find((p: { type: string; text?: string }) => p.type === 'text')?.text ?? ''),
            })),
            { role: 'assistant', content: text },
          ]
          extractMemories({ userId: user.id, topicId, messages: allMessages }).catch(() => {})
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 服務發生未知錯誤'
    console.error('[chat/route] streamText error:', message)
    return new Response(
      JSON.stringify({ error: `AI 回應失敗：${message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
