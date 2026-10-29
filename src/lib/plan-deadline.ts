/**
 * 後台「方案到期日」（BIL-4）：改 users.plan_deadline 時，會員進行中的訂閱 subscriptions.ends_at 一起改。
 *
 * 為什麼：月扣排程看的是 subscriptions.ends_at，後台原本只改 users.plan_deadline ——
 * 畫面上的到期日跟實際扣款日是兩套，改了也不會提前或延後扣款。
 *
 * 規則：
 * - 日期沒變就兩邊都不動。編輯視窗每次儲存都會送到期日，改暱稱時不能順手把付款寫進去的精確時間截掉。
 * - 存成「台灣那天的最後一刻」：月扣排程扣「到期日在台灣今天以前」的，選今天 → 今天或明天早上 09:00 扣；
 *   訂閱在那天結束前都還算有效（額度週期不會提早跳掉）。
 * - 有進行中的訂閱就不能清空（ends_at 不能是空的）；有兩筆以上不知道改哪筆，擋下來。
 */
import { taiwanDate } from '@/lib/sunpay/charge-schedule'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type DeadlineChange =
  /** 日期沒變，兩邊都不動 */
  | { action: 'none' }
  /** 寫 users.plan_deadline；subscriptionId 有值時同一個時間也寫進那筆訂閱的 ends_at */
  | { action: 'set'; deadline: string | null; subscriptionId: string | null }
  | { action: 'reject'; error: string }

/** 台灣日期 YYYY-MM-DD → 那天台灣 23:59:59.999 的 UTC ISO；不是合法日期回 null */
export function deadlineInstant(date: string): string | null {
  if (!DATE_PATTERN.test(date)) return null
  const instant = new Date(`${date}T23:59:59.999+08:00`)
  // 2026-02-31 這種會被進位成 3 月，換回台灣日期對不上就是不合法
  if (Number.isNaN(instant.getTime()) || taiwanDate(instant) !== date) return null
  return instant.toISOString()
}

/** 到期日顯示在編輯視窗的值：台灣日期（跟列表的 toLocaleDateString 一致） */
export function deadlineInputValue(deadline: string | null): string {
  return deadline ? taiwanDate(new Date(deadline)) : ''
}

export function planDeadlineChange(
  input: unknown,
  currentDeadline: string | null,
  activeSubscriptionIds: string[],
): DeadlineChange {
  if (input !== null && typeof input !== 'string') return { action: 'reject', error: '方案到期日格式不正確' }
  const date = input ?? ''
  if (date === deadlineInputValue(currentDeadline)) return { action: 'none' }

  if (activeSubscriptionIds.length > 1) {
    return {
      action: 'reject',
      error: `這位會員有 ${activeSubscriptionIds.length} 筆進行中的訂閱，無法判斷要改哪一筆，請聯絡工程師處理`,
    }
  }
  const subscriptionId = activeSubscriptionIds[0] ?? null

  if (!date) {
    if (subscriptionId) return { action: 'reject', error: '這位會員有進行中的訂閱，方案到期日不能清空' }
    return { action: 'set', deadline: null, subscriptionId: null }
  }

  const deadline = deadlineInstant(date)
  if (!deadline) return { action: 'reject', error: '方案到期日格式不正確' }
  return { action: 'set', deadline, subscriptionId }
}
