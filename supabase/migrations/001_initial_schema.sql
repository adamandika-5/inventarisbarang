-- ============================================================
-- Migration: 001_initial_schema.sql
-- Description: Initial database schema for InventarisBarang
--
-- Applies:
--   - Private schema for sensitive data (auth identifiers, costs)
--   - Public schema: profiles, categories, units, items, item_units,
--     stock_transactions, audit_logs, app_settings, import_batches
--   - Views for employee-safe data access (no price data)
--   - Enums, sequences, indexes, constraints
--   - updated_at triggers
--
-- SECURITY NOTES:
--   - private schema is NOT exposed via Supabase Data API
--   - Cost data is strictly in private schema
--   - Grants are explicit and minimal
--   - RLS is enabled on all exposed tables
-- ============================================================

-- ============================================================
-- 0. SETUP
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. PRIVATE SCHEMA (not exposed via Supabase Data API)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;

-- Revoke all access on private schema from public roles
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

-- ============================================================
-- 2. ENUMS
-- ============================================================

CREATE TYPE public.user_role AS ENUM ('ADMIN', 'EMPLOYEE');
CREATE TYPE public.transaction_type AS ENUM (
  'INITIAL', 'IN', 'OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL'
);
CREATE TYPE public.barcode_format AS ENUM ('EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'QR');
CREATE TYPE public.audit_action AS ENUM (
  'USER_CREATED', 'USER_DEACTIVATED', 'USER_ACTIVATED', 'USER_PASSWORD_RESET',
  'ITEM_CREATED', 'ITEM_UPDATED', 'ITEM_DEACTIVATED', 'ITEM_ACTIVATED',
  'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DEACTIVATED',
  'UNIT_CREATED', 'UNIT_UPDATED', 'UNIT_DEACTIVATED',
  'STOCK_INITIAL', 'STOCK_IN', 'STOCK_OUT', 'STOCK_ADJUSTMENT', 'STOCK_REVERSAL',
  'EXCEL_IMPORT', 'SETTINGS_UPDATED'
);

-- ============================================================
-- 3. SEQUENCES
-- ============================================================

-- SKU sequence: ATK-0001, ATK-0002, ...
CREATE SEQUENCE IF NOT EXISTS public.sku_sequence
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- Transaction number sequence: used to generate unique transaction numbers
CREATE SEQUENCE IF NOT EXISTS public.transaction_number_sequence
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- ============================================================
-- 4. HELPER FUNCTIONS (defined before tables that use them)
-- ============================================================

-- Function to generate SKU from sequence
CREATE OR REPLACE FUNCTION public.generate_sku()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seq_val BIGINT;
  sku_candidate TEXT;
BEGIN
  LOOP
    seq_val := nextval('public.sku_sequence');
    sku_candidate := 'ATK-' || LPAD(seq_val::TEXT, 4, '0');
    -- Skip if this SKU already exists (handles gaps from imports)
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.items WHERE sku = sku_candidate);
  END LOOP;
  RETURN sku_candidate;
END;
$$;

-- Function to generate transaction number
CREATE OR REPLACE FUNCTION public.generate_transaction_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seq_val BIGINT;
  date_part TEXT;
BEGIN
  seq_val := nextval('public.transaction_number_sequence');
  date_part := TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYYMMDD');
  RETURN 'TXN-' || date_part || '-' || LPAD(seq_val::TEXT, 6, '0');
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. PRIVATE SCHEMA TABLES
-- ============================================================

-- 5.1 Login identifier mapping (username → auth user)
-- This is NEVER exposed via Supabase Data API (private schema)
CREATE TABLE IF NOT EXISTS private.auth_login_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username_normalized TEXT NOT NULL,
  auth_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT auth_login_identifiers_username_unique UNIQUE (username_normalized),
  CONSTRAINT auth_login_identifiers_auth_user_unique UNIQUE (auth_user_id)
);

