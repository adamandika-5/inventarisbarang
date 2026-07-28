-- Migration 009: Add SECURITY DEFINER RPC for audit logging & add STOCK_INITIAL audit log in process_initial_stock

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

-- 2. Update process_initial_stock to write STOCK_INITIAL audit log
CREATE OR REPLACE FUNCTION public.process_initial_stock(
  p_client_request_id UUID,
  p_item_id UUID,
  p_input_quantity BIGINT,
  p_unit_id UUID,
  p_unit_price NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_is_active BOOLEAN;
  v_conversion_factor NUMERIC;
  v_base_quantity BIGINT;
  v_base_unit_cost NUMERIC;
  v_inventory_value NUMERIC;
  v_transaction_id UUID;
  v_transaction_number TEXT;
  v_existing_tx_id UUID;
  v_existing_stock BIGINT;
  v_existing_tx_number TEXT;
  v_existing_item_stock BIGINT;
  v_tx_count INT;
BEGIN
  -- 1. Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate inputs
  IF p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Quantity must be positive';
  END IF;

  IF p_unit_price < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Unit price cannot be negative';
  END IF;

  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Client request ID is required';
  END IF;

  -- 3. Check idempotency
  SELECT id, stock_after, transaction_number
  INTO v_existing_tx_id, v_existing_stock, v_existing_tx_number
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id', v_existing_tx_id,
      'transaction_number', v_existing_tx_number,
      'stock_after', v_existing_stock,
      'idempotent', TRUE
    );
  END IF;

  -- 4. Lock item & verify active
  SELECT is_active, current_stock
  INTO v_is_active, v_existing_item_stock
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: Item does not exist';
  END IF;

  IF NOT v_is_active THEN
    RAISE EXCEPTION 'ITEM_INACTIVE: Cannot record initial stock for inactive item';
  END IF;

  -- Verify item has no existing transactions
  SELECT COUNT(*) INTO v_tx_count
  FROM public.stock_transactions
  WHERE item_id = p_item_id;

  IF v_tx_count > 0 THEN
    RAISE EXCEPTION 'INITIAL_STOCK_ALREADY_EXISTS: Initial stock already recorded for this item';
  END IF;

  -- 5. Conversion factor
  IF p_unit_id = (SELECT base_unit_id FROM public.items WHERE id = p_item_id) THEN
    v_conversion_factor := 1;
  ELSE
    SELECT conversion_factor INTO v_conversion_factor
    FROM public.item_units iu
    WHERE iu.item_id = p_item_id
      AND iu.unit_id = p_unit_id
      AND iu.is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Unit not available for this item';
    END IF;
  END IF;

  -- 6. Calculate
  v_base_quantity := p_input_quantity * v_conversion_factor;
  v_base_unit_cost := p_unit_price / v_conversion_factor;
  v_inventory_value := v_base_quantity::NUMERIC * v_base_unit_cost;

  -- 7. Create transaction
  v_transaction_id := gen_random_uuid();
  v_transaction_number := public.generate_transaction_number();

  INSERT INTO public.stock_transactions (
    id, transaction_number, client_request_id,
    item_id, transaction_type,
    input_quantity, unit_id, conversion_factor_snapshot, base_quantity,
    quantity_delta, performed_by, transaction_at,
    stock_before, stock_after
  ) VALUES (
    v_transaction_id, v_transaction_number, p_client_request_id,
    p_item_id, 'INITIAL',
    p_input_quantity, p_unit_id, v_conversion_factor, v_base_quantity,
    v_base_quantity, v_user_id, NOW(),
    0, v_base_quantity
  );

  -- 8. Update stock
  UPDATE public.items
  SET current_stock = v_base_quantity,
      updated_at = NOW()
  WHERE id = p_item_id;

  -- 9. Initialize costs
  INSERT INTO private.stock_transaction_costs (
    transaction_id, unit_price_input, base_unit_cost,
    average_cost_before, average_cost_after,
    inventory_value_before, inventory_value_change, inventory_value_after,
    transaction_value
  ) VALUES (
    v_transaction_id, p_unit_price, v_base_unit_cost,
    0, v_base_unit_cost,
    0, v_inventory_value, v_inventory_value,
    v_inventory_value
  );

  INSERT INTO private.item_costs (item_id, average_cost, inventory_value)
  VALUES (p_item_id, v_base_unit_cost, v_inventory_value)
  ON CONFLICT (item_id) DO UPDATE
    SET average_cost = EXCLUDED.average_cost,
        inventory_value = EXCLUDED.inventory_value,
        updated_at = NOW();

  -- 10. Write audit log (STOCK_INITIAL)
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary
  ) VALUES (
    v_user_id, 'STOCK_INITIAL', 'stock_transactions', v_transaction_id,
    json_build_object(
      'item_id', p_item_id,
      'quantity', p_input_quantity,
      'stock_after', v_base_quantity,
      'transaction_number', v_transaction_number
    )
  );

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after', v_base_quantity,
    'idempotent', FALSE
  );

EXCEPTION
  WHEN UNIQUE_VIOLATION THEN
    SELECT id, stock_after, transaction_number
    INTO v_existing_tx_id, v_existing_stock, v_existing_tx_number
    FROM public.stock_transactions
    WHERE client_request_id = p_client_request_id;

    IF FOUND THEN
      RETURN json_build_object(
        'transaction_id', v_existing_tx_id,
        'transaction_number', v_existing_tx_number,
        'stock_after', v_existing_stock,
        'idempotent', TRUE
      );
    ELSE
      RAISE;
    END IF;
END;
$$;
