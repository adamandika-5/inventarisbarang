import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Tahap 1 SQL Migration & Application Contract Unit Tests
 *
 * NOTE & LIMITATION ACKNOWLEDGEMENT:
 * Real PL/pgSQL database execution tests on PostgreSQL / Supabase could NOT be executed
 * because Docker/Podman engine is not installed on this system.
 *
 * These tests perform structural analysis directly on the source SQL migration file (014)
 * and application code (actions.ts, database.ts) to verify strict adherence to required contracts.
 */

const MIGRATION_PATH = path.join(process.cwd(), 'supabase/migrations/014_fix_idempotency_audit_logs_and_admin_bootstrap.sql')
const ACTIONS_PATH = path.join(process.cwd(), 'src/app/admin/users/actions.ts')
const TYPES_PATH = path.join(process.cwd(), 'src/types/database.ts')

describe('Tahap 1 — SQL Source Structural Verifications (Migration 014)', () => {
  const sqlContent = fs.readFileSync(MIGRATION_PATH, 'utf-8')

  it('1. process_initial_stock performs post-lock idempotency re-check strictly after item FOR UPDATE end and before SELECT COUNT', () => {
    const funcMatch = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.process_initial_stock[\s\S]*?END;\s*\$\$/i)
    expect(funcMatch).not.toBeNull()
    const funcBody = funcMatch![0]

    // 1. Fast-path before item lock uses performed_by = v_user_id
    const fastPathMatch = funcBody.match(/SELECT id, stock_after, transaction_number[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE client_request_id = p_client_request_id\s+AND performed_by = v_user_id/i)
    expect(fastPathMatch).not.toBeNull()
    const fastPathIndex = fastPathMatch!.index!

    // 2. Specific item row lock query
    const itemLockMatch = funcBody.match(/SELECT is_active, current_stock[\s\S]*?INTO v_is_active, v_existing_item_stock[\s\S]*?FROM public\.items[\s\S]*?WHERE id = p_item_id[\s\S]*?FOR UPDATE/i)
    expect(itemLockMatch).not.toBeNull()
    const itemLockStartIndex = itemLockMatch!.index!
    const itemLockEndIndex = itemLockStartIndex + itemLockMatch![0].length

    // Fast-path MUST be strictly before item lock start
    expect(fastPathIndex).toBeLessThan(itemLockStartIndex)

    // 3. SELECT COUNT(*) transactions check
    const countCheckMatch = funcBody.match(/SELECT COUNT\(\*\)\s+INTO v_tx_count\s+FROM public\.stock_transactions[\s\S]*?WHERE item_id = p_item_id/i)
    expect(countCheckMatch).not.toBeNull()
    const countCheckIndex = countCheckMatch!.index!
    expect(countCheckIndex).toBeGreaterThan(itemLockEndIndex)

    // 4. Post-lock idempotency re-check MUST be in substring AFTER item lock end and BEFORE count check
    const postLockSubstr = funcBody.substring(itemLockEndIndex, countCheckIndex)
    expect(postLockSubstr).toMatch(/SELECT id, stock_after, transaction_number[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE client_request_id = p_client_request_id\s+AND performed_by = v_user_id/i)

    // 5. EXCEPTION WHEN UNIQUE_VIOLATION block uses performed_by = v_user_id
    const exceptionBlockMatch = funcBody.match(/EXCEPTION[\s\S]*?WHEN UNIQUE_VIOLATION THEN[\s\S]*?END/i)
    expect(exceptionBlockMatch).not.toBeNull()
    expect(exceptionBlockMatch![0]).toMatch(/client_request_id\s*=\s*p_client_request_id\s+AND\s+performed_by\s*=\s*v_user_id/i)
  })

  it('2. process_stock_adjustment performs post-lock idempotency re-check strictly after item FOR UPDATE end and before v_delta calculation', () => {
    const funcMatch = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.process_stock_adjustment[\s\S]*?END;\s*\$\$/i)
    expect(funcMatch).not.toBeNull()
    const funcBody = funcMatch![0]

    // 1. Fast-path before item lock uses performed_by = v_user_id
    const fastPathMatch = funcBody.match(/SELECT id, transaction_number, stock_after, transaction_type, quantity_delta[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE client_request_id = p_client_request_id\s+AND performed_by = v_user_id/i)
    expect(fastPathMatch).not.toBeNull()
    const fastPathIndex = fastPathMatch!.index!

    // 2. Specific item row lock query
    const itemLockMatch = funcBody.match(/SELECT id, current_stock, is_active, base_unit_id[\s\S]*?INTO v_item[\s\S]*?FROM public\.items[\s\S]*?WHERE id = p_item_id[\s\S]*?FOR UPDATE/i)
    expect(itemLockMatch).not.toBeNull()
    const itemLockStartIndex = itemLockMatch!.index!
    const itemLockEndIndex = itemLockStartIndex + itemLockMatch![0].length

    // Fast-path MUST be strictly before item lock start
    expect(fastPathIndex).toBeLessThan(itemLockStartIndex)

    // 3. v_delta calculation
    const deltaCalcMatch = funcBody.match(/v_delta\s*:=\s*p_physical_stock\s*-\s*v_item\.current_stock/i)
    expect(deltaCalcMatch).not.toBeNull()
    const deltaCalcIndex = deltaCalcMatch!.index!
    expect(deltaCalcIndex).toBeGreaterThan(itemLockEndIndex)

    // 4. Post-lock idempotency re-check MUST be in substring AFTER item lock end and BEFORE v_delta calculation
    const postLockSubstr = funcBody.substring(itemLockEndIndex, deltaCalcIndex)
    expect(postLockSubstr).toMatch(/SELECT id, transaction_number, stock_after, transaction_type, quantity_delta[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE client_request_id = p_client_request_id\s+AND performed_by = v_user_id/i)
  })

  it('3. process_stock_out validates p_client_request_id IS NULL before idempotency query and does not require is_admin()', () => {
    const funcMatch = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.process_stock_out[\s\S]*?END;\s*\$\$/i)
    expect(funcMatch).not.toBeNull()
    const funcBody = funcMatch![0]

    // Must NOT require public.is_admin()
    expect(funcBody).not.toMatch(/public\.is_admin\(\)/i)

    // Find position of NULL check and idempotency check
    const nullCheckIndex = funcBody.search(/IF p_client_request_id IS NULL THEN/i)
    const idempotencyIndex = funcBody.search(/SELECT id, transaction_number, stock_after[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE client_request_id = p_client_request_id/i)

    expect(nullCheckIndex).toBeGreaterThan(0)
    expect(idempotencyIndex).toBeGreaterThan(nullCheckIndex)
  })

  it('4. process_reversal enforces strict sequence: fast-path -> original tx FOR UPDATE -> post-lock re-check -> is_reversed -> item FOR UPDATE -> v_new_stock calc', () => {
    const funcMatch = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.process_reversal[\s\S]*?END;\s*\$\$/i)
    expect(funcMatch).not.toBeNull()
    const funcBody = funcMatch![0]

    // Verify original tx lock query does NOT join items or select item_current_stock
    expect(funcBody).not.toMatch(/i\.current_stock AS item_current_stock/i)
    expect(funcBody).not.toMatch(/FOR UPDATE OF st/i)

    // 1. Fast-path idempotency before lock
    const fastPathMatch = funcBody.match(/SELECT id, transaction_number, stock_after[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE client_request_id = p_client_request_id\s+AND performed_by = v_user_id/i)
    expect(fastPathMatch).not.toBeNull()
    const fastPathIndex = fastPathMatch!.index!

    // 2. Specific original transaction lock query
    const origLockMatch = funcBody.match(/SELECT \*[\s\S]*?INTO v_original[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE id = p_original_transaction_id[\s\S]*?FOR UPDATE/i)
    expect(origLockMatch).not.toBeNull()
    const origLockStartIndex = origLockMatch!.index!
    const origLockEndIndex = origLockStartIndex + origLockMatch![0].length

    // Fast-path MUST be strictly before original lock start
    expect(fastPathIndex).toBeLessThan(origLockStartIndex)

    // 3. IF v_original.is_reversed check
    const isReversedMatch = funcBody.match(/IF v_original\.is_reversed THEN/i)
    expect(isReversedMatch).not.toBeNull()
    const isReversedIndex = isReversedMatch!.index!

    // is_reversed MUST be after original lock end
    expect(isReversedIndex).toBeGreaterThan(origLockEndIndex)

    // 4. Post-lock idempotency re-check MUST be in substring AFTER orig lock end and BEFORE is_reversed check
    const postLockSubstr = funcBody.substring(origLockEndIndex, isReversedIndex)
    expect(postLockSubstr).toMatch(/SELECT id, transaction_number, stock_after[\s\S]*?FROM public\.stock_transactions[\s\S]*?WHERE client_request_id = p_client_request_id\s+AND performed_by = v_user_id/i)

    // 5. Item FOR UPDATE
    const itemLockMatch = funcBody.match(/SELECT current_stock\s+INTO v_item_current_stock\s+FROM public\.items[\s\S]*?FOR UPDATE/i)
    expect(itemLockMatch).not.toBeNull()
    const itemLockIndex = itemLockMatch!.index!
    expect(itemLockIndex).toBeGreaterThan(isReversedIndex)

    // 6. v_new_stock calculation using v_item_current_stock
    const calcMatch = funcBody.match(/v_new_stock\s*:=\s*v_item_current_stock\s*\+\s*v_reversal_delta/i)
    expect(calcMatch).not.toBeNull()
    expect(calcMatch!.index!).toBeGreaterThan(itemLockIndex + itemLockMatch![0].length)
  })

  it('5. process_stock_out and process_stock_adjustment contain atomic audit_logs insertion', () => {
    const stockOutMatch = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.process_stock_out[\s\S]*?END;\s*\$\$/i)
    expect(stockOutMatch).not.toBeNull()
    expect(stockOutMatch![0]).toMatch(/INSERT INTO public\.audit_logs[\s\S]*?'STOCK_OUT'/i)

    const adjustmentMatch = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.process_stock_adjustment[\s\S]*?END;\s*\$\$/i)
    expect(adjustmentMatch).not.toBeNull()
    expect(adjustmentMatch![0]).toMatch(/INSERT INTO public\.audit_logs[\s\S]*?'STOCK_ADJUSTMENT'/i)
  })

  it('6. create_employee_account_v2 RPC adheres to security, parameter, grant, and PostgREST reload requirements', () => {
    const v2Match = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.create_employee_account_v2[\s\S]*?END;\s*\$\$/i)
    expect(v2Match).not.toBeNull()
    const v2Body = v2Match![0]

    // Verify 3 parameters without password
    expect(v2Body).toMatch(/p_username TEXT,\s*p_full_name TEXT,\s*p_auth_user_id UUID/i)
    expect(v2Body).not.toMatch(/p_temporary_password/i)

    // Security & Auth checks
    expect(v2Body).toMatch(/SECURITY DEFINER/i)
    expect(v2Body).toMatch(/SET search_path = ''/i)
    expect(v2Body).toMatch(/public\.is_admin\(\)/i)

    // Audit log
    expect(v2Body).toMatch(/INSERT INTO public\.audit_logs[\s\S]*?'USER_CREATED'/i)

    // Permissions & Grants
    expect(sqlContent).toMatch(/REVOKE EXECUTE ON FUNCTION public\.create_employee_account_v2\(TEXT, TEXT, UUID\) FROM PUBLIC;/i)
    expect(sqlContent).toMatch(/GRANT  EXECUTE ON FUNCTION public\.create_employee_account_v2\(TEXT, TEXT, UUID\) TO authenticated;/i)
    expect(sqlContent).toMatch(/NOTIFY pgrst, 'reload schema';/i)
  })
})

