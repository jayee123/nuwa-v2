/**
 * PAYMENT_BOUNDARIES §A 決策表 A1–A9 全枚舉 + §B.1 trial_days=0。
 * 每個 it 對應表上一列，改任何一列前先改規格書。
 */
import { describe, expect, it } from 'vitest'
import {
  TRIAL_DIALOG_LIMIT_MAX,
  decideLaunch,
  isTrialActive,
  isTrialGrantedEntry,
  parseDefaultDialogLimit,
  parseTrialDays,
  parseTrialDialogLimit,
  resolveTrialTerms,
  trialDialogsLeft,
  trialFromRow,
} from '../launch-gate'

const NOW = new Date('2026-09-07T12:00:00Z')
const FUTURE = { expiresAt: new Date('2026-09-14T12:00:00Z') }
const PAST = { expiresAt: new Date('2026-09-01T12:00:00Z') }

const base = { planMeets: false, trialDays: 14, trial: null, now: NOW }

describe('active（正式開放）', () => {
  it('A1: 方案達標 → enter（不建 trial，也不看 trial）', () => {
    expect(decideLaunch({ ...base, status: 'active', planMeets: true }).kind).toBe('enter')
    expect(decideLaunch({ ...base, status: 'active', planMeets: true, trial: PAST }).kind).toBe('enter')
  })

  it('A2: 未達標、無 trial 紀錄 → create_trial_and_enter', () => {
    expect(decideLaunch({ ...base, status: 'active' }).kind).toBe('create_trial_and_enter')
  })

  it('A3: 未達標、trial 未到期 → enter', () => {
    expect(decideLaunch({ ...base, status: 'active', trial: FUTURE }).kind).toBe('enter')
  })

  it('A4: 未達標、trial 已到期 → go_subscribe（不重開）', () => {
    expect(decideLaunch({ ...base, status: 'active', trial: PAST }).kind).toBe('go_subscribe')
  })

  it('B.1: trial_days=0（關閉試用）、無紀錄 → go_subscribe 而不是建即到期的 trial', () => {
    expect(decideLaunch({ ...base, status: 'active', trialDays: 0 }).kind).toBe('go_subscribe')
  })
})

describe('internal（封測）', () => {
  it('A5: trial 未到期 → enter（不看方案）', () => {
    expect(decideLaunch({ ...base, status: 'internal', trial: FUTURE }).kind).toBe('enter')
  })

  it('封測期間已付費會員也不自動開放（定案文件 §03）', () => {
    expect(decideLaunch({ ...base, status: 'internal', planMeets: true }).kind).toBe('need_invite')
  })

  it('A7: 無 trial → need_invite', () => {
    expect(decideLaunch({ ...base, status: 'internal' }).kind).toBe('need_invite')
  })

  it('A6 註3: trial 已到期 → need_invite（兌換端會因 UNIQUE 擋下重開）', () => {
    expect(decideLaunch({ ...base, status: 'internal', trial: PAST }).kind).toBe('need_invite')
  })
})

describe('其他狀態（fail closed）', () => {
  it('A8: draft / archived → unavailable', () => {
    expect(decideLaunch({ ...base, status: 'draft', planMeets: true }).kind).toBe('unavailable')
    expect(decideLaunch({ ...base, status: 'archived', planMeets: true }).kind).toBe('unavailable')
  })

  it('A8: 認不得的 status → unavailable，方案再高也一樣', () => {
    expect(decideLaunch({ ...base, status: 'open', planMeets: true }).kind).toBe('unavailable')
    expect(decideLaunch({ ...base, status: '', planMeets: true }).kind).toBe('unavailable')
  })
})

