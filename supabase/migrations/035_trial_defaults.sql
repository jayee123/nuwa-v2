-- 035: 試用條件改成「公版預設 + App 個別覆寫」（A 方案）
--
-- 依據：Jeff 2026-10-15 —— 在公版設定一次試用條件，會員進任何 App 都能試用；
-- 每支 App 仍各自一次試用（不推翻 9/6 定案「試用是 App 層級」；B 方案「平台一次試用」已放棄）。
--
-- 規則（必須與 src/lib/launch-gate.ts 的 resolveTrialTerms 一致）：
--   公版預設 trial_defaults：天數必填；次數 NULL = 不限
--   App 覆寫 apps.trial_days：NULL = 用公版預設；0 = 關閉試用；N = N 天
--   App 覆寫 apps.trial_dialog_limit：NULL = 用公版預設；0 = 這支 App 不限次數；N = N 次
--
-- ⚠️ 部署順序：本 migration → 公版。私版不受影響（它讀的是每筆試用開立時的快照）。
-- 不刪任何資料。happy 目前的 14 天／30 次剛好等於預設值，改成「跟公版預設」，行為不變。

BEGIN;

-- ── (1) 公版預設：只有一列 ─────────────────────────────────
-- 不放 system_params：那是自由文字，填錯（例如「十四」）會讓開試用的 trigger 轉型失敗，
-- 進 App 整個被擋下。獨立一張表用 CHECK 把值鎖在合法範圍。
CREATE TABLE IF NOT EXISTS trial_defaults (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  trial_days         INTEGER NOT NULL DEFAULT 14 CHECK (trial_days BETWEEN 0 AND 365),
  trial_dialog_limit INTEGER CHECK (trial_dialog_limit IS NULL OR trial_dialog_limit BETWEEN 1 AND 10000),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE trial_defaults ENABLE ROW LEVEL SECURITY;
-- 不開任何 policy：只走 service role（公版 admin client）

INSERT INTO trial_defaults (id, trial_days, trial_dialog_limit)
VALUES (1, 14, 30)
ON CONFLICT (id) DO NOTHING;

-- ── (2) App 欄位改成可留空（= 用公版預設）──────────────────────
ALTER TABLE apps ALTER COLUMN trial_days DROP NOT NULL;
ALTER TABLE apps ALTER COLUMN trial_days DROP DEFAULT;
ALTER TABLE apps DROP CONSTRAINT IF EXISTS apps_trial_days_check;
ALTER TABLE apps ADD CONSTRAINT apps_trial_days_check
  CHECK (trial_days IS NULL OR trial_days BETWEEN 0 AND 365);

-- 034 的 CHECK 是 > 0；現在 0 = 這支 App 不限次數
ALTER TABLE apps DROP CONSTRAINT IF EXISTS apps_trial_dialog_limit_check;
ALTER TABLE apps ADD CONSTRAINT apps_trial_dialog_limit_check
  CHECK (trial_dialog_limit IS NULL OR trial_dialog_limit BETWEEN 0 AND 10000);

-- happy 的值剛好等於預設 → 改成跟公版預設（以後在系統設定改一次就好）
UPDATE apps
   SET trial_days = NULL, trial_dialog_limit = NULL
 WHERE slug = 'happy' AND trial_days = 14 AND trial_dialog_limit = 30;

-- ── (3) 一支 App 實際的試用條件 ─────────────────────────────
CREATE OR REPLACE FUNCTION effective_trial_terms(p_app_id UUID, OUT days INTEGER, OUT dialog_limit INTEGER)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT COALESCE(a.trial_days, d.trial_days),
         NULLIF(COALESCE(a.trial_dialog_limit, d.trial_dialog_limit), 0)
    FROM apps a
    CROSS JOIN (SELECT trial_days, trial_dialog_limit FROM trial_defaults WHERE id = 1
                UNION ALL SELECT 14, NULL WHERE NOT EXISTS (SELECT 1 FROM trial_defaults WHERE id = 1)) d
   WHERE a.id = p_app_id
$$;

-- ── (4) 開試用時的次數快照改用實際條件（034 的 trigger 函式）────────────
CREATE OR REPLACE FUNCTION snapshot_trial_dialog_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.dialog_limit := (SELECT dialog_limit FROM effective_trial_terms(NEW.app_id));
  NEW.dialogs_used := 0;
  RETURN NEW;
END;
$$;

-- ── (5) 邀請碼兌換：天數改用實際條件（其餘與 028 相同）────────────────
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
  -- 搶碼（row lock；已用 / 不存在 / 已過期都拿不到 row）
  -- expires_at IS NULL = 永不過期，維持 025 的語意。
  UPDATE invite_codes
     SET used_by = p_user_id, used_at = NOW()
   WHERE code = p_code
     AND used_by IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())
   RETURNING code, app_id INTO v_code, v_code_app;

  IF v_code IS NULL THEN
    -- 搶不到的三種原因裡，只把「過期」挑出來給明確訊息
    IF EXISTS (
      SELECT 1 FROM invite_codes
       WHERE code = p_code
         AND used_by IS NULL
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
    ) THEN
      RAISE EXCEPTION 'INVITE_EXPIRED';
    END IF;
    RAISE EXCEPTION 'INVITE_INVALID';  -- 不存在或已使用，不區分（防列舉）
  END IF;

  -- 限定 App 的碼只能開那支 App；app_id IS NULL = 不限
  IF v_code_app IS NOT NULL AND v_code_app <> p_app_id THEN
    RAISE EXCEPTION 'INVITE_WRONG_APP';
  END IF;

  -- 035：App 留空 = 用公版預設（effective_trial_terms）
  SELECT days INTO v_trial_days FROM effective_trial_terms(p_app_id);
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

REVOKE ALL ON FUNCTION redeem_invite_for_app(TEXT, UUID, UUID) FROM PUBLIC;

COMMIT;

-- ── 驗證（跑完後手動執行）──────────────────────────────────────
-- 1. 公版預設一列：應回 14 | 30
--    SELECT trial_days, trial_dialog_limit FROM trial_defaults;
--
-- 2. happy 改成跟預設、實際條件仍是 14 天／30 次：應回 NULL | NULL | 14 | 30
--    SELECT a.trial_days, a.trial_dialog_limit, t.days, t.dialog_limit
--      FROM apps a, effective_trial_terms(a.id) t WHERE a.slug = 'happy';
