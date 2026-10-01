import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeLocalPhone } from '@/lib/phone'

export async function POST(request: Request) {
  const { phone, code } = await request.json()

  if (!phone || !code) {
    return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // 有沒有補零都要對得上（Jeff 2026-09-21）：查正規化後的格式為主，
  // 原始輸入為輔 —— 兜住「發碼時還是舊版程式存了未補零字串」的過渡期記錄。
  const candidates = [...new Set([normalizeLocalPhone(phone), String(phone)])]

  // Find the latest unverified code for this phone
  const { data: record } = await supabase
    .from('sms_verifications')
    .select('*')
    .in('phone', candidates)
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
