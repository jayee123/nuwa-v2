-- 034: App 試用加上「對話次數上限」—— 天數或次數，先到者結束（M-12）
--
-- 依據：Jeff 2026-10-11「試用結束條件：設定的天數到了，或設定的對話次數用完」。
-- 之前只有天數（apps.trial_days → user_app_trials.expires_at）；試用期間對話次數完全不擋。
--
-- 設計：
--   apps.trial_dialog_limit          後台「App 管理」可設；NULL = 不限次數（只看天數）
--   user_app_trials.dialog_limit     開試用當下的快照（trigger 抄 apps 的值）—— 跟 expires_at 一樣不追溯
--   user_app_trials.dialogs_used     試用期間已用次數，由 consume_dialog 在同一交易累加
--   consume_dialog(..., p_trial)     私版「憑試用進場」的人呼叫時帶 true：
--                                     次數用完回 allowed=false, reason='trial_exhausted'（不扣次）
--
-- ⚠️ 部署順序：本 migration → 公版 → 私版。
--    consume_dialog 多一個有預設值的參數，舊的私版照 (p_user, p_source) 呼叫仍然可用；
--    但新私版會帶 p_trial，必須等這支跑完才能部署。
--
-- 不刪任何資料。DROP FUNCTION 只是換掉 consume_dialog 的參數清單（同一交易內立刻重建）。

BEGIN;

-- ── (1) 每支 App 的試用次數上限 ─────────────────────────────
ALTER TABLE apps ADD COLUMN IF NOT EXISTS trial_dialog_limit INTEGER
  CHECK (trial_dialog_limit IS NULL OR trial_dialog_limit > 0);

-- ── (2) 每筆試用的上限快照與已用次數 ──────────────────────────
-- 既有的試用 dialog_limit 為 NULL = 不限次數：上線前開的試用不追溯。
ALTER TABLE user_app_trials ADD COLUMN IF NOT EXISTS dialog_limit INTEGER
  CHECK (dialog_limit IS NULL OR dialog_limit > 0);
ALTER TABLE user_app_trials ADD COLUMN IF NOT EXISTS dialogs_used INTEGER NOT NULL DEFAULT 0
  CHECK (dialogs_used >= 0);

-- ── (3) 開試用時抄上限快照 ───────────────────────────────────
-- 試用有兩個入口（launch route 的 open 試用、redeem_invite_for_app 的邀請碼試用），
-- 用 trigger 一處處理，兩邊都不必改、也不會漏。
CREATE OR REPLACE FUNCTION snapshot_trial_dialog_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.dialog_limit := (SELECT trial_dialog_limit FROM apps WHERE id = NEW.app_id);
  NEW.dialogs_used := 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_trial_dialog_limit ON user_app_trials;
CREATE TRIGGER trg_snapshot_trial_dialog_limit
  BEFORE INSERT ON user_app_trials
  FOR EACH ROW EXECUTE FUNCTION snapshot_trial_dialog_limit();

-- ── (4) consume_dialog 加上試用次數 ──────────────────────────
-- 與 030 相同的本期額度檢查；p_trial = true 時多兩件事：
--   先看試用次數 —— 用完就拒絕（不扣本期額度）
--   放行時同一交易把 dialogs_used + 1
-- source 就是 App slug（030 的約定），用它找到這支 App 的試用紀錄。
DROP FUNCTION IF EXISTS consume_dialog(UUID, TEXT);

