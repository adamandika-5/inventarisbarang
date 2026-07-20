# InventarisBarang

Sistem pengelolaan persediaan alat tulis kantor (ATK) berbasis web.

## Fitur

- Login dengan username dan kata sandi (tanpa self-signup)
- Scan barcode barang untuk pengambilan
- Dashboard admin dan pegawai yang terpisah
- Pengelolaan master data (barang, kategori, satuan)
- Laporan stok, barang masuk/keluar, nilai persediaan
- Impor Excel dan ekspor laporan
- Cetak barcode label PDF A4
- PWA — dapat dipasang di layar utama

## Tech Stack

- **Next.js 15** (App Router) + TypeScript strict
- **Tailwind CSS**
- **Supabase** (PostgreSQL + Auth)
- **Vercel** (hosting target)

## Prasyarat

- Node.js LTS (v20+)
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

### 4. Jalankan Migration Database

Di Supabase Dashboard → **SQL Editor**, jalankan file berikut secara berurutan:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_and_grants.sql`
3. `supabase/migrations/003_stock_rpc_functions.sql`
4. `supabase/migrations/004_admin_bootstrap_function.sql`

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
4. Deploy

## Keamanan

- Service role key tidak boleh diawali `NEXT_PUBLIC_`
- Self-signup harus dinonaktifkan di Supabase
- Admin dibuat via script server-side, bukan melalui UI
- RLS aktif di semua tabel exposed
- Data harga disimpan di schema private yang tidak diekspos

## Dokumentasi

Lihat folder `docs/` untuk dokumentasi lengkap SDLC.
