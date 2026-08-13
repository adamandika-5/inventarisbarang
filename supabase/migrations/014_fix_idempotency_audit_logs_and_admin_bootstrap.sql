-- Migration 014: Fix idempotency race conditions for stock adjustment and reversal, complete audit logs for stock_out and adjustment, fix initial stock idempotency queries, and add non-ambiguous create_employee_account_v2 RPC.

-- ────────────────────────────────────────────────────────────
-- 1. FIX process_stock_adjustment
--    - Double idempotency check (before lock and AFTER row lock) to handle concurrent race conditions
--    - Add audit_logs insertion on successful adjustment
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_stock_adjustment(
  p_client_request_id UUID,
  p_item_id           UUID,
  p_physical_stock    BIGINT,
  p_reason            TEXT,
  p_unit_price        NUMERIC DEFAULT NULL  -- Maintained for signature compatibility, unused
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id            UUID;
  v_item               RECORD;
  v_delta              BIGINT;
  v_transaction_type   public.transaction_type;
  v_transaction_id     UUID;
  v_transaction_number TEXT;
  v_existing_tx        RECORD;
BEGIN
  -- 1. Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate inputs
  IF p_physical_stock IS NULL OR p_physical_stock < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Physical stock must be zero or positive';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason is required for adjustment';
  END IF;

  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason cannot exceed 500 characters';
  END IF;

  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Client request ID is required';
  END IF;

  -- 3. Fast-path Idempotency check (before acquiring row lock)
  SELECT id, transaction_number, stock_after, transaction_type, quantity_delta
  INTO v_existing_tx
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx.id,
      'transaction_number', v_existing_tx.transaction_number,
      'adjustment_type',   v_existing_tx.transaction_type,
      'quantity_delta',    v_existing_tx.quantity_delta,
      'idempotent',        TRUE
    );
  END IF;

  -- 4. Lock item & read current stock
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

  -- 5. Re-check Idempotency AFTER acquiring item row lock (handles concurrent requests race condition)
  SELECT id, transaction_number, stock_after, transaction_type, quantity_delta
  INTO v_existing_tx
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx.id,
      'transaction_number', v_existing_tx.transaction_number,
      'adjustment_type',   v_existing_tx.transaction_type,
      'quantity_delta',    v_existing_tx.quantity_delta,
      'idempotent',        TRUE
    );
  END IF;

  -- 6. Calculate delta
  v_delta := p_physical_stock - v_item.current_stock;

  -- 7. If no difference, no transaction needed
  IF v_delta = 0 THEN
    RETURN json_build_object(
      'transaction_id',     NULL,
      'transaction_number', NULL,
      'adjustment_type',   'NO_CHANGE',
      'quantity_delta',    0,
      'message',           'Tidak ada perbedaan stok, tidak ada transaksi dibuat.'
    );
  END IF;

  -- 8. Determine transaction type
  IF v_delta > 0 THEN
    v_transaction_type := 'ADJUSTMENT_IN';
  ELSE
    v_transaction_type := 'ADJUSTMENT_OUT';
  END IF;

  -- 9. Create transaction record
  v_transaction_id     := gen_random_uuid();
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

  -- 10. Update item stock
  UPDATE public.items
  SET current_stock = p_physical_stock,
      updated_at    = NOW()
  WHERE id = p_item_id;

  -- 11. Audit log for STOCK_ADJUSTMENT
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary, reason
  ) VALUES (
    v_user_id, 'STOCK_ADJUSTMENT', 'stock_transactions', v_transaction_id,
    json_build_object(
      'item_id',            p_item_id,
      'physical_stock',     p_physical_stock,
      'quantity_delta',     v_delta,
      'adjustment_type',    v_transaction_type,
      'stock_after',        p_physical_stock,
      'transaction_number', v_transaction_number
    ),
    p_reason
  );

  RETURN json_build_object(
    'transaction_id',     v_transaction_id,
    'transaction_number', v_transaction_number,
    'adjustment_type',   v_transaction_type,
    'quantity_delta',    v_delta,
    'idempotent',        FALSE
  );

