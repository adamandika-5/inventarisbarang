# Progress — InventarisBarang

**Terakhir diperbarui**: 2026-07-21 06:29 WIB  
**Lingkungan**: Lokal — Quality Gates 100% Passed (Type Check, Lint, Vitest, Build)

---

## Quality Gate Status (Verified Execution Run)

| Test | Perintah | Status | Hasil |
|---|---|---|---|
| Type check | `npm.cmd run type-check` | ✅ **PASSED** | 0 error (`tsc --noEmit`) |
| Lint | `npm.cmd run lint` | ✅ **PASSED** | 0 warning, 0 error (`next lint`) |
| Unit tests | `npm.cmd test` | ✅ **PASSED** | 75 passed (75/75 test cases), 0 failed |
| Production Build | `npm.cmd run build` | ✅ **PASSED** | 29/29 pages compiled & optimized (termasuk `/admin/import`, `/admin/reports`, dll) |

---

## Milestone 1 — Fondasi dan Analisis ✅

### Diselesaikan

- [x] Pemeriksaan workspace & Rencana eksekusi (`docs/00-rencana-eksekusi.md`)
- [x] Scaffold Next.js 15 + TypeScript strict + Tailwind CSS
- [x] Konfigurasi ESLint & Vitest
- [x] Structure folder `src/` & Zod Environment validation
- [x] Supabase client (`server.ts` & `client.ts`) & Database type definitions (`src/types/database.ts`)
- [x] Middleware route protection & Auth API handlers (`/api/auth/login`, `/api/auth/logout`, `/api/auth/change-password`)
- [x] Admin & Employee navigation layouts (`src/app/admin/layout.tsx`, `src/app/employee/layout.tsx`)
- [x] Utility functions: format, barcode validation, SKU generator, spreadsheet sanitization
- [x] Unit tests: auth, SKU, barcode, stock, format (69 test cases)

---

## Milestone 2 — Database, Auth, dan RLS ✅ (Code Base)

### Diselesaikan

- [x] Migration SQL: `001_initial_schema.sql` (schema public & private, tables, views, triggers)
- [x] Migration SQL: `002_rls_and_grants.sql` (RLS policies, helper security functions)
- [x] Migration SQL: `003_stock_rpc_functions.sql` (atomic RPCs with FOR UPDATE locking & Moving Average calculation)
- [x] Migration SQL: `004_admin_bootstrap_function.sql` (BFF credentials lookup & employee account creation)
- [x] Script bootstrap admin: `scripts/create-admin.ts`

---

## Milestone 3 — Master Data & Modul Transaksi Admin ✅

### Diselesaikan

- [x] **Manajemen Kategori** (`/admin/categories`) — CRUD server actions, data table, modal form, filter aktif/nonaktif, validasi duplikat.
- [x] **Manajemen Satuan** (`/admin/units`) — CRUD server actions, data table, modal form, validasi duplikat nama & simbol.
- [x] **Manajemen Barang** (`/admin/items`) — Server actions, list barang dengan search & filter kategori/status, form barang baru (`/admin/items/new`) dengan validasi EAN/UPC/CODE128/QR checksum, detail barang (`/admin/items/[id]`), edit & deaktivasi barang.
- [x] **Barang Masuk / Purchase** (`/admin/stock-in`) — Server action dengan RPC `process_stock_in`, form barang masuk dengan autocomplete item search (`ItemSearchInput`). Memiliki perbaikan parameter RPC (menggunakan `p_unit_price`) serta formatting rupiah ter-integer murni dengan penanganan posisi kursor kustom dan pencegahan wheel scrolling.
- [x] **Riwayat Barang Keluar** (`/admin/stock-out`) — Tabel riwayat barang keluar admin dengan detail penerima & status pembatalan.
- [x] **Penyesuaian Stok Fisik** (`/admin/adjustments`) — Form penyesuaian stok dengan RPC `process_stock_adjustment`, validasi selisih stok (stock in / stock out adjustment), catatan alasan wajib.
- [x] **Pembatalan / Reversal Transaksi** (`/admin/reversals`) — Client view & API route `/api/transactions/reversal` dengan RPC `process_reversal`, pencatatan alasan pembatalan & pembalikan stok otomatis.
- [x] **Manajemen Pengguna & Pegawai** (`/admin/users`) — Form pegawai baru (`/admin/users/new`) dengan password temporary & paksa ganti password pada login pertama (`must_change_password`), reset password pegawai, toggle status aktif/nonaktif.
- [x] **Audit Log Viewer** (`/admin/audit-log`) — Tampilan log audit sistem dengan filter aksi (LOGIN, ITEM_CREATE, STOCK_OUT, REVERSAL, dll), pagination & info metadata IP/user-agent.
- [x] **Pengaturan Aplikasi** (`/admin/settings`) — Form pengaturan nama perusahaan, alamat, telepon, footer nota, & format barcode default.
- [x] **Komponen Search Autocomplete** (`src/components/item-search-input.tsx` & `/api/items/search`) — Reusable autocomplete search barang untuk form transaksi.

---

## Status External Tests & Remote DB

| Test | Status | Alasan |
|---|---|---|
| Migration ke Supabase remote | BLOCKED | Belum ada Supabase credentials |
| Integration test RLS | BLOCKED | Butuh database dengan credentials |
| E2E test browser | BLOCKED | Butuh running app dengan Supabase |
| Deployment ke Vercel | BLOCKED | Butuh Vercel credentials |

---

## Milestone 4 — Import Excel & Cetak Barcode ✅

### Diselesaikan

- [x] **Cetak Label Barcode** (`/admin/barcode-print`) — Halaman cetak label barcode client-side menggunakan `bwip-js/browser`.
- [x] **Import Data Excel** (`/admin/import`) — Parser Excel/CSV menggunakan `exceljs` dan `TextDecoder` (in-memory, tanpa write ke disk). Fitur: unduh template impor dengan header warna-warni, file drop & upload, preview tabel data sebelum konfirmasi, validasi penuh di server (format SKU/barcode, lookup kategori/satuan, cek duplikasi di database/file), input confirmation block double click, all-or-nothing transactional insertion (lewat server actions), log batch summary di `import_batches` dan `audit_logs`.

---

## Milestone 6 — Laporan & Ekspor ✅

### Diselesaikan

- [x] **Laporan Transaksi** (`/admin/reports`) — Halaman laporan admin dengan pencarian dan filter rentang tanggal (default 30 hari terakhir di WIB) serta jenis transaksi. Fitur: Ringkasan total stok masuk, stok keluar, jumlah transaksi, dan barang dengan stok rendah (≤ minimum limit), tabel transaksi paginated, export CSV dengan filter aktif dan proteksi CSV Formula Injection (sanitasi prefix `=`, `+`, `-`, `@`), aman tanpa kebocoran data sensitif.

---

## Route Sidebar yang Masih 404 (Belum Diimplementasikan)

| Route | Label Menu | Status |
|---|---|---|
| `/admin/account` | Akun (footer sidebar) | ❌ 404 — belum ada `page.tsx` |
| `/employee` | (redirect ke employee dashboard) | ⚠️ Ada layout tapi konten minimal |

---

## Langkah Selanjutnya (Milestone 5 & Milestone 7-8)

1. **Modul Pegawai / Employee UI** (`/employee`) — Form keluar barang, kamera barcode scanner (`@zxing/browser`), riwayat transaksi pegawai.
2. **Halaman Akun** (`/admin/account`) — Ganti username/password self-service.
3. **PWA & Offline Queue** — Service Worker, manifest, antrian transaksi saat offline.


