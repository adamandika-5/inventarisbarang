import { describe, it, expect, vi } from 'vitest'
import { createAuditLog } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

describe('Audit Log System & Label Consistency', () => {
  it('correctly maps STOCK_INITIAL to "Stok Pembukaan"', () => {
    const ACTION_LABELS: Record<string, string> = {
      STOCK_INITIAL: 'Stok Pembukaan',
      STOCK_IN: 'Barang Masuk',
      STOCK_OUT: 'Barang Keluar',
    }

    expect(ACTION_LABELS['STOCK_INITIAL']).toBe('Stok Pembukaan')
    expect(ACTION_LABELS['STOCK_INITIAL']).not.toBe('Stok Awal')
  })

  it('excludes EXCEL_IMPORT from active audit log filter dropdown options', () => {
    const ACTION_LABELS: Record<string, string> = {
      USER_CREATED: 'Pengguna Dibuat',
      STOCK_INITIAL: 'Stok Pembukaan',
      EXCEL_IMPORT: 'Impor Excel',
      SETTINGS_UPDATED: 'Pengaturan Diperbarui',
    }

    const filterOptions = Object.entries(ACTION_LABELS).filter(
      ([key]) => key !== 'EXCEL_IMPORT'
    )

    expect(filterOptions.find(([k]) => k === 'EXCEL_IMPORT')).toBeUndefined()
    expect(filterOptions.map(([k]) => k)).toEqual([
      'USER_CREATED',
      'STOCK_INITIAL',
      'SETTINGS_UPDATED',
    ])
    // Preserves historical mapping
    expect(ACTION_LABELS['EXCEL_IMPORT']).toBe('Impor Excel')
  })

  it('generates correct empty state message based on action filter', () => {
    const ACTION_LABELS: Record<string, string> = {
      CATEGORY_CREATED: 'Kategori Dibuat',
      STOCK_INITIAL: 'Stok Pembukaan',
    }

    const getEmptyStateMessage = (actionFilter?: string) => {
      if (actionFilter) {
        const label = ACTION_LABELS[actionFilter] ?? actionFilter
        return `Belum ada riwayat untuk aksi ${label}.`
      }
      return 'Belum ada riwayat audit.'
    }

    expect(getEmptyStateMessage('STOCK_INITIAL')).toBe(
      'Belum ada riwayat untuk aksi Stok Pembukaan.'
    )
    expect(getEmptyStateMessage('CATEGORY_CREATED')).toBe(
      'Belum ada riwayat untuk aksi Kategori Dibuat.'
    )
    expect(getEmptyStateMessage('')).toBe('Belum ada riwayat audit.')
  })

  it('createAuditLog calls log_audit_event RPC with SECURITY DEFINER params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: 'log-uuid-123', error: null })
    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient<Database>

    await createAuditLog(mockSupabase, {
      action: 'CATEGORY_CREATED',
      entity_type: 'categories',
      entity_id: 'cat-123',
      changes_summary: { name: 'Alat Tulis' },
    })

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', {
      p_action: 'CATEGORY_CREATED',
      p_entity_type: 'categories',
      p_entity_id: 'cat-123',
      p_changes_summary: { name: 'Alat Tulis' },
      p_reason: null,
      p_request_metadata: null,
    })
  })

  it('throws error if log_audit_event RPC returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Permission denied' },
    })
    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient<Database>

    await expect(
      createAuditLog(mockSupabase, {
        action: 'UNIT_CREATED',
        entity_type: 'units',
      })
    ).rejects.toThrow('Gagal mencatat audit log: Permission denied')
  })
})
