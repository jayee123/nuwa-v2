// 首頁與「App 服務」卡片上的試用文字（狀態、開始試用的說明）—— 兩頁共用，別各寫一套。
// 試用＝天數或對話次數先到者結束（M-12），兩個都要讓人看得到。
import { isTrialActive, trialDialogsLeft, type TrialState } from './launch-gate'

export type TrialBadgeTone = 'active' | 'warning' | 'ended'

export interface TrialBadge {
  text: string
  tone: TrialBadgeTone
}

const DAY_MS = 24 * 60 * 60 * 1000
const WARN_DAYS = 3
const WARN_DIALOGS = 3

export function trialBadge(trial: TrialState, now: Date): TrialBadge {
  const daysLeft = Math.ceil((trial.expiresAt.getTime() - now.getTime()) / DAY_MS)
  const dialogsLeft = trialDialogsLeft(trial)

  if (!isTrialActive(trial, now)) {
    const text = dialogsLeft === 0 && daysLeft > 0
      ? '免費試用對話次數已用完 — 訂閱後可繼續使用'
      : '免費試用已到期 — 訂閱後可繼續使用'
    return { text, tone: 'ended' }
  }

  const text = dialogsLeft === null
    ? `免費試用中・剩 ${daysLeft} 天`
    : `免費試用中・剩 ${daysLeft} 天、${dialogsLeft} 次對話`
  const isLow = daysLeft <= WARN_DAYS || (dialogsLeft !== null && dialogsLeft <= WARN_DIALOGS)
  return { text, tone: isLow ? 'warning' : 'active' }
}

/** 對應 tailwind 顏色（沿用原本卡片的三種色） */
export const TRIAL_BADGE_CLASS: Record<TrialBadgeTone, string> = {
  active: 'text-brand-purple',
  warning: 'text-amber-600',
  ended: 'text-fg-muted',
}

/** 開始試用前的說明：「14 天（30 次對話）」；沒設次數上限只寫天數 */
export function trialOffer(trialDays: number, dialogLimit: number | null): string {
  return dialogLimit == null ? `${trialDays} 天` : `${trialDays} 天（${dialogLimit} 次對話）`
}
