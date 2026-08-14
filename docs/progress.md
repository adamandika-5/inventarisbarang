# Progress â€” InventarisBarang

**Terakhir diperbarui:** 2026-08-14
**Status:** Finalisasi, hardening, testing, dan dokumentasi

## Quality Gate Terakhir

| Pemeriksaan | Perintah | Status | Hasil |
|---|---|---|---|
| Type check | `npm run type-check` | PASSED | 0 error |
| Unit tests | `npm run test` | PASSED | 34 test files, 502 tests passed |
| E2E Playwright | `npm run test:e2e` | PASSED | 5 tests passed |
| Diff check | `git diff --check` | PASSED | Tidak ada whitespace error |

## Database dan Migration

Migration saat ini tersedia sampai:

- `001_initial_schema.sql`
- `002_rls_and_grants.sql`
- `003_stock_rpc_functions.sql`
- `004_admin_bootstrap_function.sql`
- `005_harden_login_lookup_permissions.sql`
- `006_fix_stock_rpc_item_unit.sql`
- `007_complete_forced_password_change.sql`
- `008_get_stock_transaction_costs_rpc.sql`
- `009_audit_logs_rpc_and_fixes.sql`
- `010_fix_log_audit_event_rpc.sql`
- `011_quantity_only_stock_rpcs.sql`
- `012_dashboard_stats_rpc.sql`
- `013_report_summary_rpc.sql`
- `014_fix_idempotency_audit_logs_and_admin_bootstrap.sql`
- `015_login_rate_limiting.sql`

Migration `001â€“015` telah diuji pada project Supabase testing.

## Authentication dan Security

Fitur keamanan yang telah diterapkan:

- Login dengan username melalui BFF
- Self-signup tidak digunakan
- Role Admin dan Employee terpisah
- Pemeriksaan status akun aktif
- Forced password change
- Reset password Employee oleh Admin
- Pesan kegagalan login generik
- Distributed login rate limiting
- Rate limiting berdasarkan akun dan sumber request
- Hashing server-side dengan `LOGIN_RATE_LIMIT_SECRET`
- Server-side authorization
- Row Level Security
- RPC database untuk operasi sensitif

## Master Data

Fitur master data yang telah tersedia:

- Manajemen barang
- Manajemen kategori
- Manajemen satuan
- Manajemen pengguna
- Barcode
- SKU

## Transaksi Stok

Fitur transaksi yang telah tersedia:

- Stock-in oleh Admin
- Stock-out oleh Employee
- Penyesuaian stok
- Reversal transaksi
- Atomic RPC
- Row locking
- Idempotency menggunakan `client_request_id`
- Audit log transaksi

## Laporan

Fitur laporan yang telah tersedia:

- Ringkasan persediaan
- Laporan transaksi
- Filter tanggal
- Export Excel
- Validasi endpoint export melalui E2E

## UI dan Operasional

Fitur antarmuka yang telah tersedia:

- Dashboard Admin
- Dashboard Employee
- Barcode scanning
- Barcode printing
- PWA
- Responsive navigation
- Dark/light theme

## E2E Coverage

Playwright saat ini memverifikasi:

1. Halaman login
2. Login Admin
3. Login Employee
4. Forced password change
5. Stock-in Admin
6. Stock-out Employee
7. Reversal stock-out
8. Reversal stock-in
9. Integritas stok setelah transaksi
10. Endpoint export laporan Excel

Seluruh E2E dijalankan terhadap project Supabase khusus testing.

## Testing Environment

Project aplikasi utama dan E2E dipisahkan:

- `.env.local` untuk aplikasi utama
- `.env.test.local` untuk Supabase testing
- `.env.test.example` sebagai template aman

Credential, password, service-role key, dan secret nyata tidak boleh disimpan di repository.

Playwright memiliki fail-safe agar E2E tidak secara tidak sengaja berjalan terhadap project Supabase yang salah.

## Repository Cleanup

Cleanup repository yang telah dilakukan:

- Menghapus `.tmp/remote-database-types.ts` yang sebelumnya ter-track
- Menambahkan `.tmp/` ke `.gitignore`
- Menghapus logo root yang tidak digunakan
- Meng-ignore artifact Playwright, coverage, build, dependency, dan environment lokal
- Menambahkan `.env.test.example`

## Supabase CLI

Sebelum menjalankan operasi database, selalu periksa project yang sedang ter-link.

Gunakan minimal:

`npx supabase migration list --linked`

dan:

`npx supabase db push --linked --dry-run`

Jangan menjalankan `db push` tanpa `--dry-run` sebelum memastikan target project benar.

## Deployment

Deployment production ke Vercel belum dinyatakan terverifikasi dalam dokumen ini.

Sebelum production:

- pastikan environment variable production lengkap
- pastikan self-signup Supabase nonaktif
- pastikan migration `001â€“015` sudah diterapkan
- lakukan Preview deployment
- lakukan smoke test
- jangan gunakan credential E2E di production

## Dokumentasi

- `README.md` â€” setup dan penggunaan proyek
- `docs/00-rencana-eksekusi.md` â€” rencana awal/historis
- `docs/02-srs.md` â€” requirements
- `docs/04-arsitektur.md` â€” arsitektur
- `docs/09-keamanan-dan-rls.md` â€” keamanan dan RLS
- `docs/progress.md` â€” status proyek terbaru