describe('isTrialGrantedEntry — access_until 要不要帶（發現 04）', () => {
  it('internal 一律憑試用，方案達標與否都要壓效期', () => {
    // 2026-09-10 實測抓到的洞：required_plan「不限」→ planMeets 恆 true，
    // 條件寫 !planMeets 會讓 internal 試用進場拿到 30 天不設限 session
    expect(isTrialGrantedEntry('internal', true)).toBe(true)
    expect(isTrialGrantedEntry('internal', false)).toBe(true)
  })

  it('active 看方案：達標憑方案（不壓），沒達標憑試用（壓）', () => {
    expect(isTrialGrantedEntry('active', true)).toBe(false)
    expect(isTrialGrantedEntry('active', false)).toBe(true)
  })
})

describe('isTrialActive 時間邊界（§B.1）', () => {
  it('now < expires_at → 未到期；now >= expires_at → 到期', () => {
    const edge = new Date('2026-09-14T12:00:00Z')
    expect(isTrialActive({ expiresAt: edge }, new Date(edge.getTime() - 1000))).toBe(true)
    expect(isTrialActive({ expiresAt: edge }, edge)).toBe(false)
    expect(isTrialActive({ expiresAt: edge }, new Date(edge.getTime() + 1000))).toBe(false)
    expect(isTrialActive(null, NOW)).toBe(false)
  })
})

describe('M-12 試用對話次數：天數或次數先到者結束（Jeff 2026-10-11）', () => {
  const withDialogs = (dialogsUsed: number, dialogLimit: number | null) => ({ ...FUTURE, dialogsUsed, dialogLimit })

  it('天數未到、次數未用完 → 試用中', () => {
    expect(isTrialActive(withDialogs(9, 10), NOW)).toBe(true)
  })

  it('天數未到、次數用完 → 試用結束', () => {
    expect(isTrialActive(withDialogs(10, 10), NOW)).toBe(false)
    expect(isTrialActive(withDialogs(11, 10), NOW)).toBe(false)
  })

  it('次數沒設上限（null，含上線前就開的試用）→ 只看天數', () => {
    expect(isTrialActive(withDialogs(999, null), NOW)).toBe(true)
    expect(isTrialActive({ ...PAST, dialogsUsed: 0, dialogLimit: null }, NOW)).toBe(false)
  })

  it('次數還有、天數已到 → 試用結束', () => {
    expect(isTrialActive({ ...PAST, dialogsUsed: 0, dialogLimit: 10 }, NOW)).toBe(false)
  })

  it('A4 延伸：未達標、次數用完 → go_subscribe（不重開）', () => {
    expect(decideLaunch({ ...base, status: 'active', trial: withDialogs(10, 10) }).kind).toBe('go_subscribe')
  })

  it('A6 延伸：封測、次數用完 → need_invite', () => {
    expect(decideLaunch({ ...base, status: 'internal', trial: withDialogs(10, 10) }).kind).toBe('need_invite')
  })

  it('A1 不受影響：方案達標時次數用完也照進', () => {
    expect(decideLaunch({ ...base, status: 'active', planMeets: true, trial: withDialogs(10, 10) }).kind).toBe('enter')
  })
})

describe('trialFromRow — DB 列轉成 gate 用的試用狀態', () => {
  it('帶次數欄位', () => {
    expect(trialFromRow({ expires_at: '2026-09-14T12:00:00Z', dialogs_used: 3, dialog_limit: 10 })).toEqual({
      expiresAt: new Date('2026-09-14T12:00:00Z'),
      dialogsUsed: 3,
      dialogLimit: 10,
    })
  })

  it('沒有紀錄 → null；次數欄位缺漏 → 已用 0、不設上限', () => {
    expect(trialFromRow(null)).toBeNull()
    expect(trialFromRow({ expires_at: '2026-09-14T12:00:00Z' })).toEqual({
      expiresAt: new Date('2026-09-14T12:00:00Z'),
      dialogsUsed: 0,
      dialogLimit: null,
    })
  })
})

