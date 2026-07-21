-- ============================================================
-- Migration: 006_fix_stock_rpc_item_unit.sql
-- Description: Fix "record v_item_unit is not assigned yet" error
--
-- ROOT CAUSE:
--   In process_stock_in, process_stock_out, and process_initial_stock,
--   the variable v_item_unit is declared as RECORD. When the user
--   selects the base unit (p_unit_id = v_item.base_unit_id), the code
--   tries to assign fields on this uninitialized RECORD directly:
--     v_item_unit.conversion_factor := 1;
--   PostgreSQL raises error 55000 because a RECORD has no structure
--   until populated via SELECT INTO. The ELSE branch works because
--   SELECT INTO gives the RECORD its shape.
--
-- FIX:
--   Replace v_item_unit RECORD with a scalar v_conversion_factor NUMERIC.
--   For base unit → v_conversion_factor := 1.
--   For derived unit → SELECT conversion_factor INTO v_conversion_factor.
--   All references to v_item_unit.conversion_factor are replaced.
--
-- AFFECTED FUNCTIONS (all three share the same pattern):
--   1. public.process_stock_in
--   2. public.process_stock_out
--   3. public.process_initial_stock
--
-- SECURITY: Preserves SECURITY DEFINER, search_path, REVOKE/GRANT.
-- ============================================================

-- ============================================================
-- 1. FIX process_stock_out
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_stock_out(
  p_client_request_id UUID,
  p_item_id UUID,
  p_input_quantity BIGINT,
  p_unit_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_item RECORD;
  v_conversion_factor NUMERIC;
  v_base_quantity BIGINT;
  v_cost RECORD;
  v_transaction_id UUID;
  v_transaction_number TEXT;
  v_existing_tx RECORD;
BEGIN
  -- 1. Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Validate user is active (any role can do OUT transaction)
  SELECT id, is_active, role INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR NOT v_profile.is_active THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Account is not active';
  END IF;

  -- 3. Idempotency check — return existing result if same request ID + user
  SELECT id, transaction_number, stock_after
  INTO v_existing_tx
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id', v_existing_tx.id,
      'transaction_number', v_existing_tx.transaction_number,
      'stock_after', v_existing_tx.stock_after,
      'idempotent', TRUE
    );
  END IF;

  -- 4. Validate input quantity
  IF p_input_quantity IS NULL OR p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Quantity must be positive';
  END IF;

  -- 5. Lock and read item (FOR UPDATE to prevent concurrent modification)
  SELECT id, current_stock, is_active, base_unit_id
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Item not found';
  END IF;

  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'INVALID_STATE: Item is not active';
  END IF;

  -- 6. Validate unit and get conversion factor (scalar, not RECORD)
  IF p_unit_id = v_item.base_unit_id THEN
    -- Base unit — conversion factor is exactly 1
    v_conversion_factor := 1;
  ELSE
    SELECT iu.conversion_factor
    INTO v_conversion_factor
    FROM public.item_units iu
    WHERE iu.item_id = p_item_id
      AND iu.unit_id = p_unit_id
      AND iu.is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Unit not available for this item';
    END IF;
  END IF;

  -- 7. Calculate base quantity
  v_base_quantity := p_input_quantity * v_conversion_factor;

  -- 8. Check sufficient stock
  IF v_item.current_stock < v_base_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Not enough stock. Available: %, Required: %',
      v_item.current_stock, v_base_quantity;
  END IF;

  -- 9. Get current average cost from private schema (for cost snapshot)
  SELECT average_cost, inventory_value
  INTO v_cost
  FROM private.item_costs
  WHERE item_id = p_item_id;

  -- 10. Create transaction record
  v_transaction_id := gen_random_uuid();
  v_transaction_number := public.generate_transaction_number();

  INSERT INTO public.stock_transactions (
    id, transaction_number, client_request_id,
    item_id, transaction_type,
    input_quantity, unit_id, conversion_factor_snapshot, base_quantity,
    quantity_delta, performed_by, transaction_at,
    stock_before, stock_after, reason
  ) VALUES (
    v_transaction_id, v_transaction_number, p_client_request_id,
    p_item_id, 'OUT',
    p_input_quantity, p_unit_id, v_conversion_factor, v_base_quantity,
    -v_base_quantity, v_user_id, NOW(),
    v_item.current_stock, v_item.current_stock - v_base_quantity, NULL
  );

  -- 11. Update item stock
  UPDATE public.items
  SET current_stock = current_stock - v_base_quantity,
      updated_at = NOW()
  WHERE id = p_item_id;

  -- 12. Update cost snapshot in private schema
  IF v_cost IS NOT NULL THEN
    DECLARE
      v_transaction_value NUMERIC;
      v_new_stock BIGINT;
      v_new_inventory_value NUMERIC;
      v_new_average_cost NUMERIC;
    BEGIN
      v_transaction_value := v_base_quantity::NUMERIC * v_cost.average_cost;
      v_new_stock := v_item.current_stock - v_base_quantity;

      IF v_new_stock = 0 THEN
        -- Zero out inventory value to avoid rounding residue
        v_new_inventory_value := 0;
        v_new_average_cost := 0;
      ELSE
        v_new_inventory_value := v_cost.inventory_value - v_transaction_value;
        v_new_average_cost := v_cost.average_cost; -- avg cost unchanged for OUT
      END IF;

      -- Insert cost snapshot
      INSERT INTO private.stock_transaction_costs (
        transaction_id, unit_price_input, base_unit_cost,
        average_cost_before, average_cost_after,
        inventory_value_before, inventory_value_change, inventory_value_after,
        transaction_value
      ) VALUES (
        v_transaction_id,
        v_cost.average_cost, -- no price input for OUT; use avg cost
        v_cost.average_cost,
        v_cost.average_cost, v_new_average_cost,
        v_cost.inventory_value, -v_transaction_value, v_new_inventory_value,
        v_transaction_value
      );

      -- Update current cost
      UPDATE private.item_costs
      SET average_cost = v_new_average_cost,
          inventory_value = v_new_inventory_value,
          updated_at = NOW()
      WHERE item_id = p_item_id;
    END;
  END IF;

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after', v_item.current_stock - v_base_quantity,
    'idempotent', FALSE
  );

