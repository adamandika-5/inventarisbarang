# InventarisBarang

Sistem pengelolaan persediaan alat tulis kantor (ATK) berbasis web.

## Fitur

- Login dengan username dan kata sandi (tanpa self-signup)
- Scan barcode barang untuk pengambilan
- Dashboard admin dan pegawai yang terpisah
- Pengelolaan master data (barang, kategori, satuan)
- Laporan stok, barang masuk/keluar, dan rincian persediaan
- Ekspor laporan ke Excel
- Cetak barcode melalui dialog print browser
- PWA — dapat dipasang di layar utama

## Tech Stack

- **Next.js 15** (App Router) + TypeScript strict
- **Tailwind CSS**
- **Supabase** (PostgreSQL + Auth)
- **Vercel** (hosting target, Node.js 24.x)

## Prasyarat

- Node.js 24.x (LTS)
- Akun Supabase
- Akun Vercel (untuk deployment)

## Konfigurasi Awal

### 1. Clone dan Install

```bash
git clone <repo-url>
cd inventarisbarang
npm install
```

### 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Catat Project URL dan anon key dari **Settings → API**
3. Catat service role key dari **Settings → API** (jangan dibagikan!)
4. Nonaktifkan self-signup di **Authentication → Providers → Email → Enable sign-ups** (matikan)
5. Rekomendasikan Functions Region **Singapore (`sin1`)** untuk latensi terbaik

### 3. Konfigurasi Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # JANGAN awali dengan NEXT_PUBLIC_
```

Environment variable yang dibutuhkan:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Jangan menambahkan `NODE_ENV` — Vercel mengaturnya secara otomatis.

### 4. Jalankan Migration Database

Di Supabase Dashboard → **SQL Editor**, jalankan file berikut secara berurutan:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_and_grants.sql`
3. `supabase/migrations/003_stock_rpc_functions.sql`
4. `supabase/migrations/004_admin_bootstrap_function.sql`
5. `supabase/migrations/005_audit_log_and_item_active.sql`
6. `supabase/migrations/006_adjustment_and_reversal_rpcs.sql`
7. `supabase/migrations/007_complete_forced_password_change.sql`
8. `supabase/migrations/008_audit_log_rpc_fix.sql`
9. `supabase/migrations/009_barcode_and_conversion.sql`
10. `supabase/migrations/010_camera_scan_rpc.sql`
11. `supabase/migrations/011_quantity_only_stock_rpcs.sql`
12. `supabase/migrations/012_dashboard_stats_rpc.sql`
13. `supabase/migrations/013_report_summary_rpc.sql`

Atau jika menggunakan Supabase CLI:

```bash
npx supabase db push
```

### 5. Buat Admin Pertama

```bash
npx tsx scripts/create-admin.ts
```

Ikuti prompt untuk memasukkan username, nama, dan password admin.

### 6. Jalankan Lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

## Pengujian

```bash
# Unit tests
npm run test

# Type checking
npm run type-check

# Lint
npm run lint

# Production build
npm run build
```

## Deployment ke Vercel

1. Push kode ke GitHub
2. Connect repository di [vercel.com](https://vercel.com)
3. Set environment variables di Vercel dashboard (Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Pilih Functions Region **Singapore (`sin1`)**
5. Deploy pertama kali melalui **Preview** untuk validasi sebelum production

## Keamanan

- Service role key tidak boleh diawali `NEXT_PUBLIC_`
- Self-signup harus dinonaktifkan di Supabase
- Admin dibuat via script server-side, bukan melalui UI
- RLS aktif di semua tabel exposed
- Data harga disimpan di schema private yang tidak diekspos

## Dokumentasi

Lihat folder `docs/` untuk dokumentasi lengkap SDLC.
