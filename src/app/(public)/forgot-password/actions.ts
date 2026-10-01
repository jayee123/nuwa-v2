'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeLocalPhone } from '@/lib/phone'

export async function resetPasswordWithOtp(formData: {
  phone: string
  newPassword: string
}) {
  const supabase = createAdminClient()

  // 伺服器端統一正規化（Jeff 2026-09-21）：有沒有補零都收斂成儲存格式，
  // 跟 sms_verifications / users.phone 對得上。原本這裡算了一個 E.164
  // 卻沒用到（查表都用原始輸入），一併清掉。
  const phone = normalizeLocalPhone(formData.phone)

  // Verify that phone was OTP-verified
  const { data: verified } = await supabase
    .from('sms_verifications')
    .select('id')
    .eq('phone', phone)
    .eq('verified', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!verified) {
    return { error: '手機號碼尚未驗證' }
  }

  // Check that user exists
  // users.phone 有 V1 遷移殘留的舊格式（886…、+886…），比照 login/actions.ts
  // 多格式並查 —— 2026-09-21 Jeff 實測：簡訊通了卻在這關「尚未註冊」。
  const phoneCandidates = [...new Set([
    phone, // 0936923912（標準）
    phone.startsWith('0') ? '886' + phone.slice(1) : phone, // 886936923912（V1 殘留）
    phone.startsWith('0') ? '+886' + phone.slice(1) : phone, // +886936923912
  ])]
  const { data: user } = await supabase
    .from('users')
    .select('id, deleted_at')
    .in('phone', phoneCandidates)
    .limit(1)
    .maybeSingle()

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
    .eq('phone', phone)

  return { success: true }
}