EXCEPTION
  WHEN UNIQUE_VIOLATION THEN
    -- Race condition: same client_request_id inserted concurrently
    SELECT id, transaction_number, stock_after
    INTO v_existing_tx
    FROM public.stock_transactions
    WHERE client_request_id = p_client_request_id
      AND performed_by = v_user_id;

    IF FOUND THEN
      RETURN json_build_object(
        'transaction_id', v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'stock_after', v_existing_tx.stock_after,
        'idempotent', TRUE
      );
    END IF;
    RAISE;
END;
$$;

-- ============================================================
-- 2. FIX process_stock_in
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_stock_in(
  p_client_request_id UUID,
  p_item_id UUID,
  p_input_quantity BIGINT,
  p_unit_id UUID,
  p_unit_price NUMERIC -- price per selected transaction unit (NOT base unit)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_item RECORD;
  v_conversion_factor NUMERIC;
  v_base_quantity BIGINT;
  v_base_unit_cost NUMERIC;
  v_purchase_value NUMERIC;
  v_current_cost RECORD;
  v_new_inventory_value NUMERIC;
  v_new_stock BIGINT;
  v_new_average_cost NUMERIC;
  v_transaction_id UUID;
  v_transaction_number TEXT;
  v_existing_tx RECORD;
BEGIN
  -- 1. Validate authentication and admin role
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate inputs
  IF p_input_quantity IS NULL OR p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Quantity must be positive';
  END IF;

  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Unit price must be non-negative';
  END IF;

  -- 3. Idempotency check
  SELECT id, transaction_number, stock_after
  INTO v_existing_tx
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id', v_existing_tx.id,
      'transaction_number', v_existing_tx.transaction_number,
      'stock_after', v_existing_tx.stock_after,
      'idempotent', TRUE
    );
  END IF;

  -- 4. Lock and read item
  SELECT id, current_stock, is_active, base_unit_id
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Item not found';
  END IF;

  IF NOT v_item.is_active THEN
    RAISE EXCEPTION 'INVALID_STATE: Item is not active';
  END IF;

  -- 5. Get conversion factor (scalar variable, not RECORD)
  IF p_unit_id = v_item.base_unit_id THEN
    -- Base unit — conversion factor is exactly 1
    v_conversion_factor := 1;
  ELSE
    SELECT iu.conversion_factor
    INTO v_conversion_factor
    FROM public.item_units iu
    WHERE iu.item_id = p_item_id
      AND iu.unit_id = p_unit_id
      AND iu.is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Unit not available for this item';
    END IF;
  END IF;

  -- 6. Calculate quantities and costs
  v_base_quantity := p_input_quantity * v_conversion_factor;
  v_base_unit_cost := p_unit_price / v_conversion_factor;
  v_purchase_value := p_input_quantity::NUMERIC * p_unit_price;

  -- 7. Get current cost from private schema
  SELECT average_cost, inventory_value
  INTO v_current_cost
  FROM private.item_costs
  WHERE item_id = p_item_id
  FOR UPDATE; -- Lock cost row

  v_new_stock := v_item.current_stock + v_base_quantity;

  IF NOT FOUND THEN
    -- First IN transaction — initialize costs
    v_new_inventory_value := v_purchase_value;
    v_new_average_cost := v_base_unit_cost;
    v_current_cost.average_cost := 0;
    v_current_cost.inventory_value := 0;
  ELSE
    -- Moving weighted average calculation
    v_new_inventory_value := v_current_cost.inventory_value + v_purchase_value;
    v_new_average_cost := v_new_inventory_value / v_new_stock::NUMERIC;
  END IF;

  -- 8. Create transaction
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
    p_item_id, 'IN',
    p_input_quantity, p_unit_id, v_conversion_factor, v_base_quantity,
    v_base_quantity, v_user_id, NOW(),
    v_item.current_stock, v_new_stock
  );

  -- 9. Update item stock
  UPDATE public.items
  SET current_stock = v_new_stock,
      updated_at = NOW()
  WHERE id = p_item_id;

  -- 10. Update/insert cost snapshot
  INSERT INTO private.stock_transaction_costs (
    transaction_id, unit_price_input, base_unit_cost,
    average_cost_before, average_cost_after,
    inventory_value_before, inventory_value_change, inventory_value_after,
    transaction_value
  ) VALUES (
    v_transaction_id, p_unit_price, v_base_unit_cost,
    COALESCE(v_current_cost.average_cost, 0), v_new_average_cost,
    COALESCE(v_current_cost.inventory_value, 0), v_purchase_value, v_new_inventory_value,
    v_purchase_value
  );

  -- 11. Update item cost
  INSERT INTO private.item_costs (item_id, average_cost, inventory_value)
  VALUES (p_item_id, v_new_average_cost, v_new_inventory_value)
  ON CONFLICT (item_id) DO UPDATE
    SET average_cost = EXCLUDED.average_cost,
        inventory_value = EXCLUDED.inventory_value,
        updated_at = NOW();

  -- 12. Write audit log
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary
  ) VALUES (
    v_user_id, 'STOCK_IN', 'stock_transactions', v_transaction_id,
    json_build_object(
      'item_id', p_item_id,
      'quantity', p_input_quantity,
      'stock_after', v_new_stock,
      'transaction_number', v_transaction_number
      -- NOTE: No price data in audit log to maintain admin-only access control
    )
  );

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after', v_new_stock,
    'idempotent', FALSE
  );

