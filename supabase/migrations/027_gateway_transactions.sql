-- 027: 金流帳務 —— 與紅陽（esafe）往來的原始交易帳（Jeff 2026-09-10 A 案）
--
-- payments 表是「用戶視角」的付款紀錄；這張表是「金流商視角」的原始憑據：
-- 每次跟紅陽的往來（首付回調、月扣、退款標記）都留一筆，成功失敗都記。
-- 解決三件事：紅陽回傳的原始資料沒地方放、手動退款系統不知道（收入虛高）、
-- 沒有「實收」統計。
--
-- ⚠️ 本表不執行任何金流操作：退款仍 100% 由管理者在紅陽商家後台人工執行，
--    這裡的 refund 列只是「標記」讓帳跟上事實。
-- ⚠️ 歷史資料不回填（帳務憑證不改寫），統計自本表上線日起算。

CREATE TABLE IF NOT EXISTS gateway_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  payment_id  UUID REFERENCES payments(id),
  -- bind_first_charge = 綁卡+首付回調；recurring = 月扣；refund = 人工退款標記
  tx_type     TEXT NOT NULL CHECK (tx_type IN ('bind_first_charge', 'recurring', 'refund')),
  -- 收款存正值、退款存負值 —— SUM(成功列) 直接等於實收
  amount      INTEGER NOT NULL,
  order_no    TEXT,             -- 我方單號（Td / REC_...）
  gateway_no  TEXT,             -- 紅陽交易號 buysafeno
  errcode     TEXT,
  errmsg      TEXT,
  success     BOOLEAN NOT NULL,
  -- 原始回傳（已剔除 tokenData / ChkValue 等敏感欄位 —— 程式端負責剔除，
  -- 卡片 token 永不入此表，PCI 紀律同 payments.token_data 的加密原則）
  raw         JSONB,
  note        TEXT,             -- 退款原因等人工備註
  created_by  UUID REFERENCES users(id),  -- refund 標記者；系統寫入為 NULL
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_tx_created ON gateway_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_tx_user ON gateway_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_gateway_tx_payment ON gateway_transactions (payment_id);

-- 紅陽對同一筆交易會回調兩次（前景/背景），失敗重送也可能重複 ——
-- 同單號+同紅陽交易號+同類型只記一次（程式端 insert 撞到就略過）
CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_tx_dedupe
  ON gateway_transactions (order_no, gateway_no, tx_type)
  WHERE gateway_no IS NOT NULL;

-- 只有 service_role 可讀寫（後台 API 一律走 admin client）
ALTER TABLE gateway_transactions ENABLE ROW LEVEL SECURITY;

-- 驗證（跑完後手動執行）：
-- SELECT COUNT(*) FROM gateway_transactions;                          -- 應為 0
-- SELECT indexname FROM pg_indexes WHERE tablename = 'gateway_transactions';  -- 應有 4 個 idx
