-- NUWA V2 — Row Level Security Policies
-- Only affects V2 Supabase DB (completely separate from V1 MySQL)

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_unit_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- users: 用戶只能讀寫自己的資料
-- ============================================================

CREATE POLICY "users_select_own"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- INSERT 由 server action (service_role) 處理，不開放 anon/authenticated 直接 insert

-- ============================================================
-- services / teachers / courses / subjects / units: 公開可讀
-- ============================================================

CREATE POLICY "services_public_read"
  ON services FOR SELECT
  USING (true);

CREATE POLICY "teachers_public_read"
  ON teachers FOR SELECT
  USING (true);

CREATE POLICY "courses_public_read"
  ON courses FOR SELECT
  USING (true);

CREATE POLICY "subjects_public_read"
  ON subjects FOR SELECT
  USING (true);

CREATE POLICY "units_public_read"
  ON units FOR SELECT
  USING (true);

-- ============================================================
-- physical_courses: 公開可讀
-- ============================================================

CREATE POLICY "physical_courses_public_read"
  ON physical_courses FOR SELECT
  USING (true);

-- ============================================================
-- registrations: 用戶只能讀寫自己的報名
-- ============================================================

CREATE POLICY "registrations_select_own"
  ON registrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "registrations_insert_own"
  ON registrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- subscriptions: 用戶只能讀自己的訂閱
-- ============================================================

CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE 由 server action (service_role) 處理

-- ============================================================
-- payments: 用戶只能讀自己的付款紀錄
-- ============================================================

CREATE POLICY "payments_select_own"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE 由 payment callback (service_role) 處理

-- ============================================================
-- chat_topics: 用戶只能存取自己的對話主題
-- ============================================================

CREATE POLICY "chat_topics_select_own"
  ON chat_topics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "chat_topics_insert_own"
  ON chat_topics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_topics_update_own"
  ON chat_topics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_topics_delete_own"
  ON chat_topics FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- chat_messages: 透過 topic 的 user_id 間接判斷
-- ============================================================

CREATE POLICY "chat_messages_select_own"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_topics
      WHERE chat_topics.id = chat_messages.topic_id
        AND chat_topics.user_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert_own"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_topics
      WHERE chat_topics.id = chat_messages.topic_id
        AND chat_topics.user_id = auth.uid()
    )
  );

-- ============================================================
-- ai_token_usage: 用戶只能讀自己的用量
-- ============================================================

CREATE POLICY "ai_token_usage_select_own"
  ON ai_token_usage FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT 由 server action (service_role) 處理

-- ============================================================
-- sms_verifications: 僅 service_role 可存取（前端不可直接操作）
-- 不建立任何 policy = 所有 anon/authenticated 請求都被拒絕
-- ============================================================

-- (no policies — only service_role bypasses RLS)

-- ============================================================
-- system_params: 公開可讀
-- ============================================================

CREATE POLICY "system_params_public_read"
  ON system_params FOR SELECT
  USING (true);

-- UPDATE 由 admin (service_role) 處理

-- ============================================================
-- user_unit_progress: 用戶只能讀寫自己的進度
-- ============================================================

CREATE POLICY "user_unit_progress_select_own"
  ON user_unit_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_unit_progress_upsert_own"
  ON user_unit_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_unit_progress_update_own"
  ON user_unit_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- notifications: 用戶只能讀自己的通知
-- ============================================================

CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- INSERT 由 server action (service_role) 處理
