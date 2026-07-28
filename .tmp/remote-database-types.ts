export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          barcode_label_layout: string
          default_barcode_label_count: number
          id: string
          institution_name: string | null
          report_header_text: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          barcode_label_layout?: string
          default_barcode_label_count?: number
          id?: string
          institution_name?: string | null
          report_header_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          barcode_label_layout?: string
          default_barcode_label_count?: number
          id?: string
          institution_name?: string | null
          report_header_text?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          changes_summary: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          performed_at: string
          performed_by: string
          reason: string | null
          request_metadata: Json | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          changes_summary?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          performed_at?: string
          performed_by: string
          reason?: string | null
          request_metadata?: Json | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          changes_summary?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          performed_at?: string
          performed_by?: string
          reason?: string | null
          request_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_normalized: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_normalized: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_normalized?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          fail_count: number
          file_name: string
          id: string
          performed_at: string
          performed_by: string
          result_summary: Json
          success_count: number
          total_rows: number
        }
        Insert: {
          fail_count?: number
          file_name: string
          id?: string
          performed_at?: string
          performed_by: string
          result_summary?: Json
          success_count?: number
          total_rows?: number
        }
        Update: {
          fail_count?: number
          file_name?: string
          id?: string
          performed_at?: string
          performed_by?: string
          result_summary?: Json
          success_count?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_units: {
        Row: {
          conversion_factor: number
          created_at: string
          id: string
          is_active: boolean
          item_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          conversion_factor: number
          created_at?: string
          id?: string
          is_active?: boolean
          item_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          conversion_factor?: number
          created_at?: string
          id?: string
          is_active?: boolean
          item_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "employee_items_view"
            referencedColumns: ["id"]
          },
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
          },
        ]
      }
      items: {
        Row: {
          barcode: string
          barcode_format: Database["public"]["Enums"]["barcode_format"]
          base_unit_id: string
          category_id: string
          created_at: string
          current_stock: number
          default_purchase_unit_id: string
          id: string
          is_active: boolean
          minimum_stock: number
          name: string
          notes: string | null
          sku: string
          updated_at: string
        }
        Insert: {
          barcode: string
          barcode_format?: Database["public"]["Enums"]["barcode_format"]
          base_unit_id: string
          category_id: string
          created_at?: string
          current_stock?: number
          default_purchase_unit_id: string
          id?: string
          is_active?: boolean
          minimum_stock?: number
          name: string
          notes?: string | null
          sku?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          barcode_format?: Database["public"]["Enums"]["barcode_format"]
          base_unit_id?: string
          category_id?: string
          created_at?: string
          current_stock?: number
          default_purchase_unit_id?: string
          id?: string
          is_active?: boolean
          minimum_stock?: number
          name?: string
          notes?: string | null
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_default_purchase_unit_id_fkey"
            columns: ["default_purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          last_sign_in_at: string | null
          must_change_password: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string
          username_normalized: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          last_sign_in_at?: string | null
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username: string
          username_normalized: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_sign_in_at?: string | null
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string
          username_normalized?: string
        }
        Relationships: []
      }
      stock_transactions: {
        Row: {
          base_quantity: number
          client_request_id: string
          conversion_factor_snapshot: number
          id: string
          input_quantity: number
          is_reversed: boolean
          item_id: string
          metadata: Json | null
          original_transaction_id: string | null
          performed_by: string
          quantity_delta: number
          reason: string | null
          reversal_transaction_id: string | null
          stock_after: number
          stock_before: number
          transaction_at: string
          transaction_number: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          unit_id: string
        }
        Insert: {
          base_quantity: number
          client_request_id: string
          conversion_factor_snapshot: number
          id?: string
          input_quantity: number
          is_reversed?: boolean
          item_id: string
          metadata?: Json | null
          original_transaction_id?: string | null
          performed_by: string
          quantity_delta: number
          reason?: string | null
          reversal_transaction_id?: string | null
          stock_after: number
          stock_before: number
          transaction_at?: string
          transaction_number?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          unit_id: string
        }
        Update: {
          base_quantity?: number
          client_request_id?: string
          conversion_factor_snapshot?: number
          id?: string
          input_quantity?: number
          is_reversed?: boolean
          item_id?: string
          metadata?: Json | null
          original_transaction_id?: string | null
          performed_by?: string
          quantity_delta?: number
          reason?: string | null
          reversal_transaction_id?: string | null
          stock_after?: number
          stock_before?: number
          transaction_at?: string
          transaction_number?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "employee_items_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "employee_own_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_reversal_transaction_id_fkey"
            columns: ["reversal_transaction_id"]
            isOneToOne: false
            referencedRelation: "employee_own_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_reversal_transaction_id_fkey"
            columns: ["reversal_transaction_id"]
            isOneToOne: false
            referencedRelation: "stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_normalized: string
          symbol: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_normalized: string
          symbol: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_normalized?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      employee_items_view: {
        Row: {
          barcode: string | null
          barcode_format: Database["public"]["Enums"]["barcode_format"] | null
          base_unit_id: string | null
          base_unit_name: string | null
          base_unit_symbol: string | null
          category_id: string | null
          category_name: string | null
          current_stock: number | null
          id: string | null
          is_active: boolean | null
          minimum_stock: number | null
          name: string | null
          sku: string | null
          stock_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_own_transactions_view: {
        Row: {
          base_quantity: number | null
          id: string | null
          input_quantity: number | null
          is_reversed: boolean | null
          item_id: string | null
          item_name: string | null
          item_sku: string | null
          quantity_delta: number | null
          stock_after: number | null
          transaction_at: string | null
          transaction_number: string | null
          transaction_type:
            | Database["public"]["Enums"]["transaction_type"]
            | null
          unit_symbol: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "employee_items_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      complete_forced_password_change: { Args: never; Returns: undefined }
      create_admin_login_mapping: {
        Args: { p_auth_user_id: string; p_username_normalized: string }
        Returns: undefined
      }
      create_employee_account: {
        Args: {
          p_auth_user_id: string
          p_full_name: string
          p_temporary_password: string
          p_username: string
        }
        Returns: undefined
      }
      generate_sku: { Args: never; Returns: string }
      generate_transaction_number: { Args: never; Returns: string }
      get_item_costs: {
        Args: { p_item_ids?: string[] }
        Returns: {
          average_cost: number
          inventory_value: number
          item_id: string
          updated_at: string
        }[]
      }
      get_stock_transaction_costs: {
        Args: { p_transaction_ids?: string[] }
        Returns: {
          average_cost_after: number
          average_cost_before: number
          base_unit_cost: number
          inventory_value_after: number
          inventory_value_before: number
          inventory_value_change: number
          transaction_id: string
          transaction_value: number
          unit_price_input: number
        }[]
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      lookup_login_identifier: {
        Args: { p_username_normalized: string }
        Returns: {
          auth_user_id: string
        }[]
      }
      process_initial_stock: {
        Args: {
          p_client_request_id: string
          p_input_quantity: number
          p_item_id: string
          p_unit_id: string
          p_unit_price: number
        }
        Returns: Json
      }
      process_reversal: {
        Args: {
          p_client_request_id: string
          p_original_transaction_id: string
          p_reason: string
        }
        Returns: Json
      }
      process_stock_adjustment: {
        Args: {
          p_client_request_id: string
          p_item_id: string
          p_physical_stock: number
          p_reason: string
          p_unit_price?: number
        }
        Returns: Json
      }
      process_stock_in: {
        Args: {
          p_client_request_id: string
          p_input_quantity: number
          p_item_id: string
          p_unit_id: string
          p_unit_price: number
        }
        Returns: Json
      }
      process_stock_out: {
        Args: {
          p_client_request_id: string
          p_input_quantity: number
          p_item_id: string
          p_unit_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      audit_action:
        | "USER_CREATED"
        | "USER_DEACTIVATED"
        | "USER_ACTIVATED"
        | "USER_PASSWORD_RESET"
        | "ITEM_CREATED"
        | "ITEM_UPDATED"
        | "ITEM_DEACTIVATED"
        | "ITEM_ACTIVATED"
        | "CATEGORY_CREATED"
        | "CATEGORY_UPDATED"
        | "CATEGORY_DEACTIVATED"
        | "UNIT_CREATED"
        | "UNIT_UPDATED"
        | "UNIT_DEACTIVATED"
        | "STOCK_INITIAL"
        | "STOCK_IN"
        | "STOCK_OUT"
        | "STOCK_ADJUSTMENT"
        | "STOCK_REVERSAL"
        | "EXCEL_IMPORT"
        | "SETTINGS_UPDATED"
      barcode_format: "EAN13" | "EAN8" | "UPCA" | "UPCE" | "CODE128" | "QR"
      transaction_type:
        | "INITIAL"
        | "IN"
        | "OUT"
        | "ADJUSTMENT_IN"
        | "ADJUSTMENT_OUT"
        | "REVERSAL"
      user_role: "ADMIN" | "EMPLOYEE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_action: [
        "USER_CREATED",
        "USER_DEACTIVATED",
        "USER_ACTIVATED",
        "USER_PASSWORD_RESET",
        "ITEM_CREATED",
        "ITEM_UPDATED",
        "ITEM_DEACTIVATED",
        "ITEM_ACTIVATED",
        "CATEGORY_CREATED",
        "CATEGORY_UPDATED",
        "CATEGORY_DEACTIVATED",
        "UNIT_CREATED",
        "UNIT_UPDATED",
        "UNIT_DEACTIVATED",
        "STOCK_INITIAL",
        "STOCK_IN",
        "STOCK_OUT",
        "STOCK_ADJUSTMENT",
        "STOCK_REVERSAL",
        "EXCEL_IMPORT",
        "SETTINGS_UPDATED",
      ],
      barcode_format: ["EAN13", "EAN8", "UPCA", "UPCE", "CODE128", "QR"],
      transaction_type: [
        "INITIAL",
        "IN",
        "OUT",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
        "REVERSAL",
      ],
      user_role: ["ADMIN", "EMPLOYEE"],
    },
  },
} as const
