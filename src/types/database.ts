/**
 * Database type definitions for Supabase PostgreSQL schema.
 *
 * NOTE: These types are manually authored to match the migration schema.
 * After deploying migrations to Supabase, regenerate using:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts
 *
 * Keep this file in sync with supabase/migrations/*.sql
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type UserRole = 'ADMIN' | 'EMPLOYEE'
export type StockStatus = 'AMAN' | 'HAMPIR_HABIS' | 'HABIS' | 'NONAKTIF'
export type TransactionType =
  | 'INITIAL'
  | 'IN'
  | 'OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'REVERSAL'
export type BarcodeFormat = 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'CODE128' | 'QR'
export type AuditAction =
  | 'USER_CREATED'
  | 'USER_DEACTIVATED'
  | 'USER_ACTIVATED'
  | 'USER_PASSWORD_RESET'
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'ITEM_DEACTIVATED'
  | 'ITEM_ACTIVATED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_DEACTIVATED'
  | 'UNIT_CREATED'
  | 'UNIT_UPDATED'
  | 'UNIT_DEACTIVATED'
  | 'STOCK_INITIAL'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'STOCK_ADJUSTMENT'
  | 'STOCK_REVERSAL'
  | 'EXCEL_IMPORT'
  | 'SETTINGS_UPDATED'

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string // UUID, references auth.users
          username: string
          username_normalized: string
          full_name: string
          role: UserRole
          is_active: boolean
          must_change_password: boolean
          created_at: string // timestamptz
          updated_at: string // timestamptz
          last_sign_in_at: string | null // timestamptz
        }
        Insert: {
          id: string
          username: string
          username_normalized: string
          full_name: string
          role: UserRole
          is_active?: boolean
          must_change_password?: boolean
          created_at?: string
          updated_at?: string
          last_sign_in_at?: string | null
        }
        Update: {
          username?: string
          username_normalized?: string
          full_name?: string
          role?: UserRole
          is_active?: boolean
          must_change_password?: boolean
          updated_at?: string
          last_sign_in_at?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string // UUID
          name: string
          name_normalized: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          name_normalized: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          name_normalized?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          id: string // UUID
          name: string
          symbol: string
          name_normalized: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          symbol: string
          name_normalized: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          symbol?: string
          name_normalized?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          id: string // UUID
          sku: string // ATK-0001 format
          barcode: string
          barcode_format: BarcodeFormat
          name: string
          category_id: string
          base_unit_id: string
          default_purchase_unit_id: string
          current_stock: number // in base units
          minimum_stock: number
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sku?: string // auto-generated if not provided
          barcode: string
          barcode_format: BarcodeFormat
          name: string
          category_id: string
          base_unit_id: string
          default_purchase_unit_id: string
          current_stock?: number
          minimum_stock?: number
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          barcode_format?: BarcodeFormat
          name?: string
          category_id?: string
          default_purchase_unit_id?: string
          minimum_stock?: number
          notes?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_default_purchase_unit_id_fkey"
            columns: ["default_purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          }
        ]
      }
      item_units: {
        Row: {
          id: string // UUID
          item_id: string
          unit_id: string
          conversion_factor: number // units of base per 1 of this unit
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          item_id: string
          unit_id: string
          conversion_factor: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          conversion_factor?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          }
        ]
      }
      stock_transactions: {
        Row: {
          id: string // UUID
          transaction_number: string // TXN-YYYYMMDD-NNNNNN
          client_request_id: string // UUID for idempotency
          item_id: string
          transaction_type: TransactionType
          input_quantity: number // positive integer, in transaction unit
          unit_id: string
          conversion_factor_snapshot: number // snapshot at time of transaction
          base_quantity: number // input_quantity * conversion_factor_snapshot
          quantity_delta: number // signed: positive for IN, negative for OUT
          performed_by: string // user UUID from auth.uid()
          transaction_at: string // timestamptz
          stock_before: number
          stock_after: number
          reason: string | null
          original_transaction_id: string | null // for REVERSAL
          is_reversed: boolean
          reversal_transaction_id: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          transaction_number?: string
          client_request_id: string
          item_id: string
          transaction_type: TransactionType
          input_quantity: number
          unit_id: string
          conversion_factor_snapshot: number
          base_quantity: number
          quantity_delta: number
          performed_by?: string
          transaction_at?: string
          stock_before: number
          stock_after: number
          reason?: string | null
          original_transaction_id?: string | null
          is_reversed?: boolean
          reversal_transaction_id?: string | null
          metadata?: Json | null
        }
        Update: Partial<Database['public']['Tables']['stock_transactions']['Row']>
        Relationships: [
          {
            foreignKeyName: "stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      audit_logs: {
        Row: {
          id: string // UUID
          performed_by: string // user UUID
          performed_at: string // timestamptz
          action: AuditAction
          entity_type: string
          entity_id: string | null
          changes_summary: Json | null // before/after safe summary (no secrets)
          reason: string | null
          request_metadata: Json | null // safe metadata
        }
        Insert: {
          id?: string
          performed_by: string
          performed_at?: string
          action: AuditAction
          entity_type: string
          entity_id?: string | null
          changes_summary?: Json | null
          reason?: string | null
          request_metadata?: Json | null
        }
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>
        Relationships: [
          {
            foreignKeyName: "audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      app_settings: {
        Row: {
          id: string // UUID (singleton row)
          institution_name: string | null
          report_header_text: string | null
          default_barcode_label_count: number
          barcode_label_layout: string // validated layout option
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          institution_name?: string | null
          report_header_text?: string | null
          default_barcode_label_count?: number
          barcode_label_layout?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          institution_name?: string | null
          report_header_text?: string | null
          default_barcode_label_count?: number
          barcode_label_layout?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          id: string // UUID
          performed_by: string
          performed_at: string
          file_name: string
          total_rows: number
          success_count: number
          fail_count: number
          result_summary: Json // per-row status without file content
        }
        Insert: {
          id?: string
          performed_by: string
          performed_at?: string
          file_name: string
          total_rows: number
          success_count: number
          fail_count: number
          result_summary: Json
        }
        Update: Partial<Database['public']['Tables']['import_batches']['Row']>
        Relationships: []
      }
    }
    Views: {
      // Safe employee view — no price data
      employee_items_view: {
        Row: {
          id: string
          sku: string
          barcode: string
          barcode_format: BarcodeFormat
          name: string
          category_id: string
          category_name: string
          base_unit_id: string
          base_unit_name: string
          base_unit_symbol: string
          current_stock: number
          minimum_stock: number
          stock_status: StockStatus
          is_active: boolean
        }
        Relationships: []
      }
      // Employee's own transaction history view — no price data
      employee_own_transactions_view: {
        Row: {
          id: string
          transaction_number: string
          item_id: string
          item_name: string
          item_sku: string
          transaction_type: TransactionType
          input_quantity: number
          unit_symbol: string
          base_quantity: number
          quantity_delta: number
          transaction_at: string
          stock_after: number
          is_reversed: boolean
        }
        Relationships: []
      }
    }
    Functions: {
      // Check if current user is admin
      is_admin: {
        Args: Record<string, unknown>
        Returns: boolean
      }
      // Check if current user is active
      is_active_user: {
        Args: Record<string, unknown>
        Returns: boolean
      }
      // Get current user role
      get_user_role: {
        Args: Record<string, unknown>
        Returns: UserRole
      }
      // Process stock OUT transaction (employee)
      process_stock_out: {
        Args: {
          p_client_request_id: string
          p_item_id: string
          p_input_quantity: number
          p_unit_id: string
        }
        Returns: {
          transaction_id: string
          transaction_number: string
          stock_after: number
        }
      }
      // Process stock IN transaction (admin)
      process_stock_in: {
        Args: {
          p_client_request_id: string
          p_item_id: string
          p_unit_id: string
          p_input_quantity: number
          p_transaction_unit_price: string // NUMERIC parameter passed as string or number
        }
        Returns: {
          transaction_id: string
          transaction_number: string
          stock_after: number
        }
      }
      // Process initial stock (admin, once per item)
      process_initial_stock: {
        Args: {
          p_client_request_id: string
          p_item_id: string
          p_unit_id: string
          p_input_quantity: number
          p_transaction_unit_price: string
        }
        Returns: {
          transaction_id: string
          transaction_number: string
          stock_after: number
        }
      }
      // Process stock adjustment (admin)
      process_stock_adjustment: {
        Args: {
          p_client_request_id: string
          p_item_id: string
          p_physical_stock: number // actual physical count
          p_reason: string
        }
        Returns: {
          transaction_id: string | null
          transaction_number: string | null
          adjustment_type: string
          quantity_delta: number
        }
      }
      // Process reversal (admin)
      process_reversal: {
        Args: {
          p_client_request_id: string
          p_original_transaction_id: string
          p_reason: string
        }
        Returns: {
          transaction_id: string
          transaction_number: string
          stock_after: number
        }
      }
    }
    Enums: {
      user_role: UserRole
      stock_status: StockStatus
      transaction_type: TransactionType
      barcode_format: BarcodeFormat
      audit_action: AuditAction
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  private: {
    Tables: {
      auth_login_identifiers: {
        Row: {
          id: string
          username_normalized: string
          auth_user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          username_normalized: string
          auth_user_id: string
          created_at?: string
        }
        Update: Partial<Database['private']['Tables']['auth_login_identifiers']['Row']>
        Relationships: []
      }
      item_costs: {
        Row: {
          id: string
          item_id: string
          average_cost: string // NUMERIC stored as string
          inventory_value: string // NUMERIC stored as string
          updated_at: string
        }
        Insert: {
          id?: string
          item_id: string
          average_cost: string
          inventory_value: string
          updated_at?: string
        }
        Update: {
          average_cost?: string
          inventory_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_transaction_costs: {
        Row: {
          id: string
          transaction_id: string
          unit_price_input: string // price per transaction unit
          base_unit_cost: string // = unit_price_input / conversion_factor
          average_cost_before: string
          average_cost_after: string
          inventory_value_before: string
          inventory_value_change: string // signed
          inventory_value_after: string
          transaction_value: string // absolute value of the transaction
        }
        Insert: {
          id?: string
          transaction_id: string
          unit_price_input: string
          base_unit_cost: string
          average_cost_before: string
          average_cost_after: string
          inventory_value_before: string
          inventory_value_change: string
          inventory_value_after: string
          transaction_value: string
        }
        Update: Partial<Database['private']['Tables']['stock_transaction_costs']['Row']>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience type aliases
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Unit = Database['public']['Tables']['units']['Row']
export type Item = Database['public']['Tables']['items']['Row']
export type ItemUnit = Database['public']['Tables']['item_units']['Row']
export type StockTransaction = Database['public']['Tables']['stock_transactions']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
export type AppSettings = Database['public']['Tables']['app_settings']['Row']
export type ImportBatch = Database['public']['Tables']['import_batches']['Row']
export type EmployeeItemView = Database['public']['Views']['employee_items_view']['Row']
export type EmployeeTransactionView =
  Database['public']['Views']['employee_own_transactions_view']['Row']
export type ItemCost = Database['private']['Tables']['item_costs']['Row']
export type StockTransactionCost =
  Database['private']['Tables']['stock_transaction_costs']['Row']
