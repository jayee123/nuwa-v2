import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCourseDay } from '@/lib/course/getCourseContent'

// GET — get today's course content for active journey
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceId = request.nextUrl.searchParams.get('serviceId')
  if (!serviceId) return NextResponse.json({ error: 'Missing serviceId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: journey } = await admin
    .from('journeys')
    .select('*')
    .eq('user_id', user.id)
    .eq('service_id', serviceId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!journey) {
    return NextResponse.json({ journey: null, course: null })
  }

  const relType = (journey.relationship_type || 'couple') as 'couple' | 'parent_child' | 'workplace'
  const course = getCourseDay(relType, journey.current_day)

  // Check if today is already completed
  const { data: todayRecord } = await admin
    .from('daily_records')
    .select('*')
    .eq('journey_id', journey.id)
    .eq('day_number', journey.current_day)
    .maybeSingle()

  return NextResponse.json({
    journey: {
      id: journey.id,
      currentDay: journey.current_day,
      mbtiSelf: journey.mbti_self,
      mbtiPartner: journey.mbti_partner,
      partnerNickname: journey.partner_nickname,
      relationshipType: journey.relationship_type,
      goalStatement: journey.goal_statement,
      startDate: journey.start_date,
    },
    course,
    todayCompleted: todayRecord?.task_completed ?? false,
  })
}

// POST — mark today as complete
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { journeyId, emotionScore, journalText } = await request.json()
  if (!journeyId) return NextResponse.json({ error: 'Missing journeyId' }, { status: 400 })

  const admin = createAdminClient()

  // Get journey
  const { data: journey } = await admin
    .from('journeys')
    .select('*')
    .eq('id', journeyId)
    .eq('user_id', user.id)
    .single()

  if (!journey) return NextResponse.json({ error: 'Journey not found' }, { status: 404 })

  const dayNumber = journey.current_day

  // Upsert daily record
  await admin
    .from('daily_records')
    .upsert({
      journey_id: journeyId,
      day_number: dayNumber,
      task_completed: true,
      emotion_score: emotionScore ?? null,
      journal_text: journalText ?? null,
      points_earned: 10,
    }, { onConflict: 'journey_id,day_number' })

  // Advance to next day (max 21)
  if (dayNumber < 21) {
    await admin
      .from('journeys')
      .update({ current_day: dayNumber + 1 })
      .eq('id', journeyId)
  }

  // Extract daily memory from today's conversations (async, don't block)
  extractDailyMemory(admin, journeyId, dayNumber, user.id).catch(() => {})

  // Check milestone achievements
  const milestonePoints: Record<number, number> = { 3: 20, 7: 50, 14: 50, 21: 100 }
  const bonusPoints = milestonePoints[dayNumber] ?? 0

  return NextResponse.json({
    success: true,
    dayNumber,
    nextDay: dayNumber < 21 ? dayNumber + 1 : null,
    bonusPoints,
    isComplete: dayNumber >= 21,
  })
}

async function extractDailyMemory(
  admin: ReturnType<typeof createAdminClient>,
  journeyId: string,
  dayNumber: number,
  userId: string
) {
  // Load today's chat messages for this journey's topics
  const { data: topics } = await admin
    .from('chat_topics')
    .select('id')
    .eq('user_id', userId)

  if (!topics?.length) return

  const topicIds = topics.map((t) => t.id)
  const { data: messages } = await admin
    .from('chat_messages')
    .select('role, content, created_at')
    .in('topic_id', topicIds)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(30)

  if (!messages?.length) return

  const conversation = messages
    .map((m) => `${m.role === 'user' ? '學員' : 'AI'}：${m.content}`)
    .join('\n')

  // Use OpenAI to extract memory
  try {
    const { getSecretParam } = await import('@/lib/secret-params')
    const { createOpenAI } = await import('@ai-sdk/openai')
    const { generateText } = await import('ai')

    const apiKey = await getSecretParam('OPENAI_API_KEY')
    if (!apiKey) return

    const openai = createOpenAI({ apiKey })
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: `從以下對話中提取今日練習摘要，回傳 JSON：
{"emotion_note":"今日情緒狀態","task_result":"練習完成狀況","partner_obs":"對對方的觀察","key_insight":"最大領悟","follow_up":"明天要注意的事"}
只回傳 JSON，不要其他文字。`,
      prompt: conversation,
    })

    const memory = JSON.parse(text.trim())
    await admin.from('daily_memories').upsert({
      journey_id: journeyId,
      day_number: dayNumber,
      ...memory,
    }, { onConflict: 'journey_id,day_number' })
  } catch {
    // silent
  }
}
