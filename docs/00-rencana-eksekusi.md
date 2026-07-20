# Rencana Eksekusi — InventarisBarang

**Tanggal**: 2026-07-20  
**Versi prompt**: v2  
**Status**: Aktif (Milestone 1)

## Ringkasan

Membangun aplikasi web inventaris ATK bernama InventarisBarang dari nol menggunakan Next.js App Router, TypeScript strict, Tailwind CSS, Supabase PostgreSQL + Auth, target hosting Vercel.

## Stack Teknologi

| Layer | Teknologi | Alasan |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server components, SSR, Vercel hosting |
| Language | TypeScript strict | Type safety, maintainability |
| Styling | Tailwind CSS | Utility-first, responsive |
| Auth | Supabase Auth | Managed auth, SSR cookie support |
| Database | Supabase PostgreSQL | Managed DB, RLS, SECURITY DEFINER functions |
| PWA | Custom service worker | App shell caching only |
| Barcode scan | @zxing/browser | Active library, multi-format |
| Barcode generate | bwip-js | Mature, browser/server support |
| Excel | exceljs | Read/write xlsx, formula detection |
| PDF | pdfkit | Server-side PDF, barcode layout |
| Validasi | zod | Schema validation, type inference |
| Test | Vitest + Testing Library + Playwright | Modern, fast, full coverage |

## Milestone Plan

| # | Milestone | Status |
|---|---|---|
| 1 | Fondasi dan Analisis | ✅ Selesai |
| 2 | Database, Auth, dan RLS | 🔄 Dalam Progress |
| 3 | Master Data dan Ledger | ⏳ Pending |
| 4 | Harga dan Transaksi Admin | ⏳ Pending |
| 5 | Alur Pegawai | ⏳ Pending |
| 6 | Alur Admin | ⏳ Pending |
| 7 | Impor dan Dokumen | ⏳ Pending |
| 8 | PWA, Hardening, dan Penyelesaian | ⏳ Pending |

## Struktur Folder

```
inventarisbarang/
├── docs/                       # SDLC documentation
├── scripts/                    # Server-side scripts (create-admin, etc.)
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth group routes (login, change-password)
│   │   ├── admin/              # Admin-only routes
│   │   ├── employee/           # Employee routes
│   │   └── api/                # API route handlers
│   ├── components/             # Shared UI components
│   ├── lib/                    # Business logic
│   │   ├── supabase/           # Supabase clients (server/client)
│   │   ├── validation/         # Input validation (auth, barcode, sku)
│   │   ├── inventory/          # Stock calculation utilities
│   │   └── utils/              # General utilities (format, cn, etc.)
│   ├── types/                  # TypeScript type definitions
│   └── test/                   # Test files
│       ├── unit/               # Unit tests (Vitest)
│       ├── integration/        # Integration tests (requires Supabase)
│       └── e2e/                # End-to-end tests (Playwright)
└── supabase/
    └── migrations/             # Versioned SQL migrations
```

## Keputusan Arsitektur

1. **Private schema** untuk cost data — tidak diekspos via Supabase Data API
2. **BFF pattern** untuk login — server lookup username → internal email
3. **SECURITY DEFINER RPC** untuk semua mutasi stok
4. **security_invoker views** untuk employee-safe views
5. **Idempotency** via client_request_id UUID unique constraint
6. **Row locking** (SELECT FOR UPDATE) untuk mencegah lost updates
7. **No direct INSERT/UPDATE/DELETE** pada ledger dari client
