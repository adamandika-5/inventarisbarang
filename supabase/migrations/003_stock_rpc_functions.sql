-- ============================================================
-- Migration: 003_stock_rpc_functions.sql
-- Description: Atomic stock transaction RPC functions
--
-- All stock mutations go through these SECURITY DEFINER functions.
-- Client cannot directly INSERT/UPDATE/DELETE stock tables.
--
-- SECURITY:
--   - Each function validates auth.uid() and active status
--   - Each function validates role where needed
--   - Input quantities come from client but are validated server-side
--   - Prices, stock_before, stock_after NEVER trusted from client
--   - Row locking prevents concurrent modification
--   - Idempotency via client_request_id unique constraint
-- ============================================================

-- ============================================================
-- 1. PROCESS STOCK OUT (Employee action)
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
  v_item_unit RECORD;
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
    -- Return existing result (idempotent)
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

  -- 6. Validate unit and get conversion factor
  IF p_unit_id = v_item.base_unit_id THEN
    -- Base unit — conversion factor is 1
    v_item_unit.conversion_factor := 1;
    v_item_unit.unit_id := p_unit_id;
  ELSE
    SELECT iu.conversion_factor, iu.unit_id
    INTO v_item_unit
    FROM public.item_units iu
    WHERE iu.item_id = p_item_id
      AND iu.unit_id = p_unit_id
      AND iu.is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Unit not available for this item';
    END IF;
  END IF;

  -- 7. Calculate base quantity
  v_base_quantity := p_input_quantity * v_item_unit.conversion_factor;

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
    p_input_quantity, p_unit_id, v_item_unit.conversion_factor, v_base_quantity,
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
-- 2. PROCESS STOCK IN (Admin action)
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
  v_item_unit RECORD;
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

  -- 5. Get conversion factor
  IF p_unit_id = v_item.base_unit_id THEN
    v_item_unit.conversion_factor := 1;
    v_item_unit.unit_id := p_unit_id;
  ELSE
    SELECT iu.conversion_factor, iu.unit_id
    INTO v_item_unit
    FROM public.item_units iu
    WHERE iu.item_id = p_item_id
      AND iu.unit_id = p_unit_id
      AND iu.is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Unit not available for this item';
    END IF;
  END IF;

  -- 6. Calculate quantities and costs
  v_base_quantity := p_input_quantity * v_item_unit.conversion_factor;
  v_base_unit_cost := p_unit_price / v_item_unit.conversion_factor::NUMERIC;
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
    p_input_quantity, p_unit_id, v_item_unit.conversion_factor, v_base_quantity,
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
-- 3. PROCESS INITIAL STOCK (Admin action, once per item)
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
  v_item_unit RECORD;
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

  -- 5. Get unit conversion
  IF p_unit_id = v_item.base_unit_id THEN
    v_item_unit.conversion_factor := 1;
    v_item_unit.unit_id := p_unit_id;
  ELSE
    SELECT iu.conversion_factor, iu.unit_id
    INTO v_item_unit
    FROM public.item_units iu
    WHERE iu.item_id = p_item_id
      AND iu.unit_id = p_unit_id
      AND iu.is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_INPUT: Unit not available for this item';
    END IF;
  END IF;

  -- 6. Calculate
  v_base_quantity := p_input_quantity * v_item_unit.conversion_factor;
  v_base_unit_cost := p_unit_price / v_item_unit.conversion_factor::NUMERIC;
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
    p_input_quantity, p_unit_id, v_item_unit.conversion_factor, v_base_quantity,
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
-- 4. PROCESS STOCK ADJUSTMENT (Admin action)
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_stock_adjustment(
  p_client_request_id UUID,
  p_item_id UUID,
  p_physical_stock BIGINT,   -- actual physical count in BASE units
  p_reason TEXT,
  p_unit_price NUMERIC DEFAULT NULL -- required if ADJUSTMENT_IN and no avg cost
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_item RECORD;
  v_current_cost RECORD;
  v_delta BIGINT;
  v_transaction_type public.transaction_type;
  v_base_unit_cost NUMERIC;
  v_transaction_id UUID;
  v_transaction_number TEXT;
BEGIN
  -- 1. Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate
  IF p_physical_stock IS NULL OR p_physical_stock < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Physical stock must be zero or positive';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason is required for adjustment';
  END IF;

  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason cannot exceed 500 characters';
  END IF;

  -- 3. Lock item — re-read actual stock at time of adjustment
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

  -- 4. Calculate delta using server-read stock (NOT client-provided)
  v_delta := p_physical_stock - v_item.current_stock;

  -- 5. If no difference, no transaction needed
  IF v_delta = 0 THEN
    RETURN json_build_object(
      'transaction_id', NULL,
      'transaction_number', NULL,
      'adjustment_type', 'NO_CHANGE',
      'quantity_delta', 0,
      'message', 'Tidak ada perbedaan stok, tidak ada transaksi dibuat.'
    );
  END IF;

  -- 6. Determine transaction type
  IF v_delta > 0 THEN
    v_transaction_type := 'ADJUSTMENT_IN';
  ELSE
    v_transaction_type := 'ADJUSTMENT_OUT';
  END IF;

  -- 7. Get current cost
  SELECT average_cost, inventory_value
  INTO v_current_cost
  FROM private.item_costs
  WHERE item_id = p_item_id
  FOR UPDATE;

  -- 8. For ADJUSTMENT_IN: need a cost basis
  IF v_transaction_type = 'ADJUSTMENT_IN' THEN
    IF v_current_cost IS NOT NULL AND v_current_cost.average_cost > 0 THEN
      v_base_unit_cost := v_current_cost.average_cost;
    ELSIF p_unit_price IS NOT NULL AND p_unit_price > 0 THEN
      v_base_unit_cost := p_unit_price; -- admin-provided price per base unit
    ELSE
      RAISE EXCEPTION 'INVALID_INPUT: Unit price required for ADJUSTMENT_IN when no average cost exists';
    END IF;
  ELSE
    -- ADJUSTMENT_OUT uses current average cost
    v_base_unit_cost := COALESCE(v_current_cost.average_cost, 0);
  END IF;

  -- 9. Idempotency check
  DECLARE
    v_existing_tx RECORD;
  BEGIN
    SELECT id, transaction_number, stock_after
    INTO v_existing_tx
    FROM public.stock_transactions
    WHERE client_request_id = p_client_request_id
      AND performed_by = v_user_id;

    IF FOUND THEN
      RETURN json_build_object(
        'transaction_id', v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'adjustment_type', v_transaction_type,
        'quantity_delta', v_delta,
        'idempotent', TRUE
      );
    END IF;
  END;

  -- 10. Create transaction
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
    p_item_id, v_transaction_type,
    ABS(v_delta), v_item.base_unit_id, 1, ABS(v_delta),
    v_delta, v_user_id, NOW(),
    v_item.current_stock, p_physical_stock, p_reason
  );

  -- 11. Update stock
  UPDATE public.items
  SET current_stock = p_physical_stock,
      updated_at = NOW()
  WHERE id = p_item_id;

  -- 12. Update costs
  DECLARE
    v_value_change NUMERIC;
    v_new_inventory_value NUMERIC;
    v_new_average_cost NUMERIC;
  BEGIN
    v_value_change := ABS(v_delta)::NUMERIC * v_base_unit_cost;
    IF v_transaction_type = 'ADJUSTMENT_IN' THEN
      v_new_inventory_value := COALESCE(v_current_cost.inventory_value, 0) + v_value_change;
    ELSE
      v_new_inventory_value := GREATEST(0, COALESCE(v_current_cost.inventory_value, 0) - v_value_change);
      v_value_change := -v_value_change;
    END IF;

    IF p_physical_stock = 0 THEN
      v_new_inventory_value := 0;
      v_new_average_cost := 0;
    ELSE
      v_new_average_cost := v_new_inventory_value / p_physical_stock::NUMERIC;
    END IF;

    INSERT INTO private.stock_transaction_costs (
      transaction_id, unit_price_input, base_unit_cost,
      average_cost_before, average_cost_after,
      inventory_value_before, inventory_value_change, inventory_value_after,
      transaction_value
    ) VALUES (
      v_transaction_id, v_base_unit_cost, v_base_unit_cost,
      COALESCE(v_current_cost.average_cost, 0), v_new_average_cost,
      COALESCE(v_current_cost.inventory_value, 0), v_value_change, v_new_inventory_value,
      ABS(v_value_change)
    );

    INSERT INTO private.item_costs (item_id, average_cost, inventory_value)
    VALUES (p_item_id, v_new_average_cost, v_new_inventory_value)
    ON CONFLICT (item_id) DO UPDATE
      SET average_cost = EXCLUDED.average_cost,
          inventory_value = EXCLUDED.inventory_value,
          updated_at = NOW();
  END;

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'transaction_number', v_transaction_number,
    'adjustment_type', v_transaction_type,
    'quantity_delta', v_delta,
    'idempotent', FALSE
  );