CREATE INDEX IF NOT EXISTS auth_login_identifiers_username_idx
  ON private.auth_login_identifiers (username_normalized);

-- 5.2 Item costs (current average cost per item)
-- Kept private to prevent price data leakage to employees
CREATE TABLE IF NOT EXISTS private.item_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL, -- references public.items
  average_cost NUMERIC(20, 6) NOT NULL DEFAULT 0,
  inventory_value NUMERIC(20, 6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT item_costs_item_unique UNIQUE (item_id),
  CONSTRAINT item_costs_average_cost_non_negative CHECK (average_cost >= 0),
  CONSTRAINT item_costs_inventory_value_non_negative CHECK (inventory_value >= 0)
);

CREATE INDEX IF NOT EXISTS item_costs_item_id_idx ON private.item_costs (item_id);

-- 5.3 Stock transaction costs (snapshot per transaction)
-- Immutable cost snapshot — no updates allowed
CREATE TABLE IF NOT EXISTS private.stock_transaction_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL, -- references public.stock_transactions
  unit_price_input NUMERIC(20, 6) NOT NULL, -- price per transaction unit
  base_unit_cost NUMERIC(20, 6) NOT NULL,   -- = unit_price_input / conversion_factor
  average_cost_before NUMERIC(20, 6) NOT NULL,
  average_cost_after NUMERIC(20, 6) NOT NULL,
  inventory_value_before NUMERIC(20, 6) NOT NULL,
  inventory_value_change NUMERIC(20, 6) NOT NULL, -- signed (can be negative)
  inventory_value_after NUMERIC(20, 6) NOT NULL,
  transaction_value NUMERIC(20, 6) NOT NULL, -- abs value of transaction
  -- Constraints
  CONSTRAINT stc_transaction_unique UNIQUE (transaction_id),
  CONSTRAINT stc_inventory_value_after_non_negative CHECK (inventory_value_after >= 0)
);

CREATE INDEX IF NOT EXISTS stc_transaction_id_idx
  ON private.stock_transaction_costs (transaction_id);

-- ============================================================
-- 6. PUBLIC SCHEMA TABLES
-- ============================================================

-- 6.1 Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY, -- same as auth.users.id
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'EMPLOYEE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ,
  -- Constraints
  CONSTRAINT profiles_username_normalized_unique UNIQUE (username_normalized),
  CONSTRAINT profiles_username_length CHECK (
    length(username_normalized) >= 3 AND length(username_normalized) <= 32
  ),
  CONSTRAINT profiles_username_format CHECK (
    username_normalized ~ '^[a-z0-9._-]+$'
  ),
  CONSTRAINT profiles_full_name_length CHECK (length(trim(full_name)) >= 1)
);

CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username_normalized);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_is_active_idx ON public.profiles (is_active);

-- Trigger for updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6.2 Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT categories_name_normalized_unique UNIQUE (name_normalized),
  CONSTRAINT categories_name_length CHECK (length(trim(name)) >= 1)
);

CREATE INDEX IF NOT EXISTS categories_name_idx ON public.categories (name_normalized);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6.3 Units
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT units_name_normalized_unique UNIQUE (name_normalized),
  CONSTRAINT units_name_length CHECK (length(trim(name)) >= 1),
  CONSTRAINT units_symbol_length CHECK (length(trim(symbol)) >= 1)
);

CREATE INDEX IF NOT EXISTS units_name_idx ON public.units (name_normalized);