EXCEPTION
  WHEN UNIQUE_VIOLATION THEN
    SELECT id, transaction_number, stock_after, transaction_type, quantity_delta
    INTO v_existing_tx
    FROM public.stock_transactions
    WHERE client_request_id = p_client_request_id
      AND performed_by = v_user_id;

    IF FOUND THEN
      RETURN json_build_object(
        'transaction_id',     v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'adjustment_type',   v_existing_tx.transaction_type,
        'quantity_delta',    v_existing_tx.quantity_delta,
        'idempotent',        TRUE
      );
    END IF;
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stock_adjustment(UUID, UUID, BIGINT, TEXT, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_stock_adjustment(UUID, UUID, BIGINT, TEXT, NUMERIC) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. FIX process_initial_stock
--    - Update initial check AND UNIQUE_VIOLATION check to include performed_by = v_user_id
--    - Add post-lock idempotency re-check after item row lock BEFORE checking SELECT COUNT(*)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_initial_stock(
  p_client_request_id UUID,
  p_item_id           UUID,
  p_input_quantity    BIGINT,
  p_unit_id           UUID,
  p_unit_price        NUMERIC DEFAULT NULL  -- Maintained for signature compatibility, unused
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id             UUID;
  v_is_active           BOOLEAN;
  v_conversion_factor   NUMERIC;
  v_base_quantity       BIGINT;
  v_transaction_id      UUID;
  v_transaction_number  TEXT;
  v_existing_tx_id      UUID;
  v_existing_stock      BIGINT;
  v_existing_tx_number  TEXT;
  v_tx_count            INT;
  v_existing_item_stock BIGINT;
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

  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Client request ID is required';
  END IF;

  -- 3. Fast-path Idempotency check with performed_by
  SELECT id, stock_after, transaction_number
  INTO v_existing_tx_id, v_existing_stock, v_existing_tx_number
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx_id,
      'transaction_number', v_existing_tx_number,
      'stock_after',        v_existing_stock,
      'idempotent',         TRUE
    );
  END IF;

  -- 4. Lock item & verify existence
  SELECT is_active, current_stock
  INTO v_is_active, v_existing_item_stock
  FROM public.items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: Item does not exist';
  END IF;

  -- 5. Re-check Idempotency AFTER acquiring item row lock (handles concurrent requests race condition)
  SELECT id, stock_after, transaction_number
  INTO v_existing_tx_id, v_existing_stock, v_existing_tx_number
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx_id,
      'transaction_number', v_existing_tx_number,
      'stock_after',        v_existing_stock,
      'idempotent',         TRUE
    );
  END IF;

  -- 6. Verify item active
  IF NOT v_is_active THEN
    RAISE EXCEPTION 'ITEM_INACTIVE: Cannot record initial stock for inactive item';
  END IF;

  -- 7. Verify no prior transactions
  SELECT COUNT(*) INTO v_tx_count
  FROM public.stock_transactions
  WHERE item_id = p_item_id;

  IF v_tx_count > 0 THEN
    RAISE EXCEPTION 'INITIAL_STOCK_ALREADY_EXISTS: Initial stock already recorded for this item';
  END IF;

  -- 8. Conversion factor
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

  -- 9. Calculate quantities
  v_base_quantity      := p_input_quantity * v_conversion_factor;
  v_transaction_id     := gen_random_uuid();
  v_transaction_number := public.generate_transaction_number();

  -- 10. Create transaction record
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

  -- 11. Update stock
  UPDATE public.items
  SET current_stock = v_base_quantity,
      updated_at    = NOW()
  WHERE id = p_item_id;

  -- 12. Audit log for STOCK_INITIAL
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary
  ) VALUES (
    v_user_id, 'STOCK_INITIAL', 'stock_transactions', v_transaction_id,
    json_build_object(
      'item_id',            p_item_id,
      'quantity',           p_input_quantity,
      'stock_after',        v_base_quantity,
      'transaction_number', v_transaction_number
    )
  );

  RETURN json_build_object(
    'transaction_id',     v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after',        v_base_quantity,
    'idempotent',         FALSE
  );

