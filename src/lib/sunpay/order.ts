/**
 * 訂單編號與送給紅陽的消費者欄位整理（純函式）。
 *
 * 訂單編號（td）：手冊規定英數、不可重複、≤ 50 碼。
 * 前綴區分首次付款與月扣 —— 通知只帶 td，靠前綴決定要「開新訂閱」還是「展延」。
 */
import { randomInt } from 'crypto'

export type OrderKind = 'first' | 'recurring'

const ORDER_PREFIX: Record<OrderKind, string> = { first: 'V3F', recurring: 'V3R' }
const SUFFIX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const SUFFIX_LENGTH = 6
const TW_OFFSET_MS = 8 * 3600 * 1000
const MAX_NAME_LENGTH = 30
const MAX_PHONE_LENGTH = 20
const MAX_ORDER_INFO_LENGTH = 50
const FALLBACK_NAME = '會員'

/** 例：V3F261012153045K7Q2MX（前綴 3 + 台灣時間 yyMMddHHmmss 12 + 亂數 6 = 21 碼） */
export function generateOrderNo(kind: OrderKind, now: Date = new Date()): string {
  const tw = new Date(now.getTime() + TW_OFFSET_MS)
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp =
    p(tw.getUTCFullYear() % 100) +
    p(tw.getUTCMonth() + 1) +
    p(tw.getUTCDate()) +
    p(tw.getUTCHours()) +
    p(tw.getUTCMinutes()) +
    p(tw.getUTCSeconds())
  const suffix = Array.from({ length: SUFFIX_LENGTH }, () => SUFFIX_CHARS[randomInt(SUFFIX_CHARS.length)]).join('')
  return `${ORDER_PREFIX[kind]}${stamp}${suffix}`
}

/** 從訂單編號判斷種類；不是新版編號回 null（例如舊 esafe 的 V2…） */
export function orderKindOf(td: string): OrderKind | null {
  if (td.startsWith(ORDER_PREFIX.first)) return 'first'
  if (td.startsWith(ORDER_PREFIX.recurring)) return 'recurring'
  return null
}

/** 姓名：手冊禁特殊字元（* ' < > [ ] " 等），只留文字、數字、空白，≤ 30 字 */
export function toSunpayName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, MAX_NAME_LENGTH)
  return cleaned || FALLBACK_NAME
}

/** 電話：純數字，≤ 20 碼；沒有就回空字串（呼叫端不送這個欄位） */
export function toSunpayPhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, MAX_PHONE_LENGTH)
}

/** 商品名稱：≤ 50 字 */
export function toSunpayOrderInfo(raw: string): string {
  return raw.trim().slice(0, MAX_ORDER_INFO_LENGTH)
}
