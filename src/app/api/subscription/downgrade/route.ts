import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_LEVEL } from '@/lib/plans'

const CODE_TO_NAME: Record<string, string> = {
  basic: '基本方案',
  advanced: '進階方案',
  premium: 'Premium',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { planCode, serviceCode } = await request.json()

  // Get user's current plan
  const { data: userData } = await admin
    .from('users')
    .select('current_plan, plan_deadline')
    .eq('id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: '找不到使用者資料' }, { status: 404 })

  const newPlanCode = planCode
  if (!newPlanCode || !(newPlanCode in PLAN_LEVEL)) return NextResponse.json({ error: '無效的方案' }, { status: 400 })

  const currentLevel = PLAN_LEVEL[userData.current_plan] ?? 0
  const newLevel = PLAN_LEVEL[newPlanCode] ?? 0

  if (newLevel >= currentLevel) {
    return NextResponse.json({ error: '此操作不是降級，請使用升級流程' }, { status: 400 })
  }

  // Record next_plan — will take effect at plan_deadline
  await admin.from('users').update({
    next_plan: newPlanCode,
  }).eq('id', user.id)

  const deadline = userData.plan_deadline
    ? new Date(userData.plan_deadline).toLocaleDateString('zh-TW')
    : '下次到期'

  return NextResponse.json({
    success: true,
    message: `已排定降級至「${CODE_TO_NAME[newPlanCode] ?? newPlanCode}」，將於 ${deadline} 後生效`,
    nextPlan: newPlanCode,
    effectiveDate: userData.plan_deadline,
  })
}

// DELETE — cancel scheduled downgrade
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  await admin.from('users').update({
    next_plan: null,
  }).eq('id', user.id)

  return NextResponse.json({ success: true, message: '已取消降級排程' })
}