describe('trialDialogsLeft — 卡片上的「剩 N 次」', () => {
  it('有上限：回剩餘次數，不會是負數', () => {
    expect(trialDialogsLeft({ ...FUTURE, dialogsUsed: 3, dialogLimit: 10 })).toBe(7)
    expect(trialDialogsLeft({ ...FUTURE, dialogsUsed: 12, dialogLimit: 10 })).toBe(0)
  })

  it('沒上限：null（不顯示次數）', () => {
    expect(trialDialogsLeft({ ...FUTURE, dialogsUsed: 3, dialogLimit: null })).toBeNull()
    expect(trialDialogsLeft(FUTURE)).toBeNull()
  })
})

describe('A 方案：公版預設 + App 個別覆寫（Jeff 2026-10-15）', () => {
  const defaults = { trialDays: 14, trialDialogLimit: 30 }

  it('App 兩欄都留空 → 用公版預設', () => {
    expect(resolveTrialTerms({ trial_days: null, trial_dialog_limit: null }, defaults)).toEqual({ days: 14, dialogLimit: 30 })
  })

  it('App 有填 → 用 App 的', () => {
    expect(resolveTrialTerms({ trial_days: 7, trial_dialog_limit: 10 }, defaults)).toEqual({ days: 7, dialogLimit: 10 })
  })

  it('App 天數 0 → 關閉試用（不是用預設）', () => {
    expect(resolveTrialTerms({ trial_days: 0, trial_dialog_limit: null }, defaults).days).toBe(0)
  })

  it('App 次數 0 → 這支 App 不限次數，即使公版有上限', () => {
    expect(resolveTrialTerms({ trial_days: null, trial_dialog_limit: 0 }, defaults).dialogLimit).toBeNull()
  })

  it('公版預設不限次數（null）、App 留空 → 不限', () => {
    expect(resolveTrialTerms({ trial_days: null, trial_dialog_limit: null }, { trialDays: 14, trialDialogLimit: null }).dialogLimit).toBeNull()
  })
})

describe('parseTrialDays — App「試用天數」欄位（留空 = 公版預設）', () => {
  it('空白 / null → 用公版預設（null）', () => {
    expect(parseTrialDays(null)).toEqual({ ok: true, value: null })
    expect(parseTrialDays('')).toEqual({ ok: true, value: null })
  })

  it('0 = 關閉試用、1–365 照存', () => {
    expect(parseTrialDays(0)).toEqual({ ok: true, value: 0 })
    expect(parseTrialDays(365)).toEqual({ ok: true, value: 365 })
  })

  it('負數、小數、超過 365、非數字 → 錯誤', () => {
    for (const bad of [-1, 2.5, 366, '14', true]) expect(parseTrialDays(bad).ok).toBe(false)
  })
})

describe('parseTrialDialogLimit — App「試用對話次數」欄位（留空 = 公版預設，0 = 不限）', () => {
  it('空白 / null → 用公版預設（null）', () => {
    expect(parseTrialDialogLimit(null)).toEqual({ ok: true, value: null })
    expect(parseTrialDialogLimit('')).toEqual({ ok: true, value: null })
  })

  it('0 = 不限、正整數照存', () => {
    expect(parseTrialDialogLimit(0)).toEqual({ ok: true, value: 0 })
    expect(parseTrialDialogLimit(20)).toEqual({ ok: true, value: 20 })
  })

  it('負數、小數、超過上限、非數字 → 錯誤', () => {
    for (const bad of [-1, 2.5, TRIAL_DIALOG_LIMIT_MAX + 1, '20', true]) {
      expect(parseTrialDialogLimit(bad).ok).toBe(false)
    }
  })
})

describe('parseDefaultDialogLimit — 公版「預設試用對話次數」（留空 = 不限）', () => {
  it('空白 / null → 不限（null）；正整數照存', () => {
    expect(parseDefaultDialogLimit('')).toEqual({ ok: true, value: null })
    expect(parseDefaultDialogLimit(30)).toEqual({ ok: true, value: 30 })
  })

  it('0、負數、非數字 → 錯誤（公版不需要「0 = 不限」，留空就是不限）', () => {
    for (const bad of [0, -1, '30']) expect(parseDefaultDialogLimit(bad).ok).toBe(false)
  })
})
