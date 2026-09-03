import crypto from 'crypto'
import { getSecretParam } from '@/lib/secret-params'

async function getCredentials() {
  const merchantId = await getSecretParam('ESAFE_MERCHANT_ID')
  const password = await getSecretParam('ESAFE_PASSWORD')
  return { merchantId, password }
}

/**
 * Binding / Etopm.aspx ChkValue — SHA1 UPPERCASE
 * Formula: SHA1(web + password + MN + Term)
 */
export async function chkValueBinding(amount: number, term: string = ''): Promise<string> {
  const { merchantId, password } = await getCredentials()
  const str = merchantId + password + amount + term
  return crypto.createHash('sha1').update(str).digest('hex').toUpperCase()
}

/**
 * Callback validation — SHA1 UPPERCASE
 * Formula: SHA1(web + password + MN + Td)
 */
export async function chkValueCallback(amount: number, td: string): Promise<string> {
  const { merchantId, password } = await getCredentials()
  const str = merchantId + password + amount + td
  return crypto.createHash('sha1').update(str).digest('hex').toUpperCase()
}

/**
 * Callback validation with raw MN string (preserves eSafe's exact format)
 */
export async function chkValueCallbackRaw(mnRaw: string, td: string): Promise<string> {
  const { merchantId, password } = await getCredentials()
  const str = merchantId + password + mnRaw + td
  return crypto.createHash('sha1').update(str).digest('hex').toUpperCase()
}

/**
 * Passcode API — SHA256 lowercase
 * Formula: SHA256(merchantID + password + rawJSON)
 */
export async function chkValuePasscode(rawJson: string): Promise<string> {
  const { merchantId, password } = await getCredentials()
  const str = merchantId + password + rawJson
  return crypto.createHash('sha256').update(str).digest('hex')
}

/**
 * Payment API — SHA256 lowercase
 * Formula: SHA256(merchantID + password + price + term + rawJSON)
 */
export async function chkValuePayment(price: number, rawJson: string, term: string = ''): Promise<string> {
  const { merchantId, password } = await getCredentials()
  const str = merchantId + password + price + term + rawJson
  return crypto.createHash('sha256').update(str).digest('hex')
}
