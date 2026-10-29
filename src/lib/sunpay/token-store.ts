/**
 * 月扣要用的卡片代碼（save_card_token + token_key + token_life）落地加密。
 *
 * 存在 payments.token_data（首次付款那一筆）。不是卡號 —— 卡號只在紅陽，
 * 但拿到 token_key 再配上我們的特店金鑰就能扣款，所以落地一律加密。
 * AES-256-GCM（帶驗證），金鑰是後台「系統設定」的 SUNPAY_TOKEN_KEY（64 碼 hex）。
 *
 * 前綴 `v3:` 用來跟舊 esafe 的 token_data 區分；月扣只認得 v3。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export interface StoredToken {
  /** 首次付款時我們定義的卡片識別碼（= 付款 id；2026-10-16 以前綁的是會員 id，照樣能扣） */
  saveCardToken: string
  tokenKey: string
  /** YYYYMMDD；過了就不能再扣 */
  tokenLife: string
  boundAt: string
}

const TOKEN_PREFIX = 'v3:'
const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/

function toKey(keyHex: string): Buffer {
  if (!KEY_HEX_PATTERN.test(keyHex)) {
    throw new Error('SUNPAY_TOKEN_KEY 必須是 64 碼 hex（openssl rand -hex 32）')
  }
  return Buffer.from(keyHex, 'hex')
}

export function isValidTokenKey(keyHex: string): boolean {
  return KEY_HEX_PATTERN.test(keyHex)
}

export function isV3Token(tokenData: string | null | undefined): boolean {
  return !!tokenData && tokenData.startsWith(TOKEN_PREFIX)
}

export function packToken(bundle: StoredToken, keyHex: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, toKey(keyHex), iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify(bundle), 'utf8'), cipher.final()])
  return TOKEN_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}

export function unpackToken(packed: string, keyHex: string): StoredToken {
  if (!isV3Token(packed)) throw new Error('不是新版（v3）卡片代碼')
  const raw = Buffer.from(packed.slice(TOKEN_PREFIX.length), 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const enc = raw.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGO, toKey(keyHex), iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return JSON.parse(dec.toString('utf8')) as StoredToken
}

/**
 * token_life（YYYYMMDD）是否已過期。
 * 沒帶或格式不對就不擋 —— 交給紅陽判斷（過期會回失敗，照常入帳）。
 */
export function isTokenExpired(tokenLife: string, today: string): boolean {
  if (!/^\d{8}$/.test(tokenLife)) return false
  return tokenLife < today
}
