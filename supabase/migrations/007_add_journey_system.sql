-- 21 天練習旅程
CREATE TABLE journeys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  service_id        UUID REFERENCES services(id),
  mbti_self         VARCHAR(4),
  mbti_partner      VARCHAR(4),
  mbti_confidence   VARCHAR(20) DEFAULT 'guess',
  partner_nickname  VARCHAR(50) DEFAULT '對方',
  relationship_type VARCHAR(20) DEFAULT 'couple',  -- couple / parent_child / workplace
  goal_statement    TEXT,
  start_date        DATE DEFAULT CURRENT_DATE,
  current_day       INTEGER DEFAULT 1,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journeys_user ON journeys(user_id);

-- 每日完成紀錄
CREATE TABLE daily_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID REFERENCES journeys(id) ON DELETE CASCADE,
  day_number      INTEGER NOT NULL,
  date            DATE DEFAULT CURRENT_DATE,
  task_completed  BOOLEAN DEFAULT FALSE,
  emotion_score   INTEGER,
  journal_text    TEXT,
  points_earned   INTEGER DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journey_id, day_number)
);

-- AI 每日記憶摘要
CREATE TABLE daily_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id      UUID REFERENCES journeys(id) ON DELETE CASCADE,
  day_number      INTEGER NOT NULL,
  emotion_note    TEXT,
  task_result     TEXT,
  partner_obs     TEXT,
  key_insight     TEXT,
  follow_up       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journey_id, day_number)
);

-- RLS
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journeys_own" ON journeys FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "daily_records_own" ON daily_records FOR ALL
  USING (journey_id IN (SELECT id FROM journeys WHERE user_id = auth.uid()));
CREATE POLICY "daily_memories_own" ON daily_memories FOR ALL
  USING (journey_id IN (SELECT id FROM journeys WHERE user_id = auth.uid()));

-- updated_at trigger
CREATE TRIGGER journeys_updated_at BEFORE UPDATE ON journeys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