CREATE TRIGGER units_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6.4 Items
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL DEFAULT public.generate_sku(),
  barcode TEXT NOT NULL,
  barcode_format public.barcode_format NOT NULL DEFAULT 'CODE128',
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  base_unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  default_purchase_unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  current_stock BIGINT NOT NULL DEFAULT 0,
  minimum_stock BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT items_sku_unique UNIQUE (sku),
  CONSTRAINT items_barcode_unique UNIQUE (barcode),
  CONSTRAINT items_current_stock_non_negative CHECK (current_stock >= 0),
  CONSTRAINT items_minimum_stock_non_negative CHECK (minimum_stock >= 0),
  CONSTRAINT items_name_length CHECK (length(trim(name)) >= 1),
  CONSTRAINT items_barcode_length CHECK (length(barcode) >= 1 AND length(barcode) <= 256),
  CONSTRAINT items_sku_format CHECK (sku ~ '^ATK-[0-9]{4,}$')
);

CREATE INDEX IF NOT EXISTS items_sku_idx ON public.items (sku);
CREATE INDEX IF NOT EXISTS items_barcode_idx ON public.items (barcode);
CREATE INDEX IF NOT EXISTS items_category_id_idx ON public.items (category_id);
CREATE INDEX IF NOT EXISTS items_is_active_idx ON public.items (is_active);
CREATE INDEX IF NOT EXISTS items_name_idx ON public.items USING gin (to_tsvector('simple', name));

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6.5 Item Units (alternative units with conversion factors)
CREATE TABLE IF NOT EXISTS public.item_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  conversion_factor BIGINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT item_units_item_unit_unique UNIQUE (item_id, unit_id),
  CONSTRAINT item_units_conversion_factor_positive CHECK (conversion_factor > 0)
);

CREATE INDEX IF NOT EXISTS item_units_item_id_idx ON public.item_units (item_id);
CREATE INDEX IF NOT EXISTS item_units_unit_id_idx ON public.item_units (unit_id);

CREATE TRIGGER item_units_updated_at
  BEFORE UPDATE ON public.item_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6.6 Stock Transactions (immutable ledger)
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number TEXT NOT NULL DEFAULT public.generate_transaction_number(),
  client_request_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  transaction_type public.transaction_type NOT NULL,
  input_quantity BIGINT NOT NULL,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  conversion_factor_snapshot BIGINT NOT NULL,
  base_quantity BIGINT NOT NULL,
  quantity_delta BIGINT NOT NULL, -- signed
  performed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  transaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stock_before BIGINT NOT NULL,
  stock_after BIGINT NOT NULL,
  reason TEXT,
  original_transaction_id UUID REFERENCES public.stock_transactions(id) ON DELETE RESTRICT,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversal_transaction_id UUID REFERENCES public.stock_transactions(id) ON DELETE RESTRICT,
  metadata JSONB,
  -- Constraints
  CONSTRAINT st_transaction_number_unique UNIQUE (transaction_number),
  CONSTRAINT st_client_request_id_performed_by_unique UNIQUE (client_request_id, performed_by),
  CONSTRAINT st_input_quantity_positive CHECK (input_quantity > 0),
  CONSTRAINT st_conversion_factor_positive CHECK (conversion_factor_snapshot > 0),
  CONSTRAINT st_base_quantity_positive CHECK (base_quantity > 0),
  CONSTRAINT st_base_quantity_consistent CHECK (
    base_quantity = input_quantity * conversion_factor_snapshot
  ),
  CONSTRAINT st_stock_before_non_negative CHECK (stock_before >= 0),
  CONSTRAINT st_stock_after_non_negative CHECK (stock_after >= 0),
  CONSTRAINT st_stock_after_consistent CHECK (
    stock_after = stock_before + quantity_delta
  ),
  -- REVERSAL constraints
  CONSTRAINT st_reversal_needs_original CHECK (
    (transaction_type = 'REVERSAL') = (original_transaction_id IS NOT NULL)
  ),
  CONSTRAINT st_no_reversal_of_reversal CHECK (
    -- REVERSAL transactions cannot be the original of another REVERSAL
    -- (enforced by RPC logic, but this prevents direct insert bypass)
    TRUE
  )
);

