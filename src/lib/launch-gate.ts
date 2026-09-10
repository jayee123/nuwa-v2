/**
 * Launch gate 決策 —— 「進不進得去這支 App」的唯一判斷點。
 *
 * 對應 docs/PAYMENT_SPEC.md v2 §3.2 與 PAYMENT_BOUNDARIES.md §A 決策表（A1–A9）。
 * 純函式：route 負責撈資料（app、方案、試用紀錄），這裡只做判斷，
 * 讓 A1–A9 的每一列都能直接用 unit test 釘住。
 *
 * fail closed：認不得的 status 一律 unavailable。
 * `to=admin` 的後台入口不走這裡（route 另有管理者驗證）。
 */

/** App 上架狀態。internal = 封測（邀請制）；active = 正式開放。 */
const KNOWN_STATUSES = ['draft', 'internal', 'active', 'archived'] as const

export type LaunchDecision =
  /** 直接進入（不建 trial） */
  | { kind: 'enter' }
  /** 就地建立 open 試用（trial_days 天）後進入 —— 呼叫端負責 insert 與撞 unique 的重讀 */
  | { kind: 'create_trial_and_enter' }
  /** internal 封測：引導輸入邀請碼 */
  | { kind: 'need_invite' }
  /** 試用已到期（或 trial_days=0 關閉試用）：導向訂閱頁 */
  | { kind: 'go_subscribe' }
  /** draft / archived / 認不得的狀態：擋下 */
  | { kind: 'unavailable' }

export interface LaunchGateInput {
  /** apps.status */
  status: string
  /** 方案是否達到 required_plan 門檻（route 用 meetsRequiredPlan 算好傳入） */
  planMeets: boolean
  /** apps.trial_days（0 = 此 App 關閉免費試用） */
  trialDays: number
  /** user_app_trials 該用戶對該 App 的紀錄；null = 沒有 */
  trial: { expiresAt: Date } | null
  /** 判斷時間（測試注入用；正式呼叫傳 new Date()） */
  now: Date
}

export function isTrialActive(trial: { expiresAt: Date } | null, now: Date): boolean {
  return trial !== null && now.getTime() < trial.expiresAt.getTime()
}

/**
 * 這次進場是不是「憑試用」放行的 —— 是的話 SSO token 要帶 access_until（發現 04）。
 *
 * internal 一律算：封測不看方案，放行的唯一依據就是試用/邀請碼；
 * 曾經因為把條件寫成 `!planMeets`，在 required_plan「不限」（planMeets 恆 true）的
 * App 上，internal 試用進場拿到的是不設限的 30 天 session —— 效期上限形同虛設
 * （2026-09-10 Jeff 實測抓到）。
 * active 下才看方案：達標是憑方案（不設限），沒達標才是憑試用。
 */
export function isTrialGrantedEntry(status: string, planMeets: boolean): boolean {
  if (status === 'internal') return true
  return !planMeets
}

export function decideLaunch(input: LaunchGateInput): LaunchDecision {
  const { status, planMeets, trialDays, trial, now } = input

  if (!(KNOWN_STATUSES as readonly string[]).includes(status)) {
    return { kind: 'unavailable' } // A8：fail closed
  }

  if (status === 'draft' || status === 'archived') {
    return { kind: 'unavailable' } // A8
  }

  if (status === 'internal') {
    // 封測不看方案 —— 已付費會員也不自動開放（定案文件 §03）
    if (isTrialActive(trial, now)) return { kind: 'enter' } // A5
    return { kind: 'need_invite' } // A6/A7：兌換走另一支 API，成功後重新 launch
  }

  // status === 'active'
  if (planMeets) return { kind: 'enter' } // A1
  if (isTrialActive(trial, now)) return { kind: 'enter' } // A3
  if (trial !== null) return { kind: 'go_subscribe' } // A4：有紀錄且已到期，不重開
  if (trialDays <= 0) return { kind: 'go_subscribe' } // B.1：此 App 關閉試用
  return { kind: 'create_trial_and_enter' } // A2
}
