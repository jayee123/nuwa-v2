-- 019: 邀請碼可限定 App
--
-- invite_codes 加 app_id：指定這組碼限用於哪支 App；NULL = 不限（任何 App / 純平台試用）。

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES apps(id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_app ON invite_codes(app_id);
