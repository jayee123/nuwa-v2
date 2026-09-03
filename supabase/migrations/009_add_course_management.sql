-- 009: 21 天課程後台管理 — 課程內容從 JSON 遷移到 DB
-- 對齊 Steven v3 的 course_content 表設計

-- 課程模板（可以有多套課程）
CREATE TABLE course_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  total_days      INTEGER DEFAULT 21,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 每日課程內容
CREATE TABLE course_days (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           UUID REFERENCES course_templates(id) ON DELETE CASCADE,
  day_number            INTEGER NOT NULL,

  -- 基本資訊
  title                 VARCHAR(200) NOT NULL,
  theme                 VARCHAR(200),
  course_unit           VARCHAR(50),

  -- AI 教學用內容
  knowledge_point       TEXT,
  today_task            TEXT,
  core_tip              TEXT,

  -- 互動內容（JSONB 陣列）
  objectives            JSONB DEFAULT '[]',
  actions               JSONB DEFAULT '[]',
  reflection_questions  JSONB DEFAULT '[]',
  evening_questions     JSONB DEFAULT '[]',

  -- MBTI 整合
  mbti_cognitive_fns    JSONB,

  -- 關係類型變體提示
  variation_couple      TEXT,
  variation_parent      TEXT,
  variation_workplace   TEXT,

  -- 進階控制
  special_content       JSONB,
  ai_prompt_extra       TEXT,

  sort_order            INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, day_number)
);

CREATE INDEX idx_course_days_template ON course_days(template_id, day_number);

-- RLS
ALTER TABLE course_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_days ENABLE ROW LEVEL SECURITY;

-- 管理員可讀寫，一般用戶可讀
CREATE POLICY "course_templates_read" ON course_templates FOR SELECT USING (true);
CREATE POLICY "course_days_read" ON course_days FOR SELECT USING (true);

-- updated_at trigger
CREATE TRIGGER course_templates_updated_at BEFORE UPDATE ON course_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER course_days_updated_at BEFORE UPDATE ON course_days FOR EACH ROW EXECUTE FUNCTION update_updated_at();
