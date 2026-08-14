# InventarisBarang

Sistem pengelolaan persediaan alat tulis kantor (ATK) berbasis web dengan pemisahan akses administrator dan pegawai.

## Fitur Utama

- Login menggunakan username dan kata sandi tanpa self-signup
- Dashboard dan hak akses Admin/Employee yang terpisah
- Forced password change untuk pegawai setelah akun dibuat atau password di-reset Admin
- Manajemen barang, kategori, satuan, dan pengguna
- Barang masuk, barang keluar, penyesuaian stok, dan reversal transaksi
- Scan barcode untuk operasional pegawai
- Riwayat transaksi dan audit log
- Laporan persediaan dan transaksi
- Ekspor laporan ke Excel
- Cetak barcode
- PWA dan tampilan responsif

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript** strict
- **Tailwind CSS**
- **Supabase** — PostgreSQL, Authentication, RLS, dan RPC
- **Vitest + Testing Library**
- **Playwright**
- **Vercel**

## Prasyarat

- Node.js 24.x
- npm
- Project Supabase
- Supabase CLI untuk workflow migration CLI
- Akun Vercel untuk deployment

## Konfigurasi Awal

### Clone dan Install

```bash
git clone https://github.com/adamandika-5/inventarisbarang.git
cd inventarisbarang
npm install
```

## Konfigurasi Environment

Salin template:

```bash
cp .env.example .env.local
```

Isi `.env.local` dengan:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
LOGIN_RATE_LIMIT_SECRET=replace_with_a_random_secret_of_at_least_32_characters
```

Aturan keamanan:

- Jangan commit `.env.local` atau `.env.test.local`
- Jangan memberi prefix `NEXT_PUBLIC_` pada service-role key atau secret server
- `LOGIN_RATE_LIMIT_SECRET` harus berupa nilai acak minimal 32 karakter
- Jangan menyimpan password, token, service-role key, atau secret nyata di repository atau log
- Self-signup Supabase harus dinonaktifkan

## Migration Database

Migration dijalankan secara berurutan:

1. `001_initial_schema.sql`
2. `002_rls_and_grants.sql`
3. `003_stock_rpc_functions.sql`
4. `004_admin_bootstrap_function.sql`
5. `005_harden_login_lookup_permissions.sql`
6. `006_fix_stock_rpc_item_unit.sql`
7. `007_complete_forced_password_change.sql`
8. `008_get_stock_transaction_costs_rpc.sql`
9. `009_audit_logs_rpc_and_fixes.sql`
10. `010_fix_log_audit_event_rpc.sql`
11. `011_quantity_only_stock_rpcs.sql`
12. `012_dashboard_stats_rpc.sql`
13. `013_report_summary_rpc.sql`
14. `014_fix_idempotency_audit_logs_and_admin_bootstrap.sql`
15. `015_login_rate_limiting.sql`

Untuk Supabase CLI:

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Jalankan `db push` tanpa `--dry-run` hanya setelah memastikan project Supabase yang sedang ter-link adalah target yang benar.

> Jangan mengasumsikan Supabase CLI sedang terhubung ke production. Selalu periksa project ref terlebih dahulu.

## Membuat Admin Pertama

Admin pertama dibuat melalui script server-side:

```bash
npx tsx scripts/create-admin.ts
```

Ikuti prompt untuk memasukkan username, nama lengkap, dan password Admin.

## Menjalankan Aplikasi Lokal

```bash
npm run dev
```

Secara default:

```text
http://localhost:3000
```

## Pengujian

### Unit Test

```bash
npm run test
```

Baseline terakhir yang telah diverifikasi:

```text
34 test files passed
502 tests passed
```

### Type Checking

```bash
npm run type-check
```

### Test Coverage

```bash
npm run test:coverage
```

### End-to-End Test dengan Playwright

E2E harus menggunakan project Supabase khusus testing dan tidak boleh menggunakan database production.

Salin template:

```bash
cp .env.test.example .env.test.local
```

Isi `.env.test.local` dengan credential project testing dan akun E2E khusus.

Variabel E2E:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_TEST_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_test_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_test_service_role_key
LOGIN_RATE_LIMIT_SECRET=replace_with_a_random_test_secret_of_at_least_32_characters

E2E_ADMIN_USERNAME=e2e_admin
E2E_ADMIN_PASSWORD=replace_with_test_admin_password

E2E_EMPLOYEE_USERNAME=e2e_employee
E2E_EMPLOYEE_PASSWORD=replace_with_test_employee_password
```

Jalankan:

```bash
npm run test:e2e
```

Suite E2E saat ini mencakup:

- render halaman login
- login Admin
- login Employee
- forced password change
- stock-in oleh Admin
- stock-out oleh Employee
- reversal transaksi
- verifikasi integritas stok
- validasi endpoint ekspor laporan Excel

Baseline terakhir:

```text
5 E2E tests passed
```

`playwright.config.ts` memiliki fail-safe untuk mencegah E2E dijalankan terhadap project Supabase yang salah.

Jika menggunakan project testing lain, konfigurasi fail-safe tersebut harus diperbarui secara sengaja agar cocok dengan project testing yang baru.

## Keamanan Login

Perlindungan login mencakup:

- pesan kegagalan login generik
- rate limiting berdasarkan akun dan sumber request
- distributed rate limiting menggunakan PostgreSQL
- hashing server-side menggunakan `LOGIN_RATE_LIMIT_SECRET`
- validasi akun aktif
- forced password change
- validasi role server-side
- RLS dan RPC sebagai defense in depth

## Keamanan Database

- RLS aktif pada tabel yang diekspos
- data harga sensitif disimpan pada schema private
- service-role key hanya digunakan server-side
- mutasi stok dilakukan melalui RPC database
- pegawai tidak melakukan mutasi ledger secara langsung
- aktivitas penting dicatat melalui audit log

## Integritas Transaksi Stok

- Mutasi stok dilakukan secara atomik melalui RPC
- Row locking digunakan untuk mencegah lost update
- `client_request_id` digunakan untuk idempotency
- Ledger transaksi tidak dimodifikasi langsung oleh client
- Reversal mempertahankan histori transaksi asli
- Constraint database menjaga integritas stok dan snapshot transaksi

## Supabase Testing dan Production

Gunakan project Supabase berbeda untuk aplikasi utama dan E2E:

```text
.env.local       -> development / production
.env.test.local  -> dedicated testing project
```

Sebelum menjalankan operasi Supabase CLI yang dapat mengubah database, selalu periksa project yang sedang ter-link.

## Deployment ke Vercel

Environment variable production yang diperlukan:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
LOGIN_RATE_LIMIT_SECRET
```

Gunakan environment Preview untuk validasi sebelum production.

Jangan memasukkan credential atau akun E2E ke deployment production.

## Perintah Pengembangan

```bash
# Development
npm run dev

# Type checking
npm run type-check

# Unit test
npm run test

# Watch unit test
npm run test:watch

# Coverage
npm run test:coverage

# End-to-end
npm run test:e2e

# Format
npm run format

# Check formatting
npm run format:check

# Production build
npm run build
```

## Dokumentasi

Dokumentasi tambahan tersedia di folder `docs/`.

- `docs/00-rencana-eksekusi.md` — rencana awal/historis proyek
- `docs/02-srs.md` — Software Requirements Specification
- `docs/04-arsitektur.md` — arsitektur sistem
- `docs/09-keamanan-dan-rls.md` — keamanan dan RLS
- `docs/progress.md` — status implementasi dan quality gate terbaru
