/**
 * 訂單編號與送給紅陽的消費者欄位整理（純函式）。
 *
 * 訂單編號（td）：手冊規定英數、不可重複、≤ 50 碼。
 * 前綴區分首次付款、升級與月扣 —— 通知只帶 td，靠前綴決定要「開新訂閱」「改方案」還是「展延」。
 */
import { randomInt } from 'crypto'

/** first 首次付款／重訂、upgrade 升級補差價（PAY-20）、recurring 月扣 */
export type OrderKind = 'first' | 'upgrade' | 'recurring'

const ORDER_PREFIX: Record<OrderKind, string> = { first: 'V3F', upgrade: 'V3U', recurring: 'V3R' }
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
  if (td.startsWith(ORDER_PREFIX.upgrade)) return 'upgrade'
  if (td.startsWith(ORDER_PREFIX.recurring)) return 'recurring'
  return null
}

/**
 * 首次付款的卡片識別碼（save_card_token）= 這筆付款的 id，每次結帳一組新的。
 *
 * 以前固定用會員 id：同一組 token 在紅陽綁過卡後，再走首次付款紅陽就回 96
 * 「未傳 TokenKey 值」—— 升級、到期重訂、退款後重訂全部付不了（PAY-15，2026-10-16）。
 * 手冊：≤ 36 碼、只能英數與 . _ @ -；uuid 剛好 36 碼。
 * 通知不會帶回這個值，入帳時用同一個函式從付款 id 算回來，兩邊一定一致。
 * 月扣用「最近一筆付款成功、有卡片代碼」的那組（見 auto-charge 的 latestStoredToken）。
 */
export function cardTokenOf(paymentId: string): string {
  return paymentId
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
