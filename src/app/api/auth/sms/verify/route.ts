import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const { phone, code } = await request.json()

  if (!phone || !code) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find the latest unverified code for this phone
  const { data: record } = await supabase
    .from('sms_verifications')
    .select('*')
    .eq('phone', phone)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!record) {
    return NextResponse.json({ error: '請先發送驗證碼' }, { status: 400 })
  }

  // Check expiration
  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: '驗證碼已過期，請重新發送' }, { status: 400 })
  }

  // Check code
  if (record.code !== code) {
    return NextResponse.json({ error: '驗證碼錯誤' }, { status: 400 })
  }

  // Mark as verified
  await supabase
    .from('sms_verifications')
    .update({ verified: true })
    .eq('id', record.id)

  return NextResponse.json({ success: true })
}
