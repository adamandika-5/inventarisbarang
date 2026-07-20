/**
 * Keamanan dan RLS — InventarisBarang
 *
 * Dokumen ini menjelaskan strategi keamanan dan Row Level Security (RLS).
 */

# Keamanan dan RLS

## 1. Defense in Depth

Setiap layer menambahkan lapisan perlindungan independen:

1. **UI Layer** — Sembunyikan menu admin dari pegawai (UX only)
2. **Middleware** — Route guard berdasarkan session cookie
3. **Server Components** — Verifikasi role + is_active via direct DB query
4. **API Routes / Server Actions** — Validasi session, role, is_active sebelum operasi
5. **RPC Functions (SECURITY DEFINER)** — is_admin() check di dalam function body
6. **RLS Policies** — Policy per role per tabel di PostgreSQL
7. **Private Schema** — Schema tidak diekspos via Supabase Data API
8. **Database Constraints** — CHECK, UNIQUE, FK, NOT NULL invariants

## 2. RLS Policy Summary

### profiles
| Policy | Role | Aksi | Kondisi |
|---|---|---|---|
| profiles_select_own | authenticated | SELECT | id = auth.uid() AND is_active |
| profiles_select_admin | authenticated | SELECT | is_admin() |
| profiles_update_admin | authenticated | UPDATE | is_admin() |

### categories, units
| Policy | Role | Aksi | Kondisi |
|---|---|---|---|
| *_select | authenticated | SELECT | is_active_user() |
| *_insert_admin | authenticated | INSERT | is_admin() |
| *_update_admin | authenticated | UPDATE | is_admin() |

### items
| Policy | Role | Aksi | Kondisi |
|---|---|---|---|
| items_select_employee | authenticated | SELECT | is_active_user() AND (is_active OR is_admin()) |
| items_insert_admin | authenticated | INSERT | is_admin() |
| items_update_admin | authenticated | UPDATE | is_admin() |

### stock_transactions
| Policy | Role | Aksi | Kondisi |
|---|---|---|---|
| st_select_own_employee | authenticated | SELECT | (performed_by = uid AND type = OUT) OR is_admin() |
| (no INSERT/UPDATE/DELETE) | — | — | Mutasi hanya via RPC |

### audit_logs
| Policy | Role | Aksi | Kondisi |
|---|---|---|---|
| audit_logs_select_admin | authenticated | SELECT | is_admin() |

## 3. Pemisahan Data Harga

### Masalah
Pegawai tidak boleh melihat harga, nilai persediaan, atau data biaya dalam bentuk apa pun.

### Solusi

```
private.item_costs          ← Di luar Supabase Data API
private.stock_transaction_costs  ← Di luar Supabase Data API

public.items                ← Tidak ada kolom harga
public.stock_transactions   ← Tidak ada kolom harga
employee_items_view         ← security_invoker, tidak ada harga
process_stock_out()         ← Menggunakan cost internal tapi tidak mengembalikannya
```

### Verifikasi
Test yang harus gagal jika dijalankan sebagai pegawai:
- `SELECT * FROM private.item_costs` → Permission denied
- `SELECT * FROM private.stock_transaction_costs` → Permission denied
- `SELECT unit_price_input FROM private.stock_transaction_costs` → Permission denied
- `SELECT * FROM stock_transactions WHERE performed_by != auth.uid()` → Empty result (RLS)

## 4. Idempotency

Setiap transaksi menggunakan `client_request_id` UUID:

- Client membuat UUID unik per transaksi
- Tombol dikunci setelah diklik
- RPC cek unique constraint `(client_request_id, performed_by)`
- Request ulang dengan ID sama mengembalikan hasil pertama

## 5. Concurrency Safety

- `SELECT FOR UPDATE` pada item sebelum memodifikasi stok
- `SELECT FOR UPDATE` pada private.item_costs sebelum update
- PostgreSQL transaction memastikan atomicity
- Unique constraint pada client_request_id menangani race condition

## 6. Session dan Cookie Security

- Session menggunakan Supabase SSR dengan HttpOnly cookies
- Service role key: server-side only, tidak boleh prefix NEXT_PUBLIC_
- Logout: signOut() + cache clear
- Pengguna nonaktif: session diinvalidasi pada level DB check (is_active check di every RPC)

## 7. CSRF Protection

- Same-origin cookie (SameSite=Lax default Supabase)
- Server actions dan API routes memverifikasi session dari cookie
- Tidak ada endpoint yang menerima token dari request body untuk auth

## 8. Input Validation

- Client: Zod schema untuk UX feedback
- Server: Zod schema pada semua API routes dan server actions
- Database: CHECK constraints untuk invariants

## 9. Secret Management

Aturan ketat:
- JANGAN simpan secret di repository
- JANGAN log password, token, atau internal email
- Service role key hanya di .env.local (lokal) dan Vercel env vars (production)
- Internal email tidak pernah dikirim ke browser atau masuk log
