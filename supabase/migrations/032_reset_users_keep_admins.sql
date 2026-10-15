-- ============================================================
-- 032_reset_users_keep_admins.sql —— 會員重置：只留 Steve、Jeff，其餘徹底刪除
--
-- 決定：Jeff 2026-10-05「會員資料只留 Steve 跟 Jeff，其他人刪掉，
--       讓已註冊過的人變成從未註冊過的狀態，可以重新測試」。
--       範圍含 8/12 已軟刪除的 17 個帳號（Jeff 確認「一起刪」）——
--       徹底刪掉後他們可以用同一個 email／手機重新註冊（軟刪除則會卡死）。
-- 保留：steveweng7@gmail.com、jeff@milkidea.com（公版、私版、auth 三處都留）
-- 刪除：公版 public.users 21 筆（17 個 8/12 已軟刪除 + 4 個列表上的） + 對應 auth.users，私版 happy.users 4 筆，及其所有關聯資料
--
-- ⚠️ 這是硬刪除，跑完無法還原。020 改成軟刪除的理由（金流憑證）此時不成立：
--    031 已清掉 6/1 前的訂閱與付款，剩下的付款全是 10/1 起的測試單。
--
-- 執行方式：Jeff 在 Supabase SQL Editor 分段跑。
--   STEP 1（只讀盤點，10/05 已跑）→ STEP 2（寫入，整段一次）→ STEP 3（確認）
--
-- 執行紀錄：Jeff 2026-10-05 執行。第一次預期值寫成 20 被自身檢查擋下（實為 21），修正後重跑成功。
--   STEP 3 三處都只剩 jeff@milkidea.com、steveweng7@gmail.com；複查剩下的付款 3、報名 2、
--   對話主題 49、通知 4、試用 1、已用邀請碼 1，全屬 Steve／Jeff。
-- ============================================================


-- ── STEP 1（只讀）：要刪幾個人 ─────────────────────────────────
SELECT
  (SELECT count(*) FROM public.users
    WHERE coalesce(email,'') NOT IN ('steveweng7@gmail.com','jeff@milkidea.com')) AS 公版待刪_預期21,
  (SELECT count(*) FROM auth.users
    WHERE coalesce(email,'') NOT IN ('steveweng7@gmail.com','jeff@milkidea.com')) AS auth待刪,
  (SELECT count(*) FROM happy.users
    WHERE coalesce(email,'') NOT IN ('steveweng7@gmail.com','jeff@milkidea.com')) AS 私版待刪_預期4;


