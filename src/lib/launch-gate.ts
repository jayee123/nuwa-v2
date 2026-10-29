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
  trial: TrialState | null
  /** 判斷時間（測試注入用；正式呼叫傳 new Date()） */
  now: Date
}

/**
 * 一筆試用的狀態。結束條件是「天數或對話次數，先到者」（Jeff 2026-10-11，M-12）。
 * dialogLimit 是開試用當下的快照：App 覆寫或公版預設（migration 034 的 trigger、035 改用 effective_trial_terms），
 * 後台之後改上限不追溯 —— 跟天數一樣。null / 未提供 = 不限次數，只看天數。
 */
export interface TrialState {
  expiresAt: Date
  dialogsUsed?: number
  dialogLimit?: number | null
}

/** user_app_trials 的一列（launch route 與各頁面撈的欄位） */
export interface TrialRow {
  expires_at: string
  dialogs_used?: number | null
  dialog_limit?: number | null
}

export function trialFromRow(row: TrialRow | null | undefined): TrialState | null {
  if (!row) return null
  return {
    expiresAt: new Date(row.expires_at),
    dialogsUsed: row.dialogs_used ?? 0,
    dialogLimit: row.dialog_limit ?? null,
  }
}

/** 剩幾次試用對話；沒設上限回 null（畫面不顯示次數） */
export function trialDialogsLeft(trial: TrialState): number | null {
  if (trial.dialogLimit == null) return null
  return Math.max(0, trial.dialogLimit - (trial.dialogsUsed ?? 0))
}

export const TRIAL_DAYS_MAX = 365
export const TRIAL_DIALOG_LIMIT_MAX = 10000

/**
 * 試用條件 = 公版預設 + App 個別覆寫（A 方案，Jeff 2026-10-15）。
 *
 * 公版預設（trial_defaults 表，後台「系統設定」）：天數必填、次數 null = 不限。
 * App（apps 表，後台「App 管理」）：null = 用公版預設；天數 0 = 關閉試用；次數 0 = 這支 App 不限次數。
 *
 * ⚠️ 必須與 migration 035 的 SQL 函式 effective_trial_terms() 一致
 *    （開試用時 DB trigger 用它抄次數快照、邀請碼兌換用它算天數）。
 */
export interface TrialDefaults {
  trialDays: number
  trialDialogLimit: number | null
}

export interface AppTrialSettings {
  trial_days: number | null
  trial_dialog_limit: number | null
}

export interface TrialTerms {
  /** 0 = 此 App 關閉試用 */
  days: number
  /** null = 不限次數 */
  dialogLimit: number | null
}

export function resolveTrialTerms(app: AppTrialSettings, defaults: TrialDefaults): TrialTerms {
  const days = app.trial_days ?? defaults.trialDays
  const rawLimit = app.trial_dialog_limit ?? defaults.trialDialogLimit
  return { days, dialogLimit: rawLimit === 0 ? null : rawLimit }
}

type Parsed = { ok: true; value: number | null } | { ok: false; error: string }

function parseOptionalInt(value: unknown, min: number, max: number, error: string): Parsed {
  if (value === null || value === '') return { ok: true, value: null }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return { ok: false, error }
  return { ok: true, value }
}

/** App「試用天數」：null / 空白 = 公版預設；0 = 關閉試用；否則 1–TRIAL_DAYS_MAX */
export function parseTrialDays(value: unknown): Parsed {
  return parseOptionalInt(value, 0, TRIAL_DAYS_MAX, `試用天數必須是 0–${TRIAL_DAYS_MAX} 的整數（留空 = 公版預設；0 = 關閉試用）`)
}

/** App「試用對話次數」：null / 空白 = 公版預設；0 = 這支 App 不限次數；否則 1–TRIAL_DIALOG_LIMIT_MAX */
export function parseTrialDialogLimit(value: unknown): Parsed {
  return parseOptionalInt(
    value, 0, TRIAL_DIALOG_LIMIT_MAX,
    `試用對話次數必須是 0–${TRIAL_DIALOG_LIMIT_MAX} 的整數（留空 = 公版預設；0 = 不限次數）`,
  )
}

/** 公版「預設試用對話次數」：null / 空白 = 不限；否則 1–TRIAL_DIALOG_LIMIT_MAX */
export function parseDefaultDialogLimit(value: unknown): Parsed {
  return parseOptionalInt(
    value, 1, TRIAL_DIALOG_LIMIT_MAX,
    `預設試用對話次數必須是 1–${TRIAL_DIALOG_LIMIT_MAX} 的整數（留空 = 不限次數）`,
  )
}

export function isTrialActive(trial: TrialState | null, now: Date): boolean {
  if (trial === null || now.getTime() >= trial.expiresAt.getTime()) return false
  const left = trialDialogsLeft(trial)
  return left === null || left > 0
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
