/**
 * PAYMENT_BOUNDARIES §A 決策表 A1–A9 全枚舉 + §B.1 trial_days=0。
 * 每個 it 對應表上一列，改任何一列前先改規格書。
 */
import { describe, expect, it } from 'vitest'
import { decideLaunch, isTrialActive, isTrialGrantedEntry } from '../launch-gate'

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
