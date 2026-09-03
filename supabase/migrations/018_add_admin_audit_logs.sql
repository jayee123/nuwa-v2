-- 018: 後台操作記錄（admin audit log）
--
-- 記錄管理者在 Market 後台的操作（新增/編輯/刪除 App、指派權限、產生邀請碼…），供稽核與追查。

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id),   -- 操作者
  action      TEXT NOT NULL,               -- 例：app.create / app.update / invite.generate
  target      TEXT,                        -- 操作對象（slug / id / 摘要）
  detail      JSONB,                       -- 額外內容（變更欄位等）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON admin_audit_logs(actor_id);

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
-- 只走後台 service role 讀寫。
