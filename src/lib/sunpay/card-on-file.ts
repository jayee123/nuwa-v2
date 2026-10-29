/**
 * 月扣用哪張卡：這位會員最近一筆「已付款、存了新版卡片代碼」的付款。
 *
 * 月扣（auto-charge）和入帳時的帳務備註（settle）共用這個查法，兩邊的判斷才會一致 ——
 * 10/19 對帳補入帳 V3F261018001051XRQ75U 時，備註沒查就寫「之後無法月扣」，
 * 其實這筆在 10/18 通知入帳時已經存了代碼（失敗回滾只退回 pending，代碼留著），
 * 會員更早的 V3F261017234728QHAJ8W 也有，月扣照樣扣得到。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CardPayment {
  payment_uid: string
  token_data: string
  amount: number
}

export async function latestCardPayment(admin: SupabaseClient, userId: string): Promise<CardPayment | null> {
  const { data } = await admin
    .from('payments')
    .select('payment_uid, token_data, amount')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .like('token_data', 'v3:%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as CardPayment | null) ?? null
}
