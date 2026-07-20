-- ============================================================
-- Migration: 002_rls_and_grants.sql
-- Description: Row Level Security policies and grants
--
-- SECURITY ARCHITECTURE:
--   - RLS enabled on all public tables
--   - Employees can only read safe data (no price data)
--   - Admins get full access appropriate to role
--   - No direct INSERT/UPDATE/DELETE on ledger tables
--   - All stock mutations through RPC functions
--   - Private schema has NO grants to anon/authenticated
-- ============================================================

-- ============================================================
-- 1. HELPER FUNCTIONS FOR RLS (non-recursive)
-- ============================================================

-- Check if current user is admin and active
-- SECURITY: Uses SECURITY DEFINER to avoid recursive RLS
-- search_path set to empty to prevent schema injection
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'ADMIN'
      AND is_active = TRUE
  );
$$;

-- Check if current user is active (any role)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = TRUE
  );
$$;

-- Get current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = TRUE
  LIMIT 1;
$$;

-- ============================================================
-- 2. ENABLE RLS ON ALL PUBLIC TABLES
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. PROFILES POLICIES
-- ============================================================

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid() AND is_active = TRUE);

-- Admins can read all profiles
CREATE POLICY "profiles_select_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_admin());

-- Only admins can update profiles (except own must_change_password)
CREATE POLICY "profiles_update_admin"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Users can update their own must_change_password = false (when changing password)
-- and last_sign_in_at — handled via RPC for security
-- No direct insert allowed — only via admin RPC

-- ============================================================
-- 4. CATEGORIES POLICIES
-- ============================================================

-- All active authenticated users can read categories
CREATE POLICY "categories_select"
ON public.categories FOR SELECT
TO authenticated
USING (public.is_active_user());

-- Only admins can insert/update categories
CREATE POLICY "categories_insert_admin"
ON public.categories FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "categories_update_admin"
ON public.categories FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- No delete on categories (use is_active)

-- ============================================================
-- 5. UNITS POLICIES
-- ============================================================

CREATE POLICY "units_select"
ON public.units FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "units_insert_admin"
ON public.units FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "units_update_admin"
ON public.units FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ============================================================
-- 6. ITEMS POLICIES
-- ============================================================

-- Employees can read active items (no price data in items table)
CREATE POLICY "items_select_employee"
ON public.items FOR SELECT
TO authenticated
USING (
  public.is_active_user() AND (
    is_active = TRUE  -- employees see only active items
    OR public.is_admin()  -- admins see all items
  )
);

-- Admins can insert/update items
CREATE POLICY "items_insert_admin"
ON public.items FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "items_update_admin"
ON public.items FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- No delete on items

-- ============================================================
-- 7. ITEM_UNITS POLICIES
-- ============================================================

CREATE POLICY "item_units_select"
ON public.item_units FOR SELECT
TO authenticated
USING (public.is_active_user());

CREATE POLICY "item_units_insert_admin"
ON public.item_units FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "item_units_update_admin"
ON public.item_units FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ============================================================
-- 8. STOCK_TRANSACTIONS POLICIES
-- ============================================================

-- CRITICAL: Employees can only see their OWN OUT transactions
-- Admins can see all transactions
-- NO direct INSERT/UPDATE/DELETE — must use RPC functions

CREATE POLICY "st_select_own_employee"
ON public.stock_transactions FOR SELECT
TO authenticated
USING (
  public.is_active_user() AND (
    (performed_by = auth.uid() AND transaction_type = 'OUT')  -- own out transactions
    OR public.is_admin()  -- admins see all
  )
);

-- No INSERT/UPDATE/DELETE policy for employees
-- Admin operations go through RPC SECURITY DEFINER functions
-- Direct writes are blocked by having no INSERT/UPDATE/DELETE policies

-- ============================================================
-- 9. AUDIT_LOGS POLICIES
-- ============================================================

-- Only admins can read audit logs
-- SECURITY: Even employees cannot see audit logs
CREATE POLICY "audit_logs_select_admin"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin());

-- No INSERT policy — all inserts via SECURITY DEFINER RPC functions only

-- ============================================================
-- 10. APP_SETTINGS POLICIES
-- ============================================================

-- All active users can read settings (for institution name display)
CREATE POLICY "app_settings_select"
ON public.app_settings FOR SELECT
TO authenticated
USING (public.is_active_user());

-- Only admins can update settings
CREATE POLICY "app_settings_update_admin"
ON public.app_settings FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ============================================================
-- 11. IMPORT_BATCHES POLICIES
-- ============================================================

-- Only admins can see import batch history
CREATE POLICY "import_batches_select_admin"
ON public.import_batches FOR SELECT
TO authenticated
USING (public.is_admin());

-- Insert via RPC only

-- ============================================================
-- 12. GRANTS
-- ============================================================

-- Grant usage on public schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- anon role: NO access to any tables (login is server-side only)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- authenticated role: selective grants
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (
  username, username_normalized, full_name,
  is_active, must_change_password, updated_at, last_sign_in_at
) ON public.profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.units TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.item_units TO authenticated;

-- stock_transactions: SELECT only (mutations via RPC)
GRANT SELECT ON public.stock_transactions TO authenticated;

-- audit_logs: SELECT only (inserts via SECURITY DEFINER RPCs)
GRANT SELECT ON public.audit_logs TO authenticated;

-- app_settings: SELECT and UPDATE (UPDATE filtered by RLS)
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;

-- import_batches: SELECT only (inserts via RPC)
GRANT SELECT ON public.import_batches TO authenticated;

-- Grant USAGE on sequences to authenticated for RPC functions
GRANT USAGE ON SEQUENCE public.sku_sequence TO authenticated;
GRANT USAGE ON SEQUENCE public.transaction_number_sequence TO authenticated;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- Revoke from PUBLIC/anon for security
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- Views
GRANT SELECT ON public.employee_items_view TO authenticated;
GRANT SELECT ON public.employee_own_transactions_view TO authenticated;

-- private schema: NO grants to any client role
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM anon, authenticated, PUBLIC;
REVOKE USAGE ON SCHEMA private FROM anon, authenticated, PUBLIC;
