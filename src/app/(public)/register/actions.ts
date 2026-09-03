'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { formatPhoneE164 } from '@/lib/phone'

interface RegisterData {
  phone: string
  password: string
  countryCode: string
  nickname: string
  gender?: number
  birthday?: string
  email?: string
  affiliateId?: string
  inviteCode?: string
}

export async function register(data: RegisterData) {
  const supabase = createAdminClient()

  const phone = formatPhoneE164(data.phone, data.countryCode)

  // Email 必填（電子發票 + 支援 Email 登入）
  const email = data.email?.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { error: '請輸入有效的 Email（電子發票需要）' }
  }

  // Email 不可重複（登入身分之一）
  const { data: emailTaken } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (emailTaken) {
    return { error: '此 Email 已註冊，請直接登入' }
  }

  // Verify that phone was OTP-verified
  const { data: verified } = await supabase
    .from('sms_verifications')
    .select('id')
    .eq('phone', data.phone)
    .eq('verified', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!verified) {
    return { error: '手機號碼尚未驗證' }
  }

  // Check if phone already registered
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', data.phone)
    .single()

  if (existing) {
    return { error: '此手機號碼已註冊，請直接登入' }
  }

  // 邀請碼驗證（試用門檻，#3a 上移公版）— 建帳號前先驗
  const inviteCode = data.inviteCode?.trim().toUpperCase()
  if (!inviteCode) {
    return { error: '請輸入邀請碼' }
  }
  const { data: invite } = await supabase
    .from('invite_codes')
    .select('code, used_by, expires_at')
    .eq('code', inviteCode)
    .maybeSingle()
  if (!invite) {
    return { error: '邀請碼不存在' }
  }
  if (invite.used_by) {
    return { error: '邀請碼已被使用' }
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { error: '邀請碼已過期' }
  }

  // Create Supabase Auth user（帶手機 + email，兩種登入方式皆可用）
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    phone,
    email,
    password: data.password,
    phone_confirm: true,
    email_confirm: true,
  })

  if (authError) {
    return { error: authError.message }
  }

  if (!authData.user) {
    return { error: 'Auth 帳號建立失敗' }
  }

  // Insert into users table
  const { error: insertError } = await supabase.from('users').insert({
    id: authData.user.id,
    phone: data.phone,
    nickname: data.nickname,
    gender: data.gender ?? null,
    birthday: data.birthday || null,
    email,
    affiliate_id: data.affiliateId || null,
    current_plan: 'free',
    dialog_limit: 0,
  })

  if (insertError) {
    console.error('Users insert error:', insertError)
    return { error: `建立帳號失敗：${insertError.message}` }
  }

  // 標記邀請碼已用
  await supabase
    .from('invite_codes')
    .update({ used_by: authData.user.id, used_at: new Date().toISOString() })
    .eq('code', inviteCode)

  // Clean up used verification records
  await supabase
    .from('sms_verifications')
    .delete()
    .eq('phone', data.phone)

  redirect('/dashboard')
}
