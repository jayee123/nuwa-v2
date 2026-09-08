-- 026: 註冊邀請碼門檻開關（封測動線測試回報・發現 01/03）
--
-- 邀請碼的用途是「點 internal App 時兌換」（migration 025），不是註冊門檻。
-- 註冊也收碼會跟兌換頁搶同一組碼：受邀者的碼在註冊被吃掉，到 App 門口就沒了。
-- 因此註冊門檻改為系統設定，預設 false（不要求）；
-- 程式端讀不到此列時也視為 false（lib/system-params.ts fail open）。
--
-- 這一列 seed 進 system_params 後，會直接出現在後台「系統設定 → 一般參數」可編輯。

INSERT INTO system_params (key, value, updated_at)
VALUES ('register_require_invite', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- 驗證：
-- SELECT * FROM system_params WHERE key = 'register_require_invite';  -- 應有 1 列，value 'false'
