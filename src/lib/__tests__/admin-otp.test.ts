/**
 * 管理員登入驗證碼（簡訊 A）：隨機碼、真的發簡訊、60 秒節流、輸錯即作廢；
 * 收不到簡訊可改寄 Email（10/19）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendSms = vi.fn<(phone: string, message: string) => Promise<boolean>>()
/** 設了就讓簡訊發送失敗（不經過 vi.fn，避免 spy 把 rejection 記成測試失敗） */
let smsFailure: Error | null = null
vi.mock('@/lib/sms/milkidea', () => ({
  sendSms: async (phone: string, message: string) => {
    if (smsFailure) throw smsFailure
    return sendSms(phone, message)
  },
}))

const sendEmail = vi.fn<(mail: { to: string; subject: string; html: string }) => Promise<void>>()
let emailFailure: Error | null = null
vi.mock('@/lib/email', () => ({
  sendEmail: async (mail: { to: string; subject: string; html: string }) => {
    if (emailFailure) throw emailFailure
    return sendEmail(mail)
  },
}))

import { checkOtp, generateOtpCode, issueAdminOtp, maskEmail, OTP_TTL_MS, resendWaitSeconds } from '../admin-otp'

const NOW = new Date('2026-10-17T10:00:00Z')

describe('generateOtpCode', () => {
  it('4 位數字，不足補 0', () => {
    for (let i = 0; i < 200; i++) expect(generateOtpCode()).toMatch(/^\d{4}$/)
  })

  it('不是固定碼', () => {
    const codes = new Set(Array.from({ length: 50 }, generateOtpCode))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('resendWaitSeconds', () => {
  it('沒發過 → 0', () => expect(resendWaitSeconds(null, NOW)).toBe(0))
  it('20 秒前發過 → 還要等 40 秒', () => {
    expect(resendWaitSeconds(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe(40)
  })
  it('剛好 60 秒 → 可以發', () => {
    expect(resendWaitSeconds(new Date(NOW.getTime() - 60_000).toISOString(), NOW)).toBe(0)
  })
})

describe('checkOtp', () => {
  const record = { code: '0427', expires_at: new Date(NOW.getTime() + 1000).toISOString() }
  it('對 → ok', () => expect(checkOtp(record, '0427', NOW)).toBe('ok'))
  it('錯 → wrong', () => expect(checkOtp(record, '1234', NOW)).toBe('wrong'))
  it('過期（含被作廢的）→ expired，即使碼是對的', () => {
    expect(checkOtp({ ...record, expires_at: NOW.toISOString() }, '0427', NOW)).toBe('expired')
  })
  it('沒有紀錄 → missing', () => expect(checkOtp(null, '0427', NOW)).toBe('missing'))
})

// ─── issueAdminOtp：假 Supabase，只實作用到的寫法 ───────────────

interface Row {
  id: string
  phone: string
  code: string
  expires_at: string
  created_at: string
}

function fakeAdmin(rows: Row[]) {
  const from = () => {
    const filters: Array<(r: Row) => boolean> = []
    let pending: Partial<Row> | null = null
    let mode: 'select' | 'insert' | 'update' = 'select'
    const q = {
      select: () => q,
      eq: (col: keyof Row, val: string) => {
        filters.push((r) => r[col] === val)
        if (mode === 'update') {
          rows.filter((r) => filters.every((f) => f(r))).forEach((r) => Object.assign(r, pending))
          return Promise.resolve({ error: null })
        }
        return q
      },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        const hit = rows.filter((r) => filters.every((f) => f(r))).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        return { data: hit ?? null, error: null }
      },
      insert: (values: Omit<Row, 'id' | 'created_at'>) => {
        mode = 'insert'
        const row = { ...values, id: `otp-${rows.length + 1}`, created_at: NOW.toISOString() }
        rows.push(row)
        return { select: () => ({ single: async () => ({ data: { id: row.id }, error: null }) }) }
      },
      update: (values: Partial<Row>) => {
        mode = 'update'
        pending = values
        return q
      },
    }
    return q
  }
  return { from } as unknown as SupabaseClient
}

describe('issueAdminOtp', () => {
  beforeEach(() => {
    smsFailure = null
    emailFailure = null
    sendSms.mockReset().mockResolvedValue(true)
    sendEmail.mockReset().mockResolvedValue(undefined)
  })

  it('存一組 10 分鐘有效的隨機碼，簡訊發到本地格式、內容含這組碼與有效時間', async () => {
    const rows: Row[] = []
    expect(await issueAdminOtp(fakeAdmin(rows), '+886936000111', NOW)).toEqual({ ok: true })
    expect(rows).toHaveLength(1)
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000)
    expect(rows[0].expires_at).toBe(new Date(NOW.getTime() + OTP_TTL_MS).toISOString())
    expect(sendSms).toHaveBeenCalledWith('0936000111', expect.stringContaining(rows[0].code))
    expect(sendSms.mock.calls[0][1]).toContain('10 分鐘內有效')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('改寄 Email：寄到指定信箱、內容含這組碼，不發簡訊；查表的 key 還是手機，驗證那一步不用改', async () => {
    const rows: Row[] = []
    const result = await issueAdminOtp(fakeAdmin(rows), '+886936000111', NOW, { via: 'email', email: 'admin@example.com' })
    expect(result).toEqual({ ok: true })
    expect(rows[0].phone).toBe('+886936000111')
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.com', html: expect.stringContaining(rows[0].code) }))
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('Email 寄不出去 → 回錯誤並建議改用簡訊，那組碼當場作廢', async () => {
    emailFailure = new Error('Email 服務尚未設定')
    const rows: Row[] = []
    const result = await issueAdminOtp(fakeAdmin(rows), '0936000111', NOW, { via: 'email', email: 'admin@example.com' })
    expect(result).toEqual({ ok: false, error: '驗證碼 Email 寄送失敗，請稍後再試或改用簡訊' })
    expect(checkOtp(rows[0], rows[0].code, NOW)).toBe('expired')
  })

  it('剛發過簡訊，60 秒內改寄 Email → 一樣擋下（換管道不能繞過節流）', async () => {
    const rows: Row[] = [
      { id: 'old', phone: '0936000111', code: '1111', expires_at: NOW.toISOString(), created_at: new Date(NOW.getTime() - 10_000).toISOString() },
    ]
    const result = await issueAdminOtp(fakeAdmin(rows), '0936000111', NOW, { via: 'email', email: 'admin@example.com' })
    expect(result).toEqual({ ok: false, error: '請等待 50 秒後再試' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('60 秒內再發 → 擋下，不寫表、不發簡訊', async () => {
    const rows: Row[] = [
      { id: 'old', phone: '0936000111', code: '1111', expires_at: NOW.toISOString(), created_at: new Date(NOW.getTime() - 10_000).toISOString() },
    ]
    expect(await issueAdminOtp(fakeAdmin(rows), '0936000111', NOW)).toEqual({ ok: false, error: '請等待 50 秒後再試' })
    expect(rows).toHaveLength(1)
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('簡訊發不出去 → 回錯誤，那組碼當場作廢', async () => {
    smsFailure = new Error('簡訊服務尚未設定')
    const rows: Row[] = []
    const result = await issueAdminOtp(fakeAdmin(rows), '0936000111', NOW)
    expect(result).toMatchObject({ ok: false })
    expect(checkOtp(rows[0], rows[0].code, NOW)).toBe('expired')
  })
})

describe('maskEmail', () => {
  it('只露第一個字與網域', () => {
    expect(maskEmail('jeff@milkidea.com')).toBe('j***@milkidea.com')
  })

  it('格式不對 → 全遮', () => {
    expect(maskEmail('no-at-sign')).toBe('***')
    expect(maskEmail('@example.com')).toBe('***')
  })
})
