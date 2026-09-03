import { encrypt, decrypt } from './crypto'
import { chkValuePasscode, chkValuePayment } from './chkvalue'
import { getSecretParam } from '@/lib/secret-params'

/**
 * Execute token payment (two-step: Passcode → Payment)
 */
export async function executeTokenPayment(opts: {
  paymentToken: string
  verificationCode: string
  tokenExpiryDate: string
  userId: string
  price: number
  orderNo: string
  orderInfo?: string
}) {
  const merchantId = await getSecretParam('ESAFE_MERCHANT_ID')
  const passcodeUrl = await getSecretParam('ESAFE_PASSCODE_URL')
  const transUrl = await getSecretParam('ESAFE_TRANS_URL')

  // Step 1: Get Passcode
  const passcodePayload = {
    timestamp: Math.floor(Date.now() / 1000),
    userID: opts.userId,
    paymentToken: opts.paymentToken,
    verificationCode: opts.verificationCode,
    tokenExpiryDate: opts.tokenExpiryDate,
    price: opts.price,
  }

  const passcodeRawJson = JSON.stringify(passcodePayload)
  const passcodeEncrypted = await encrypt(passcodePayload)

  const passcodeRes = await fetch(passcodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantID: merchantId,
      tokenData: passcodeEncrypted,
      chkValue: await chkValuePasscode(passcodeRawJson),
    }),
  })

  const passcodeResult = await passcodeRes.json()
  if (!passcodeResult.passcodeData) {
    throw new Error('Passcode request failed: ' + JSON.stringify(passcodeResult))
  }

  const passcodeData = await decrypt(passcodeResult.passcodeData) as { passcode?: string }
  if (!passcodeData.passcode) {
    throw new Error('No passcode in response')
  }

  // Step 2: Execute Payment
  const paymentPayload = {
    passcode: passcodeData.passcode,
    userID: opts.userId,
    verificationCode: opts.verificationCode,
    tokenExpiryDate: opts.tokenExpiryDate,
    price: opts.price,
    orderNo: opts.orderNo,
    orderInfo: opts.orderInfo ?? '訂閱扣款',
    cardType: '2',
    customerName: 'AutoPay',
  }

  const paymentRawJson = JSON.stringify(paymentPayload)
  const paymentEncrypted = await encrypt(paymentPayload)

  const paymentRes = await fetch(transUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantID: merchantId,
      paymentToken: opts.paymentToken,
      paymentData: paymentEncrypted,
      chkValue: await chkValuePayment(opts.price, paymentRawJson),
    }),
  })

  const paymentResult = await paymentRes.json()
  return paymentResult
}
