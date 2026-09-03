'use server'

import { createClient } from '@/lib/supabase/server'

export async function changePassword(formData: {
  currentPassword: string
  newPassword: string
}) {
  const supabase = await createClient()

  // Verify current user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: '請先登入' }
  }

  // Verify current password by re-authenticating
  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: user.phone!,
    password: formData.currentPassword,
  })

  if (signInError) {
    return { error: '目前密碼錯誤' }
  }

  // Update password
  const { error: updateError } = await supabase.auth.updateUser({
    password: formData.newPassword,
  })

  if (updateError) {
    return { error: updateError.message }
  }

  return { success: true }
}
