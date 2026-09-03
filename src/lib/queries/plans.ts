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

export async function getActivePlans(): Promise<PlanRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('plans').select('*').eq('is_active', true).order('sort_order')
  return (data ?? []) as PlanRow[]
}

export async function getPlanByCode(code: string): Promise<PlanRow | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('plans').select('*').eq('code', code).maybeSingle()
  return (data as PlanRow | null) ?? null
}
