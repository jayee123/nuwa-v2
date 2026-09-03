-- 014: P1 多模式登入 — email 成為可登入身分（必填 + 唯一）、phone 放寬為可空
--
-- 背景：原本 phone 是主要身分（UNIQUE NOT NULL）、email 可空。改為支援「手機 / Email」兩種登入，
--       email 需唯一且必填（電子發票也要）；email-only / 未來 OAuth-only 用戶可能沒手機，故 phone 放寬。
-- 前置：已確認 users 全部有 email 且唯一（total=has_email=distinct_email=18），此遷移安全。

-- email：唯一（case-insensitive）+ 必填
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- phone：放寬為可空（Postgres 的 UNIQUE 允許多個 NULL，原 UNIQUE 仍保留）
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