END;
$$;

-- ============================================================
-- 5. PROCESS REVERSAL (Admin action)
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_reversal(
  p_client_request_id UUID,
  p_original_transaction_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_original RECORD;
  v_item RECORD;
  v_cost_snapshot RECORD;
  v_transaction_id UUID;
  v_transaction_number TEXT;
  v_reversal_delta BIGINT;
  v_new_stock BIGINT;
BEGIN
  -- 1. Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate reason
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason is required for reversal';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason cannot exceed 500 characters';
  END IF;

  -- 3. Get original transaction (with row lock)
  SELECT st.*, i.current_stock AS item_current_stock
  INTO v_original
  FROM public.stock_transactions st
  JOIN public.items i ON i.id = st.item_id
  WHERE st.id = p_original_transaction_id
  FOR UPDATE OF st;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Original transaction not found';
  END IF;

  -- 4. Validate reversal rules
  IF v_original.transaction_type = 'REVERSAL' THEN
    RAISE EXCEPTION 'INVALID_STATE: REVERSAL transactions cannot be reversed';
  END IF;

  IF v_original.is_reversed THEN
    RAISE EXCEPTION 'INVALID_STATE: Transaction already reversed';
  END IF;

  -- 5. Calculate reversal delta (opposite of original)
  v_reversal_delta := -v_original.quantity_delta;
  v_new_stock := v_original.item_current_stock + v_reversal_delta;

  -- 6. Validate no negative stock
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'INVALID_STATE: Reversal would cause negative stock. Current: %, Reversal delta: %',
      v_original.item_current_stock, v_reversal_delta;
  END IF;

  -- 7. Lock item
  PERFORM 1 FROM public.items WHERE id = v_original.item_id FOR UPDATE;

  -- 8. Idempotency check
  DECLARE
    v_existing_tx RECORD;
  BEGIN
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
  END;

  -- 9. Create reversal transaction
  v_transaction_id := gen_random_uuid();
  v_transaction_number := public.generate_transaction_number();

  INSERT INTO public.stock_transactions (
    id, transaction_number, client_request_id,
    item_id, transaction_type,
    input_quantity, unit_id, conversion_factor_snapshot, base_quantity,
    quantity_delta, performed_by, transaction_at,
    stock_before, stock_after, reason,
    original_transaction_id
  ) VALUES (
    v_transaction_id, v_transaction_number, p_client_request_id,
    v_original.item_id, 'REVERSAL',
    v_original.base_quantity, v_original.unit_id,
    v_original.conversion_factor_snapshot, v_original.base_quantity,
    v_reversal_delta, v_user_id, NOW(),
    v_original.item_current_stock, v_new_stock, p_reason,
    p_original_transaction_id
  );

  -- 10. Mark original as reversed
  UPDATE public.stock_transactions
  SET is_reversed = TRUE,
      reversal_transaction_id = v_transaction_id
  WHERE id = p_original_transaction_id;

  -- 11. Update item stock
  UPDATE public.items
  SET current_stock = v_new_stock,
      updated_at = NOW()
  WHERE id = v_original.item_id;

  -- 12. Handle cost reversal
  SELECT * INTO v_cost_snapshot
  FROM private.stock_transaction_costs
  WHERE transaction_id = p_original_transaction_id;

  IF FOUND THEN
    DECLARE
      v_current_cost RECORD;
      v_new_inventory_value NUMERIC;
      v_new_average_cost NUMERIC;
    BEGIN
      SELECT * INTO v_current_cost
      FROM private.item_costs
      WHERE item_id = v_original.item_id
      FOR UPDATE;

      -- Reversal: undo the inventory_value_change of original
      v_new_inventory_value := COALESCE(v_current_cost.inventory_value, 0)
                               - v_cost_snapshot.inventory_value_change;

      -- Clamp to 0 if rounding causes small negatives
      IF v_new_inventory_value < 0 THEN
        v_new_inventory_value := 0;
      END IF;

      IF v_new_stock = 0 THEN
        v_new_inventory_value := 0;
        v_new_average_cost := 0;
      ELSE
        v_new_average_cost := v_new_inventory_value / v_new_stock::NUMERIC;
      END IF;

      INSERT INTO private.stock_transaction_costs (
        transaction_id, unit_price_input, base_unit_cost,
        average_cost_before, average_cost_after,
        inventory_value_before, inventory_value_change, inventory_value_after,
        transaction_value
      ) VALUES (
        v_transaction_id,
        v_cost_snapshot.unit_price_input, v_cost_snapshot.base_unit_cost,
        COALESCE(v_current_cost.average_cost, 0), v_new_average_cost,
        COALESCE(v_current_cost.inventory_value, 0),
        -v_cost_snapshot.inventory_value_change,
        v_new_inventory_value,
        v_cost_snapshot.transaction_value
      );

      UPDATE private.item_costs
      SET average_cost = v_new_average_cost,
          inventory_value = v_new_inventory_value,
          updated_at = NOW()
      WHERE item_id = v_original.item_id;
    END;
  END IF;

  -- 13. Audit log
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary, reason
  ) VALUES (
    v_user_id, 'STOCK_REVERSAL', 'stock_transactions', v_transaction_id,
    json_build_object(
      'original_transaction_id', p_original_transaction_id,
      'reversal_transaction_number', v_transaction_number,
      'stock_after', v_new_stock
    ),
    p_reason
  );

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after', v_new_stock,
    'idempotent', FALSE
  );
END;
$$;

-- ============================================================
-- 6. GRANT EXECUTE ON RPC FUNCTIONS
-- ============================================================

-- Grant to authenticated role (RLS in functions validates further)
GRANT EXECUTE ON FUNCTION public.process_stock_out(UUID, UUID, BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stock_in(UUID, UUID, BIGINT, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_initial_stock(UUID, UUID, BIGINT, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_stock_adjustment(UUID, UUID, BIGINT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_reversal(UUID, UUID, TEXT) TO authenticated;

-- Revoke from PUBLIC/anon
REVOKE EXECUTE ON FUNCTION public.process_stock_out(UUID, UUID, BIGINT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stock_in(UUID, UUID, BIGINT, UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_initial_stock(UUID, UUID, BIGINT, UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stock_adjustment(UUID, UUID, BIGINT, TEXT, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_reversal(UUID, UUID, TEXT) FROM PUBLIC;
