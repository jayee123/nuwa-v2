/**
 * 結帳要用的資料：方案、課程、會員、這次算首次付款還是升級、收多少。
 *
 * 結帳頁的試算（/api/payment/quote）和按下付款（/api/payment/initiate）共用這一份，
 * 確認畫面上看到的金額才會跟真的收的一樣（PAY-22）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlanByCode, type PlanRow } from '@/lib/queries/plans'
import { checkoutQuote, type CheckoutQuote } from './checkout-quote'

export interface CheckoutUser {
  nickname: string | null
  phone: string | null
  email: string | null
  current_plan: string | null
}

export interface CheckoutContext {
  plan: PlanRow
  service: { id: string; name: string | null }
  user: CheckoutUser | null
  quote: Exclude<CheckoutQuote, { kind: 'reject' }>
}

export type CheckoutContextResult =
  | ({ ok: true } & CheckoutContext)
  | { ok: false; status: number; error: string }

export async function loadCheckoutContext(
  admin: SupabaseClient,
  userId: string,
  planCode: string,
  serviceCode: string,
): Promise<CheckoutContextResult> {
  const plan = planCode ? await getPlanByCode(planCode) : null
  if (!plan || !plan.is_active || plan.code === 'free') return { ok: false, status: 400, error: '找不到此方案' }

  const [{ data: user }, { data: service }] = await Promise.all([
    admin.from('users').select('nickname, phone, email, current_plan').eq('id', userId).single(),
    admin.from('services').select('id, name').eq('code', serviceCode).single(),
  ])
  if (!service) return { ok: false, status: 404, error: '服務不存在' }

  const currentPlanCode = (user as CheckoutUser | null)?.current_plan ?? 'free'
  const [currentPlan, { data: activeSubscription, error: subError }] = await Promise.all([
    currentPlanCode === 'free' ? null : getPlanByCode(currentPlanCode),
    admin
      .from('subscriptions')
      .select('ends_at')
      .eq('user_id', userId)
      .eq('service_id', service.id)
      .eq('status', 'active')
      .gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (subError) {
    console.error('[payment/checkout] 查訂閱失敗', subError.message)
    return { ok: false, status: 500, error: '系統錯誤，請重試' }
  }

  const quote = checkoutQuote({ target: plan, current: currentPlan, activeSubscription })
  if (quote.kind === 'reject') return { ok: false, status: 400, error: quote.error }

  return { ok: true, plan, service, user: user as CheckoutUser | null, quote }
}
