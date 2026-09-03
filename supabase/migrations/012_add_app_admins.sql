-- 012: Market 後台 per-App 管理權限（哪個管理者能管/看哪支 App）
-- 搭配 011 apps。superadmin 指派；非 superadmin 只能管有列在此的 App。

CREATE TABLE app_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'manager',   -- manager（可管） | viewer（唯讀）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_id)
);

CREATE INDEX idx_app_admins_user ON app_admins(user_id);
CREATE INDEX idx_app_admins_app ON app_admins(app_id);

-- RLS：寫入走後台 service role（createAdminClient bypass RLS）；管理者可讀自己的權限列
ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_admins_own_read" ON app_admins FOR SELECT USING (auth.uid() = user_id);
