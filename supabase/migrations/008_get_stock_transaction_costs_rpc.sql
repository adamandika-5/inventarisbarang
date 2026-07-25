-- Migration 008: RPC functions to safely retrieve stock transaction cost snapshots & item costs for authenticated admins

-- 1. get_stock_transaction_costs RPC
CREATE OR REPLACE FUNCTION public.get_stock_transaction_costs(
  p_transaction_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  unit_price_input NUMERIC,
  base_unit_cost NUMERIC,
  average_cost_before NUMERIC,
  average_cost_after NUMERIC,
  inventory_value_before NUMERIC,
  inventory_value_change NUMERIC,
  inventory_value_after NUMERIC,
  transaction_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 1. Validate authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Validate Admin role
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required to access transaction cost data';
  END IF;

  -- 3. Single query: NULL returns all rows, [] (empty array) returns zero rows, containing IDs filters by IDs
  RETURN QUERY
  SELECT 
    stc.transaction_id,
    stc.unit_price_input,
    stc.base_unit_cost,
    stc.average_cost_before,
    stc.average_cost_after,
    stc.inventory_value_before,
    stc.inventory_value_change,
    stc.inventory_value_after,
    stc.transaction_value
  FROM private.stock_transaction_costs stc
  WHERE p_transaction_ids IS NULL
     OR stc.transaction_id = ANY(p_transaction_ids);
END;
$$;

-- 2. get_item_costs RPC
CREATE OR REPLACE FUNCTION public.get_item_costs(
  p_item_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_id UUID,
  average_cost NUMERIC,
  inventory_value NUMERIC,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 1. Validate authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- 2. Validate Admin role
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin role required to access item cost data';
  END IF;

  -- 3. Single query: NULL returns all rows, [] (empty array) returns zero rows, containing IDs filters by IDs
  RETURN QUERY
  SELECT ic.item_id, ic.average_cost, ic.inventory_value, ic.updated_at
  FROM private.item_costs ic
  WHERE p_item_ids IS NULL
     OR ic.item_id = ANY(p_item_ids);
END;
$$;

-- Explicitly revoke execution access from PUBLIC and anon for security hardening
REVOKE EXECUTE ON FUNCTION public.get_stock_transaction_costs(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_stock_transaction_costs(UUID[]) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_item_costs(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_item_costs(UUID[]) FROM anon;

-- Grant execute permission only to authenticated users (role check inside function ensures only admins get data)
GRANT EXECUTE ON FUNCTION public.get_stock_transaction_costs(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_item_costs(UUID[]) TO authenticated;
