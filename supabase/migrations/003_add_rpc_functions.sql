-- Decrement dialog limit for a user (called after each AI response)
CREATE OR REPLACE FUNCTION decrement_dialog_limit(uid UUID)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET dialog_limit = GREATEST(dialog_limit - 1, 0)
  WHERE id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
