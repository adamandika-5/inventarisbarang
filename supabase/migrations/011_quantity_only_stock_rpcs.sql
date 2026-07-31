-- ============================================================
-- Migration: 011_quantity_only_stock_rpcs.sql
-- Description: Ubah seluruh RPC stok menjadi quantity-only.
--
-- PRINSIP:
--   - Tidak ada data harga yang dikirim dari client.
--   - p_unit_price dipertahankan hanya untuk kompatibilitas signature.
--   - Parameter p_unit_price TIDAK PERNAH digunakan dalam perhitungan.
--   - Tidak ada percabangan yang memproses biaya ketika p_unit_price ada.
--   - Tidak ada INSERT ke private.stock_transaction_costs.
--   - Tidak ada INSERT/UPDATE ke private.item_costs.
--   - Tidak ada SELECT dari kedua tabel biaya tersebut.
--   - Tidak ada DROP NOT NULL, DROP COLUMN, atau perubahan constraint.
--   - Tidak ada UPDATE pada data historis.
--   - Tidak ada DEFAULT 0, tidak ada COALESCE harga ke 0.
--
-- TABEL BIAYA DIBEKUKAN (tidak disentuh):
--   private.stock_transaction_costs — struktur & data historis utuh.
--   private.item_costs              — struktur & data historis utuh.
--
-- DASAR FUNGSI (versi terbaru masing-masing):
--   process_stock_in        → 006 (terbaru)
--   process_initial_stock   → 009 (terbaru, bukan 006)
--   process_stock_out       → 006 (terbaru)
--   process_stock_adjustment → 003 (terbaru)
--   process_reversal        → 003 (terbaru)
--
-- TIDAK MENYENTUH:
--   log_audit_event    — tetap dari migration 010
--   toggle_item_active — tetap dari migration 010
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. process_stock_in — quantity-only
--    Basis: 006, baris 238–442
--    Semua blok biaya dihapus tanpa percabangan.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_stock_in(
  p_client_request_id UUID,
  p_item_id           UUID,
  p_input_quantity    BIGINT,
  p_unit_id           UUID,
  p_unit_price        NUMERIC DEFAULT NULL  -- Dipertahankan untuk kompatibilitas, tidak digunakan
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id            UUID;
  v_item               RECORD;
  v_conversion_factor  NUMERIC;
  v_base_quantity      BIGINT;
  v_new_stock          BIGINT;
  v_transaction_id     UUID;
  v_transaction_number TEXT;
  v_existing_tx        RECORD;
BEGIN
  -- 1. Validate authentication and admin role
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate quantity
  IF p_input_quantity IS NULL OR p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Quantity must be positive';
  END IF;

  -- 3. Idempotency check
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

  -- 5. Get conversion factor (scalar variable)
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

  -- 6. Calculate quantities only (no price calculation)
  v_base_quantity := p_input_quantity * v_conversion_factor;
  v_new_stock     := v_item.current_stock + v_base_quantity;

  -- 7. Create transaction
  v_transaction_id     := gen_random_uuid();
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

  -- 8. Update item stock
  UPDATE public.items
  SET current_stock = v_new_stock,
      updated_at    = NOW()
  WHERE id = p_item_id;

  -- [QUANTITY-ONLY] Blok biaya dihapus sepenuhnya:
  --   Tidak ada SELECT dari private.item_costs
  --   Tidak ada kalkulasi base_unit_cost / purchase_value
  --   Tidak ada INSERT ke private.stock_transaction_costs
  --   Tidak ada INSERT/UPDATE ke private.item_costs

  -- 9. Write audit log (no price data)
  INSERT INTO public.audit_logs (
    performed_by, action, entity_type, entity_id, changes_summary
  ) VALUES (
    v_user_id, 'STOCK_IN', 'stock_transactions', v_transaction_id,
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

REVOKE EXECUTE ON FUNCTION public.process_stock_in(UUID, UUID, BIGINT, UUID, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_stock_in(UUID, UUID, BIGINT, UUID, NUMERIC) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. process_initial_stock — quantity-only
--    Basis: 009 (BUKAN 006) — 009 menambah audit STOCK_INITIAL
--    dan memperbaiki idempotency check.
--    Semua blok biaya dihapus tanpa percabangan.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_initial_stock(
  p_client_request_id UUID,
  p_item_id           UUID,
  p_input_quantity    BIGINT,
  p_unit_id           UUID,
  p_unit_price        NUMERIC DEFAULT NULL  -- Dipertahankan untuk kompatibilitas, tidak digunakan
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
  -- 1. Auth check (dari 009)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 2. Validate inputs (dari 009)
  IF p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Quantity must be positive';
  END IF;

  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Client request ID is required';
  END IF;

  -- 3. Idempotency (dari 009)
  SELECT id, stock_after, transaction_number
  INTO v_existing_tx_id, v_existing_stock, v_existing_tx_number
  FROM public.stock_transactions
  WHERE client_request_id = p_client_request_id;

  IF FOUND THEN
    RETURN json_build_object(
      'transaction_id',     v_existing_tx_id,
      'transaction_number', v_existing_tx_number,
      'stock_after',        v_existing_stock,
      'idempotent',         TRUE
    );
  END IF;

  -- 4. Lock item & verify active (dari 009)
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

  -- 5. Verify no prior transactions (dari 009)
  SELECT COUNT(*) INTO v_tx_count
  FROM public.stock_transactions
  WHERE item_id = p_item_id;

  IF v_tx_count > 0 THEN
    RAISE EXCEPTION 'INITIAL_STOCK_ALREADY_EXISTS: Initial stock already recorded for this item';
  END IF;

  -- 6. Conversion factor (dari 009)
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

  -- 7. Quantities only (no price calculation)
  v_base_quantity      := p_input_quantity * v_conversion_factor;
  v_transaction_id     := gen_random_uuid();
  v_transaction_number := public.generate_transaction_number();

  -- 8. Create transaction
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

  -- 9. Update stock
  UPDATE public.items
  SET current_stock = v_base_quantity,
      updated_at    = NOW()
  WHERE id = p_item_id;

  -- [QUANTITY-ONLY] Blok biaya dihapus sepenuhnya (dari 009 step 9):
  --   Tidak ada INSERT ke private.stock_transaction_costs
  --   Tidak ada INSERT ke private.item_costs

  -- 10. Write audit log STOCK_INITIAL (dari 009 step 10 — dipertahankan)
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
    WHERE client_request_id = p_client_request_id;

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
-- 3. process_stock_out — hapus blok biaya
--    Basis: 006, baris 33–231
--    Langkah 9 (SELECT item_costs) dan 12 (INSERT stc + UPDATE item_costs) dihapus.
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

  -- 3. Idempotency check
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

  -- 4. Validate input quantity
  IF p_input_quantity IS NULL OR p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Quantity must be positive';
  END IF;

  -- 5. Lock and read item
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

  -- 6. Get conversion factor (scalar variable, not RECORD)
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

  -- 7. Calculate base quantity
  v_base_quantity := p_input_quantity * v_conversion_factor;

  -- 8. Check sufficient stock
  IF v_item.current_stock < v_base_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Not enough stock. Available: %, Required: %',
      v_item.current_stock, v_base_quantity;
  END IF;

  -- [QUANTITY-ONLY] Langkah 9 dihapus:
  --   Tidak ada SELECT dari private.item_costs

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
    p_item_id, 'OUT',
    p_input_quantity, p_unit_id, v_conversion_factor, v_base_quantity,
    -v_base_quantity, v_user_id, NOW(),
    v_item.current_stock, v_item.current_stock - v_base_quantity, NULL
  );

  -- 10. Update item stock
  UPDATE public.items
  SET current_stock = current_stock - v_base_quantity,
      updated_at    = NOW()
  WHERE id = p_item_id;

  -- [QUANTITY-ONLY] Langkah 12 dihapus (dari 006 baris 162–203):
  --   Tidak ada INSERT ke private.stock_transaction_costs
  --   Tidak ada UPDATE ke private.item_costs

  RETURN json_build_object(
    'transaction_id',     v_transaction_id,
    'transaction_number', v_transaction_number,
    'stock_after',        v_item.current_stock - v_base_quantity,
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
-- 4. process_stock_adjustment — hapus blok biaya
--    Basis: 003, baris 579–774
--    Langkah 7 (SELECT item_costs), 8 (cost basis + RAISE tanpa harga),
--    dan 12 (INSERT stc + UPDATE item_costs) dihapus.
--    ADJUSTMENT_IN sekarang diizinkan tanpa harga.
--    Signature lima parameter dipertahankan (tidak ada overload baru).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_stock_adjustment(
  p_client_request_id UUID,
  p_item_id           UUID,
  p_physical_stock    BIGINT,
  p_reason            TEXT,
  p_unit_price        NUMERIC DEFAULT NULL  -- Dipertahankan untuk kompatibilitas, tidak digunakan
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

  -- 3. Lock item
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

  -- 4. Calculate delta
  v_delta := p_physical_stock - v_item.current_stock;

  -- 5. If no difference, no transaction needed
  IF v_delta = 0 THEN
    RETURN json_build_object(
      'transaction_id',    NULL,
      'transaction_number', NULL,
      'adjustment_type',   'NO_CHANGE',
      'quantity_delta',    0,
      'message',           'Tidak ada perbedaan stok, tidak ada transaksi dibuat.'
    );
  END IF;

  -- 6. Determine transaction type
  IF v_delta > 0 THEN
    v_transaction_type := 'ADJUSTMENT_IN';
  ELSE
    v_transaction_type := 'ADJUSTMENT_OUT';
  END IF;

  -- [QUANTITY-ONLY] Langkah 7 dihapus: SELECT dari private.item_costs
  -- [QUANTITY-ONLY] Langkah 8 dihapus: cost basis + RAISE untuk ADJUSTMENT_IN tanpa harga
  --   ADJUSTMENT_IN sekarang diizinkan tanpa harga

  -- 7. Idempotency check
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
        'transaction_id',    v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'adjustment_type',   v_transaction_type,
        'quantity_delta',    v_delta,
        'idempotent',        TRUE
      );
    END IF;
  END;

  -- 8. Create transaction
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

  -- 9. Update stock
  UPDATE public.items
  SET current_stock = p_physical_stock,
      updated_at    = NOW()
  WHERE id = p_item_id;

  -- [QUANTITY-ONLY] Langkah 12 dihapus (dari 003 baris 726–763):
  --   Tidak ada INSERT ke private.stock_transaction_costs
  --   Tidak ada INSERT/UPDATE ke private.item_costs

  RETURN json_build_object(
    'transaction_id',    v_transaction_id,
    'transaction_number', v_transaction_number,
    'adjustment_type',   v_transaction_type,
    'quantity_delta',    v_delta,
    'idempotent',        FALSE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_stock_adjustment(UUID, UUID, BIGINT, TEXT, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_stock_adjustment(UUID, UUID, BIGINT, TEXT, NUMERIC) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. process_reversal — hapus blok cost reversal
--    Basis: 003, baris 780–979
--    Langkah 12 (Handle cost reversal, baris 904–956) dihapus seluruhnya.
--    Snapshot biaya historis dari transaksi LAMA tidak diubah.
--    Reversal BARU hanya mengoreksi kuantitas stok.
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
  v_new_stock      := v_original.item_current_stock + v_reversal_delta;

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
        'transaction_id',     v_existing_tx.id,
        'transaction_number', v_existing_tx.transaction_number,
        'stock_after',        v_existing_tx.stock_after,
        'idempotent',         TRUE
      );
    END IF;
  END;

  -- 9. Create reversal transaction
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
    v_original.item_current_stock, v_new_stock, p_reason,
    p_original_transaction_id
  );

  -- 10. Mark original as reversed
  UPDATE public.stock_transactions
  SET is_reversed             = TRUE,
      reversal_transaction_id = v_transaction_id
  WHERE id = p_original_transaction_id;

  -- 11. Update item stock
  UPDATE public.items
  SET current_stock = v_new_stock,
      updated_at    = NOW()
  WHERE id = v_original.item_id;

  -- [QUANTITY-ONLY] Langkah 12 dihapus (dari 003 baris 904–956):
  --   Tidak ada SELECT dari private.stock_transaction_costs
  --   Tidak ada SELECT dari private.item_costs
  --   Tidak ada INSERT ke private.stock_transaction_costs
  --   Tidak ada UPDATE ke private.item_costs
  --   Snapshot biaya historis transaksi lama tetap tidak berubah.

  -- 12. Audit log
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_reversal(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_reversal(UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
