-- 025: App 生命週期（internal 封測）與 App 層級試用
--
-- 依據：Steve〈金流與試用架構定案〉2026-09-06 + docs/PAYMENT_SPEC.md v2 §3.1。
-- 三條定案的落地：收錢一律公版、邀請碼一律公版發放、訂閱是平台通行證而
-- 試用是 App 層級（每支 App 各自 trial_days 天、免綁卡）。
--
-- ⚠️ 部署順序：本 migration 先在 Supabase 跑完，launch gate 新程式才能部署
--    （程式端查不到新表/新欄位時 fail closed 回 unavailable，不會 500，
--    但那等於全部擋在門外）。

-- ── (1) apps.status 增加 'internal' ────────────────────────────
-- 沿用現有 TEXT 欄位（draft | active | archived），加一個封測值：
--   internal = 定案文件的「內測/封測中」：首頁顯示「即將推出」，
--              只有持該 App 邀請碼者進得去，已付費會員也不自動開放。
--   active   = 定案文件的「open 正式開放」。
-- 欄位沒有 CHECK constraint（011 當初就沒建），值域由程式端 lib/launch-gate 判斷，
-- 認不得的值一律 unavailable（fail closed）。

-- 公開讀取原本只放 active；internal 要能在首頁顯示「即將推出」，所以放寬到兩者。
DROP POLICY IF EXISTS "apps_public_read_active" ON apps;
CREATE POLICY "apps_public_read_active" ON apps
  FOR SELECT USING (status IN ('active', 'internal'));

-- ── (2) apps.trial_days ────────────────────────────────────────
-- 每支 App 各自的免費試用天數；後台「App 管理」可改，不寫死在程式。
-- 0 = 關閉此 App 的免費試用（active 下未達標者直接導訂閱頁）。
ALTER TABLE apps ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 14;

-- ── (3) user_app_trials ────────────────────────────────────────
-- 誰、哪支 App、何時開始、何時到期、來源（邀請碼 / 公開試用）、用了哪組碼。
-- 一個帳號對一支 App 只有一筆（UNIQUE）—— 到期不重開，要重開得後台人工刪列。
-- 到期「不」回寫 users.current_plan：launch gate 看這張表就自然擋住。
CREATE TABLE IF NOT EXISTS user_app_trials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id      UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('invite', 'open')),
  invite_code TEXT REFERENCES invite_codes(code),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_id),
  -- invite 來源必須帶碼、open 來源必須不帶：半套資料一律擋在 DB 層
  CHECK (
    (source = 'invite' AND invite_code IS NOT NULL) OR
    (source = 'open' AND invite_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_app_trials_user ON user_app_trials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_app_trials_app ON user_app_trials(app_id);

ALTER TABLE user_app_trials ENABLE ROW LEVEL SECURITY;
-- 使用者只能看自己的試用紀錄；寫入一律走 service_role（launch route / 兌換 RPC）。
CREATE POLICY "user_app_trials_own_read" ON user_app_trials
  FOR SELECT USING (auth.uid() = user_id);

-- ── (4) 邀請碼兌換的原子性（PAYMENT_BOUNDARIES §C.2）──────────
-- 「標記碼已用」與「建 trial」必須同一交易：半套（碼作廢、trial 沒建成）不可接受。
-- 搶碼用 UPDATE ... WHERE used_by IS NULL，拿不到 row 表示已被用。
-- 回傳值：兌換成功回該筆 trial 的 expires_at；失敗 raise exception（呼叫端翻成友善訊息）。
CREATE OR REPLACE FUNCTION redeem_invite_for_app(
  p_code    TEXT,
  p_user_id UUID,
  p_app_id  UUID
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code       TEXT;
  v_code_app   UUID;
  v_trial_days INTEGER;
  v_expires    TIMESTAMPTZ;
BEGIN
  -- 搶碼（row lock；已用 / 不存在都拿不到 row）
  UPDATE invite_codes
     SET used_by = p_user_id, used_at = NOW()
   WHERE code = p_code AND used_by IS NULL
   RETURNING code, app_id INTO v_code, v_code_app;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'INVITE_INVALID';  -- 不存在或已使用，不區分（防列舉）
  END IF;

  -- 限定 App 的碼只能開那支 App；app_id IS NULL = 不限
  IF v_code_app IS NOT NULL AND v_code_app <> p_app_id THEN
    RAISE EXCEPTION 'INVITE_WRONG_APP';
  END IF;

  SELECT trial_days INTO v_trial_days FROM apps WHERE id = p_app_id;
  IF v_trial_days IS NULL THEN
    RAISE EXCEPTION 'APP_NOT_FOUND';
  END IF;

  v_expires := NOW() + make_interval(days => v_trial_days);

  -- UNIQUE(user_id, app_id)：已有 trial（含已到期）就擋 —— 不重開（BOUNDARIES A6 註3）
  INSERT INTO user_app_trials (user_id, app_id, expires_at, source, invite_code)
  VALUES (p_user_id, p_app_id, v_expires, 'invite', p_code);

  RETURN v_expires;
END;
$$;

-- 只准 service_role 呼叫（launch / 兌換 API 走 admin client）
REVOKE ALL ON FUNCTION redeem_invite_for_app(TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION redeem_invite_for_app(TEXT, UUID, UUID) FROM anon, authenticated;

-- ── 驗證（跑完後手動執行）──────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'apps' AND column_name = 'trial_days';        -- 應有 1 列
-- SELECT COUNT(*) FROM user_app_trials;                              -- 應為 0
-- SELECT proname FROM pg_proc WHERE proname = 'redeem_invite_for_app'; -- 應有 1 列
