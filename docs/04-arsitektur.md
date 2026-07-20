# Arsitektur — InventarisBarang

## Diagram Arsitektur

```mermaid
graph TB
    subgraph Client["Browser / Mobile"]
        UI["Next.js React Components\n(Client Components)"]
        SW["Service Worker\n(Shell Cache Only)"]
    end

    subgraph Server["Vercel Edge / Node.js"]
        MW["Middleware\n(Session Refresh + UX Route Guard)"]
        SC["Server Components\n(Server-side Auth Check)"]
        SA["Server Actions / Route Handlers\n(Business Logic)"]
        BFF["Login BFF\n(/api/auth/login)"]
    end

    subgraph Supabase["Supabase"]
        AUTH["Auth (GoTrue)\nUser + Session Management"]
        DB[("PostgreSQL\nPublic Schema (RLS)")]
        PDB[("PostgreSQL\nPrivate Schema (Costs)")]
        RPC["SECURITY DEFINER RPCs\n(Atomic Stock Mutations)"]
    end

    UI --> MW
    MW --> SC
    SC --> SA
    SA --> BFF
    BFF -->|"username lookup\n(service role)"| AUTH
    BFF -->|"signInWithPassword"| AUTH
    SA -->|"cookie session"| DB
    SA -->|"service role (admin ops only)"| AUTH
    RPC -->|"row locking\n+ cost update"| PDB
    DB --> RPC
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant LoginPage
    participant BFF as /api/auth/login
    participant PrivateDB as private.auth_login_identifiers
    participant AuthDB as auth.users
    participant Supabase as Supabase Auth

    User->>LoginPage: Enter username + password
    LoginPage->>BFF: POST /api/auth/login {username, password}
    BFF->>PrivateDB: SELECT auth_user_id WHERE username_normalized = ?
    PrivateDB-->>BFF: auth_user_id (or not found)
    BFF->>AuthDB: admin.getUserById(auth_user_id)
    AuthDB-->>BFF: internal email
    BFF->>Supabase: signInWithPassword(email, password)
    Supabase-->>BFF: session (cookie set)
    BFF->>BFF: Verify profile.is_active
    BFF-->>LoginPage: {role, mustChangePassword}
    LoginPage->>User: Redirect to dashboard
```

## Database Schema (ERD)

```mermaid
erDiagram
    profiles {
        uuid id PK
        text username
        text username_normalized
        text full_name
        user_role role
        bool is_active
        bool must_change_password
        timestamptz created_at
        timestamptz updated_at
    }

    categories {
        uuid id PK
        text name
        text name_normalized
        bool is_active
    }

    units {
        uuid id PK
        text name
        text symbol
        text name_normalized
        bool is_active
    }

    items {
        uuid id PK
        text sku
        text barcode
        barcode_format barcode_format
        text name
        uuid category_id FK
        uuid base_unit_id FK
        uuid default_purchase_unit_id FK
        bigint current_stock
        bigint minimum_stock
        bool is_active
    }

    item_units {
        uuid id PK
        uuid item_id FK
        uuid unit_id FK
        bigint conversion_factor
        bool is_active
    }

    stock_transactions {
        uuid id PK
        text transaction_number
        uuid client_request_id
        uuid item_id FK
        transaction_type transaction_type
        bigint input_quantity
        uuid unit_id FK
        bigint conversion_factor_snapshot
        bigint base_quantity
        bigint quantity_delta
        uuid performed_by FK
        timestamptz transaction_at
        bigint stock_before
        bigint stock_after
        text reason
        uuid original_transaction_id FK
        bool is_reversed
    }

    audit_logs {
        uuid id PK
        uuid performed_by FK
        timestamptz performed_at
        audit_action action
        text entity_type
        uuid entity_id
        jsonb changes_summary
    }

    app_settings {
        uuid id PK
        text institution_name
        integer default_barcode_label_count
        text barcode_label_layout
    }

    categories ||--o{ items : "category_id"
    units ||--o{ items : "base_unit_id"
    units ||--o{ items : "default_purchase_unit_id"
    items ||--o{ item_units : "item_id"
    units ||--o{ item_units : "unit_id"
    items ||--o{ stock_transactions : "item_id"
    units ||--o{ stock_transactions : "unit_id"
    profiles ||--o{ stock_transactions : "performed_by"
    profiles ||--o{ audit_logs : "performed_by"
    stock_transactions ||--o| stock_transactions : "original_transaction_id"
```

## Security Architecture

### Defense in Depth

| Layer | Mekanisme |
|---|---|
| UI | Sembunyikan menu admin dari pegawai |
| Middleware | Route guard berdasarkan session |
| Server Components | Verifikasi role + is_active via DB query |
| Server Actions / API | Validasi session + role sebelum operasi |
| RPC Functions | is_admin() check di dalam function body |
| RLS Policies | Policy per role per tabel |
| Schema | Private schema tidak diekspos via Data API |
| Database Constraints | CHECK, UNIQUE, FK, NOT NULL |

### Price Data Isolation

```
Employee Browser ─────────────────────────────────────────
       │                                                  │
       │ (no price data in any response)                 │
       ▼                                                  │
 public.items          ← No price columns               │
 public.stock_transactions ← No price columns           │
 employee_items_view   ← security_invoker, no price     │
 process_stock_out()   ← Uses private cost internally   │
                                                          │
Admin Browser ────────────────────────────────────────────
       │                                                  │
       │ (admin sees price data via admin-only RPCs)     │
       ▼                                                  │
 private.item_costs         ← NOT in Data API           │
 private.stock_transaction_costs ← NOT in Data API      │
```
