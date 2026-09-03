-- 010: MBTI 深度檔案 + 盲點偵測
-- P1-1: MBTI Profiles Table
-- P1-2: Blindspot Detection Tables

-- MBTI 深度檔案（16 型）
CREATE TABLE mbti_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mbti_type VARCHAR(4) UNIQUE NOT NULL,
  temperament VARCHAR(20),
  core_tagline TEXT,
  blindspot TEXT,
  desire TEXT,
  landmine TEXT,
  unlock TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mbti_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mbti_profiles_read" ON mbti_profiles FOR SELECT USING (true);

INSERT INTO mbti_profiles (mbti_type, temperament, core_tagline, blindspot, desire, landmine, unlock) VALUES
  ('ISTJ', 'SJ 守護者', '穩定負責，默默承擔', '忽略情感層次，只看事實', '被尊重、被認可付出', '被質疑能力或承諾', '給具體行動方案，不只講感覺'),
  ('ISFJ', 'SJ 守護者', '溫暖體貼，默默付出', '壓抑自己需求，過度犧牲', '被感謝、被看見付出', '被忽略或被當作理所當然', '主動說出你的感謝，具體描述他做了什麼'),
  ('INFJ', 'NF 理想者', '深度洞察，追求意義', '過度解讀他人意圖', '被深度理解', '被當作「想太多」', '先聽完再回應，認真對待他的感受'),
  ('INTJ', 'NT 理性者', '策略思維，追求效率', '忽略他人感受，過度理性', '被尊重智慧和判斷', '被質疑邏輯或被情緒勒索', '用事實和邏輯溝通，不用情緒施壓'),
  ('ISTP', 'SP 冒險者', '冷靜務實，動手解決', '不擅表達情感', '被給予空間和自由', '被黏住或被要求表態', '給他空間，用行動而非言語靠近'),
  ('ISFP', 'SP 冒險者', '溫柔敏感，重視和諧', '逃避衝突，不敢表達不滿', '被接納真實的自己', '被批判價值觀或品味', '接納他的感受，不急著給建議'),
  ('INFP', 'NF 理想者', '理想主義，重視真誠', '過度理想化關係', '被真誠理解和接納', '被否定感受或被說「太敏感」', '先懂他的感受，再給務實建議'),
  ('INTP', 'NT 理性者', '邏輯分析，追求真理', '忽略情感需求，活在腦中', '被理解思考方式', '被要求「正常一點」或「別想那麼多」', '對他的想法表示好奇，給他思考時間'),
  ('ESTP', 'SP 冒險者', '行動派，活在當下', '衝動決策，忽略長期影響', '被欣賞和被認可能力', '被限制自由或被說教', '跟他一起做，比跟他講道理有效'),
  ('ESFP', 'SP 冒險者', '熱情開朗，享受生活', '逃避負面情緒和嚴肅話題', '被喜歡、被開心對待', '被否定或被冷落', '用輕鬆的方式談嚴肅的事'),
  ('ENFP', 'NF 理想者', '熱情創意，充滿可能', '承諾太多，難以堅持', '被支持夢想和想法', '被潑冷水或被說「不切實際」', '先接住他的想法，再一起想怎麼落地'),
  ('ENTP', 'NT 理性者', '辯論高手，挑戰常規', '爭辯時傷人不自知', '被視為有趣和聰明', '被控制或被要求服從', '跟他辯論但不攻擊人格'),
  ('ESTJ', 'SJ 守護者', '組織能力強，重視規則', '過度控制，忽略他人感受', '被尊重權威和付出', '被質疑決策或不被信任', '先肯定他的付出，再提不同想法'),
  ('ESFJ', 'SJ 守護者', '熱心助人，重視和諧', '過度在意他人評價', '被需要、被感謝', '被拒絕或被說「管太多」', '具體說出你需要他的地方'),
  ('ENFJ', 'NF 理想者', '天生領袖，關懷他人', '犧牲自己成全他人', '被認可影響力', '被忽視或被說「太愛管」', '讓他知道他的關心有被收到'),
  ('ENTJ', 'NT 理性者', '決策果斷，追求卓越', '過度強勢，不容質疑', '被尊重能力和遠見', '被挑戰權威或被情緒化對待', '用數據和邏輯說服，不用情緒對抗');

-- 盲點定義（B1-B5）
CREATE TABLE blindspot_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  definition TEXT NOT NULL,
  typical_phrases TEXT[] DEFAULT '{}',
  remediation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE blindspot_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blindspot_taxonomy_read" ON blindspot_taxonomy FOR SELECT USING (true);

INSERT INTO blindspot_taxonomy (code, name, definition, typical_phrases, remediation) VALUES
  ('B1', '猴子給香蕉', '用自己想要的方式愛對方，而非對方需要的方式', ARRAY['我都是為你好','我已經夠努力了','我做這麼多你還不滿意'], '先問對方：你現在需要什麼？而不是假設你知道'),
  ('B2', '假性同理', '表面說「我懂」但實際在等對方說完好給建議', ARRAY['我懂我懂，但是你應該','我理解，不過你有沒有想過','好啦好啦我知道了'], '試著複述對方的感受，不加「但是」'),
  ('B3', '評斷偽裝成觀察', '以為自己在描述事實，實際在下判斷', ARRAY['你每次都這樣','你就是不在乎','你根本沒在聽'], '把「你每次都」換成「我注意到這次你」'),
  ('B4', '歸因外部', '把問題歸咎於對方或環境，不看自己的部分', ARRAY['都是因為你','如果你不那樣我就不會','環境逼我的'], '試著問自己：在這件事裡，我的部分是什麼？'),
  ('B5', '急於解決', '跳過情緒直接給方案，讓對方覺得不被聽見', ARRAY['你就這樣做就好了','很簡單啊你只要','解決方法就是'], '先說「聽起來你很不好受」，等對方說完再提方案');

-- 盲點偵測記錄
CREATE TABLE blindspot_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL,
  blindspot_code VARCHAR(10) REFERENCES blindspot_taxonomy(code),
  trigger_snippet TEXT,
  ai_feedback TEXT,
  day_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blindspot_records_user ON blindspot_records(user_id);
ALTER TABLE blindspot_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blindspot_records_own" ON blindspot_records FOR ALL USING (auth.uid() = user_id);