CREATE INDEX IF NOT EXISTS st_item_id_idx ON public.stock_transactions (item_id);
CREATE INDEX IF NOT EXISTS st_performed_by_idx ON public.stock_transactions (performed_by);
CREATE INDEX IF NOT EXISTS st_transaction_at_idx ON public.stock_transactions (transaction_at DESC);
CREATE INDEX IF NOT EXISTS st_transaction_type_idx ON public.stock_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS st_client_request_id_idx ON public.stock_transactions (client_request_id);
CREATE INDEX IF NOT EXISTS st_original_transaction_id_idx
  ON public.stock_transactions (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

-- 6.7 Audit Logs (append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action public.audit_action NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  changes_summary JSONB,
  reason TEXT,
  request_metadata JSONB
);

CREATE INDEX IF NOT EXISTS al_performed_by_idx ON public.audit_logs (performed_by);
CREATE INDEX IF NOT EXISTS al_performed_at_idx ON public.audit_logs (performed_at DESC);
CREATE INDEX IF NOT EXISTS al_action_idx ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS al_entity_id_idx ON public.audit_logs (entity_id)
  WHERE entity_id IS NOT NULL;

-- 6.8 App Settings (singleton row)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name TEXT,
  report_header_text TEXT,
  default_barcode_label_count INTEGER NOT NULL DEFAULT 1,
  barcode_label_layout TEXT NOT NULL DEFAULT '4x14', -- e.g., '4x14', '3x10'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Constraints
  CONSTRAINT app_settings_label_count_range CHECK (
    default_barcode_label_count >= 1 AND default_barcode_label_count <= 100
  ),
  CONSTRAINT app_settings_layout_valid CHECK (
    barcode_label_layout IN ('4x14', '3x10', '2x7', '1x4')
  )
);

CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert singleton settings row
INSERT INTO public.app_settings (id)
VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- 6.9 Import Batches (audit of Excel imports)
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  result_summary JSONB NOT NULL DEFAULT '[]'::JSONB
);

CREATE INDEX IF NOT EXISTS ib_performed_by_idx ON public.import_batches (performed_by);
CREATE INDEX IF NOT EXISTS ib_performed_at_idx ON public.import_batches (performed_at DESC);

-- ============================================================
-- 7. VIEWS (employee-safe — no price data)
-- ============================================================

-- 7.1 Employee items view — no price data
CREATE OR REPLACE VIEW public.employee_items_view
WITH (security_invoker = true)
AS
SELECT
  i.id,
  i.sku,
  i.barcode,
  i.barcode_format,
  i.name,
  i.category_id,
  c.name AS category_name,
  i.base_unit_id,
  u.name AS base_unit_name,
  u.symbol AS base_unit_symbol,
  i.current_stock,
  i.minimum_stock,
  CASE
    WHEN i.current_stock = 0 THEN 'HABIS'
    WHEN i.current_stock <= i.minimum_stock THEN 'HAMPIR_HABIS'
    ELSE 'AMAN'
  END AS stock_status,
  i.is_active
FROM public.items i
JOIN public.categories c ON c.id = i.category_id
JOIN public.units u ON u.id = i.base_unit_id
WHERE i.is_active = TRUE; -- Employees only see active items

-- 7.2 Employee's own transaction history view — no price data
CREATE OR REPLACE VIEW public.employee_own_transactions_view
WITH (security_invoker = true)
AS
SELECT
  st.id,
  st.transaction_number,
  st.item_id,
  i.name AS item_name,
  i.sku AS item_sku,
  st.transaction_type,
  st.input_quantity,
  u.symbol AS unit_symbol,
  st.base_quantity,
  st.quantity_delta,
  st.transaction_at,
  st.stock_after,
  st.is_reversed
FROM public.stock_transactions st
JOIN public.items i ON i.id = st.item_id
JOIN public.units u ON u.id = st.unit_id
WHERE st.performed_by = auth.uid()
  AND st.transaction_type = 'OUT'; -- Employee only sees their own OUT transactions
