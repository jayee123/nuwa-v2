import { getSecretParam } from '@/lib/secret-params'

const SMS_URL = 'http://sms.milkidea.com/api/api-sms-send.sms'

export async function sendSms(phone: string, message: string) {
  const smsToken = await getSecretParam('SMS_API_KEY') || 'e14485ece4f8062e97b58f3d790ac2f7855'

  const body = new URLSearchParams({
    token: smsToken,
    dstAddr: phone,
    smbody: message,
    validTime: '300',
  })

  let response: Response
  try {
    response = await fetch(SMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch (e) {
    // 連不上簡訊閘道（DNS / 網路 / 對方掛了）—— 跟「閘道回錯誤」分開記，
    // 2026-09-19 那波「簡訊發送失敗」就是因為這裡全被吞掉，事後查不到原因
    console.error('[sms] milkidea 連線失敗:', e instanceof Error ? e.message : e)
    throw new Error('簡訊發送失敗，請稍後再試。')
  }

  const rawText = await response.text()
  let json: { Error?: { code: number; description?: string }; result?: string } | null = null
  try {
    json = JSON.parse(rawText)
  } catch {
    // 回應不是 JSON（可能是防火牆/challenge 頁）—— 原文留 log（截斷，無敏感資料）
    console.error('[sms] milkidea 回應非 JSON:', response.status, rawText.slice(0, 300))
    throw new Error('簡訊發送失敗，請稍後再試。')
  }

  if (!json?.Error || json.Error.code !== 0) {
    console.error('[sms] milkidea 回錯誤:', JSON.stringify(json).slice(0, 300))
    throw new Error('簡訊發送失敗，請確認手機號碼是否正確。')
  }

  // Error.code=0 只代表閘道收單；statuscode=1 才是接受發送。
  // 非 1 不擋流程（碼已入庫、使用者可重發），但要留痕跡供追「有回單卻沒送達」。
  if (json.result && !/statuscode=1\b/.test(json.result)) {
    console.warn('[sms] milkidea 收單但 statuscode 非 1:', json.result.slice(0, 200))
  }

  return true
}
