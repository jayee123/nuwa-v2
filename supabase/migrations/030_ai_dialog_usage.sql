-- 030: AI 對話額度統一 —— 階段 1（建表 + 影子雙寫用的函式）
--
-- 依據：docs/QUOTA-PLAN.md；Jeff 2026-09-25 拍板
--   決定 1A 存「已用」不存「剩餘」
--   決定 2A 全平台一池（公版 chat/unpack + 各 App 共用），依來源分項
--   決定 3A 免費方案在 plans 補一列，次數 = 基本方案（Steve §4.7）
--   另：後台可「本期補發 N 次」（客服補償）；公版自己的 AI 算進同一池
--
-- ⚠️ 本 migration **不改變任何人的使用體驗**：
--    舊的 users.dialog_limit 照舊擋人；新表只做影子記錄（record_dialog），
--    跑一週比對新舊數字對得上，才進階段 2 改用 consume_dialog 擋人。
--    consume_dialog 在本階段建好但**沒有任何程式呼叫它**。

BEGIN;

-- ── (1) 免費方案補一列（決定 3A）────────────────────────────
-- 次數跟基本方案相同（§4.7：差別在「能不能進 App」，不在次數）。
-- 從 basic 那列複製數字而不是寫死 50 —— 規格說數字由後台設定，不寫進文件。
-- 程式端：getActivePlans() 排除 free（不出現在訂閱頁）、後台擋刪除。
INSERT INTO plans (code, name, price, renewal_price, monthly_dialog_count, monthly_charge, sort_order, is_active)
SELECT 'free', '免費', 0, 0, b.monthly_dialog_count, 0, 0, true
  FROM plans b
 WHERE b.code = 'basic'
   AND NOT EXISTS (SELECT 1 FROM plans WHERE code = 'free');

-- ── (2) 已用次數（決定 1A + 2A）─────────────────────────────
-- 一列 = 一個使用者、一期、一個來源的已用次數。
-- 總額度 = 同 (user_id, period_start) 所有來源加總；分項顯示就是逐列列出。
-- source 用文字而非 app_id：公版自己的 chat/unpack 不是一支 App，但要算進同一池。
CREATE TABLE IF NOT EXISTS ai_dialog_usage (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE        NOT NULL,
  source       TEXT        NOT NULL,   -- 'nuwa'（公版）或 App slug（'happy'）
  used         INTEGER     NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, period_start, source)
);
ALTER TABLE ai_dialog_usage ENABLE ROW LEVEL SECURITY;
-- 不開任何 policy：只走 service role（公版 admin client / 私版 market client）

-- ── (3) 本期補發（客服補償）────────────────────────────────
-- 獨立一張表而不是在 used 扣負數：誰補的、為什麼補，要查得到。
CREATE TABLE IF NOT EXISTS ai_dialog_grants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE        NOT NULL,
  amount       INTEGER     NOT NULL CHECK (amount > 0),
  reason       TEXT,
  granted_by   UUID        REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_dialog_grants_user_period_idx ON ai_dialog_grants (user_id, period_start);
ALTER TABLE ai_dialog_grants ENABLE ROW LEVEL SECURITY;

-- ── (4) 本期起算日 ─────────────────────────────────────────
-- ⚠️ 必須與 src/lib/dialog-period.ts 行為一致（那份有 13 條單元測試）。
--   錨點：有效訂閱的 starts_at；沒有 → users.created_at（§4.4：免費以註冊日起算）
--   以台灣日曆日計；錨點日在該月不存在 → 取月底，只影響那一個月
CREATE OR REPLACE FUNCTION dialog_period_start(p_user UUID, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS DATE
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_anchor_ts  TIMESTAMPTZ;
  v_anchor     DATE;
  v_today      DATE;
  v_day        INT;
  v_month      DATE;   -- 某月 1 號
  v_candidate  DATE;
BEGIN
  SELECT s.starts_at INTO v_anchor_ts
    FROM subscriptions s
   WHERE s.user_id = p_user AND s.status = 'active' AND s.ends_at > p_now
   ORDER BY s.starts_at DESC
   LIMIT 1;

  IF v_anchor_ts IS NULL THEN
    SELECT u.created_at INTO v_anchor_ts FROM users u WHERE u.id = p_user;
  END IF;
  IF v_anchor_ts IS NULL THEN
    RETURN NULL;  -- 查無此人
  END IF;

  v_anchor := (v_anchor_ts AT TIME ZONE 'Asia/Taipei')::date;
  v_today  := (p_now       AT TIME ZONE 'Asia/Taipei')::date;

  IF v_today < v_anchor THEN
    RETURN v_anchor;  -- 資料異常（錨點在未來）：不回傳比錨點更早的期
  END IF;

  v_day   := EXTRACT(DAY FROM v_anchor)::int;
  v_month := date_trunc('month', v_today)::date;
  v_candidate := v_month + (LEAST(v_day, EXTRACT(DAY FROM (v_month + INTERVAL '1 month - 1 day'))::int) - 1);

  IF v_candidate > v_today THEN
    v_month := (v_month - INTERVAL '1 month')::date;
    v_candidate := v_month + (LEAST(v_day, EXTRACT(DAY FROM (v_month + INTERVAL '1 month - 1 day'))::int) - 1);
  END IF;

  RETURN v_candidate;
END;
$$;

-- ── (5) 本期上限 = 方案次數 + 本期補發 ─────────────────────────
-- 方案讀 users.current_plan；認不得的方案一律退回 free 的次數（不放行成無上限）。
CREATE OR REPLACE FUNCTION dialog_limit_for(p_user UUID, p_period DATE)
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
           (SELECT p.monthly_dialog_count FROM users u JOIN plans p ON p.code = u.current_plan WHERE u.id = p_user),
           (SELECT monthly_dialog_count FROM plans WHERE code = 'free'),
           0)
       + COALESCE((SELECT SUM(amount) FROM ai_dialog_grants WHERE user_id = p_user AND period_start = p_period), 0)::int
