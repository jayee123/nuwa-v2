import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/sms/milkidea'
import { isValidPhone } from '@/lib/phone'
import { getSecretParam } from '@/lib/secret-params'

export async function POST(request: Request) {
  const { phone, countryCode } = await request.json()

  if (!phone || !isValidPhone(phone)) {
    return NextResponse.json({ error: '請輸入有效的手機號碼' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Rate limit: check last SMS sent within 60 seconds
  const { data: recent } = await supabase
    .from('sms_verifications')
    .select('created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (recent) {
    const elapsed = Date.now() - new Date(recent.created_at).getTime()
    if (elapsed < 60_000) {
      const remaining = Math.ceil((60_000 - elapsed) / 1000)
      return NextResponse.json(
        { error: `請等待 ${remaining} 秒後再試` },
        { status: 429 }
      )
    }
  }

  // Generate 4-digit code (test mode: fixed 1234)
  const smsTestMode = await getSecretParam('SMS_TEST_MODE')
  const isTestMode = smsTestMode === '1'
  const code = isTestMode ? '1234' : String(Math.floor(Math.random() * 10000)).padStart(4, '0')

  // Store in DB (use the raw phone as key for later verify lookup)
  await supabase.from('sms_verifications').insert({
    phone,
    code,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    verified: false,
  })

  // Send SMS (skip in test mode)
  if (!isTestMode) {
    try {
      const message = `使用 ${code} 驗證碼，透過【羽升幸福養成學苑】服務進行會員驗證。`
      await sendSms(phone, message)
    } catch {
      return NextResponse.json({ error: '簡訊發送失敗，請稍後再試' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
