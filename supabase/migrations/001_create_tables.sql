-- NUWA V2 Database Schema
-- Based on NUWA_V2_SPEC.md

-- 3.1 使用者
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(20) UNIQUE NOT NULL,
  email         VARCHAR(255),
  nickname      VARCHAR(100),
  gender        SMALLINT,
  birthday      DATE,
  avatar_url    TEXT,
  current_plan  VARCHAR(50) DEFAULT 'free',
  next_plan     VARCHAR(50),
  plan_deadline TIMESTAMPTZ,
  dialog_limit  INTEGER DEFAULT 0,
  calendar_expires_at    TIMESTAMPTZ,
  arrangement_expires_at TIMESTAMPTZ,
  affiliate_id  VARCHAR(50),
  role          VARCHAR(20) DEFAULT 'user',  -- user / admin
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 服務/課程設定
CREATE TABLE services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  welcome_msg   TEXT,
  banner_url    TEXT,
  plans         JSONB NOT NULL DEFAULT '[]',
  is_active     BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3.3 教師/家教
CREATE TABLE teachers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    UUID REFERENCES services(id),
  name          VARCHAR(100) NOT NULL,
  avatar_url    TEXT,
  system_prompt TEXT,
  welcome_msg   TEXT,
  knowledge_url TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 線上課程結構
CREATE TABLE courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    UUID REFERENCES services(id),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subjects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID REFERENCES courses(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id    UUID REFERENCES subjects(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  content_url   TEXT,
  sort_order    INTEGER DEFAULT 0
);

-- 3.5 實體課程
CREATE TABLE physical_courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code    VARCHAR(50),
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  price           INTEGER NOT NULL,
  location        TEXT,
  course_code     VARCHAR(50),
  notice          TEXT,
  points_reward   INTEGER DEFAULT 0,
  reg_start       TIMESTAMPTZ,
  reg_end         TIMESTAMPTZ,
  class_start     TIMESTAMPTZ,
  class_end       TIMESTAMPTZ,
  status          VARCHAR(20) DEFAULT 'planned',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3.6 課程報名
CREATE TABLE registrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id),
  physical_course_id  UUID REFERENCES physical_courses(id),
  email               VARCHAR(255),
  status              VARCHAR(20) DEFAULT 'registered',
  reminder_sent       BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3.7 訂閱記錄
CREATE TABLE subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  service_id    UUID REFERENCES services(id),
  plan_name     VARCHAR(50) NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3.8 付款記錄
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  service_id      UUID REFERENCES services(id),
  amount          INTEGER NOT NULL,
  plan_name       VARCHAR(50),
  payment_uid     VARCHAR(100),
  token_data      TEXT,
  status          VARCHAR(20) DEFAULT 'pending',
  affiliate_id    VARCHAR(50),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3.9 AI 對話
CREATE TABLE chat_topics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  teacher_id    UUID REFERENCES teachers(id),
  course_id     UUID REFERENCES courses(id),
  title         VARCHAR(200) DEFAULT '新對話',
  is_pinned     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id      UUID REFERENCES chat_topics(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL,
  content       TEXT NOT NULL,
  token_count   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3.10 AI Token 使用量
CREATE TABLE ai_token_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  teacher_id    UUID REFERENCES teachers(id),
  service_id    UUID REFERENCES services(id),
  tokens_used   INTEGER DEFAULT 0,
  date          DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3.11 SMS 驗證
CREATE TABLE sms_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(20) NOT NULL,
  code          VARCHAR(10) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  verified      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3.12 系統參數
CREATE TABLE system_params (
  key           VARCHAR(100) PRIMARY KEY,
  value         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Additional tables from DEV_PLAN

-- 影片觀看進度
CREATE TABLE user_unit_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  unit_id       UUID REFERENCES units(id),
  progress_pct  INTEGER DEFAULT 0,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, unit_id)
);

-- 站內通知
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  type          VARCHAR(50) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  content       TEXT,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- updated_at 自動更新 trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER teachers_updated_at BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER physical_courses_updated_at BEFORE UPDATE ON physical_courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER chat_topics_updated_at BEFORE UPDATE ON chat_topics FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_unit_progress_updated_at BEFORE UPDATE ON user_unit_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();