CREATE FUNCTION consume_dialog(p_user UUID, p_source TEXT, p_trial BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period      DATE;
  v_limit       INT;
  v_used        INT;
  v_trial_id    UUID;
  v_trial_used  INT;
  v_trial_limit INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('consume_dialog:' || p_user::text));

  v_period := dialog_period_start(p_user);
  IF v_period IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_not_found');
  END IF;

  IF p_trial THEN
    -- 只在「真的是憑試用進場」時才算：封測一律是；正式開放要有進入門檻（免費會員才未達標）。
    -- 對應 lib/launch-gate.ts 的 isTrialGrantedEntry —— 門檻「不限」的 App 免費會員本來就能進，
    -- 不能因為留著一筆舊試用紀錄就被試用次數擋下。
    SELECT t.id, t.dialogs_used, t.dialog_limit
      INTO v_trial_id, v_trial_used, v_trial_limit
      FROM user_app_trials t
      JOIN apps a ON a.id = t.app_id
     WHERE t.user_id = p_user AND a.slug = p_source
       AND (a.status = 'internal' OR a.required_plan IS NOT NULL);

    IF v_trial_limit IS NOT NULL AND v_trial_used >= v_trial_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'trial_exhausted',
                                'trial_used', v_trial_used, 'trial_limit', v_trial_limit);
    END IF;
  END IF;

  v_limit := dialog_limit_for(p_user, v_period);
  SELECT COALESCE(SUM(used), 0) INTO v_used
    FROM ai_dialog_usage WHERE user_id = p_user AND period_start = v_period;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exceeded',
                              'used', v_used, 'limit', v_limit, 'period_start', v_period);
  END IF;

  INSERT INTO ai_dialog_usage (user_id, period_start, source, used)
  VALUES (p_user, v_period, p_source, 1)
  ON CONFLICT (user_id, period_start, source)
  DO UPDATE SET used = ai_dialog_usage.used + 1, updated_at = NOW();

  IF v_trial_id IS NOT NULL THEN
    UPDATE user_app_trials SET dialogs_used = dialogs_used + 1 WHERE id = v_trial_id;
    v_trial_used := v_trial_used + 1;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit, 'period_start', v_period,
                            'trial_used', v_trial_used, 'trial_limit', v_trial_limit);
END;
$$;

REVOKE ALL ON FUNCTION consume_dialog(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── 驗證（跑完後手動執行）──────────────────────────────────────
-- 1. 欄位與 trigger 都在：應回 3 列欄位 + 1 列 trigger
--    SELECT table_name, column_name FROM information_schema.columns
--     WHERE (table_name, column_name) IN (('apps','trial_dialog_limit'),
--           ('user_app_trials','dialog_limit'), ('user_app_trials','dialogs_used'));
--    SELECT tgname FROM pg_trigger WHERE tgname = 'trg_snapshot_trial_dialog_limit';
--
-- 2. consume_dialog 只剩新版一個：應回 1 列，參數是 p_user uuid, p_source text, p_trial boolean DEFAULT false
--    SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'consume_dialog';
--
-- 3. 試用次數邊界 —— 子交易 + 故意拋例外回滾，**不會留下任何資料**：
--
--    CREATE OR REPLACE FUNCTION pg_temp.verify_034() RETURNS TEXT LANGUAGE plpgsql AS $v$
--    DECLARE v_trial user_app_trials%ROWTYPE; v_slug TEXT; v_r1 JSONB; v_r2 JSONB; v_r3 JSONB; v_msg TEXT;
--    BEGIN
--      SELECT t.* INTO v_trial FROM user_app_trials t JOIN apps a ON a.id = t.app_id
--       WHERE a.status = 'internal' OR a.required_plan IS NOT NULL LIMIT 1;
--      IF v_trial.id IS NULL THEN RETURN '⚪ 沒有「憑試用進場」的試用紀錄（App 門檻不限時不會開試用），先跳過'; END IF;
--      SELECT slug INTO v_slug FROM apps WHERE id = v_trial.app_id;
--      BEGIN
--        UPDATE user_app_trials SET dialog_limit = 2, dialogs_used = 1 WHERE id = v_trial.id;
--        -- 臨時補發本期額度，避免這個人本期額度剛好用完而干擾結果（最後會回滾）
--        INSERT INTO ai_dialog_grants (user_id, period_start, amount, reason)
--        VALUES (v_trial.user_id, dialog_period_start(v_trial.user_id), 100, 'verify_034');
--        v_r1 := consume_dialog(v_trial.user_id, v_slug, true);   -- 第 2 次 → 應放行
--        v_r2 := consume_dialog(v_trial.user_id, v_slug, true);   -- 第 3 次 → 應 trial_exhausted
--        v_r3 := consume_dialog(v_trial.user_id, v_slug);         -- 不帶 p_trial（方案進場）→ 應放行
--        v_msg := CASE
--          WHEN (v_r1->>'allowed')::bool AND v_r2->>'reason' = 'trial_exhausted' AND (v_r3->>'allowed')::bool
--            THEN '✅ 034 正確：試用次數到上限擋下、方案進場不受影響'
--          ELSE '❌ 行為不符：' || v_r1::text || ' / ' || v_r2::text || ' / ' || v_r3::text END;
--        RAISE EXCEPTION 'rollback';
--      EXCEPTION WHEN raise_exception THEN
--        RETURN v_msg;
--      END;
--    END $v$;
--    SELECT pg_temp.verify_034() AS 驗證結果;
