'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { formatPhoneE164 } from '@/lib/phone'
import { safeNext } from '@/lib/safe-next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkOtp, issueAdminOtp, maskEmail, OTP_ERROR, type OtpChannel } from '@/lib/admin-otp'

// 020: 軟刪除（deleted_at）的帳號一律擋在登入之前。
// 這是 app 層守門；auth.users 端的停用另由 scripts/ban-soft-deleted-users.ts 處理。
const DISABLED_ACCOUNT_ERROR = '此帳號已停用，如有疑問請聯繫客服'

/** 手機／Email 登入的回傳：成功會 redirect，只有要驗證碼或出錯時才有值 */
export type LoginResult =
  | { requireOtp: true; phone: string; via: OtpChannel; sentTo: string | null; error?: undefined }
  | { requireOtp?: undefined; error: string }

/**
 * 密碼驗過之後，發管理員驗證碼。via=email 時寄到這個帳號在 users 表的 Email（不收前端傳來的地址）。
 * 回傳的 sentTo 給畫面顯示「已寄送至 j***@…」。
 */
async function startAdminOtp(admin: SupabaseClient, key: string, accountEmail: string | null, via: OtpChannel): Promise<LoginResult> {
  if (via === 'email') {
    if (!accountEmail) return { error: '這個管理員帳號沒有設定 Email，請改用簡訊' }
    const otp = await issueAdminOtp(admin, key, new Date(), { via: 'email', email: accountEmail })
    if (!otp.ok) return { error: otp.error }
    return { requireOtp: true, phone: key, via, sentTo: maskEmail(accountEmail) }
  }
  const otp = await issueAdminOtp(admin, key)
  if (!otp.ok) return { error: otp.error }
  return { requireOtp: true, phone: key, via, sentTo: null }
}


export async function login(formData: {
  phone: string
  password: string
  countryCode: string
  next?: string
  /** 管理員驗證碼送到哪（預設簡訊；收不到時畫面上可改 Email） */
  otpVia?: OtpChannel
}): Promise<LoginResult> {
  const phone = formatPhoneE164(formData.phone, formData.countryCode)
  const admin = createAdminClient()

  // Check if this phone belongs to a superadmin — requires OTP
  // Phone may be stored as +886936887465, 886936887465, or 0936887465
  const phoneWithout = phone.replace(/^\+/, '')
  // 台灣本地格式：+886936... → 0936...
  const phoneLocal = formData.countryCode === '+886'
    ? '0' + phone.replace(/^\+886/, '')
    : null
  const { data: userData } = await admin
    .from('users')
    .select('role, deleted_at, email')
    .or([`phone.eq.${phone}`, `phone.eq.${phoneWithout}`, phoneLocal && `phone.eq.${phoneLocal}`].filter(Boolean).join(','))
    .limit(1)
    .single()

  if (userData?.deleted_at) {
    return { error: DISABLED_ACCOUNT_ERROR }
  }

  if (userData?.role === 'superadmin') {
    // Verify password is correct before sending OTP
    // Use a temporary Supabase client to test credentials without creating a session
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      phone,
      password: formData.password,
    })

    if (error) {
      return { error: error.message }
    }

    // Password is correct — sign out immediately (don't keep session until OTP verified)
    await supabase.auth.signOut()

    // 隨機碼 + 發簡訊或寄 Email（lib/admin-otp）
    return startAdminOtp(admin, phone, userData.email ?? null, formData.otpVia ?? 'sms')
  }

  // Regular user — direct login
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    phone,
    password: formData.password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect(safeNext(formData.next))
}

// Email 登入模式（手機/Email 切換的另一半）。
// 一般用戶：直接以 email 登入。superadmin：驗密碼後走 OTP（預設簡訊，可改 Email，與手機模式一致）。
export async function loginWithEmail(formData: {
  email: string
  password: string
  next?: string
  otpVia?: OtpChannel
}): Promise<LoginResult> {
  const email = formData.email.trim().toLowerCase()
  const admin = createAdminClient()

  const { data: userData } = await admin
    .from('users')
    .select('role, phone, email, deleted_at')
    .ilike('email', email)
    .limit(1)
    .single()

  if (userData?.deleted_at) {
    return { error: DISABLED_ACCOUNT_ERROR }
  }

  const supabase = await createClient()

  if (userData?.role === 'superadmin') {
    // 先驗密碼再發 OTP（驗完立即登出，OTP 過關才真正建立 session）
    const { error } = await supabase.auth.signInWithPassword({ email, password: formData.password })
    if (error) return { error: error.message }
    await supabase.auth.signOut()

    if (!userData.phone) {
      return { error: '管理員帳號缺少手機號碼，無法進行二次驗證，請改用手機登入' }
    }

    return startAdminOtp(admin, userData.phone, userData.email ?? null, formData.otpVia ?? 'sms')
  }

  // 一般用戶 — 直接登入
  const { error } = await supabase.auth.signInWithPassword({ email, password: formData.password })
  if (error) return { error: error.message }

  redirect(safeNext(formData.next))
}

export async function loginWithOtp(formData: {
  phone: string
  password: string
  otp: string
  email?: string // 若 OTP 由 Email 模式觸發，最後用 email 完成登入（users.phone 是本地格式，用它登會失敗）
  next?: string
}) {
  const admin = createAdminClient()

  // Verify OTP
  const { data: record } = await admin
    .from('sms_verifications')
    .select('*')
    .eq('phone', formData.phone)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!record) return { error: OTP_ERROR.missing }
  const now = new Date()
  const check = checkOtp(record, formData.otp, now)
  if (check === 'wrong') {
    // 輸錯一次就作廢（lib/admin-otp 開頭的說明）：不然 4 碼在 5 分鐘內可以一直猜
    await admin.from('sms_verifications').update({ expires_at: now.toISOString() }).eq('id', record.id)
  }
  if (check !== 'ok') return { error: OTP_ERROR[check] }

  // Mark OTP as used
  await admin
    .from('sms_verifications')
    .update({ verified: true })
    .eq('id', record.id)

  // Now complete the actual login
  // Email 模式：用 email 登入（users.phone 為本地格式，signIn by phone 會失敗）；手機模式：用 phone
  const supabase = await createClient()
  const { error } = formData.email
    ? await supabase.auth.signInWithPassword({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      })
    : await supabase.auth.signInWithPassword({
        phone: formData.phone,
        password: formData.password,
      })

  if (error) {
    return { error: error.message }
  }

  redirect(safeNext(formData.next))
}
