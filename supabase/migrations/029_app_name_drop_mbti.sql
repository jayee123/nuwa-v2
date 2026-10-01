-- 029: App 名稱拿掉 MBTI —— 商標風險
--
-- 背景：MBTI 是 The Myers-Briggs Company 的註冊商標。
--   放在說明文字裡描述方法（「透過 MBTI 人格分析…」）風險較低，
--   但接在產品名前面當成 App / 課程名稱，就是把它當品牌名用 ——
--   那是商標最忌諱的用法。（Jeff 2026-09-24 拍板；Steve 同方向）
--
-- 範圍原則：**只改「當名稱用」的地方，不動「描述方法」的地方。**
--   全站約 60 處 MBTI（人格類型欄位、AI prompt、16 型檔案、表單標籤、
--   MBTI_REGEX 等）都是功能性用途，一律保留。
--
-- 本檔只處理資料；程式碼那一處（about/page.tsx 的沿革文字）隨 commit 上線。
--
-- ⚠️ 歷史通知刻意不改：`notifications` 有 34 筆 subscription_expiring 的內容
--    含「MBTI 幸福關係」。那些是**已經送到使用者面前的歷史紀錄**，改掉等於
--    竄改過去發生的事。改掉來源（services.name）之後，新產生的通知就會是新名稱
--    —— notify-expiring 是用 `services(name)` 組字串的，不是寫死。
--    若法務認為留著舊紀錄仍構成曝險，再另開一個 migration 處理，並在此註記理由。

BEGIN;

-- ── (1) services.name —— 根源 ────────────────────────────────
-- 這筆是所有下游顯示的來源：
--   · 首頁 App 卡片（page.tsx 的 `svc?.name ?? app.name`）
--   · 訂閱到期通知與 email（api/subscription/notify-expiring 讀 services(name)）
-- 改這一筆，上述全部跟著變。
UPDATE services
   SET name = '幸福關係', updated_at = NOW()
 WHERE code = 'happy'
   AND name = 'MBTI 幸福關係';

-- ── (2) courses.title ───────────────────────────────────────
-- 兩筆同名（一筆 service_id 為 null 的孤兒、一筆掛在 happy 底下）。
-- 用 LIKE 而不是等值比對，避免其中一筆有看不見的空白差異而漏改。
UPDATE courses
   SET title = REPLACE(title, 'MBTI 幸福關係', '幸福關係')
 WHERE title LIKE '%MBTI 幸福關係%';

COMMIT;

-- ── 驗證（跑完後手動執行）──────────────────────────────────────
-- 1. 名稱已改，且沒有漏網的：
--    SELECT code, name FROM services WHERE code = 'happy';
--      → 應為 '幸福關係'
--    SELECT id, title FROM courses WHERE title LIKE '%MBTI%';
--      → 應為 0 列
--
-- 2. apps.name 本來就對，確認沒被動到：
--    SELECT slug, name FROM apps WHERE slug = 'happy';
--      → 應仍為 '幸福關係'
--
-- 3. 歷史通知應該**原封不動**（這是刻意的，不是漏改）：
--    SELECT COUNT(*) FROM notifications WHERE content LIKE '%MBTI 幸福關係%';
--      → 應仍為 34
--
-- 4. 功能性用途未受影響（描述方法的文字保留）：
--    SELECT COUNT(*) FROM mbti_profiles;   -- 16 型檔案應原封不動
