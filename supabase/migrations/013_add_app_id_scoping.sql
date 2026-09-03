-- 013: PR3 — 金流/用量上移 Market，交易與用量帶 app_id（各 App 後台只看自己學員）
--
-- 背景：Market（public schema）集中承載金流與 AI 用量；每筆 payment/subscription/
--       token 用量/對話都標上所屬 App，讓 per-App 管理者（app_admins）只看到自己 App 的資料。
-- 對應關係：apps.slug == services.code（例如 'happy'）。純 Market 課程無對應 App → app_id 為 NULL。

-- 1) 四張表加 app_id（nullable FK；純 Market 資料留 NULL）
ALTER TABLE payments       ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES apps(id);
ALTER TABLE subscriptions  ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES apps(id);
ALTER TABLE ai_token_usage ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES apps(id);
ALTER TABLE chat_topics    ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES apps(id);

-- 2) 回填既有資料：service.code = apps.slug
UPDATE payments p SET app_id = a.id
  FROM services s JOIN apps a ON a.slug = s.code
  WHERE p.service_id = s.id AND p.app_id IS NULL;

UPDATE subscriptions sub SET app_id = a.id
  FROM services s JOIN apps a ON a.slug = s.code
  WHERE sub.service_id = s.id AND sub.app_id IS NULL;

UPDATE ai_token_usage u SET app_id = a.id
  FROM services s JOIN apps a ON a.slug = s.code
  WHERE u.service_id = s.id AND u.app_id IS NULL;

-- chat_topics 沒有 service_id，經 teacher → service → app 回填
UPDATE chat_topics ct SET app_id = a.id
  FROM teachers t JOIN services s ON s.id = t.service_id JOIN apps a ON a.slug = s.code
  WHERE ct.teacher_id = t.id AND ct.app_id IS NULL;

-- 3) 索引（後台一律以 app_id 過濾）
CREATE INDEX IF NOT EXISTS idx_payments_app      ON payments(app_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_app ON subscriptions(app_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_app      ON ai_token_usage(app_id);
CREATE INDEX IF NOT EXISTS idx_chat_topics_app   ON chat_topics(app_id);

-- 4) 自動帶入 app_id 的 trigger：insert 時若 app_id 為空，從 service_id 推導
--    （集中在 DB 層，寫入端不必逐處手動帶 app_id；與 updated_at trigger 同類做法）
CREATE OR REPLACE FUNCTION set_app_id_from_service() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.app_id IS NULL AND NEW.service_id IS NOT NULL THEN
    SELECT a.id INTO NEW.app_id
      FROM apps a JOIN services s ON s.code = a.slug
      WHERE s.id = NEW.service_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- chat_topics 走 teacher_id → service → app
CREATE OR REPLACE FUNCTION set_app_id_from_teacher() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.app_id IS NULL AND NEW.teacher_id IS NOT NULL THEN
    SELECT a.id INTO NEW.app_id
      FROM apps a
      JOIN services s ON s.code = a.slug
      JOIN teachers t ON t.service_id = s.id
      WHERE t.id = NEW.teacher_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_app_id      ON payments;
DROP TRIGGER IF EXISTS trg_subscriptions_app_id ON subscriptions;
DROP TRIGGER IF EXISTS trg_ai_usage_app_id      ON ai_token_usage;
DROP TRIGGER IF EXISTS trg_chat_topics_app_id   ON chat_topics;

CREATE TRIGGER trg_payments_app_id      BEFORE INSERT ON payments       FOR EACH ROW EXECUTE FUNCTION set_app_id_from_service();
CREATE TRIGGER trg_subscriptions_app_id BEFORE INSERT ON subscriptions  FOR EACH ROW EXECUTE FUNCTION set_app_id_from_service();
CREATE TRIGGER trg_ai_usage_app_id      BEFORE INSERT ON ai_token_usage FOR EACH ROW EXECUTE FUNCTION set_app_id_from_service();
CREATE TRIGGER trg_chat_topics_app_id   BEFORE INSERT ON chat_topics    FOR EACH ROW EXECUTE FUNCTION set_app_id_from_teacher();
