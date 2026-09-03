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

  const response = await fetch(SMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const json = await response.json()
  if (!json?.Error || json.Error.code !== 0) {
    throw new Error('簡訊發送失敗，請確認手機號碼是否正確。')
  }

  return true
}
