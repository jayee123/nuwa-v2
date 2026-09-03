-- 011: Market App Registry — 平台（Market）管理多支 App（Market/App 兩層架構）
-- apps:      App 註冊表（幸福關係 = happy，未來多支）
-- user_apps: 平台會員 ↔ App profile 綁定表

-- App 註冊表
CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,                 -- 'happy'（身分骨架，建立後不可改）
  name TEXT NOT NULL,                        -- '幸福關係'
  tagline TEXT,
  icon TEXT,                                 -- emoji 或圖片 URL
  app_url TEXT,                              -- https://happy.nuwa.chg2asc.com
  db_schema TEXT NOT NULL,                   -- 'happy'（schema 隔離，建立後不可改）
  sso_secret TEXT,                           -- App 與 Market SSO 對接金鑰
  entitlement_key TEXT,                      -- App 查詢訂閱權益的 API key
  required_plan TEXT,                        -- 進入所需最低方案（NULL = 免費/不限）
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | active | archived
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 平台會員 ↔ App 綁定（哪個會員綁了哪支 App）
CREATE TABLE user_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  app_user_id TEXT,                          -- App 自身 schema 內的 user id（如 happy.users.id）
  status TEXT NOT NULL DEFAULT 'active',     -- active | suspended
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_id)
);

CREATE INDEX idx_user_apps_user ON user_apps(user_id);
CREATE INDEX idx_user_apps_app ON user_apps(app_id);

-- RLS：寫入一律走後台 service role（createAdminClient，會 bypass RLS）
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_apps ENABLE ROW LEVEL SECURITY;
-- 已上架 App 可公開讀（給 Market 首頁 App Launcher 顯示）
CREATE POLICY "apps_public_read_active" ON apps FOR SELECT USING (status = 'active');
-- 會員只能讀自己的綁定
CREATE POLICY "user_apps_own_read" ON user_apps FOR SELECT USING (auth.uid() = user_id);

-- 種入現有「幸福關係」App
INSERT INTO apps (slug, name, tagline, icon, app_url, db_schema, required_plan, status, sort_order)
VALUES ('happy', '幸福關係', 'AI 陪你練習關係與溝通', '💛', 'https://nexthappy.sakilu-dev.uk', 'happy', NULL, 'active', 1);
