-- 敏感環境變數（API 金鑰等），僅 service_role 可存取
CREATE TABLE secret_params (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT,
  description VARCHAR(200),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE secret_params ENABLE ROW LEVEL SECURITY;

-- 不建立任何 public policy，只有 service_role 可存取
-- admin client 使用 service_role key，因此後台可讀寫

-- 預設金鑰清單（值留空，由管理者填入）
INSERT INTO secret_params (key, description) VALUES
  ('OPENAI_API_KEY',      'OpenAI API 金鑰（AI 對話功能）'),
  ('ESAFE_MERCHANT_ID',   'esafe 商店代號'),
  ('ESAFE_PASSWORD',      'esafe 商店密碼'),
  ('ESAFE_ENC_KEY',       'esafe AES 加密金鑰'),
  ('ESAFE_ENC_IV',        'esafe AES 初始向量'),
  ('ESAFE_BIND_URL',      'esafe 綁卡 URL'),
  ('ESAFE_PASSCODE_URL',  'esafe Passcode API URL'),
  ('ESAFE_TRANS_URL',     'esafe 扣款 API URL'),
  ('RESEND_API_KEY',      'Resend Email API 金鑰'),
  ('CRON_SECRET',         'Cron Job 驗證密鑰'),
  ('SMS_API_KEY',         '簡訊 API Token（milkidea）'),
  ('SMS_TEST_MODE',       '簡訊測試模式（1=固定碼1234, 0=正式發送）')
ON CONFLICT (key) DO NOTHING;
