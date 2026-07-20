-- ============================================================
-- Migration: 004_admin_bootstrap_function.sql
-- Description: Server-side function for admin bootstrap script
--
-- This function allows the service-role-authenticated bootstrap script
-- to create entries in private.auth_login_identifiers.
--
-- SECURITY:
--   - Only callable by service role (no client access)
--   - Validates input before inserting
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_admin_login_mapping(
  p_username_normalized TEXT,
  p_auth_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Validate username format
  IF p_username_normalized !~ '^[a-z0-9._-]{3,32}$' THEN
    RAISE EXCEPTION 'INVALID_INPUT: Invalid username format';
  END IF;

  -- Insert into private schema
  INSERT INTO private.auth_login_identifiers (username_normalized, auth_user_id)
  VALUES (p_username_normalized, p_auth_user_id);
END;
$$;

-- Grant ONLY to service role (not to anon or authenticated)
-- Service role bypasses RLS by default, but we still restrict function access
REVOKE EXECUTE ON FUNCTION public.create_admin_login_mapping(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_admin_login_mapping(TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_admin_login_mapping(TEXT, UUID) FROM authenticated;
-- Service role has superuser-like permissions in Supabase, so no explicit grant needed

-- ============================================================
-- Function for login route: lookup username → auth_user_id
-- This is called by the server-side login BFF
-- ============================================================

CREATE OR REPLACE FUNCTION public.lookup_login_identifier(
  p_username_normalized TEXT
)
RETURNS TABLE(auth_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT ali.auth_user_id
  FROM private.auth_login_identifiers ali
  WHERE ali.username_normalized = p_username_normalized
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_login_identifier(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_login_identifier(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lookup_login_identifier(TEXT) FROM authenticated;
-- Only callable by service role

-- ============================================================
-- Function for admin to create employee accounts
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_employee_account(
  p_username TEXT,
  p_full_name TEXT,
  p_temporary_password TEXT,
  p_auth_user_id UUID -- provided by server after creating auth user
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username_normalized TEXT;
BEGIN
  -- Only callable with valid admin session
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  v_username_normalized := lower(trim(p_username));

  -- Validate username
  IF v_username_normalized !~ '^[a-z0-9._-]{3,32}$' THEN
    RAISE EXCEPTION 'INVALID_INPUT: Invalid username format';
  END IF;

  -- Validate full name
  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Full name is required';
  END IF;

  -- Create profile
  INSERT INTO public.profiles (
    id, username, username_normalized, full_name,
    role, is_active, must_change_password
  ) VALUES (
    p_auth_user_id, p_username, v_username_normalized, trim(p_full_name),
    'EMPLOYEE', TRUE, TRUE -- employees must change password on first login
  );

  -- Create login mapping
  INSERT INTO private.auth_login_identifiers (username_normalized, auth_user_id)
  VALUES (v_username_normalized, p_auth_user_id);

  -- Audit log
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id,
    changes_summary
  ) VALUES (
    auth.uid(), 'USER_CREATED', 'profiles', p_auth_user_id,
    json_build_object(
      'username', v_username_normalized,
      'role', 'EMPLOYEE'
      -- NOTE: Never log passwords, even temporary ones
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_employee_account(TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_employee_account(TEXT, TEXT, TEXT, UUID) TO authenticated;
