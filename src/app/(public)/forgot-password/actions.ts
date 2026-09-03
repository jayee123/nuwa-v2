'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function resetPasswordWithOtp(formData: {
  phone: string
  newPassword: string
}) {
  const supabase = createAdminClient()

  // Format phone to E.164
  let phone = formData.phone.replace(/\s|-/g, '')
  if (phone.startsWith('0')) {
    phone = '+886' + phone.slice(1)
  } else if (!phone.startsWith('+')) {
    phone = '+886' + phone
  }

  // Verify that phone was OTP-verified
  const { data: verified } = await supabase
    .from('sms_verifications')
    .select('id')
    .eq('phone', formData.phone)
    .eq('verified', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!verified) {
    return { error: '手機號碼尚未驗證' }
  }

  // Check that user exists
  const { data: user } = await supabase
    .from('users')
    .select('id, deleted_at')
    .eq('phone', formData.phone)
    .single()

  if (!user) {
    return { error: '此手機號碼尚未註冊' }
  }

  // 020: 軟刪除帳號不得用重設密碼繞過登入守門
  if (user.deleted_at) {
    return { error: '此帳號已停用，如有疑問請聯繫客服' }
  }

  // Update password via admin API
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: formData.newPassword,
  })

  if (error) {
    return { error: '密碼重設失敗，請稍後再試' }
  }

  // Clean up used verification records
  await supabase
    .from('sms_verifications')
    .delete()
    .eq('phone', formData.phone)

  return { success: true }
}
