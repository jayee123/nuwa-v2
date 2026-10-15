/**
 * SunPay v3 設定：一律從後台「系統設定」（secret_params）讀，env 為後備。
 *
 * 紅陽只收白名單 IP 送來的交易（手冊 §2.5，錯誤碼 97），Vercel 對外 IP 不固定，
 * 所以正式環境要經 berth 轉送站（固定 IP）送出：設了 SUNPAY_RELAY_URL 就走轉送站。
 */
import { getSecretParam } from '@/lib/secret-params'
import { toPem, type SunpaySigningKeys } from './crypto'
import { isValidTokenKey } from './token-store'

export const SUNPAY_TRADE_URLS = {
  production: 'https://trade.sunpay.com.tw/v3/token',
  test: 'https://testtrade.sunpay.com.tw/v3/token',
} as const

export type SunpayEnv = keyof typeof SUNPAY_TRADE_URLS

export interface SunpayConfig extends SunpaySigningKeys {
  env: SunpayEnv
  tradeUrl: string
  /** berth 轉送站網址；空字串＝直連紅陽（只適合本機測試） */
  relayUrl: string
  relaySecret: string
  /** 卡片代碼落地加密金鑰（64 碼 hex） */
  tokenKey: string
}

export type SunpayConfigResult =
  | { ok: true; config: SunpayConfig }
  | { ok: false; problems: string[] }

export const SUNPAY_SECRET_KEYS = [
  'SUNPAY_WEB',
  'SUNPAY_SHA2_SECRET',
  'SUNPAY_RSA_PUBLIC_KEY',
  'SUNPAY_TRADE_URL',
  'SUNPAY_RELAY_URL',
  'SUNPAY_RELAY_SECRET',
  'SUNPAY_TOKEN_KEY',
] as const

function envOf(tradeUrl: string): SunpayEnv | null {
  if (tradeUrl === SUNPAY_TRADE_URLS.production) return 'production'
  if (tradeUrl === SUNPAY_TRADE_URLS.test) return 'test'
  return null
}

/** 純函式：檢查設定值，回傳可用設定或問題清單（問題訊息不含任何金鑰內容） */
export function validateSunpayConfig(values: Record<(typeof SUNPAY_SECRET_KEYS)[number], string>): SunpayConfigResult {
  const problems: string[] = []
  const required = ['SUNPAY_WEB', 'SUNPAY_SHA2_SECRET', 'SUNPAY_RSA_PUBLIC_KEY', 'SUNPAY_TRADE_URL'] as const
  for (const key of required) {
    if (!values[key]) problems.push(`${key} 未設定`)
  }

  const tradeUrl = values.SUNPAY_TRADE_URL.trim()
  const env = envOf(tradeUrl)
  if (tradeUrl && !env) problems.push('SUNPAY_TRADE_URL 必須是紅陽正式或測試的 /v3/token 網址')

  if (!isValidTokenKey(values.SUNPAY_TOKEN_KEY)) problems.push('SUNPAY_TOKEN_KEY 未設定或不是 64 碼 hex')

  const relayUrl = values.SUNPAY_RELAY_URL.trim().replace(/\/+$/, '')
  if (relayUrl && !relayUrl.startsWith('https://')) problems.push('SUNPAY_RELAY_URL 必須是 https')
  if (relayUrl && !values.SUNPAY_RELAY_SECRET) problems.push('有設 SUNPAY_RELAY_URL 就要設 SUNPAY_RELAY_SECRET')

  if (problems.length > 0 || !env) return { ok: false, problems }

  return {
    ok: true,
    config: {
      web: values.SUNPAY_WEB.trim(),
      sha2Secret: values.SUNPAY_SHA2_SECRET.trim(),
      rsaPublicKeyPem: toPem(values.SUNPAY_RSA_PUBLIC_KEY),
      env,
      tradeUrl,
      relayUrl,
      relaySecret: values.SUNPAY_RELAY_SECRET.trim(),
      tokenKey: values.SUNPAY_TOKEN_KEY.trim(),
    },
  }
}

export async function getSunpayConfig(): Promise<SunpayConfigResult> {
  const entries = await Promise.all(
    SUNPAY_SECRET_KEYS.map(async (key) => [key, await getSecretParam(key)] as const),
  )
  return validateSunpayConfig(Object.fromEntries(entries) as Record<(typeof SUNPAY_SECRET_KEYS)[number], string>)
}
