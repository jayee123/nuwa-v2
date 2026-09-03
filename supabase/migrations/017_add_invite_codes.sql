-- 017: 邀請碼上移公版（#3a）
--
-- 邀請碼（試用門檻）搬到 Market（公版）：公版註冊驗證邀請碼，私版只走公版 SSO。
-- 鏡射私版 happy.invite_codes 結構；既有碼用腳本複製上來。

CREATE TABLE IF NOT EXISTS invite_codes (
  code        TEXT PRIMARY KEY,                         -- 邀請碼（大寫）
  used_by     UUID REFERENCES users(id),               -- 使用者（NULL = 未使用）
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,                              -- NULL = 不過期
  note        TEXT,                                     -- 批次/來源備註
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by ON invite_codes(used_by);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
-- 只走後台 service role 讀寫（createAdminClient bypass RLS）；不開公開讀。
