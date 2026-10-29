/**
 * 管理員登入的二階段驗證碼（簡訊 A，docs/LAUNCH-CHECKLIST.md §2）。
 *
 * 原本固定 1234、不發簡訊，等於沒有第二層。改成：
 * - 隨機 4 碼（crypto.randomInt），真的發簡訊，10 分鐘有效
 *   （10/18 Steve 的簡訊被電信延遲超過 5 分鐘，碼送到前就過期，改 10 分鐘，Jeff 10/19 定）
 * - 收不到簡訊可以改寄到帳號的 Email（備援，Jeff 10/19 定）。收件地址一律從 users 表讀，
 *   不收前端傳來的地址；兩個管道共用同一組節流、同一張表，同時只有最新那組有效
 * - 同一支號碼 60 秒內只發一次（跟註冊的 /api/auth/sms/send 一樣），換管道也算
 * - 輸錯一次這組碼就作廢，要重新發送 —— 等於每 60 秒只能猜一次，
 *   10,000 種組合猜不完。只有兩個管理員帳號，打錯重發的成本可以接受。
 * - 不看 SMS_TEST_MODE：9/21 那個開關被意外帶上正式站過，管理員這層不能有後門。
 */
import { randomInt } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/sms/milkidea'
import { sendEmail } from '@/lib/email'
import { normalizeLocalPhone } from '@/lib/phone'

export const OTP_TTL_MS = 10 * 60 * 1000
const OTP_TTL_MINUTES = OTP_TTL_MS / 60_000
export const OTP_RESEND_MS = 60 * 1000
const OTP_DIGITS = 4

export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0')
}

/** 距離上一封還要等幾秒才能再發；0 = 可以發 */
export function resendWaitSeconds(lastCreatedAt: string | null, now: Date): number {
  if (!lastCreatedAt) return 0
  const elapsed = now.getTime() - new Date(lastCreatedAt).getTime()
  return elapsed >= OTP_RESEND_MS ? 0 : Math.ceil((OTP_RESEND_MS - elapsed) / 1000)
}

export type OtpCheck = 'ok' | 'missing' | 'expired' | 'wrong'

export function checkOtp(record: { code: string; expires_at: string } | null, input: string, now: Date): OtpCheck {
  if (!record) return 'missing'
  if (new Date(record.expires_at) <= now) return 'expired'
  return record.code === input ? 'ok' : 'wrong'
}

export const OTP_ERROR: Record<Exclude<OtpCheck, 'ok'>, string> = {
  missing: '驗證碼不存在，請重新發送',
  expired: '驗證碼已過期，請重新發送',
  wrong: '驗證碼錯誤，這組已失效，請按「重新發送驗證碼」取得新的',
}

export type OtpChannel = 'sms' | 'email'

/** 驗證碼送去哪：簡訊發到 key 對應的手機；Email 寄到這個地址（由 server 從 users 表讀） */
export type OtpDelivery = { via: 'sms' } | { via: 'email'; email: string }

/** 畫面上顯示收件信箱用，只露第一個字與網域：jeff@milkidea.com → j***@milkidea.com */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***${email.slice(at)}`
}

function deliver(code: string, key: string, delivery: OtpDelivery): Promise<unknown> {
  if (delivery.via === 'email') {
    return sendEmail({
      to: delivery.email,
      subject: '【羽升幸福養成學苑】管理後台登入驗證碼',
      html: `
        <p>您的管理後台登入驗證碼是：</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
        <p>${OTP_TTL_MINUTES} 分鐘內有效，輸入一次錯誤就會失效。</p>
        <p>如果這不是您本人的登入，請盡快修改密碼並通知其他管理員。</p>
      `,
    })
  }
  return sendSms(normalizeLocalPhone(key), `使用 ${code} 驗證碼，登入【羽升幸福養成學苑】管理後台，${OTP_TTL_MINUTES} 分鐘內有效。`)
}

/**
 * 產生驗證碼、存進 sms_verifications、發簡訊或寄 Email。
 * key 是之後 loginWithOtp 查表用的字串（手機模式是 +886…，Email 模式是 users.phone）；
 * 換成 Email 管道時 key 不變，所以驗證那一步不用改。
 * 簡訊一律發到正規化後的本地格式（milkidea 收 09 開頭）。
 */
export async function issueAdminOtp(
  admin: SupabaseClient,
  key: string,
  now: Date = new Date(),
  delivery: OtpDelivery = { via: 'sms' },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: last } = await admin
    .from('sms_verifications')
    .select('created_at')
    .eq('phone', key)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const wait = resendWaitSeconds(last?.created_at ?? null, now)
  if (wait > 0) return { ok: false, error: `請等待 ${wait} 秒後再試` }

  const code = generateOtpCode()
  const { data: row, error: insertError } = await admin
    .from('sms_verifications')
    .insert({ phone: key, code, expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString(), verified: false })
    .select('id')
    .single()
  if (insertError || !row) {
    console.error('[admin-otp] 寫入驗證碼失敗:', insertError?.message)
    return { ok: false, error: '驗證碼產生失敗，請稍後再試' }
  }

  try {
    await deliver(code, key, delivery)
  } catch (e) {
    // 細節 lib/sms/milkidea、lib/email 已記；沒發出去的碼直接作廢，不留一組沒人收到的有效碼
    await admin.from('sms_verifications').update({ expires_at: now.toISOString() }).eq('id', row.id)
    console.error(`[admin-otp] ${delivery.via} 發送失敗:`, key.slice(0, -5) + '*****', e instanceof Error ? e.message : e)
    return {
      ok: false,
      error: delivery.via === 'email' ? '驗證碼 Email 寄送失敗，請稍後再試或改用簡訊' : '驗證碼簡訊發送失敗，請稍後再試',
    }
  }
  return { ok: true }
}
