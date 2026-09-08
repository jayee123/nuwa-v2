/**
 * 公版方案代碼與等級的單一定義。
 *
 * ⚠️ 公版與私版的方案值域**不一樣**：
 *     公版（public.users.current_plan）：free / basic / advanced / premium
 *     私版（happy.users.current_plan） ：trial / basic / advanced / premium / cancelled
 *
 * 兩者在 SSO 交界處極易混用，而混用時不會報錯 —— 只會安靜地放行或擋下。
 * api/apps/[slug]/launch 的進入門檻就踩過這個坑：它拿私版的 'trial' / 'cancelled'
 * 去比對公版的 current_plan，導致免費用戶一律通過。
 *
 * 因此「有哪些方案、順序為何」只留這一份，任何要判斷方案的地方都從這裡取。
 *
 * 顯示名稱也只留這一份（2026-09-03 起）：曾經同一個 premium 散在 7 個檔案
 * 寫成 Premium / 旗艦 / 旗艦版，前台後台各說各話。分兩組 ——
 *   PLAN_LABEL     短標籤（旗艦）   → badge、下拉、表格、CSV
 *   PLAN_FULL_NAME 完整名稱（旗艦方案）→ 定價頁、通知文案、金流收據品名
 * DB 的 plan_name 欄位一律存「代碼」，顯示時才轉標籤 —— 所以改這兩張表
 * 不會動到任何帳務資料。
 */

/** 公版所有合法的方案代碼，由低到高。 */
export const PLAN_CODES = ['free', 'basic', 'advanced', 'premium'] as const

export type PlanCode = (typeof PLAN_CODES)[number]

/** 方案等級，用於比較高低（升級 / 降級 / 進入門檻）。 */
export const PLAN_LEVEL: Record<string, number> = Object.fromEntries(
  PLAN_CODES.map((code, i) => [code, i]),
)

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLAN_CODES as readonly string[]).includes(value)
}

/**
 * 短標籤：badge、下拉、表格、CSV。
 * 型別刻意用 Record<string, string>，讓呼叫端寫 `PLAN_LABEL[x] ?? x`
 * 承接非法值（例如私版流過來的 'trial'），而不是編譯錯誤加 as 斷言。
 */
export const PLAN_LABEL: Record<string, string> = {
  free: '免費',
  basic: '基本',
  advanced: '進階',
  premium: '旗艦',
}

/** 完整名稱：定價頁、通知文案、金流收據品名（orderInfo）。 */
export const PLAN_FULL_NAME: Record<string, string> = {
  free: '免費方案',
  basic: '基本方案',
  advanced: '進階方案',
  premium: '旗艦方案',
}

/**
 * 可以拿來當「進入門檻」的方案。
 *
 * `free` 不在裡面 —— 每個帳號建立時就是 free（register/actions.ts），
 * 拿它當門檻等於沒有門檻，那個意思應該用「留空」表達。
 * 兩種寫法並存只會讓人以為有差別。
 *
 * 後台的下拉與 API 的驗證共用這一份，否則 UI 藏起來的值 API 仍然收 ——
 * 兩邊規則不同，遲早有人從 API 塞進一個畫面上選不到的值。
 */
export const GATEABLE_PLAN_CODES = PLAN_CODES.filter((c) => c !== 'free')

export function isGateablePlan(value: unknown): value is PlanCode {
  return typeof value === 'string' && (GATEABLE_PLAN_CODES as readonly string[]).includes(value)
}

/**
 * 使用者的方案是否達到門檻。
 *
 * @param userPlan     使用者當前方案（public.users.current_plan）
 * @param requiredPlan 門檻方案（apps.required_plan）；null / 空字串 = 不限方案
 *
 * 設計上 fail closed：認不得的門檻值、或認不得的使用者方案，一律回 false。
 * 寧可把人擋在外面讓人來問，也不要靜默放行 —— 這道門後面是付費內容。
 */
export function meetsRequiredPlan(
  userPlan: string | null | undefined,
  requiredPlan: string | null | undefined,
): boolean {
  if (!requiredPlan) return true

  const required = PLAN_LEVEL[requiredPlan]
  if (required === undefined) return false

  // 認不得的方案（包含私版的 trial / cancelled）視為低於 free
  const current = PLAN_LEVEL[userPlan ?? ''] ?? -1
  return current >= required
}