EXCEPTION
  WHEN UNIQUE_VIOLATION THEN
    SELECT id, stock_after, transaction_number
    INTO v_existing_tx_id, v_existing_stock, v_existing_tx_number
    FROM public.stock_transactions
    WHERE client_request_id = p_client_request_id
      AND performed_by = v_user_id;

    IF FOUND THEN
      RETURN json_build_object(
        'transaction_id',     v_existing_tx_id,
        'transaction_number', v_existing_tx_number,
        'stock_after',        v_existing_stock,
        'idempotent',         TRUE
      );
    ELSE
      RAISE;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_initial_stock(UUID, UUID, BIGINT, UUID, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_initial_stock(UUID, UUID, BIGINT, UUID, NUMERIC) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. FIX process_reversal
--    - Lock original transaction FOR UPDATE
--    - Double idempotency check (before lock and AFTER original tx lock BEFORE checking is_reversed)
--    - Lock item FOR UPDATE & read current_stock BEFORE calculating v_new_stock
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_reversal(
  p_client_request_id       UUID,
  p_original_transaction_id UUID,
  p_reason                  TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id            UUID;
  v_original           RECORD;
  v_transaction_id     UUID;
  v_transaction_number TEXT;
  v_reversal_delta     BIGINT;
  v_new_stock          BIGINT;
  v_existing_tx        RECORD;
  v_item_current_stock BIGINT;
BEGIN
  -- 1. Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate inputs
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason is required for reversal';
  END IF;
  IF length(p_reason) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason cannot exceed 500 characters';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Client request ID is required';
  END IF;

  -- 3. Fast-path Idempotency check (before acquiring row lock)
  SELECT id, transaction_number, stock_after
  INTO v_existing_tx
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx.id,
      'transaction_number', v_existing_tx.transaction_number,
      'stock_after',        v_existing_tx.stock_after,
      'idempotent',         TRUE
    );
  END IF;

  -- 4. Lock and fetch original transaction
  SELECT *
  INTO v_original
  FROM public.stock_transactions
  WHERE id = p_original_transaction_id
  FOR UPDATE;

  -- 5. Re-check Idempotency AFTER acquiring row lock on original transaction (BEFORE checking is_reversed)
  SELECT id, transaction_number, stock_after
  INTO v_existing_tx
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx.id,
      'transaction_number', v_existing_tx.transaction_number,
      'stock_after',        v_existing_tx.stock_after,
      'idempotent',         TRUE
    );
  END IF;

  -- 6. Validate reversal rules
  IF NOT FOUND AND v_original.id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Original transaction not found';
  END IF;

  IF v_original.transaction_type = 'REVERSAL' THEN
    RAISE EXCEPTION 'INVALID_STATE: REVERSAL transactions cannot be reversed';
  END IF;

  IF v_original.is_reversed THEN
    RAISE EXCEPTION 'INVALID_STATE: Transaction already reversed';
  END IF;

  -- 7. Lock item row and read latest stock in the SAME query BEFORE calculating v_new_stock
  SELECT current_stock
  INTO v_item_current_stock
  FROM public.items
  WHERE id = v_original.item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Item not found';
  END IF;

  -- 8. Calculate reversal delta & new stock from locked item current stock
  v_reversal_delta := -v_original.quantity_delta;
  v_new_stock      := v_item_current_stock + v_reversal_delta;

  -- 9. Validate no negative stock
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'INVALID_STATE: Reversal would cause negative stock. Current: %, Reversal delta: %',
      v_item_current_stock, v_reversal_delta;
  END IF;

  -- 10. Create reversal transaction
  v_transaction_id     := gen_random_uuid();
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
    v_item_current_stock, v_new_stock, p_reason,
    p_original_transaction_id
  );

  -- 11. Mark original as reversed
  UPDATE public.stock_transactions
  SET is_reversed             = TRUE,
      reversal_transaction_id = v_transaction_id
  WHERE id = p_original_transaction_id;

  -- 12. Update item stock
  UPDATE public.items
  SET current_stock = v_new_stock,
      updated_at    = NOW()
  WHERE id = v_original.item_id;

  -- 13. Audit log
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary, reason
  ) VALUES (
    v_user_id, 'STOCK_REVERSAL', 'stock_transactions', v_transaction_id,
    json_build_object(
      'original_transaction_id',     p_original_transaction_id,
      'reversal_transaction_number', v_transaction_number,
      'stock_after',                 v_new_stock
    ),
    p_reason
  );

  RETURN json_build_object(
    'transaction_id',     v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after',        v_new_stock,
    'idempotent',         FALSE
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
        'transaction_id',     v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'stock_after',        v_existing_tx.stock_after,
        'idempotent',         TRUE
      );
    END IF;
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_reversal(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_reversal(UUID, UUID, TEXT) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. FIX process_stock_out
--    - Add p_client_request_id IS NULL validation before idempotency check
--    - Add audit log for STOCK_OUT
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_stock_out(
  p_client_request_id UUID,
  p_item_id           UUID,
  p_input_quantity    BIGINT,
  p_unit_id           UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id            UUID;
  v_profile            RECORD;
  v_item               RECORD;
  v_conversion_factor  NUMERIC;
  v_base_quantity      BIGINT;
  v_transaction_id     UUID;
  v_transaction_number TEXT;
  v_existing_tx        RECORD;
  v_new_stock          BIGINT;
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

  -- 3. Validate client request ID
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Client request ID is required';
  END IF;

  -- 4. Idempotency check
  SELECT id, transaction_number, stock_after
  INTO v_existing_tx
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id
    AND performed_by = v_user_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx.id,
      'transaction_number', v_existing_tx.transaction_number,
      'stock_after',        v_existing_tx.stock_after,
      'idempotent',         TRUE
    );
  END IF;

  -- 5. Validate input quantity
  IF p_input_quantity IS NULL OR p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Quantity must be positive';
  END IF;

  -- 6. Lock and read item
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

  -- 7. Get conversion factor
  IF p_unit_id = v_item.base_unit_id THEN
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

  -- 8. Calculate base quantity
  v_base_quantity := p_input_quantity * v_conversion_factor;
  v_new_stock     := v_item.current_stock - v_base_quantity;

  -- 9. Check sufficient stock
  IF v_item.current_stock < v_base_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Not enough stock. Available: %, Required: %',
      v_item.current_stock, v_base_quantity;
  END IF;

  -- 10. Create transaction record
  v_transaction_id     := gen_random_uuid();
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
    v_item.current_stock, v_new_stock, NULL
  );

  -- 11. Update item stock
  UPDATE public.items
  SET current_stock = v_new_stock,
      updated_at    = NOW()
  WHERE id = p_item_id;

  -- 12. Audit log for STOCK_OUT
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary
  ) VALUES (
    v_user_id, 'STOCK_OUT', 'stock_transactions', v_transaction_id,
    json_build_object(
      'item_id',            p_item_id,
      'quantity',           p_input_quantity,
      'stock_after',        v_new_stock,
      'transaction_number', v_transaction_number
    )
  );

  RETURN json_build_object(
    'transaction_id',     v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after',        v_new_stock,
    'idempotent',         FALSE
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
        'transaction_id',     v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'stock_after',        v_existing_tx.stock_after,
        'idempotent',         TRUE
      );
    END IF;
    RAISE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stock_out(UUID, UUID, BIGINT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_stock_out(UUID, UUID, BIGINT, UUID) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 5. CREATE NON-AMBIGUOUS create_employee_account_v2 RPC
--    Zero-downtime deployment strategy:
--    - Migration 014 creates create_employee_account_v2 (3 params).
--    - Legacy create_employee_account (4 params) remains active so old app code in-flight does not break.
--    - App code is updated to call create_employee_account_v2 without temporary password.
--    - PostgREST has no ambiguity as the function name is distinct.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_employee_account_v2(
  p_username TEXT,
  p_full_name TEXT,
  p_auth_user_id UUID
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
    'EMPLOYEE', TRUE, TRUE
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
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_employee_account_v2(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_employee_account_v2(TEXT, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