describe('Tahap 1 — Server Action & TypeScript Contract Verifications', () => {
  it('Server action calls create_employee_account_v2 without sending password parameter', () => {
    const actionsContent = fs.readFileSync(ACTIONS_PATH, 'utf-8')

    // Must call create_employee_account_v2
    expect(actionsContent).toMatch(/supabase\.rpc\('create_employee_account_v2'/i)

    // Must NOT pass p_temporary_password
    const rpcCallMatch = actionsContent.match(/supabase\.rpc\('create_employee_account_v2',\s*\{[\s\S]*?\}\)/i)
    expect(rpcCallMatch).not.toBeNull()
    expect(rpcCallMatch![0]).not.toMatch(/p_temporary_password/i)
  })

  it('Database types include both legacy create_employee_account (required password) and create_employee_account_v2 (no password)', () => {
    const typesContent = fs.readFileSync(TYPES_PATH, 'utf-8')

    // Legacy RPC definition must require p_temporary_password: string (NOT p_temporary_password?: string)
    const legacyRpcMatch = typesContent.match(/create_employee_account:\s*\{[\s\S]*?Args:\s*\{[\s\S]*?\}[\s\S]*?\}/i)
    expect(legacyRpcMatch).not.toBeNull()
    expect(legacyRpcMatch![0]).toMatch(/p_temporary_password:\s*string/i)
    expect(legacyRpcMatch![0]).not.toMatch(/p_temporary_password\?:/i)

    // RPC v2 definition must exist and NOT have password parameter
    const v2RpcMatch = typesContent.match(/create_employee_account_v2:\s*\{[\s\S]*?Args:\s*\{[\s\S]*?\}[\s\S]*?\}/i)
    expect(v2RpcMatch).not.toBeNull()
    expect(v2RpcMatch![0]).not.toMatch(/password/i)
  })
})
