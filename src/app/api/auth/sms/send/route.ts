import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/sms/milkidea'
import { isValidPhone, normalizeLocalPhone } from '@/lib/phone'
import { getSecretParam } from '@/lib/secret-params'

export async function POST(request: Request) {
  const { phone: rawPhone, countryCode } = await request.json()

  if (!rawPhone || !isValidPhone(rawPhone)) {
    return NextResponse.json({ error: '請輸入有效的手機號碼' }, { status: 400 })
  }

  // 伺服器端統一正規化（Jeff 2026-09-21）：使用者有沒有打開頭的 0、
  // 有沒有夾空白，都收斂成同一個儲存格式 —— 表單漏補零時這裡兜底，
  // 後續 verify / 註冊 / 重設密碼查的都是同一個字串。
  const phone = normalizeLocalPhone(rawPhone, typeof countryCode === 'string' ? countryCode : '+886')

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
  // trim()：曾有帶換行的 "1\n" 讓比對悄悄失效；反向也一樣悄悄生效 ——
  // 2026-09-21 事故：.env.production 的 SMS_TEST_MODE=1 被 CLI 帶上正式站，
  // 整天驗證碼固定 1234、簡訊全不發，卻沒有任何痕跡。啟用時必須大聲留 log。
  const smsTestMode = (await getSecretParam('SMS_TEST_MODE')).trim()
  const isTestMode = smsTestMode === '1'
  if (isTestMode) {
    console.warn(`[sms/send] ⚠️ SMS_TEST_MODE 啟用中：驗證碼固定 1234、不發簡訊（${phone.slice(0, -5)}*****）。正式環境看到這行就是事故。`)
  }
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
    } catch (e) {
      // 細節已在 lib/sms/milkidea 記過；這裡補號碼線索（遮尾五碼）方便對 vercel logs
      console.error('[sms/send] 發送失敗:', phone.slice(0, -5) + '*****', e instanceof Error ? e.message : e)
      return NextResponse.json({ error: '簡訊發送失敗，請稍後再試' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
