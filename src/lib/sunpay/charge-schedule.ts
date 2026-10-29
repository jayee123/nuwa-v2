// 月扣排程的日期換算（BIL-1）。
//
// 排程每天台灣早上跑一次（v2/vercel.json），扣「到期日在台灣今天以前」的訂閱：
// 今天稍晚才到期的也在今早一起扣，明天才到期的留給明天。
// 提早幾小時扣不會讓會員少天數 —— 續扣成功時新的到期日從「原本的到期日」加一個月（settle.ts），不是從扣款當下。

const TAIWAN_OFFSET_MS = 8 * 60 * 60 * 1000

/** 台灣今天的日期，YYYY-MM-DD */
export function taiwanDate(now: Date): string {
  return new Date(now.getTime() + TAIWAN_OFFSET_MS).toISOString().slice(0, 10)
}

/** 台灣今天，YYYYMMDD（跟紅陽卡片代碼效期 token_life 同格式） */
export function taiwanDateCompact(now: Date): string {
  return taiwanDate(now).replace(/-/g, '')
}

/** 這次要扣的訂閱：ends_at 小於等於這個時間（台灣今天 23:59:59.999，換成 UTC ISO） */
export function chargeCutoff(now: Date): string {
  return new Date(`${taiwanDate(now)}T23:59:59.999+08:00`).toISOString()
}
