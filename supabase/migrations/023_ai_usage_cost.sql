-- 023: ai_token_usage 補成本欄位 + 歸戶查詢索引
--
-- 背景：跨 App 用量歸戶 —— 公版以「一個會員」為單位，彙總他在各 App 的
-- token 用量與成本。app_id 在 013 已經加好，/manage/ai-usage 也已按 App 分權限，
-- 缺的是（1）成本欄位（2）私版回寫（見 nexthappy src/lib/market/usage.ts）。
--
-- 可重跑：ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。

-- ① 成本（TWD）。私版每次 AI 呼叫都算得出真實成本，公版原本只存 tokens。
--    NULL = 舊資料或公版自身呼叫尚未回填成本。
ALTER TABLE public.ai_token_usage
  ADD COLUMN IF NOT EXISTS cost_twd NUMERIC(10, 4);

COMMENT ON COLUMN public.ai_token_usage.cost_twd IS
  '該次 AI 呼叫的估算成本（TWD）。私版回寫時帶入；公版自身呼叫目前為 NULL。';

-- ② 歸戶統計的查詢路徑：以會員為單位、跨 App 彙總
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_user_date
  ON public.ai_token_usage (user_id, date DESC);

-- ③ 單一 App 的用量檢視（各 App 後台只看自己學員）
CREATE INDEX IF NOT EXISTS idx_ai_token_usage_app_date
  ON public.ai_token_usage (app_id, date DESC);

-- ═══════════════════════════════════════════════════════════════
-- 驗證（跑完後可執行）
-- ═══════════════════════════════════════════════════════════════
--
-- 歸戶統計：每位會員在各 App 的用量與成本
--
-- SELECT u.nickname, u.email, a.name AS app_name,
--        sum(t.tokens_used) AS tokens, sum(t.cost_twd) AS cost_twd,
--        count(*) AS calls, max(t.date) AS last_used
-- FROM public.ai_token_usage t
-- JOIN public.users u ON u.id = t.user_id
-- LEFT JOIN public.apps a ON a.id = t.app_id
-- GROUP BY u.nickname, u.email, a.name
-- ORDER BY tokens DESC;
