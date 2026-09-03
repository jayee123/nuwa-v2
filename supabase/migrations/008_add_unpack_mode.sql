-- 008: 「我卡住幫我拆」unpack mode
-- Spec: v2/docs/SPEC_STUCK_UNPACK.md §3.1

-- chat_topics 擴充：支援多模式對話
ALTER TABLE chat_topics
  ADD COLUMN mode VARCHAR(20) DEFAULT 'free',
  ADD COLUMN journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL,
  ADD COLUMN day_number INTEGER,
  ADD COLUMN unpack_context JSONB,
  ADD COLUMN ended_at TIMESTAMPTZ;

COMMENT ON COLUMN chat_topics.mode IS 'free: 通用對話（既有）/ unpack: 我卡住幫我拆 / journey: 21 天 journey 對應對話';
COMMENT ON COLUMN chat_topics.unpack_context IS '結構化上下文：relationship_type, partner_role, partner_age, partner_mbti_guess, problem_summary, stage (plain/probe/lead)';
COMMENT ON COLUMN chat_topics.ended_at IS 'unpack session 結束時間（使用者選完成或 7 天未回）';

CREATE INDEX idx_chat_topics_user_mode ON chat_topics(user_id, mode);
CREATE INDEX idx_chat_topics_journey ON chat_topics(journey_id) WHERE journey_id IS NOT NULL;

-- journeys 擴充：支援週期長度（為未來 7×3 預留）
ALTER TABLE journeys
  ADD COLUMN cycle_length INTEGER DEFAULT 21,
  ADD COLUMN total_cycles INTEGER DEFAULT 1;

COMMENT ON COLUMN journeys.cycle_length IS '21 / 14 / 7';
COMMENT ON COLUMN journeys.total_cycles IS '例：cycle_length=7, total_cycles=3 即為 7 天 × 3 週期';

-- 系統參數：feature flags
INSERT INTO system_params (key, value) VALUES
  ('unpack_mode_enabled', 'true'),
  ('unpack_mvp_relationship_types', 'parent_child'),
  ('unpack_max_turns_before_lead', '4')
ON CONFLICT (key) DO NOTHING;
