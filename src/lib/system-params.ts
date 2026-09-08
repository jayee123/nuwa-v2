import { createAdminClient } from '@/lib/supabase/admin'

/**
 * system_params 讀取（一般參數；secret 類走 lib/secret-params.ts，兩者是不同表）。
 *
 * 後台「系統設定 → 一般參數」可即時改值，所以這裡不做長 cache ——
 * 註冊頁這種低頻讀取直接查表即可。
 */
export async function getSystemParam(key: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('system_params')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    return data?.value ?? null
  } catch {
    return null
  }
}

/**
 * 註冊是否要求邀請碼（封測動線測試回報・發現 01/03）。
 *
 * 預設 false：邀請碼的用途是「進 internal App 時兌換」，不是註冊門檻 ——
 * 封測期所有 App 都是 internal，陌生人註冊了也進不去，註冊擋碼是多餘的一道；
 * 全面開放時更不能擋。要重新開啟時到後台把 register_require_invite 設成 true。
 *
 * fail open 是刻意的：讀不到設定時回預設值 false，
 * 因為「註冊被莫名擋死」比「多收一個進不了任何 App 的帳號」嚴重。
 */
export async function isRegisterInviteRequired(): Promise<boolean> {
  const value = await getSystemParam('register_require_invite')
  return value?.trim().toLowerCase() === 'true'
}
