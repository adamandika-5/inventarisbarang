-- ============================================================
-- Migration: 007_complete_forced_password_change.sql
-- Description: RPC function for user to clear must_change_password flag upon changing password.
--
-- SECURITY:
--   - Uses auth.uid() directly (no user_id passed from client)
--   - Checks user is authenticated and active
--   - Updates ONLY must_change_password and updated_at
--   - SECURITY DEFINER with search_path = ''
--   - Accessible only by authenticated users
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_forced_password_change()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_active BOOLEAN;
BEGIN
  -- 1. Get current authenticated user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Verify profile is active
  SELECT is_active INTO v_active
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR NOT v_active THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Account is not active';
  END IF;

  -- 3. Clear must_change_password flag
  UPDATE public.profiles
  SET must_change_password = FALSE,
      updated_at = NOW()
  WHERE id = v_user_id;
END;
$$;

-- Grant to authenticated role
GRANT EXECUTE ON FUNCTION public.complete_forced_password_change() TO authenticated;

-- Revoke from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.complete_forced_password_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_forced_password_change() FROM anon;
