-- ============================================================
-- 024_is_email_taken_fn.sql
--
-- Email 撞號檢查改走函式，讓查詢吃得到 idx_users_email_lower。
--
-- 背景：
--   014 建了 `CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email))`，
--   那是一個**函式索引** —— 只有寫成 `lower(email) = ...` 的條件才用得到它。
--
--   nuwa#3 的 lib/user-fields.ts 用 PostgREST 的 .ilike() 做大小寫不敏感比對：
--   語意正確、跳脫也寫對了（% _ \ 都處理），但 `email ILIKE $1` 用不到那個索引，
--   每次存個人資訊都是一次全表掃描。使用者少時無感，會隨帳號數線性變慢。
--
--   PostgREST 沒有辦法在欄位上套 lower()，所以改成呼叫一支 SQL 函式。
--
-- 注意：
--   軟刪除（deleted_at IS NOT NULL）的帳號**照樣算佔用** ——
--   那一列還在，unique index 也還在管它。若之後要允許回收已刪帳號的 email，
--   得先想清楚「回收後原帳號還原怎麼辦」，不是在這裡加個 filter 就好。
--
-- 權限：只給 service_role。
--   這支會回答「這個 email 存不存在」，等於一個帳號枚舉的介面。
--   呼叫端（api/auth/profile、api/manage/users）都走 createAdminClient()，
--   所以不需要開給 anon / authenticated。
--
-- 可重跑：CREATE OR REPLACE，重跑安全。
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_email_taken(
  p_email           TEXT,
  p_exclude_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = lower(p_email)
      AND id <> p_exclude_user_id
  );
$$;

COMMENT ON FUNCTION public.is_email_taken(TEXT, UUID) IS
  '這個 email 是否已被「其他」帳號使用（大小寫不敏感，對齊 idx_users_email_lower）。'
  '給前台個人資訊與後台編輯用戶的撞號檢查用；真正的唯一性保證仍在 unique index。';

REVOKE ALL ON FUNCTION public.is_email_taken(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_taken(TEXT, UUID) TO service_role;


-- ─────────────────────────────────────────────────────────
-- 驗證：跑完貼這段
-- ─────────────────────────────────────────────────────────
-- 期待：已存在的 email 排除自己 → true；排除自己本人 → false
--
-- SELECT
--   public.is_email_taken(
--     (SELECT email FROM public.users ORDER BY created_at LIMIT 1),
--     '00000000-0000-0000-0000-000000000000'::uuid
--   ) AS 應為_true,
--   public.is_email_taken(
--     (SELECT email FROM public.users ORDER BY created_at LIMIT 1),
--     (SELECT id    FROM public.users ORDER BY created_at LIMIT 1)
--   ) AS 應為_false;