-- ── STEP 1b（只讀）：所有指向使用者的外鍵，與每條會牽動幾筆 ──────────
-- 刪除規則：a=無動作（會擋） r=限制（會擋） c=連帶刪除 n=設為NULL
SELECT c.conrelid::regclass AS 參照表,
       a.attname            AS 欄位,
       c.confrelid::regclass AS 指向,
       c.confdeltype        AS 刪除規則,
       (xpath('/row/n/text()', query_to_xml(format(
          'SELECT count(*) AS n FROM %s WHERE %I IN (SELECT id FROM %s WHERE coalesce(email,'''') NOT IN (''steveweng7@gmail.com'',''jeff@milkidea.com''))',
          c.conrelid::regclass, a.attname, c.confrelid::regclass), false, true, '')))[1]::text::int AS 受影響筆數
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
 WHERE c.contype = 'f'
   AND c.confrelid IN ('public.users'::regclass, 'happy.users'::regclass, 'auth.users'::regclass)
   AND c.connamespace <> 'auth'::regnamespace
 ORDER BY 指向, 刪除規則, 參照表;


-- ── STEP 2（寫入）：整段一次執行 ─────────────────────────────────
-- 依 STEP 1b 實測結果（2026-10-05）：
--   會擋的（a）要先手動處理：registrations 15、payments 5、chat_topics 47（訊息連帶刪）、
--     ai_token_usage 8、notifications 30、invite_codes.used_by 5（改回未使用，碼留著）
--   其餘 c（連帶刪）／n（設 NULL）由外鍵自己處理：journeys、user_apps、user_app_trials、
--     happy.conversations、happy.usage_quotas；happy.ai_usage_logs 與 happy.invite_codes 設 NULL
--   不是外鍵但要清：sms_verifications（依手機）—— 才是真的「從未註冊」
-- 人數不是公版 21／私版 4 就 RAISE EXCEPTION，整段撤銷、什麼都不會改。
DO $$
DECLARE
  n_public int;
  n_happy  int;
  n_auth   int;
  n_pay    int;
BEGIN
  CREATE TEMP TABLE _gone ON COMMIT DROP AS
    SELECT id, phone FROM public.users
     WHERE coalesce(email,'') NOT IN ('steveweng7@gmail.com','jeff@milkidea.com');

  -- 第二層：付款底下的帳務（目前 0 筆，防萬一）
  DELETE FROM public.gateway_transactions
   WHERE user_id IN (SELECT id FROM _gone)
      OR payment_id IN (SELECT id FROM public.payments WHERE user_id IN (SELECT id FROM _gone));

  -- 會擋的（刪除規則 a）
  DELETE FROM public.registrations  WHERE user_id IN (SELECT id FROM _gone);
  DELETE FROM public.subscriptions  WHERE user_id IN (SELECT id FROM _gone);
  DELETE FROM public.payments       WHERE user_id IN (SELECT id FROM _gone);
  GET DIAGNOSTICS n_pay = ROW_COUNT;
  DELETE FROM public.chat_topics    WHERE user_id IN (SELECT id FROM _gone);  -- chat_messages 連帶刪
  DELETE FROM public.ai_token_usage WHERE user_id IN (SELECT id FROM _gone);
  DELETE FROM public.user_unit_progress WHERE user_id IN (SELECT id FROM _gone);
  DELETE FROM public.notifications  WHERE user_id IN (SELECT id FROM _gone);
  UPDATE public.invite_codes SET used_by = NULL, used_at = NULL WHERE used_by IN (SELECT id FROM _gone);
  UPDATE public.admin_audit_logs SET actor_id = NULL WHERE actor_id IN (SELECT id FROM _gone);
  UPDATE public.ai_dialog_grants SET granted_by = NULL WHERE granted_by IN (SELECT id FROM _gone);

  -- 不是外鍵：手機驗證紀錄
  DELETE FROM public.sms_verifications WHERE phone IN (SELECT phone FROM _gone WHERE phone IS NOT NULL);

  -- 公版使用者（其餘關聯表連帶刪）
  DELETE FROM public.users WHERE id IN (SELECT id FROM _gone);
  GET DIAGNOSTICS n_public = ROW_COUNT;

  -- 私版使用者（conversations、usage_quotas 連帶刪；ai_usage_logs、invite_codes 設 NULL）
  DELETE FROM happy.users
   WHERE coalesce(email,'') NOT IN ('steveweng7@gmail.com','jeff@milkidea.com');
  GET DIAGNOSTICS n_happy = ROW_COUNT;

  -- 登入帳號（identities、sessions 等由 auth 自己連帶刪）
  DELETE FROM auth.users
   WHERE id IN (SELECT id FROM _gone)
      OR coalesce(email,'') NOT IN ('steveweng7@gmail.com','jeff@milkidea.com');
  GET DIAGNOSTICS n_auth = ROW_COUNT;

  IF n_public <> 21 OR n_happy <> 4 THEN
    RAISE EXCEPTION '人數不符（公版 % ／私版 %，預期 21／4），已全部撤銷', n_public, n_happy;
  END IF;

  RAISE NOTICE '✅ 032 完成：公版 %、私版 %、登入帳號 %、付款 % 筆', n_public, n_happy, n_auth, n_pay;
END $$;


-- ── STEP 3（只讀）：跑完確認 ────────────────────────────────────
SELECT
  (SELECT string_agg(email, ', ' ORDER BY email) FROM public.users) AS 公版剩下_應只有Steve與Jeff,
  (SELECT string_agg(email, ', ' ORDER BY email) FROM happy.users)  AS 私版剩下_應只有Steve與Jeff,
  (SELECT string_agg(email, ', ' ORDER BY email) FROM auth.users)   AS 登入帳號剩下_應只有Steve與Jeff;
