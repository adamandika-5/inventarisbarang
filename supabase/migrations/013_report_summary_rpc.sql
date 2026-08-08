-- ============================================================
-- Migration: 013_report_summary_rpc.sql
-- Description: Add aggregation RPC for Admin Reports summary.
--
-- Replaces fetching all transactions to Next.js / browser with
-- a single PostgreSQL aggregation RPC scanning stock_transactions once:
--   - total_transactions:    COUNT(*) of matching rows (incl. reversed originals & reversals)
--   - total_in:              SUM(base_quantity) for non-reversed IN/INITIAL/ADJUSTMENT_IN + REVERSALS (quantity_delta > 0)
--   - total_out:             SUM(base_quantity) for non-reversed OUT/ADJUSTMENT_OUT + REVERSALS (quantity_delta < 0)
--   - total_adjustment_in:   SUM(base_quantity) for non-reversed ADJUSTMENT_IN
--   - total_adjustment_out:  SUM(base_quantity) for non-reversed ADJUSTMENT_OUT
--   - total_reversal:        COUNT(*) of REVERSAL rows
--   - low_stock_count:       COUNT(*) of active items with stock <= minimum_stock (Global)
--
-- SECURITY:
--   - SECURITY INVOKER: executes under calling user's RLS
--   - Admin-only: auth check at top of function
--   - search_path locked to prevent search-path injection
--   - Explicit schema qualification (public.*)
--   - Granted to authenticated only
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_report_summary(
  p_from_at  TIMESTAMPTZ,
  p_to_at    TIMESTAMPTZ,
  p_type     TEXT DEFAULT NULL,
  p_item_id  UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id                 UUID;
  v_total_transactions      BIGINT;
  v_total_in                NUMERIC;
  v_total_out               NUMERIC;
  v_total_adjustment_in     NUMERIC;
  v_total_adjustment_out    NUMERIC;
  v_total_reversal          BIGINT;
  v_low_stock_count         BIGINT;
  v_clean_type              TEXT;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Admin-only check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 3. Validate input parameters
  IF p_from_at IS NULL OR p_to_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: Date bounds (p_from_at, p_to_at) are required';
  END IF;

  IF p_from_at >= p_to_at THEN
    RAISE EXCEPTION 'INVALID_INPUT: Start timestamp must be before end timestamp';
  END IF;

  -- Normalize and validate transaction type filter
  v_clean_type := upper(NULLIF(pg_catalog.btrim(p_type), ''));
  IF v_clean_type = 'ALL' THEN
    v_clean_type := NULL;
  END IF;

  IF v_clean_type IS NOT NULL AND v_clean_type NOT IN (
    'INITIAL', 'IN', 'OUT', 'ADJUSTMENT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL'
  ) THEN
    RAISE EXCEPTION 'INVALID_INPUT: Unknown transaction type "%"', p_type;
  END IF;

  -- 4. Single pass aggregation on stock_transactions
  SELECT
    -- total_transactions: all matching rows (including reversed originals and reversals)
    COUNT(*),

    -- total_in: non-reversed IN/INITIAL/ADJUSTMENT_IN + REVERSAL with positive delta
    COALESCE(SUM(
      CASE
        WHEN st.transaction_type IN ('IN', 'INITIAL', 'ADJUSTMENT_IN') AND st.is_reversed IS FALSE THEN st.base_quantity
        WHEN st.transaction_type = 'REVERSAL' AND st.quantity_delta > 0 THEN st.base_quantity
        ELSE 0
      END
    ), 0),

    -- total_out: non-reversed OUT/ADJUSTMENT_OUT + REVERSAL with negative delta
    COALESCE(SUM(
      CASE
        WHEN st.transaction_type IN ('OUT', 'ADJUSTMENT_OUT') AND st.is_reversed IS FALSE THEN st.base_quantity
        WHEN st.transaction_type = 'REVERSAL' AND st.quantity_delta < 0 THEN st.base_quantity
        ELSE 0
      END
    ), 0),

    -- total_adjustment_in: non-reversed original ADJUSTMENT_IN
    COALESCE(SUM(
      CASE
        WHEN st.transaction_type = 'ADJUSTMENT_IN' AND st.is_reversed IS FALSE THEN st.base_quantity
        ELSE 0
      END
    ), 0),

    -- total_adjustment_out: non-reversed original ADJUSTMENT_OUT
    COALESCE(SUM(
      CASE
        WHEN st.transaction_type = 'ADJUSTMENT_OUT' AND st.is_reversed IS FALSE THEN st.base_quantity
        ELSE 0
      END
    ), 0),

    -- total_reversal: count of REVERSAL rows
    COUNT(*) FILTER (WHERE st.transaction_type = 'REVERSAL')

  INTO
    v_total_transactions,
    v_total_in,
    v_total_out,
    v_total_adjustment_in,
    v_total_adjustment_out,
    v_total_reversal
  FROM public.stock_transactions st
  WHERE st.transaction_at >= p_from_at
    AND st.transaction_at  < p_to_at
    AND (p_item_id IS NULL OR st.item_id = p_item_id)
    AND (
      v_clean_type IS NULL OR
      (v_clean_type = 'ADJUSTMENT'     AND st.transaction_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')) OR
      (v_clean_type = 'INITIAL'        AND st.transaction_type = 'INITIAL') OR
      (v_clean_type = 'IN'             AND st.transaction_type = 'IN') OR
      (v_clean_type = 'OUT'            AND st.transaction_type = 'OUT') OR
      (v_clean_type = 'ADJUSTMENT_IN'  AND st.transaction_type = 'ADJUSTMENT_IN') OR
      (v_clean_type = 'ADJUSTMENT_OUT' AND st.transaction_type = 'ADJUSTMENT_OUT') OR
      (v_clean_type = 'REVERSAL'       AND st.transaction_type = 'REVERSAL')
    );

  -- 5. Low stock items count (Global: active items where current_stock <= minimum_stock)
  SELECT COUNT(*)
  INTO v_low_stock_count
  FROM public.items i
  WHERE i.is_active = TRUE
    AND i.current_stock <= i.minimum_stock;

  RETURN json_build_object(
    'total_in',              v_total_in,
    'total_out',             v_total_out,
    'total_adjustment_in',   v_total_adjustment_in,
    'total_adjustment_out',  v_total_adjustment_out,
    'total_reversal',        v_total_reversal,
    'total_transactions',    v_total_transactions,
    'low_stock_count',       v_low_stock_count
  );
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_report_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_report_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_report_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
