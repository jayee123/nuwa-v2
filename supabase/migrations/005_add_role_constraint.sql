-- 擴展 role 欄位支援 superadmin
-- 原本: 'user' / 'admin'
-- 新增: 'superadmin'（系統管理員，登入需 OTP 二次驗證）

ALTER TABLE users
  ADD CONSTRAINT check_valid_role
  CHECK (role IN ('user', 'admin', 'superadmin'));
