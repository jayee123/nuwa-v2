-- ============================================================
-- 031_purge_pre_june_test_billing.sql —— 一次性清除 6/1 以前的封測訂閱與付款
--
-- 決定：Steve 2026-09-30（nuwa-docs BILLING-PAYMENT.md 缺陷 3「一次性例外」）
--   · 對象是 Steve 的封測學員，已口頭告知封測；5/26 LINE 預告過自動扣款
--   · 從未產生成功交易：四次月扣都沒展延 ends_at；gateway_transactions 0 筆
--   · 服務已停止
-- ⚠️ 這是 B 案（一起刪）的一次性例外，不是常規做法。常規仍是 A 案「保留但收掉」。
--
-- 範圍：
--   · subscriptions：ends_at 在 2026-06-02 以前的全部（預期 19 筆：17 active + 2 superseded）
--   · payments：created_at 在 2026-06-01 以前的全部（預期 44 筆；9/10 那筆 pending 不動）
--   · users：上述訂閱的主人若刪完後沒有任何 active 訂閱 → 方案退回 free
--     （不退的話，日後還原軟刪除帳號會回來一個「沒有訂閱的旗艦」，Steve 自己的帳號也是）
--
-- 必須在 2026-10-01 00:00 UTC（台灣 08:00）月扣 cron 之前跑完，
-- 否則 cron 會拿這批舊卡去紅陽測試環境扣款、寫進新資料。
--
-- 執行方式：Jeff 在 Supabase SQL Editor 分段跑。
--   STEP 1 只讀 → 數字符合預期才跑 STEP 2 → STEP 3 確認
--
-- 執行紀錄：Jeff 2026-09-30 22:30 UTC（cron 前 1.5 小時）在正式專案執行。
--   STEP 3 回 0／0／0／1；複查剩 payments 1 筆（9/10 pending）、subscriptions 0、
--   users premium 1（已軟刪除、本來就沒訂閱）／free 21。
-- ============================================================


-- ── STEP 1（只讀）：確認筆數與外鍵 ─────────────────────────────
SELECT
  (SELECT count(*) FROM public.subscriptions WHERE ends_at < '2026-06-02') AS 待刪訂閱_預期19,
  (SELECT count(*) FROM public.subscriptions WHERE ends_at >= '2026-06-02') AS 保留訂閱,
  (SELECT count(*) FROM public.payments WHERE created_at < '2026-06-01') AS 待刪付款_預期44,
  (SELECT count(*) FROM public.payments WHERE created_at >= '2026-06-01') AS 保留付款,
  (SELECT count(*) FROM public.gateway_transactions) AS 帳務表_預期0;

-- 有沒有別的表指向 payments / subscriptions（有的話 STEP 2 會被擋，先回報）
SELECT conrelid::regclass AS 參照表, conname AS 外鍵, confrelid::regclass AS 被參照
  FROM pg_constraint
 WHERE contype = 'f'
   AND confrelid IN ('public.payments'::regclass, 'public.subscriptions'::regclass);


-- ── STEP 2（寫入）：整段一次執行 ─────────────────────────────────
-- 筆數不是 19／44 就 RAISE EXCEPTION，整段自動撤銷、什麼都不會改。
DO $$
DECLARE
  n_subs int;
  n_pays int;
  n_users int;
BEGIN
  CREATE TEMP TABLE _purge_users ON COMMIT DROP AS
    SELECT DISTINCT user_id FROM public.subscriptions WHERE ends_at < '2026-06-02';

  DELETE FROM public.subscriptions WHERE ends_at < '2026-06-02';
  GET DIAGNOSTICS n_subs = ROW_COUNT;

  DELETE FROM public.payments WHERE created_at < '2026-06-01';
  GET DIAGNOSTICS n_pays = ROW_COUNT;

  IF n_subs <> 19 OR n_pays <> 44 THEN
    RAISE EXCEPTION '筆數不符（訂閱 % / 付款 %，預期 19 / 44），已全部撤銷', n_subs, n_pays;
  END IF;

  UPDATE public.users u
     SET current_plan = 'free', dialog_limit = 0, next_plan = NULL, plan_deadline = NULL
   WHERE u.id IN (SELECT user_id FROM _purge_users)
     AND NOT EXISTS (SELECT 1 FROM public.subscriptions s
                      WHERE s.user_id = u.id AND s.status = 'active');
  GET DIAGNOSTICS n_users = ROW_COUNT;

  RAISE NOTICE '✅ 031 完成：刪訂閱 %、刪付款 %、方案退回 free %', n_subs, n_pays, n_users;
END $$;


-- ── STEP 3（只讀）：跑完確認 ────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.subscriptions WHERE ends_at < '2026-06-02') AS 剩餘舊訂閱_應0,
  (SELECT count(*) FROM public.payments WHERE created_at < '2026-06-01') AS 剩餘舊付款_應0,
  (SELECT count(*) FROM public.subscriptions
    WHERE status = 'active' AND ends_at <= now()) AS 月扣會掃到的_應0,
  (SELECT count(*) FROM public.users u
    WHERE u.current_plan <> 'free'
      AND NOT EXISTS (SELECT 1 FROM public.subscriptions s
                       WHERE s.user_id = u.id AND s.status = 'active')) AS 付費方案但無訂閱的人;
