# SRS — Software Requirements Specification

## FR-01 Autentikasi dan Akun

### FR-01.1 Login dengan Username
- Pengguna dapat login menggunakan username dan kata sandi
- Username dinormalisasi ke huruf kecil
- Pesan gagal login tidak membocorkan apakah username terdaftar

### FR-01.2 Pengelolaan Akun oleh Admin
- Admin dapat membuat akun pegawai
- Admin dapat menonaktifkan akun
- Admin dapat reset password pegawai dengan password sementara
- Pengguna dengan `must_change_password = true` hanya dapat mengakses halaman ganti password

### FR-01.3 Keamanan Akun
- Password minimal 10 karakter
- Self-signup tidak tersedia
- Akun nonaktif tidak dapat menggunakan sesi lama
- Rate limiting pada endpoint login

---

## FR-02 Pengelolaan Barang

### FR-02.1 Master Data Barang
- Admin dapat menambah, mengubah, dan menonaktifkan barang
- Setiap barang memiliki SKU format ATK-XXXX (auto-generated)
- Setiap barang memiliki satu barcode unik
- Barang tidak dapat dinonaktifkan jika masih memiliki stok

### FR-02.2 Satuan dan Konversi
- Setiap barang memiliki tepat satu satuan dasar (faktor = 1)
- Barang dapat memiliki satuan alternatif dengan faktor konversi bilangan bulat positif
- Satuan dasar tidak dapat diubah setelah ada transaksi

### FR-02.3 Barcode
- Mendukung EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR Code
- Validasi checksum untuk EAN/UPC
- Barang tanpa barcode pabrikan menggunakan SKU dengan format CODE128

---

## FR-03 Transaksi Stok

### FR-03.1 Stok Awal
- Admin mencatat stok awal dengan harga per satuan
- Hanya boleh satu transaksi INITIAL per barang
- Stok nol tidak membuat transaksi INITIAL

### FR-03.2 Barang Masuk
- Admin mencatat barang masuk dengan jumlah, satuan, dan harga per satuan
- Sistem menghitung moving average cost secara atomik

### FR-03.3 Barang Keluar
- Pegawai atau admin mencatat barang keluar melalui scan atau pencarian manual
- Pegawai tidak mengisi harga — sistem menggunakan moving average saat ini
- Stok tidak boleh menjadi negatif

### FR-03.4 Penyesuaian Stok
- Admin mencatat hasil hitung fisik
- Sistem menghitung delta di server (bukan dari client)
- Alasan penyesuaian wajib diisi

### FR-03.5 Koreksi (Reversal)
- Admin dapat membalik transaksi yang ada
- Reversal tidak dapat dibalik kembali
- Satu transaksi hanya boleh dibalik satu kali
- Alasan koreksi wajib diisi

---

## FR-04 Harga dan Nilai Persediaan

### FR-04.1 Moving Weighted Average
- Harga rata-rata dihitung berdasarkan satuan dasar
- Formula: (nilai_lama + nilai_beli) / stok_baru
- Harga rata-rata tidak berubah untuk transaksi OUT

### FR-04.2 Pemisahan Data Harga
- Harga disimpan di schema private (tidak diekspos ke pegawai)
- Pegawai tidak dapat melihat harga melalui UI, API, view, RPC, atau akses langsung

---

## FR-05 Dashboard dan Laporan

### FR-05.1 Dashboard Admin
- Metrik: total barang aktif, hampir habis, habis, nilai persediaan, transaksi bulan ini
- Grafik transaksi per hari
- Tabel barang dengan pencarian dan filter

### FR-05.2 Dashboard Pegawai
- Tombol Scan Barang
- Cek stok (tanpa harga)
- Riwayat pengambilan sendiri

### FR-05.3 Laporan
- Stok saat ini, barang masuk, keluar, kartu stok, penyesuaian, koreksi, hampir habis, habis, nilai persediaan
- Filter: bulan/tahun, rentang tanggal, kategori, barang
- Ekspor Excel (.xlsx) dan PDF

---

## FR-06 Impor Excel

### FR-06.1 Template dan Upload
- Template .xlsx tersedia untuk download
- Upload file .xlsx max 5 MB, max 2000 baris data
- Validasi semua baris sebelum impor
- Preview status per baris
- Baris valid dapat berhasil meski ada baris invalid

---

## FR-07 PWA

### FR-07.1 Instalasi
- Aplikasi dapat dipasang di layar utama Android dan iOS
- Web app manifest lengkap

### FR-07.2 Offline
- Indikator offline yang jelas
- Tombol transaksi dinonaktifkan saat offline
- Tidak ada antrean transaksi offline

---

## NFR-01 Keamanan

- RLS aktif di semua tabel exposed
- Service role key tidak diekspos ke browser
- Audit log append-only
- Defense in depth: validasi di client (UX), server (trust), database (invariant)

## NFR-02 Performa

- Optimasi untuk Vercel Hobby dan Supabase Free plan
- Ekspor sinkron dibatasi 10.000 baris

## NFR-03 Aksesibilitas

- Focus state dan keyboard navigation
- Semantic HTML
- Kontras WCAG AA minimal

## NFR-04 Responsivitas

- Berfungsi di PC/laptop, Android, iPhone
- Mobile: navigasi bawah
- Desktop: sidebar

## NFR-05 Lokalisme

- Bahasa Indonesia untuk seluruh antarmuka
- Zona waktu tampilan Asia/Jakarta
- Format mata uang IDR (id-ID locale)
