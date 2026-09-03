-- 020: users 軟刪除（soft delete）— 用「隱藏」取代硬刪
--
-- 背景：客戶要求刪除所有一般用戶（role='user'）。直接 DELETE 會踩三個地雷：
--   1. FK 阻擋：registrations / subscriptions / payments / chat_topics /
--      ai_token_usage / user_unit_progress / notifications / invite_codes.used_by /
--      admin_audit_logs.actor_id 皆無 ON DELETE CASCADE。
--      其中 payments / subscriptions 是金流帳務紀錄，刪除等於銷毀對帳依據。
--   2. 幽靈帳號：public.users.id 與 auth.users.id 是「手動同 id」而非 FK
--      （register/actions.ts:86,103）。只刪 profile 的話，人還登得進來但抓不到資料。
--   3. 私版孤兒：happy.users.nuwa_user_id 指向本表 id 且無 FK。公版 id 消失後，
--      那些人下次 SSO 進來會走 email 比對或重新建號，資料錯亂。
--
-- 因此改為軟刪除：資料完整保留、後台看不到、隨時可還原。
--
-- 可重跑：使用 IF NOT EXISTS，重跑安全。

-- ① 軟刪除欄位（NULL = 正常用戶）
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.deleted_at IS
  '軟刪除時間；NULL = 正常。後台列表 / 通知發送一律過濾 deleted_at IS NULL。';

-- ② 部分索引：只索引未刪除的列，讓 deleted_at IS NULL 的過濾走索引
CREATE INDEX IF NOT EXISTS idx_users_active
  ON public.users (created_at DESC)
  WHERE deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════
-- ⚠️ 以下為「資料操作」，不隨 schema migration 自動執行。
--    請先跑 STEP 1 確認筆數，確認無誤後再手動執行 STEP 2。
-- ═══════════════════════════════════════════════════════════════

-- STEP 1（只讀）：確認會影響幾筆，以及這些人身上有多少不可刪的紀錄
--
-- SELECT
--   (SELECT count(*) FROM public.users WHERE role = 'user' AND deleted_at IS NULL) AS 待隱藏用戶,
--   (SELECT count(*) FROM public.payments  p JOIN public.users u ON u.id = p.user_id
--     WHERE u.role = 'user') AS 相關付款紀錄,
--   (SELECT count(*) FROM public.registrations r JOIN public.users u ON u.id = r.user_id
--     WHERE u.role = 'user') AS 相關報名紀錄;

-- STEP 2（寫入）：標記隱藏
--
-- UPDATE public.users
-- SET deleted_at = NOW(), updated_at = NOW()
-- WHERE role = 'user' AND deleted_at IS NULL;

-- STEP 3（擋登入，跑完 STEP 2 之後）：
--   app 層守門已在 code 內完成（login/actions.ts、forgot-password/actions.ts、
--   api/apps/[slug]/launch/route.ts）。auth.users 端的停用請跑：
--
--   npx tsx --env-file=.env.local scripts/ban-soft-deleted-users.ts --dry-run
--   npx tsx --env-file=.env.local scripts/ban-soft-deleted-users.ts

-- ═══ 還原（誤操作時）— 順序不可顛倒 ═══
--
-- 先解除 auth 停用（腳本靠 deleted_at IS NOT NULL 找人，所以要趁還沒清掉時跑）：
--   npx tsx --env-file=.env.local scripts/ban-soft-deleted-users.ts --unban
--
-- 再清掉軟刪除標記：
--   UPDATE public.users SET deleted_at = NULL, updated_at = NOW()
--   WHERE role = 'user' AND deleted_at IS NOT NULL;
