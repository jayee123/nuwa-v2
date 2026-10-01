import { createAdminClient } from '@/lib/supabase/admin'

// 公版統一方案（plans 表）查詢。金流/訂閱一律以 code 為 key、charge 用 monthly_charge。
export interface PlanRow {
  id: string
  code: string
  name: string
  price: number
  renewal_price: number
  monthly_dialog_count: number
  monthly_charge: number
  sort_order: number
  is_active: boolean
}

/**
 * 可購買的方案（訂閱頁用）。
 * 排除 free：它在 plans 表裡只是為了讓免費會員的對話次數能在後台編輯
 * （migration 030、Steve §4.7），不是能買的東西。
 */
export async function getActivePlans(): Promise<PlanRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('plans').select('*').eq('is_active', true).neq('code', 'free').order('sort_order')
  return (data ?? []) as PlanRow[]
}

export async function getPlanByCode(code: string): Promise<PlanRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('plans').select('*').eq('code', code).maybeSingle()
  return (data as PlanRow | null) ?? null
}
