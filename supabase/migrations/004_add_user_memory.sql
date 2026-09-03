-- User Memory: AI 自動摘要的長期記憶
CREATE TABLE user_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  category        VARCHAR(50) NOT NULL,  -- personality / preference / relationship / goal / event
  content         TEXT NOT NULL,
  source_topic_id UUID REFERENCES chat_topics(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_memory_user ON user_memory(user_id);
CREATE INDEX idx_user_memory_category ON user_memory(user_id, category);

-- RLS: 用戶只能讀自己的記憶，寫入由 service_role 處理
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_memory_select_own"
  ON user_memory FOR SELECT
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE TRIGGER user_memory_updated_at
  BEFORE UPDATE ON user_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
