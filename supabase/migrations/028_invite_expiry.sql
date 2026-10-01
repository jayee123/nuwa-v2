-- 028: 邀請碼兌換補上到期檢查
--
-- 事故：2026-09-21 封測回報（測試帳號 李淑枝）—— EXPIRE-TEST-082A78 在
--       9/20 07:41Z 就到期，9/21 13:30Z 仍兌換成功，還建了一筆 trial。
--
-- 根因：025 的 redeem_invite_for_app 搶碼時只擋「已被用」：
--         WHERE code = p_code AND used_by IS NULL
--       完全沒看 expires_at。註冊流程（register/actions.ts）有檢查到期日，
--       兌換這條路沒有 —— 兩條路徑對同一批碼用了不同規則。
--
-- 本次修正：
--   (1) 搶碼加上未到期條件，過期的碼再也搶不到。
--   (2) 新增 INVITE_EXPIRED，跟 INVITE_INVALID 分開 —— Steve 要求過期要能
--       明確告訴使用者「此邀請碼已過期」，而不是含糊的「無效或已被使用」。
--
-- 關於防列舉（025 原註「不存在 / 已使用不區分」）：
--   這裡刻意只對「確實存在、未被使用、但已過期」的碼吐 INVITE_EXPIRED。
--   不存在與已被使用仍然合併回 INVITE_INVALID，列舉者無法用回應分辨
--   「碼不存在」與「碼被別人用掉」。洩漏面僅限「這組碼曾經發出過且過期」，
--   換到的是受邀者不會對著有效碼乾瞪眼 —— 封測期這個交換划算。
--
-- 只換函式本體，不動資料表；既有的 trial 紀錄不受影響。

CREATE OR REPLACE FUNCTION redeem_invite_for_app(
  p_code    TEXT,
  p_user_id UUID,
  p_app_id  UUID
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code       TEXT;
  v_code_app   UUID;
  v_trial_days INTEGER;
  v_expires    TIMESTAMPTZ;
BEGIN
  -- 搶碼（row lock；已用 / 不存在 / 已過期都拿不到 row）
  -- expires_at IS NULL = 永不過期，維持 025 的語意。
  UPDATE invite_codes
     SET used_by = p_user_id, used_at = NOW()
   WHERE code = p_code
     AND used_by IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())
   RETURNING code, app_id INTO v_code, v_code_app;

  IF v_code IS NULL THEN
    -- 搶不到的三種原因裡，只把「過期」挑出來給明確訊息
    IF EXISTS (
      SELECT 1 FROM invite_codes
       WHERE code = p_code
         AND used_by IS NULL
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
    ) THEN
      RAISE EXCEPTION 'INVITE_EXPIRED';
    END IF;
    RAISE EXCEPTION 'INVITE_INVALID';  -- 不存在或已使用，不區分（防列舉）
  END IF;

  -- 限定 App 的碼只能開那支 App；app_id IS NULL = 不限
  IF v_code_app IS NOT NULL AND v_code_app <> p_app_id THEN
    RAISE EXCEPTION 'INVITE_WRONG_APP';
  END IF;

  SELECT trial_days INTO v_trial_days FROM apps WHERE id = p_app_id;
  IF v_trial_days IS NULL THEN
    RAISE EXCEPTION 'APP_NOT_FOUND';
  END IF;

  v_expires := NOW() + make_interval(days => v_trial_days);

  -- UNIQUE(user_id, app_id)：已有 trial（含已到期）就擋 —— 不重開（BOUNDARIES A6 註3）
  INSERT INTO user_app_trials (user_id, app_id, expires_at, source, invite_code)
  VALUES (p_user_id, p_app_id, v_expires, 'invite', p_code);

  RETURN v_expires;
END;
$$;

-- 權限比照 025：只准 service_role 呼叫（CREATE OR REPLACE 不會重置既有授權，
-- 這裡重下一次確保與 025 一致，之後若有人手滑 GRANT 也會被這行蓋回去）
REVOKE ALL ON FUNCTION redeem_invite_for_app(TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION redeem_invite_for_app(TEXT, UUID, UUID) FROM anon, authenticated;

-- ── 驗證（跑完後手動執行）──────────────────────────────────────
-- 1. 函式還在、只有一個版本：
--    SELECT proname, pronargs FROM pg_proc WHERE proname = 'redeem_invite_for_app';
--
-- 2. 過期碼確實被擋（拿一張已過期、未使用的碼測；預期 raise INVITE_EXPIRED）：
--    SELECT redeem_invite_for_app('<過期碼>', '<user uuid>', '<app uuid>');
--
-- 3. 目前有幾張「已過期且未使用」的碼會受影響（2026-09-22 實查為 0 張）：
--    SELECT code, expires_at FROM invite_codes
--     WHERE used_by IS NULL AND expires_at IS NOT NULL AND expires_at <= NOW();
