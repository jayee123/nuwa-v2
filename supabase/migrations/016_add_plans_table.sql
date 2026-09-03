-- 016: 公版統一服務方案定義（plans）
--
-- 全平台只有一套服務方案（所有課程/App 共用），欄位：
--   方案名稱 / 方案價格 / 續約價格 / 每月可提供的對話次數 / 每月收費金額
-- 取代原本散在 services.plans(JSONB) 的 per-service 定義（後續再把 subscribe/金流接到這張表）。

CREATE TABLE IF NOT EXISTS plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT UNIQUE NOT NULL,                 -- basic / advanced / premium
  name                  TEXT NOT NULL,                        -- 方案名稱
  price                 INTEGER NOT NULL DEFAULT 0,           -- 方案價格
  renewal_price         INTEGER NOT NULL DEFAULT 0,           -- 續約價格
  monthly_dialog_count  INTEGER NOT NULL DEFAULT 0,           -- 每月可提供的對話次數
  monthly_charge        INTEGER NOT NULL DEFAULT 0,           -- 每月收費金額
  sort_order            INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON plans FOR SELECT USING (is_active = true);

-- 種入現行三級方案（2026-04-30 確認：所有課程共用）
INSERT INTO plans (code, name, price, renewal_price, monthly_dialog_count, monthly_charge, sort_order) VALUES
  ('basic',    'Basic 啟動練習階段',     100, 100, 50,  100, 1),
  ('advanced', 'Advanced 深化練習階段',  200, 200, 100, 200, 2),
  ('premium',  'Premium 整合與達成階段', 300, 300, 200, 300, 3)
ON CONFLICT (code) DO NOTHING;