$$;

-- ── (6) 影子記錄（階段 1 用）：只記不擋 ───────────────────────
CREATE OR REPLACE FUNCTION record_dialog(p_user UUID, p_source TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := dialog_period_start(p_user);
BEGIN
  IF v_period IS NULL THEN RETURN; END IF;
  INSERT INTO ai_dialog_usage (user_id, period_start, source, used)
  VALUES (p_user, v_period, p_source, 1)
  ON CONFLICT (user_id, period_start, source)
  DO UPDATE SET used = ai_dialog_usage.used + 1, updated_at = NOW();
END;
$$;

-- ── (7) 檢查 + 扣次，一步完成（階段 2 才會被呼叫）─────────────
-- 用 per-user advisory lock 序列化同一人的請求：總額度是跨來源加總，
-- 單靠列鎖擋不住「兩個來源同時各扣一次」而超額。
CREATE OR REPLACE FUNCTION consume_dialog(p_user UUID, p_source TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE;
  v_limit  INT;
  v_used   INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('consume_dialog:' || p_user::text));

  v_period := dialog_period_start(p_user);
  IF v_period IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'user_not_found');
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

  RETURN jsonb_build_object('allowed', true, 'used', v_used + 1, 'limit', v_limit, 'period_start', v_period);
END;
$$;

REVOKE ALL ON FUNCTION record_dialog(UUID, TEXT)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION consume_dialog(UUID, TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── 驗證（跑完後手動執行）──────────────────────────────────────
-- 1. 免費方案一列、次數與 basic 相同：
--    SELECT code, monthly_dialog_count FROM plans WHERE code IN ('free','basic');
--
-- 2. 週期函式與 TS 版一致（對照 dialog-period.test.ts 的案例；p_now 可注入）：
--    SELECT dialog_period_start(id, '2026-10-05 12:00+08') FROM users LIMIT 3;
--
-- 3. consume_dialog 的上限邊界 —— 另存成一個 query 貼上執行，結果是一列文字。
--    內部用子交易 + 故意拋例外回滾，**不會留下任何資料**：
--
--    CREATE OR REPLACE FUNCTION pg_temp.verify_030() RETURNS TEXT LANGUAGE plpgsql AS $v$
--    DECLARE v_user UUID; v_r1 JSONB; v_r2 JSONB; v_msg TEXT;
--    BEGIN
--      SELECT id INTO v_user FROM users WHERE current_plan = 'free' LIMIT 1;
--      BEGIN
--        INSERT INTO ai_dialog_usage (user_id, period_start, source, used)
--        VALUES (v_user, dialog_period_start(v_user), 'nuwa',
--                dialog_limit_for(v_user, dialog_period_start(v_user)) - 1)
--        ON CONFLICT (user_id, period_start, source) DO UPDATE SET used = EXCLUDED.used;
--        v_r1 := consume_dialog(v_user, 'happy');  -- 剛好用到上限 → 應允許
--        v_r2 := consume_dialog(v_user, 'nuwa');   -- 跨來源加總已滿 → 應拒絕
--        v_msg := CASE
--          WHEN (v_r1->>'allowed')::bool AND NOT (v_r2->>'allowed')::bool
--            THEN '✅ 030 正確：到上限前放行、到上限後跨來源擋下'
--          ELSE '❌ 行為不符：' || v_r1::text || ' / ' || v_r2::text END;
--        RAISE EXCEPTION 'rollback';               -- 回滾上面所有寫入
--      EXCEPTION WHEN raise_exception THEN
--        RETURN v_msg;
--      END;
--    END $v$;
--    SELECT pg_temp.verify_030() AS 驗證結果;
