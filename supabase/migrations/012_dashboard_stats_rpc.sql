-- ============================================================
-- Migration: 012_dashboard_stats_rpc.sql
-- Description: Add aggregation RPC for Admin Dashboard statistics.
--
-- Replaces multiple client-side queries + JS aggregation with a
-- single PostgreSQL aggregation call:
--   - Barang Aktif:           COUNT(*) from items WHERE is_active
--   - Total Unit Stok:        SUM(current_stock) from active items
--   - Barang Keluar Bulan Ini: SUM(base_quantity) for OUT, not reversed, in WIB month
--   - Barang Keluar Tahun Ini: SUM(base_quantity) for OUT, not reversed, in WIB year
--   - Transaksi Bulan Ini:    COUNT(*) all transactions from month start to now
--
-- SECURITY:
--   - SECURITY INVOKER: reads public tables under caller's RLS
--   - Admin-only: auth check at the top of the function
--   - search_path locked to prevent search-path injection
--   - Granted to authenticated only (admin check inside)
-- ============================================================

-- ── 1. Composite index for outgoing stock queries ──────────────────────────────
CREATE INDEX IF NOT EXISTS st_out_active_at_idx
  ON public.stock_transactions (transaction_at)
  INCLUDE (base_quantity)
  WHERE transaction_type = 'OUT'
    AND is_reversed IS FALSE;

-- ── 2. get_dashboard_stats RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_tz   TEXT          DEFAULT 'Asia/Jakarta',
  p_now  TIMESTAMPTZ   DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id              UUID;
  v_now                  TIMESTAMPTZ;

  -- Derived period bounds (UTC-stored timestamps matching WIB calendar)
  v_month_start          TIMESTAMPTZ;
  v_next_month_start     TIMESTAMPTZ;
  v_year_start           TIMESTAMPTZ;
  v_next_year_start      TIMESTAMPTZ;

  -- Aggregated results
  v_active_items         BIGINT;
  v_total_stock_units    NUMERIC;
  v_low_stock_count      BIGINT;
  v_out_of_stock_count   BIGINT;
  v_outgoing_month_qty   NUMERIC;
  v_outgoing_year_qty    NUMERIC;
  v_month_transactions   BIGINT;
BEGIN
  -- 1. Authenticate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Admin-only
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required';
  END IF;

  -- 3. Validate timezone
  IF p_tz IS NULL OR pg_catalog.btrim(p_tz) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: Timezone is required';
  END IF;

  BEGIN
    PERFORM '2000-01-01 00:00:00 UTC'::TIMESTAMPTZ AT TIME ZONE p_tz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_INPUT: Unknown timezone "%"', p_tz;
  END;

  -- 4. Reference time (NULL → server now)
  v_now := COALESCE(p_now, NOW());

  -- 5. Compute WIB calendar period boundaries as UTC timestamps.
  v_month_start := date_trunc('month', v_now AT TIME ZONE p_tz)
                   AT TIME ZONE p_tz;

  v_next_month_start := (date_trunc('month', v_now AT TIME ZONE p_tz)
                         + INTERVAL '1 month')
                        AT TIME ZONE p_tz;

  v_year_start := date_trunc('year', v_now AT TIME ZONE p_tz)
                  AT TIME ZONE p_tz;

  v_next_year_start := (date_trunc('year', v_now AT TIME ZONE p_tz)
                        + INTERVAL '1 year')
                       AT TIME ZONE p_tz;

  -- 6. Aggregate active item counts and total stock in a single pass.
  SELECT
    COUNT(*)                                                            AS active_items,
    COALESCE(SUM(current_stock), 0)                                     AS total_stock,
    COUNT(*) FILTER (WHERE current_stock > 0
                      AND  current_stock <= minimum_stock)              AS low_stock,
    COUNT(*) FILTER (WHERE current_stock = 0)                           AS out_of_stock
  INTO v_active_items, v_total_stock_units, v_low_stock_count, v_out_of_stock_count
  FROM public.items
  WHERE is_active = TRUE;

  -- 7. Outgoing qty for current WIB month:
  SELECT COALESCE(SUM(base_quantity), 0)
  INTO v_outgoing_month_qty
  FROM public.stock_transactions
  WHERE transaction_type = 'OUT'
    AND is_reversed       IS FALSE
    AND transaction_at   >= v_month_start
    AND transaction_at    < v_next_month_start;

  -- 8. Outgoing qty for current WIB year:
  SELECT COALESCE(SUM(base_quantity), 0)
  INTO v_outgoing_year_qty
  FROM public.stock_transactions
  WHERE transaction_type = 'OUT'
    AND is_reversed       IS FALSE
    AND transaction_at   >= v_year_start
    AND transaction_at    < v_next_year_start;

  -- 9. Count ALL transactions from WIB month start to now
  SELECT COUNT(*)
  INTO v_month_transactions
  FROM public.stock_transactions
  WHERE transaction_at >= v_month_start
    AND transaction_at <= v_now;

  RETURN json_build_object(
    'active_items_count',       v_active_items,
    'total_stock_units',        v_total_stock_units,
    'low_stock_count',          v_low_stock_count,
    'out_of_stock_count',       v_out_of_stock_count,
    'outgoing_month_qty',       v_outgoing_month_qty,
    'outgoing_year_qty',        v_outgoing_year_qty,
    'month_transactions_count', v_month_transactions
  );
END;
$$;

-- ── 3. Grants ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(TEXT, TIMESTAMPTZ) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_stats(TEXT, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
