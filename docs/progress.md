# Progress — InventarisBarang

**Terakhir diperbarui:** 2026-08-15
**Status:** Release Ready v1.0.0

## Quality Gate Terakhir

| Pemeriksaan | Perintah | Status | Hasil |
|---|---|---|---|
| Type check | `npm run type-check` | PASSED | 0 error |
| Lint | `npm run lint` | PASSED | 0 error |
| Unit tests | `npm run test` | PASSED | 35 test files passed |
| E2E Playwright | `npm run test:e2e` | PASSED | 5 tests passed (Testing Environment) |
| Diff check | `git diff --check` | PASSED | Tidak ada whitespace error |

## Status Produksi (Production Readiness)

Aplikasi telah berhasil melewati seluruh tahapan audit kesiapan produksi:

1. **Vercel Production:**
   - URL Produksi: [https://inventarisbarang.vercel.app](https://inventarisbarang.vercel.app)
   - Status deployment: `Ready` (Next.js 15.5.23 on Node.js 24.x)
   - Security headers aktif (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Cache-Control).

2. **Database Produksi (Supabase):**
   - Project: `inventarisbarang` (`ruvfxziudpfyntahupqn`)
   - Migrations `001–015` berurutan dan cocok 100% dengan remote (`MATCH`).
   - `supabase db push --dry-run` mengonfirmasi status database telah `up to date`.

3. **Smoke Test Produksi:**
   - Seluruh rute publik dan terproteksi telah diuji.
   - Proteksi unauthenticated (redirect 307 ke `/login`) bekerja konsisten tanpa HTTP 500.

4. **Uji Transaksi & Reversal Terkontrol (Controlled Production Transaction Test):**
   - Kandidat uji: `Penghapus` (`ATK-0007`)
   - Siklus Barang Masuk: `90 Pcs` $\rightarrow$ `91 Pcs` $\rightarrow$ Reversal $\rightarrow$ `90 Pcs` (PASS)
   - Siklus Barang Keluar: `90 Pcs` $\rightarrow$ `89 Pcs` $\rightarrow$ Reversal $\rightarrow$ `90 Pcs` (PASS)
   - Integritas stok akhir kembali presisi ke baseline `90 Pcs` dengan net quantity `0`.
   - Proteksi double reversal dan pencatatan audit log terverifikasi 100%.

5. **Pemisahan Environment (Isolation):**
   - Produksi (`.env.local` $\rightarrow$ `ruvfxziudpfyntahupqn`) dan Testing (`.env.test.local` $\rightarrow$ `dncyhftgkwkdhksvxaob`) terisolasi penuh.
   - Tidak ada akun testing atau data E2E yang bocor ke environment produksi.

## Status Backup & Pemulihan (Backup & Recovery)

- **Manual Production Backup:** DEFERRED (Ditunda).
- **Alasan:** Keterbatasan penyimpanan lokal dan dependensi Docker Desktop untuk eksekusi utilitas CLI `supabase db dump`.
- **Konfigurasi Supabase Free Plan:** Scheduled backup otomatis dan PITR tidak tersedia pada tier gratis saat audit dilakukan.
- **Rencana Pemulihan (Recovery Plan):** Telah terdokumentasi (pemanfaatan in-app reversal untuk koreksi operasional, skema restore berurutan `roles` $\rightarrow$ `schema` $\rightarrow$ `data` untuk disaster recovery).
- **Rekomendasi:** Backup logis manual harus segera dibuat ketika kapasitas penyimpanan lokal atau Docker telah tersedia.

## Database dan Migration

Migration saat ini tersedia lengkap dan berurutan:

- `001_initial_schema.sql` — Skema dasar dan relasi
- `002_rls_and_grants.sql` — Kebijakan RLS dan hak akses
- `003_stock_rpc_functions.sql` — Fungsi RPC transaksi stok
- `004_admin_bootstrap_function.sql` — Inisialisasi akun admin
- `005_harden_login_lookup_permissions.sql` — Pengerasan izin lookup login
- `006_fix_stock_rpc_item_unit.sql` — Koreksi konversi satuan transaksi
- `007_complete_forced_password_change.sql` — Alur ganti kata sandi wajib
- `008_get_stock_transaction_costs_rpc.sql` — RPC kalkulasi biaya transaksi
- `009_audit_logs_rpc_and_fixes.sql` — RPC dan indeks audit log
- `010_fix_log_audit_event_rpc.sql` — Penyesuaian logging event audit
- `011_quantity_only_stock_rpcs.sql` — Transisi transaksi stok berbasis kuantitas
- `012_dashboard_stats_rpc.sql` — RPC statistik dashboard
- `013_report_summary_rpc.sql` — RPC ringkasan laporan
- `014_fix_idempotency_audit_logs_and_admin_bootstrap.sql` — Idempotensi penyesuaian stok, penguncian baris, dan audit log
- `015_login_rate_limiting.sql` — Rate limiting login multi-dimensi

## Authentication dan Security

- Login dengan username melalui Backend-for-Frontend (BFF)
- Self-signup dinonaktifkan
- Pemisahan hak akses Admin dan Employee di tingkat middleware, layout server, dan database
- Pemeriksaan status akun aktif (`is_active`)
- Forced password change untuk akun baru atau pasca-reset
- Rate limiting login multi-layer (akun, IP, dan kombinasi akun-IP) dengan HMAC hashing `LOGIN_RATE_LIMIT_SECRET`
- Row Level Security (RLS) pada semua tabel publik
- Operasi mutasi stok atomik dengan `SECURITY DEFINER` RPC dan row-level locking

## Master Data & Transaksi Stok

- Manajemen barang, kategori, satuan, dan pengguna
- Barcode generator (CODE128) dan barcode printing
- Scan barcode melalui kamera untuk operasional barang keluar
- Transaksi barang masuk, barang keluar, penyesuaian stok, dan pembatalan transaksi (reversal)
- Idempotency berbasis `client_request_id`
- Ledger transaksi stok dan audit log append-only

## Laporan & Ekspor

- Ringkasan persediaan dan laporan transaksi
- Filter berdasarkan rentang tanggal
- Ekspor laporan ke file Excel (`.xlsx`) via streaming server

## Dokumentasi

- `README.md` — Panduan setup dan penggunaan proyek
- `docs/release-v1.0.0.md` — Catatan rilis versi final 1.0.0
- `docs/00-rencana-eksekusi.md` — Rencana historis
- `docs/02-srs.md` — Spesifikasi kebutuhan perangkat lunak (SRS)
- `docs/04-arsitektur.md` — Arsitektur sistem
- `docs/09-keamanan-dan-rls.md` — Dokumentasi keamanan dan kebijakan RLS
- `docs/progress.md` — Status kesiapan produksi