EXCEPTION
  WHEN UNIQUE_VIOLATION THEN
    SELECT id, transaction_number, stock_after
    INTO v_existing_tx
    FROM public.stock_transactions
    WHERE client_request_id = p_client_request_id
      AND performed_by = v_user_id;

    IF FOUND THEN
      RETURN json_build_object(
        'transaction_id', v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'stock_after', v_existing_tx.stock_after,
        'idempotent', TRUE
      );
    END IF;
    RAISE;
END;
$$;

-- ============================================================
-- 3. FIX process_initial_stock
-- ============================================================

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
  v_item RECORD;
  v_conversion_factor NUMERIC;
  v_base_quantity BIGINT;
  v_base_unit_cost NUMERIC;
  v_inventory_value NUMERIC;
  v_transaction_id UUID;
  v_transaction_number TEXT;
BEGIN
  -- 1. Authenticate and authorize
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate inputs
  IF p_input_quantity IS NULL OR p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Initial quantity must be positive';
  END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Price must be non-negative';
  END IF;

  -- 3. Lock and read item
  SELECT id, current_stock, is_active, base_unit_id
  INTO v_item
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Item not found';
  END IF;

  -- 4. Check no prior transactions exist for this item
  IF EXISTS (
    SELECT 1 FROM public.stock_transactions
    WHERE item_id = p_item_id AND transaction_type = 'INITIAL'
  ) THEN
    RAISE EXCEPTION 'INVALID_STATE: Initial stock already set for this item';
  END IF;

  IF v_item.current_stock <> 0 THEN
    RAISE EXCEPTION 'INVALID_STATE: Item already has stock';
  END IF;

  -- 5. Get unit conversion (scalar variable, not RECORD)
  IF p_unit_id = v_item.base_unit_id THEN
    -- Base unit — conversion factor is exactly 1
    v_conversion_factor := 1;
  ELSE
    SELECT iu.conversion_factor
    INTO v_conversion_factor
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

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after', v_base_quantity,
    'idempotent', FALSE
  );
END;
$$;

-- ============================================================
-- 4. Re-grant permissions (signatures unchanged, but
--    CREATE OR REPLACE may reset grants on some PG versions)
-- ============================================================

GRANT EXECUTE ON FUNCTION public.process_stock_out(UUID, UUID, BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stock_in(UUID, UUID, BIGINT, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_initial_stock(UUID, UUID, BIGINT, UUID, NUMERIC) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.process_stock_out(UUID, UUID, BIGINT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stock_in(UUID, UUID, BIGINT, UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_initial_stock(UUID, UUID, BIGINT, UUID, NUMERIC) FROM PUBLIC;
