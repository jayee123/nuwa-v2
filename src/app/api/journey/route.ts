import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — get user's active journey for a service
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
    return NextResponse.json({ journey: null })
  }

  // Load daily records
  const { data: records } = await admin
    .from('daily_records')
    .select('day_number, task_completed, emotion_score, points_earned')
    .eq('journey_id', journey.id)
    .order('day_number')

  return NextResponse.json({
    journey,
    records: records ?? [],
    completedDays: (records ?? []).filter((r) => r.task_completed).length,
    totalPoints: (records ?? []).reduce((sum, r) => sum + (r.points_earned ?? 0), 0),
  })
}

// POST — create a new journey
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { serviceId, mbtiSelf, mbtiPartner, mbtiConfidence, partnerNickname, relationshipType, goalStatement, fromTopicId } = await request.json()

  if (!serviceId) return NextResponse.json({ error: 'Missing serviceId' }, { status: 400 })

  const admin = createAdminClient()

  // If fromTopicId provided, inherit context from unpack session
  let inheritedMbti: string | null = null
  let inheritedRelType: string | null = null
  let inheritedNickname: string | null = null
  let inheritedGoal: string | null = null

  if (fromTopicId) {
    const { data: topic } = await admin
      .from('chat_topics')
      .select('unpack_context')
      .eq('id', fromTopicId)
      .eq('user_id', user.id)
      .eq('mode', 'unpack')
      .single()

    if (topic?.unpack_context) {
      const ctx = topic.unpack_context as {
        partner_mbti_guess?: string
        relationship_type?: string
        partner_role?: string
        problem_summary?: string
      }
      inheritedMbti = ctx.partner_mbti_guess || null
      inheritedRelType = ctx.relationship_type || null
      inheritedNickname = ctx.partner_role || null
      inheritedGoal = ctx.problem_summary || null
    }
  }

  // Deactivate any existing journey for this service
  await admin
    .from('journeys')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('service_id', serviceId)
    .eq('is_active', true)

  const { data: journey, error } = await admin
    .from('journeys')
    .insert({
      user_id: user.id,
      service_id: serviceId,
      mbti_self: mbtiSelf || null,
      mbti_partner: mbtiPartner || inheritedMbti || null,
      mbti_confidence: mbtiConfidence || 'guess',
      partner_nickname: partnerNickname || inheritedNickname || '對方',
      relationship_type: relationshipType || inheritedRelType || 'couple',
      goal_statement: goalStatement || inheritedGoal || null,
      current_day: 1,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ journey })
}
