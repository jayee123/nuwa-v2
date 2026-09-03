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
 * 註：方案的**顯示名稱**目前仍散在 7 個檔案裡（同一個 premium 分別寫成
 * Premium / 旗艦 / 旗艦版），那是另一個主題，待獨立處理。這裡只管代碼與等級。
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
