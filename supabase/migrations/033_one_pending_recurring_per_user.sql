-- 033: 每位會員同時最多一筆「等結果中」的月扣（紅陽 SunPay v3）
--
-- 新版月扣是非同步的：送出後付款維持 pending，等紅陽通知才知道成功或失敗。
-- 月扣排程送出前會先檢查「這個人有沒有 pending 的月扣」，但檢查和新增不是同一步 ——
-- 兩個排程同時跑（Vercel 重試、手動觸發）就可能各送一筆，重複扣款。
-- 這個唯一索引讓第二筆新增直接失敗（23505），排程端會跳過這個人。
--
-- 月扣訂單編號固定 V3R 開頭（v2/src/lib/sunpay/order.ts）。
-- 不影響首次付款（V3F）與舊 esafe 付款（V2…）。
--
-- 只建索引，不刪改任何資料。執行前可先跑 STEP 1 確認目前沒有違反的資料（應回 0 列）。

-- STEP 1（檢查）：同一人有兩筆以上 pending 月扣 → 應回 0 列
SELECT user_id, count(*)
  FROM payments
 WHERE status = 'pending' AND payment_uid LIKE 'V3R%'
 GROUP BY user_id
HAVING count(*) > 1;

-- STEP 2（建索引）
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending_recurring
  ON payments (user_id)
  WHERE status = 'pending' AND payment_uid LIKE 'V3R%';
