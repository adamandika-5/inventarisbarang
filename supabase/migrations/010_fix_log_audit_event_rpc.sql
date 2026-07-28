-- Migration 010: Fix log_audit_event RPC and add atomic toggle_item_active RPC

-- 1. Create SECURITY DEFINER RPC for logging audit events securely
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action public.audit_action,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_changes_summary JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_request_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_log_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to log audit event';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required to log audit event';
  END IF;

  INSERT INTO public.audit_logs (
    performed_by,
    performed_at,
    action,
    entity_type,
    entity_id,
    changes_summary,
    reason,
    request_metadata
  ) VALUES (
    v_user_id,
    NOW(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_changes_summary,
    p_reason,
    p_request_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(
  public.audit_action, TEXT, UUID, JSONB, TEXT, JSONB
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(
  public.audit_action, TEXT, UUID, JSONB, TEXT, JSONB
) FROM PUBLIC;

-- 2. Create SECURITY DEFINER RPC for atomic item status change & audit log
CREATE OR REPLACE FUNCTION public.toggle_item_active(
  p_item_id UUID,
  p_target_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_item_name TEXT;
  v_item_sku TEXT;
  v_current_is_active BOOLEAN;
  v_action public.audit_action;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  SELECT name, sku, is_active
  INTO v_item_name, v_item_sku, v_current_is_active
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: Item does not exist';
  END IF;

  IF v_current_is_active = p_target_is_active THEN
    IF p_target_is_active THEN
      RAISE EXCEPTION 'ITEM_ALREADY_ACTIVE: Barang sudah aktif.';
    ELSE
      RAISE EXCEPTION 'ITEM_ALREADY_INACTIVE: Barang sudah nonaktif.';
    END IF;
  END IF;

  UPDATE public.items
  SET is_active = p_target_is_active,
      updated_at = NOW()
  WHERE id = p_item_id;

  v_action := CASE WHEN p_target_is_active THEN 'ITEM_ACTIVATED'::public.audit_action ELSE 'ITEM_DEACTIVATED'::public.audit_action END;

  INSERT INTO public.audit_logs (
    performed_by,
    performed_at,
    action,
    entity_type,
    entity_id,
    changes_summary
  ) VALUES (
    v_user_id,
    NOW(),
    v_action,
    'items',
    p_item_id,
    jsonb_build_object('sku', v_item_sku, 'name', v_item_name)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'item_id', p_item_id,
    'is_active', p_target_is_active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_item_active(UUID, BOOLEAN) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.toggle_item_active(UUID, BOOLEAN) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
