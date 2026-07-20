# Master Prompt — Bangun Aplikasi InventarisBarang

Bertindak sebagai senior full-stack engineer, system analyst, UI/UX designer, database engineer, security engineer, DevOps engineer, dan QA engineer. Bangun aplikasi web lengkap dan siap produksi bernama **InventarisBarang** dengan proses pengembangan SDLC Waterfall yang disertai perbaikan iteratif pada tahap implementasi dan pengujian.

Nama dan identitas aplikasi wajib konsisten:

- Nama yang ditampilkan pada antarmuka: `InventarisBarang`.
- Nama proyek/package/slug: `inventarisbarang`.
- Jangan mengganti nama aplikasi tanpa instruksi pengguna.

Jangan berhenti pada perencanaan, dokumentasi, mockup, prototipe, atau contoh kode. Selesaikan source code, migration database, autentikasi, otorisasi, fitur, pengujian, dokumentasi, dan kesiapan deployment.

## 1. Prinsip Pelaksanaan

1. Periksa workspace dan struktur repository sebelum mengubah apa pun.
2. Baca dan patuhi instruksi repository seperti `AGENTS.md`, `CONTRIBUTING.md`, atau dokumen serupa jika tersedia.
3. Jika repository kosong, buat proyek dari awal.
4. Jika repository sudah berisi proyek, pertahankan perubahan pengguna dan perubahan yang tidak berkaitan.
5. Jangan melakukan tindakan destruktif, menghapus data, menimpa konfigurasi penting, atau mengubah riwayat Git.
6. Jangan melakukan push, deployment eksternal, membuat akun, atau mengubah layanan eksternal tanpa kredensial dan izin pengguna.
7. Jangan menyimpan secret, token, password, atau kredensial dalam source code, log, fixture, screenshot, maupun dokumentasi.
8. Gunakan asumsi pada prompt ini sebagai keputusan arsitektur. Hanya minta keputusan pengguna jika benar-benar ada kebutuhan baru yang mengubah ruang lingkup atau arsitektur.
9. Jangan membuat tombol, menu, halaman, API, atau data palsu yang terlihat berfungsi tetapi sebenarnya belum diimplementasikan.
10. Jangan menggunakan mock data sebagai pengganti fungsi produksi. Fixture dan data seed khusus pengujian diperbolehkan, tetapi harus terpisah dari produksi.
11. Jangan menyebut suatu fitur atau pengujian selesai jika belum benar-benar dibuat dan diverifikasi.
12. Jika platform menghentikan pekerjaan sebelum seluruhnya selesai, simpan status yang akurat dalam `docs/progress.md` dan laporkan pekerjaan tersisa secara spesifik. Jangan mengklaim selesai.

## 2. Tujuan Sistem

InventarisBarang adalah aplikasi pengelolaan persediaan alat tulis kantor untuk satu lokasi penyimpanan dengan sekitar 20 pegawai.

Sistem dapat diakses melalui internet menggunakan:

- PC dan laptop.
- Android.
- iPhone.

Pegawai mengambil barang melalui pemindaian barcode atau pencarian manual. Admin mengelola master data, stok awal, barang masuk, penyesuaian, koreksi, barcode, pengguna, laporan, pengaturan, dan audit log.

Sistem ini merupakan sistem inventaris operasional internal, bukan sistem penjualan, pembayaran, atau akuntansi keuangan formal.

## 3. Teknologi Wajib

Gunakan:

- Next.js versi stabil terbaru yang kompatibel, menggunakan App Router.
- TypeScript dengan `strict: true`.
- Tailwind CSS.
- Supabase PostgreSQL.
- Supabase Auth.
- Vercel sebagai target hosting.
- PWA yang dapat dipasang pada layar utama perangkat.
- Library aktif dan terpelihara untuk pemindaian barcode, pembuatan barcode, Excel, PDF, validasi, dan pengujian.
- Bahasa Indonesia untuk seluruh antarmuka pengguna.
- Zona waktu tampilan `Asia/Jakarta`.
- `timestamptz` dan UTC untuk penyimpanan waktu database.
- Rupiah Indonesia untuk mata uang.

Ketentuan teknologi:

- Jika repository baru, gunakan `npm` dan commit lockfile. Jika repository sudah memiliki package manager, pertahankan package manager tersebut.
- Gunakan versi Node.js LTS yang didukung oleh Next.js dan Vercel pada saat implementasi.
- Pin versi dependency melalui lockfile.
- Jangan menggunakan library deprecated, tidak terpelihara, atau memiliki masalah keamanan yang diketahui tanpa mitigasi dan dokumentasi.
- Dokumentasikan library utama dan alasan pemilihannya.
- Gunakan runtime Node.js untuk route yang membutuhkan pembuatan PDF, Excel, atau operasi buffer yang tidak kompatibel dengan Edge runtime.
- Optimalkan agar dapat digunakan pada Vercel Hobby dan Supabase Free.
- Jangan bergantung pada penyimpanan file lokal permanen, background worker berbayar, message queue berbayar, atau layanan berbayar lainnya.
- File impor dan hasil ekspor harus diproses dalam memori atau penyimpanan sementara dan tidak disimpan permanen.
- Hasilkan dan gunakan tipe database Supabase untuk mengurangi ketidaksesuaian antara TypeScript dan schema database.

## 4. Tahapan dan Dokumen SDLC

Buat dan pelihara dokumen berikut:

- `docs/00-rencana-eksekusi.md`
- `docs/01-perencanaan.md`
- `docs/02-srs.md`
- `docs/03-traceability-matrix.md`
- `docs/04-arsitektur.md`
- `docs/05-use-case.md`
- `docs/06-erd.md`
- `docs/07-alur-transaksi.md`
- `docs/08-rancangan-antarmuka.md`
- `docs/09-keamanan-dan-rls.md`
- `docs/10-test-plan.md`
- `docs/11-uat.md`
- `docs/12-pemeliharaan.md`
- `docs/13-kamus-data.md`
- `docs/14-release-checklist.md`
- `docs/progress.md`

### 4.1 Perencanaan

`docs/01-perencanaan.md` minimal memuat:

- Latar belakang.
- Tujuan sistem.
- Ruang lingkup.
- Pengguna sistem.
- Permasalahan yang diselesaikan.
- Asumsi dan batasan.
- Risiko bisnis dan teknis.
- Teknologi yang digunakan.
- Strategi implementasi bertahap.

### 4.2 Analisis Kebutuhan

`docs/02-srs.md` minimal memuat:

- Kebutuhan fungsional dengan kode `FR-01` dan seterusnya.
- Kebutuhan nonfungsional dengan kode `NFR-01` dan seterusnya.
- Aktor admin dan pegawai.
- Use case setiap aktor.
- Aturan bisnis.
- Validasi.
- Kriteria penerimaan yang dapat diuji.
- Batasan sistem.
- Kasus kegagalan dan respons sistem.

`docs/03-traceability-matrix.md` harus menghubungkan:

- ID kebutuhan.
- Fitur atau halaman.
- Tabel, view, atau fungsi database.
- File source code.
- Pengujian otomatis.
- Skenario UAT.
- Status implementasi dan verifikasi.

Matriks harus diperbarui setelah implementasi, bukan hanya dibuat pada awal proyek.

### 4.3 Perancangan

Gunakan Mermaid atau Markdown untuk:

- Diagram arsitektur.
- Use case admin dan pegawai.
- ERD database.
- Alur login.
- Alur pembuatan akun.
- Alur stok awal.
- Alur barang masuk.
- Alur scan barang keluar.
- Alur penyesuaian fisik.
- Alur koreksi dan pembalikan.
- Alur impor Excel.
- Alur ekspor laporan.
- Rancangan halaman desktop dan mobile.
- Strategi autentikasi, otorisasi, RLS, grants, view aman, dan fungsi database.

Dokumentasi bukan pengganti implementasi. Setelah dokumen awal tersedia, lanjutkan sampai aplikasi selesai tanpa menunggu persetujuan setiap tahap.

## 5. Keputusan Bisnis yang Wajib Diikuti

### 5.1 Lokasi dan Transaksi

- Sistem hanya menangani satu lokasi penyimpanan.
- Setiap transaksi hanya berisi satu jenis barang.
- Tidak ada keranjang.
- Tidak ada kolom tujuan, keperluan, divisi, proyek, atau penerima barang.
- Satu barcode mengidentifikasi satu jenis barang, bukan setiap unit fisik.
- Setiap barang hanya memiliki satu barcode aktif.

### 5.2 Kuantitas dan Satuan

- Semua kuantitas transaksi berupa bilangan bulat positif.
- Pecahan tidak diperbolehkan.
- Stok disimpan sebagai bilangan bulat dalam satuan dasar.
- Faktor konversi berupa bilangan bulat positif.
- Gunakan tipe database yang aman untuk jumlah besar, misalnya `BIGINT`.
- Setiap barang memiliki tepat satu satuan dasar dengan faktor `1`.
- Setiap barang dapat memiliki nol atau lebih satuan alternatif melalui `item_units`.
- Satuan pembelian adalah salah satu satuan alternatif atau satuan dasar.
- Faktor konversi selalu berarti jumlah satuan dasar dalam satu unit transaksi.

Contoh:

- Satuan dasar pulpen: `pcs`.
- Satuan pembelian: `kotak`.
- Faktor konversi: `12`.
- Input `5 kotak` menghasilkan `60 pcs`.

### 5.3 Harga

- Harga input pada barang masuk adalah harga per satuan transaksi yang dipilih, bukan harga total.
- UI wajib menampilkan label yang tidak ambigu, misalnya `Harga per kotak`.
- Total pembelian dihitung sebagai jumlah input dikali harga per satuan transaksi.
- Harga satuan dasar dihitung dari harga satuan transaksi dibagi faktor konversi.
- Simpan harga dan nilai menggunakan `NUMERIC` dengan presisi yang memadai, minimal enam angka desimal untuk perhitungan internal.
- Jangan melakukan pembulatan pada setiap langkah perhitungan.
- Lakukan pembulatan hanya untuk tampilan atau nilai akhir dokumen sesuai kebutuhan.
- Tampilkan rupiah menggunakan locale `id-ID`, umumnya tanpa angka desimal.

### 5.4 Status Stok

Gunakan aturan yang tidak tumpang tindih:

- `HABIS`: stok sama dengan `0`.
- `HAMPIR_HABIS`: stok lebih besar dari `0` dan lebih kecil atau sama dengan batas minimum.
- `AMAN`: stok lebih besar dari batas minimum.
- `NONAKTIF`: status master data terpisah dari status jumlah stok.

Barang tidak boleh dinonaktifkan selama stok belum nol. Barang nonaktif tetap tampil pada laporan historis admin, tetapi tidak tampil pada pencarian pegawai dan tidak dapat digunakan untuk transaksi baru.

### 5.5 Penghapusan Data

- Jangan hapus transaksi stok.
- Jangan edit transaksi stok yang telah disimpan.
- Jangan hapus pengguna yang telah memiliki aktivitas.
- Jangan hapus barang, kategori, atau satuan yang sudah direferensikan.
- Gunakan status aktif/nonaktif untuk master data.
- Audit log bersifat append-only.

## 6. Peran dan Hak Akses

### 6.1 Admin

Admin dapat:

- Melihat dashboard admin lengkap.
- Melihat harga dan nilai persediaan.
- Mengelola kategori dan satuan.
- Menambah, mengubah, dan menonaktifkan barang sesuai aturan stok.
- Mencatat stok awal.
- Mencatat barang masuk.
- Melakukan penyesuaian stok.
- Melakukan koreksi melalui pembalikan.
- Melihat seluruh riwayat transaksi.
- Membuat, menonaktifkan, dan mengatur ulang kata sandi akun pegawai.
- Mencetak barcode.
- Mengimpor data Excel.
- Mengekspor laporan Excel dan PDF.
- Melihat audit log.
- Mengelola pengaturan aplikasi yang telah didefinisikan.
- Mengganti kata sandi sendiri.

Admin pada antarmuka hanya boleh membuat akun dengan peran `EMPLOYEE`. Admin tambahan dibuat melalui script server-side yang aman. Admin terakhir tidak boleh dinonaktifkan.

### 6.2 Pegawai

Pegawai dapat:

- Login menggunakan username dan kata sandi.
- Memindai barcode barang yang diambil.
- Mencari barang berdasarkan nama, SKU, atau barcode.
- Memilih satuan yang tersedia.
- Memasukkan jumlah pengambilan.
- Melihat stok tanpa informasi harga.
- Melihat riwayat pengambilan sendiri.
- Mengganti kata sandi sendiri.

Pegawai tidak dapat:

- Mendaftar akun sendiri.
- Membuat akun lain.
- Menambah atau mengubah master data.
- Melihat harga, nilai persediaan, atau data biaya melalui UI, API, view, RPC, query Supabase, source client, cache, ekspor, atau manipulasi request.
- Mengubah, menghapus, menyesuaikan, atau membalik transaksi.
- Melihat transaksi pegawai lain.
- Mengirim atau menentukan `user_id` pelaku transaksi.
- Mengakses route, halaman, API, atau fungsi admin.

Hak akses wajib diperiksa pada database dan backend. Menyembunyikan menu tidak dianggap sebagai pengamanan.

## 7. Autentikasi dan Pengelolaan Akun

Gunakan Supabase Auth secara aman.

### 7.1 Username

- Pengguna melihat dan memasukkan username, bukan email.
- Username dinormalisasi menjadi huruf kecil.
- Username unik tanpa membedakan kapitalisasi.
- Username hanya boleh mengandung huruf kecil, angka, titik, garis bawah, atau tanda hubung.
- Panjang username antara 3 dan 32 karakter.
- Simpan `username_normalized` untuk pencarian dan constraint unik.
- Jangan mengubah kapitalisasi password.

Jika Supabase Auth memerlukan email internal:

- Buat pemetaan username ke email internal pada server.
- Simpan pemetaan pada tabel private yang tidak diekspos ke Supabase Data API, misalnya `private.auth_login_identifiers`.
- Email internal tidak boleh ditampilkan, dikirim ke browser, masuk log, atau muncul pada pesan kesalahan.
- Endpoint login server menerima username dan password, melakukan lookup terbatas, lalu melakukan login Supabase.
- Jangan menyimpan password pada tabel aplikasi.

### 7.2 Kebijakan Akun

- Akun hanya dibuat oleh admin atau script bootstrap admin.
- Nonaktifkan self-signup pada konfigurasi Supabase Auth; tidak cukup hanya menghilangkan tombol daftar.
- Akun yang dibuat melalui Admin API harus berstatus terkonfirmasi tanpa mengirim email ke alamat internal.
- Password minimal 10 karakter.
- Pesan login gagal harus generik dan tidak membocorkan apakah username terdaftar, akun nonaktif, atau password salah.
- Terapkan rate limiting menggunakan mekanisme provider atau penyimpanan bersama yang sesuai; jangan menggunakan rate limiter in-memory yang tidak konsisten pada serverless.
- Admin reset password menggunakan password sementara dan mengaktifkan `must_change_password`.
- Pengguna dengan `must_change_password` hanya dapat mengakses halaman ganti password dan logout sampai password diganti.
- Password sementara tidak pernah ditulis dalam audit log.
- Tidak ada fitur lupa password melalui email. Pemulihan dilakukan admin.
- Penonaktifan akun harus menghalangi seluruh akses meskipun token atau sesi lama belum kedaluwarsa.
- Setiap RLS helper, RPC, dan pemeriksaan backend wajib memverifikasi `profiles.is_active`.

### 7.3 Session dan Secret

- Gunakan mekanisme session/cookie server-side Supabase yang direkomendasikan untuk Next.js App Router pada saat implementasi.
- Jangan mengandalkan local storage sebagai satu-satunya sumber session.
- Jangan mengirim service-role key ke browser.
- Jangan memberi awalan `NEXT_PUBLIC_` pada service-role key.
- Service-role key hanya digunakan pada kode server untuk login identifier, bootstrap, pembuatan akun, penonaktifan, reset password, atau operasi admin lain yang memang memerlukannya.
- Setiap route yang memakai service-role harus terlebih dahulu memvalidasi session, status aktif, dan role admin menggunakan konteks pengguna biasa.
- Jangan menggunakan service-role sebagai jalan pintas untuk seluruh operasi aplikasi.
- Mutation berbasis cookie harus memiliki perlindungan CSRF/same-origin yang sesuai.
- Logout harus membersihkan session dan data sensitif di memori/cache aplikasi.

## 8. Data Barang

Setiap barang minimal memiliki:

- ID UUID.
- SKU.
- Barcode.
- Format barcode.
- Nama barang.
- Kategori.
- Satuan dasar.
- Satuan pembelian default.
- Faktor konversi satuan pembelian.
- Stok saat ini dalam satuan dasar.
- Batas minimum.
- Keterangan.
- Status aktif/nonaktif.
- `created_at`.
- `updated_at`.

Harga tidak disimpan pada tabel barang yang dapat dibaca pegawai.

### 8.1 SKU

Gunakan format:

- `ATK-0001`
- `ATK-0002`
- `ATK-0003`

Ketentuan:

- Gunakan PostgreSQL sequence atau mekanisme concurrency-safe.
- Jangan menggunakan `MAX(sku) + 1`.
- SKU harus unik.
- SKU tidak boleh digunakan ulang meskipun barang dinonaktifkan.
- Impor boleh menyediakan SKU opsional dengan format `ATK-` diikuti minimal empat digit.
- Generator harus mampu melewati SKU yang sudah ada dan tetap aman jika terjadi transaksi bersamaan.

### 8.2 Barcode

- Simpan barcode sebagai `TEXT`, bukan angka.
- Pertahankan nol di depan.
- Hapus whitespace pada awal dan akhir, tetapi jangan mengubah kapitalisasi isi barcode.
- Barcode unik dan tidak boleh digunakan ulang oleh barang lain.
- Batasi panjang barcode, misalnya maksimum 256 karakter.
- Dukung EAN-13, EAN-8, UPC-A/UPC-E jika library mendukung, Code 128, dan QR Code.
- Validasi checksum untuk EAN/UPC jika format diketahui.
- QR diperlakukan sebagai teks persis dan tidak boleh otomatis membuka URL.
- Barang dengan barcode pabrikan menggunakan barcode tersebut.
- Barang tanpa barcode menggunakan SKU sebagai nilai barcode dan `CODE128` sebagai format.
- Jika admin mengetik barcode manual, admin harus memilih format atau sistem menggunakan format aman yang dapat divalidasi.
- Pegawai tidak boleh mendaftarkan barcode atau barang baru.

## 9. Model Persediaan dan Ledger

Gunakan immutable stock ledger sebagai riwayat utama dan simpan `current_stock` sebagai nilai terdenormalisasi yang hanya boleh diperbarui oleh fungsi transaksi atomik.

Jenis transaksi stok:

- `INITIAL`
- `IN`
- `OUT`
- `ADJUSTMENT_IN`
- `ADJUSTMENT_OUT`
- `REVERSAL`

Setiap transaksi minimal mencatat:

- ID UUID.
- Nomor transaksi yang dibuat menggunakan sequence concurrency-safe.
- `client_request_id` UUID unik untuk idempotency.
- Barang.
- Jenis transaksi.
- Jumlah input positif.
- Satuan transaksi.
- Faktor konversi snapshot.
- Jumlah satuan dasar positif.
- `quantity_delta` bertanda positif atau negatif.
- Pengguna/pelaku dari session autentikasi.
- Waktu `timestamptz`.
- Stok sebelum.
- Stok sesudah.
- Alasan jika diwajibkan.
- Referensi transaksi asli jika pembalikan.
- Metadata aman yang diperlukan.

Aturan tanda:

- `INITIAL`, `IN`, dan `ADJUSTMENT_IN` memiliki delta positif.
- `OUT` dan `ADJUSTMENT_OUT` memiliki delta negatif.
- `REVERSAL` memiliki delta kebalikan dari transaksi asli.

Invariant database yang wajib dipertahankan:

- Jumlah input lebih besar dari nol.
- Faktor konversi lebih besar dari nol.
- Jumlah satuan dasar sama dengan jumlah input dikali faktor konversi snapshot.
- `stock_after = stock_before + quantity_delta`.
- Stok sebelum dan sesudah tidak boleh negatif.
- Pelaku transaksi selalu berasal dari `auth.uid()` atau session tervalidasi.
- `client_request_id` yang sama tidak boleh menghasilkan transaksi kedua.
- Transaksi tidak dapat diedit atau dihapus.

Gunakan PostgreSQL transaction atau RPC atomik dengan row locking pada barang dan data biaya. Dua pegawai yang mengambil barang sama secara bersamaan tidak boleh menyebabkan lost update atau stok negatif.

Cabut izin client untuk melakukan `INSERT`, `UPDATE`, atau `DELETE` langsung pada stok, transaction ledger, dan tabel biaya. Semua perubahan harus melalui RPC atau server operation yang tervalidasi.

## 10. Idempotency dan Pencegahan Duplikasi

- Client membuat `client_request_id` UUID untuk setiap upaya transaksi.
- Tombol konfirmasi langsung dinonaktifkan setelah ditekan.
- Request ulang akibat double-click, retry jaringan, atau refresh harus menggunakan ID yang sama.
- RPC menyimpan constraint unik dan mengembalikan hasil transaksi pertama jika ID yang sama diterima kembali oleh pengguna yang sama dengan payload yang sama.
- Jika ID sama dipakai dengan payload berbeda, tolak sebagai konflik.
- Pencegahan pemindaian barcode ganda tidak menggantikan idempotency transaksi.
- Tambahkan integration test untuk request identik dan transaksi bersamaan.

## 11. Harga Rata-Rata Bergerak

Gunakan metode moving weighted average berdasarkan satuan dasar.

Pisahkan data stok dan data biaya:

- `stock_transactions` tidak memiliki kolom harga yang dapat dibaca pegawai.
- Harga barang saat ini disimpan pada tabel biaya private, misalnya `private.item_costs`.
- Snapshot biaya transaksi disimpan pada tabel private, misalnya `private.stock_transaction_costs`.
- Pegawai tidak memiliki grant, policy, view, endpoint, atau RPC yang dapat mengembalikan data biaya.

Data biaya transaksi minimal mencatat:

- Harga per satuan transaksi yang diinput.
- Harga per satuan dasar.
- Harga rata-rata sebelum.
- Harga rata-rata sesudah.
- Nilai persediaan sebelum.
- Perubahan nilai persediaan.
- Nilai persediaan sesudah.
- Nilai transaksi.

### 11.1 Stok Awal

- Satu barang hanya boleh memiliki satu transaksi `INITIAL`.
- Jika stok awal nol, tidak perlu membuat transaksi `INITIAL`.
- Stok awal positif wajib memiliki harga per satuan yang dipilih.
- Nilai awal sama dengan jumlah satuan dasar dikali harga satuan dasar.
- Harga rata-rata awal sama dengan harga satuan dasar.

### 11.2 Barang Masuk

Untuk `IN`:

```text
base_quantity = input_quantity × conversion_factor
base_unit_cost = transaction_unit_price ÷ conversion_factor
purchase_value = input_quantity × transaction_unit_price
new_inventory_value = old_inventory_value + purchase_value
new_average_cost = new_inventory_value ÷ new_stock
```

Stok, nilai persediaan, dan harga rata-rata harus diperbarui dalam satu transaksi database.

### 11.3 Barang Keluar

Untuk `OUT`:

- Pegawai tidak mengisi atau mengirim harga.
- Gunakan harga rata-rata saat transaksi sebagai cost snapshot.
- Nilai keluar sama dengan jumlah satuan dasar dikali harga rata-rata saat transaksi.
- Harga rata-rata tidak berubah selama stok masih lebih besar dari nol.
- Jika seluruh stok keluar, nilai persediaan sesudah harus tepat nol agar tidak meninggalkan residu pembulatan.
- Nilai barang keluar hanya terlihat admin dan bukan tagihan kepada pegawai.

### 11.4 Penyesuaian

- `ADJUSTMENT_OUT` menggunakan harga rata-rata saat transaksi.
- `ADJUSTMENT_IN` menggunakan harga rata-rata saat ini jika harga tersebut tersedia.
- Jika stok dan riwayat harga belum memiliki harga rata-rata yang valid, admin wajib memasukkan harga untuk `ADJUSTMENT_IN`.
- UI hanya menampilkan input harga tambahan ketika memang diperlukan.
- Alasan penyesuaian wajib diisi.

### 11.5 Pembalikan dan Nilai Persediaan

- Pembalikan menggunakan kebalikan quantity delta dan inventory value delta dari transaksi asli.
- Pembalikan `OUT` mengembalikan nilai berdasarkan cost snapshot transaksi asli.
- Pembalikan `IN` mengurangi nilai yang ditambahkan transaksi asli.
- Setelah pembalikan, hitung harga rata-rata baru dari nilai persediaan sesudah dibagi stok sesudah jika stok lebih besar dari nol.
- Jika stok sesudah nol, nilai persediaan sesudah harus nol.
- Tolak pembalikan jika menyebabkan stok negatif, nilai persediaan negatif, pembagian tidak valid, atau invariant lain gagal.
- Jangan mengubah transaksi lama untuk memaksa pembalikan berhasil.
- Jika transaksi barang masuk lama tidak dapat dibalik secara aman setelah terjadi pergerakan stok berikutnya, tampilkan penjelasan yang jujur dan arahkan admin menggunakan penyesuaian sesuai kondisi fisik. Jangan merekonstruksi nilai historis secara diam-diam.
- Sistem ini tidak melakukan restatement akuntansi historis terhadap seluruh transaksi sesudahnya.

## 12. Koreksi Transaksi

- Koreksi hanya dapat dilakukan admin.
- Transaksi tersimpan tidak boleh diedit atau dihapus.
- Koreksi dibuat sebagai transaksi `REVERSAL`.
- Alasan koreksi wajib diisi dan memiliki batas panjang yang wajar.
- Simpan hubungan ke transaksi asli.
- Satu transaksi asli hanya boleh dibalik satu kali.
- Transaksi `REVERSAL` tidak boleh dibalik kembali.
- Cegah dua admin membalik transaksi yang sama secara bersamaan menggunakan constraint dan locking.
- Simpan stok sebelum dan sesudah.
- Simpan cost snapshot pembalikan pada tabel biaya private.
- Riwayat dan laporan harus menunjukkan bahwa transaksi asli telah dibalik serta menampilkan transaksi pembaliknya.
- Status pembalikan transaksi asli diturunkan dari keberadaan transaksi pembalik, bukan dengan menghapus riwayat.

## 13. Penyesuaian Stok Fisik

Alur admin:

1. Pilih barang aktif.
2. Lihat stok sistem dan satuan dasar.
3. Masukkan stok fisik sebagai bilangan bulat nol atau lebih.
4. Masukkan alasan wajib.
5. Sistem menampilkan selisih.
6. Admin mengonfirmasi.
7. Server mengunci baris barang dan membaca ulang stok terbaru.
8. Server menghitung ulang selisih; jangan mempercayai selisih dari client.
9. Jika stok fisik lebih besar, buat `ADJUSTMENT_IN`.
10. Jika lebih kecil, buat `ADJUSTMENT_OUT`.
11. Jika tidak ada selisih, jangan membuat transaksi kosong dan tampilkan informasi yang jelas.

Stok tidak boleh diubah tanpa ledger dan audit trail.

## 14. Struktur Database Minimum

Buat migration SQL berversi di `supabase/migrations`.

Schema public/safe minimal:

- `profiles`
- `categories`
- `units`
- `items`
- `item_units`
- `stock_transactions`
- `audit_logs`
- `app_settings`
- `import_batches` jika diperlukan untuk audit hasil impor

Schema private/non-exposed minimal:

- `private.auth_login_identifiers`
- `private.item_costs`
- `private.stock_transaction_costs`

Tambahkan view aman jika diperlukan, misalnya:

- View daftar barang pegawai tanpa harga.
- View riwayat transaksi pegawai tanpa harga.
- View status transaksi dan pembalikan.

Ketentuan database:

- UUID sebagai primary key untuk entitas utama.
- Foreign key dengan perilaku `RESTRICT` atau kebijakan aman yang menjaga histori.
- Unique constraint.
- Check constraint.
- Indeks pencarian dan foreign key yang relevan.
- Trigger `updated_at` hanya untuk tabel yang memang dapat diperbarui.
- Transaction ledger dan audit log tidak memiliki jalur update/delete.
- Sequence SKU.
- Sequence nomor transaksi.
- Fungsi transaksi stok atomik.
- Fungsi harga rata-rata.
- Fungsi pembalikan.
- Helper role/status yang tidak menimbulkan recursive RLS.
- RLS policy pada seluruh tabel exposed yang relevan.
- Grants eksplisit selain RLS.
- Pembatasan akses data harga.

Gunakan `SECURITY DEFINER` hanya jika diperlukan. Untuk setiap fungsi tersebut:

- Tetapkan `search_path` secara aman, idealnya kosong dan gunakan nama schema lengkap.
- Validasi `auth.uid()`.
- Validasi profil aktif.
- Validasi role di dalam fungsi.
- Validasi seluruh input.
- Batasi owner dan grant execute.
- Cabut execute dari `PUBLIC` dan `anon` jika tidak diperlukan.
- Jangan menerima `user_id`, role, stok sebelum, stok sesudah, harga rata-rata, atau nilai persediaan sebagai sumber kebenaran dari client.

View yang membaca tabel ber-RLS harus menggunakan perilaku security-invoker yang aman. Jangan membuat view yang tanpa sengaja melewati RLS.

## 15. Audit Log

Audit minimal mencatat:

- Pelaku.
- Waktu.
- Jenis tindakan.
- Jenis entitas.
- ID entitas.
- Ringkasan perubahan sebelum dan sesudah yang aman.
- Alasan jika relevan.
- Metadata request yang aman jika tersedia.

Audit tindakan berikut:

- Pembuatan, penonaktifan, dan aktivasi akun.
- Reset password sebagai event tanpa nilai password.
- Perubahan barang, kategori, dan satuan.
- Stok awal.
- Barang masuk dan keluar.
- Penyesuaian.
- Pembalikan.
- Impor Excel.
- Perubahan pengaturan.

Ketentuan:

- Audit log append-only.
- Client tidak dapat menulis audit event seolah-olah berasal dari pengguna lain.
- Jangan simpan password, token, cookie, service-role key, internal email, atau data rahasia lain.
- Audit log hanya dapat dibaca admin.
- Data biaya di audit hanya boleh terlihat admin.

## 16. Fitur Pemindaian Barang Keluar

Alur utama pegawai:

1. Login.
2. Buka menu `Scan Barang`.
3. Sistem memeriksa koneksi internet.
4. Sistem meminta izin kamera ketika fitur dimulai, bukan saat halaman awal dimuat.
5. Gunakan kamera belakang sebagai pilihan awal pada HP jika tersedia.
6. Sediakan pemilih kamera depan/belakang atau perangkat kamera yang tersedia.
7. Baca EAN-13, EAN-8, UPC, Code 128, dan QR Code sesuai dukungan library.
8. Setelah barcode terbaca, hentikan atau jeda kamera.
9. Berikan bunyi dan getaran jika browser/perangkat mendukung dan izin memungkinkan.
10. Terapkan debounce agar barcode yang sama tidak terbaca berulang.
11. Cari barcode secara persis.
12. Jika ditemukan, tampilkan nama, SKU, satuan dasar, dan stok tersedia tanpa harga.
13. Jumlah awal otomatis `1`.
14. Sediakan tombol tambah, kurang, dan input angka.
15. Sediakan pemilihan satuan dari `item_units` aktif.
16. Tampilkan hasil konversi ke satuan dasar dan perkiraan sisa stok.
17. Tampilkan konfirmasi nama barang, jumlah, satuan, hasil konversi, dan sisa stok.
18. Setelah dikonfirmasi, kirim `client_request_id` dan data input yang diperlukan.
19. Server mengambil identitas pengguna dari session dan mengurangi stok secara atomik.
20. Tampilkan notifikasi sukses, nomor transaksi, dan sisa stok.
21. Pengguna dapat memulai transaksi baru untuk barang berikutnya.

Alternatif wajib:

- Input barcode manual.
- Pencarian nama barang.
- Pencarian SKU.

Validasi:

- Barcode cukup dipindai sekali meskipun mengambil beberapa unit.
- Jumlah tidak boleh nol, negatif, pecahan, atau melebihi stok setelah konversi.
- Satuan yang dipilih harus terdaftar dan aktif untuk barang tersebut.
- Barang nonaktif tidak dapat ditransaksikan.
- Barcode tidak dikenal menghasilkan pesan yang jelas dan tidak membuka form pendaftaran.
- Kamera harus dihentikan ketika modal ditutup, transaksi selesai, tab disembunyikan jika perlu, atau pengguna meninggalkan halaman.
- Jika izin kamera ditolak atau kamera tidak tersedia, fallback manual tetap dapat digunakan.
- Kamera hanya bekerja pada secure context; dokumentasikan kebutuhan HTTPS untuk pengujian perangkat.

## 17. Dashboard Pegawai

Dashboard pegawai menampilkan:

- Sapaan dan nama pengguna.
- Tombol besar `Scan Barang`.
- Menu `Cek Stok`.
- `Riwayat Pengambilan Saya`.
- `Akun`.
- `Ganti Kata Sandi`.
- Status koneksi jika offline.

Menu `Cek Stok` memiliki:

- Pencarian nama, SKU, dan barcode.
- Filter kategori.
- Filter `Aman`, `Hampir Habis`, dan `Habis`.
- Tombol reset filter.
- Pagination jika diperlukan.

Jangan menampilkan harga atau nilai persediaan dalam bentuk apa pun.

Pada HP gunakan navigasi bawah sederhana dengan jumlah menu utama yang wajar. Menu tambahan dapat berada di halaman akun atau menu lain yang tidak memenuhi layar.

## 18. Dashboard Admin

Dashboard admin menampilkan metrik yang bermakna:

- Total jenis barang aktif.
- Jumlah jenis barang yang masih tersedia.
- Nilai persediaan.
- Jumlah jenis hampir habis.
- Jumlah jenis habis.
- Jumlah transaksi masuk bulan berjalan.
- Jumlah transaksi keluar bulan berjalan.
- Grafik jumlah transaksi masuk dan keluar per hari.
- Transaksi terbaru.

Jangan menjumlahkan kuantitas barang dengan satuan dasar berbeda menjadi satu angka total karena hasilnya tidak bermakna.

Sediakan tabel ringkas persediaan dengan:

- Pencarian nama, SKU, atau barcode.
- Filter kategori.
- Filter status stok.
- Filter status aktif.
- Pengurutan nama atau stok.
- Tombol reset filter.
- Pagination.

Pada desktop gunakan sidebar. Pada HP gunakan drawer atau navigasi responsif yang tidak memenuhi layar.

## 19. Menu Admin

Implementasikan seluruh menu berikut secara nyata:

- Dashboard.
- Data Barang.
- Kategori dan Satuan.
- Barang Masuk.
- Riwayat Barang Keluar.
- Penyesuaian Stok.
- Koreksi Transaksi.
- Cetak Barcode.
- Impor Excel.
- Laporan.
- Pengguna.
- Audit Log.
- Pengaturan.

Jangan meninggalkan menu yang menuju halaman kosong atau placeholder.

## 20. Master Data

### 20.1 Kategori

- Nama wajib, unik tanpa membedakan kapitalisasi, dan telah di-trim.
- Dapat diaktifkan/nonaktifkan.
- Kategori yang sudah digunakan tidak boleh dihapus.
- Kategori nonaktif tidak dapat dipilih untuk barang baru, tetapi tetap tampil pada histori admin.

### 20.2 Satuan

- Nama dan simbol wajib.
- Nama/simbol unik sesuai aturan yang terdokumentasi.
- Dapat diaktifkan/nonaktifkan.
- Satuan yang sudah digunakan tidak boleh dihapus.
- Satuan nonaktif tidak dapat digunakan pada konfigurasi atau transaksi baru.

### 20.3 Barang

Admin dapat:

- Menambah barang.
- Mengubah data deskriptif dan batas minimum.
- Mengatur satuan dasar saat barang baru dibuat.
- Menambahkan atau menonaktifkan satuan alternatif.
- Memindai atau mengetik barcode.
- Menonaktifkan barang jika stok nol.

Jangan mengizinkan perubahan satuan dasar setelah barang memiliki transaksi. Faktor satuan yang tersimpan pada transaksi lama harus tetap berupa snapshot dan tidak berubah ketika konfigurasi satuan barang diperbarui.

## 21. Barang Masuk

Admin dapat:

- Memindai barcode atau mencari barang.
- Memasukkan jumlah bilangan bulat positif.
- Memilih satuan aktif.
- Memasukkan harga per satuan yang dipilih.
- Melihat jumlah hasil konversi.
- Melihat total harga pembelian.
- Melihat simulasi harga rata-rata baru.
- Mengonfirmasi transaksi.

Simulasi client hanya untuk tampilan. Server/database menghitung ulang seluruh nilai dengan data terkini dan menjadi sumber kebenaran.

Setelah disimpan, stok, nilai persediaan, dan harga rata-rata diperbarui secara atomik dan idempotent.

## 22. Cetak Barcode

Admin dapat:

- Memilih satu atau beberapa barang.
- Menentukan jumlah label per barang.
- Melihat preview ringkas.
- Menghasilkan PDF A4.
- Mencetak menggunakan printer biasa.

Label memuat:

- Nama barang.
- SKU.
- Gambar barcode sesuai format.
- Nilai barcode dalam teks.

Ketentuan:

- Barang tanpa barcode pabrikan menggunakan Code 128 berdasarkan SKU.
- Validasi jumlah label dan beri batas wajar, misalnya maksimum 500 label per dokumen.
- PDF harus memiliki margin, jarak label, dan pemisah yang konsisten.
- Barcode harus cukup besar dan memiliki quiet zone agar dapat dipindai.
- Jangan memotong nama/SKU tanpa indikator yang jelas.
- Buat pengujian struktur PDF dan pengujian render/visual yang memungkinkan.

## 23. Impor Excel

Sediakan template `.xlsx` dengan kolom:

- `SKU` — opsional.
- `Barcode` — opsional; jika kosong gunakan SKU dan Code 128.
- `Nama Barang`.
- `Kategori`.
- `Satuan Dasar`.
- `Satuan Pembelian`.
- `Faktor Konversi`.
- `Stok Awal`.
- `Batas Minimum`.
- `Harga per Satuan Pembelian`.
- `Keterangan`.

Aturan impor:

- Versi pertama bersifat create-only dan tidak memperbarui barang yang sudah ada.
- Hanya menerima `.xlsx`, bukan file bermacro.
- Batas default maksimal 5 MB dan 2.000 baris data.
- Barcode diperlakukan sebagai teks dan kolom template diformat sebagai teks.
- Tolak formula, macro, atau konten yang tidak aman.
- Validasi tipe, panjang teks, bilangan bulat, harga, faktor konversi, dan field wajib.
- Deteksi SKU/barcode duplikat terhadap database dan antarbaris file.
- Cocokkan kategori dan satuan tanpa membedakan kapitalisasi.
- Kategori atau satuan baru boleh dibuat hanya setelah ditandai jelas pada preview dan admin mengonfirmasi.
- Harga wajib jika stok awal lebih besar dari nol.
- Tampilkan preview seluruh status baris sebelum impor.
- Jangan mengimpor baris tidak valid secara diam-diam.
- Setiap baris merupakan unit transaksi database tersendiri: pembuatan barang dan stok awal pada baris tersebut harus berhasil atau gagal bersama-sama.
- Baris valid boleh berhasil sementara baris tidak valid gagal.
- Tampilkan jumlah berhasil/gagal dan alasan per baris.
- Buat transaksi `INITIAL` untuk stok awal positif.
- Jangan membuat `INITIAL` untuk stok nol.
- Pada saat konfirmasi, upload dan parse ulang file yang sama di server atau gunakan mekanisme integritas yang aman. Jangan mempercayai data preview dari browser.
- Jangan menyimpan file permanen.
- Simpan ringkasan batch dan hasil audit tanpa menyimpan isi sensitif file secara berlebihan.

## 24. Laporan

Buat laporan admin:

- Stok saat ini.
- Barang masuk.
- Barang keluar.
- Kartu stok per barang.
- Penyesuaian.
- Koreksi transaksi.
- Barang hampir habis.
- Barang habis.
- Nilai persediaan.

Filter:

- Bulan dan tahun.
- Rentang tanggal.
- Kategori.
- Barang.
- Jenis transaksi.
- Status transaksi jika relevan.

Aturan tanggal:

- Seluruh label dan input tanggal menggunakan Asia/Jakarta.
- Konversikan batas periode ke UTC sebelum query database.
- Gunakan batas setengah terbuka: waktu `>= awal` dan `< akhir berikutnya`.
- Jika pengguna memilih rentang tanggal, rentang tersebut mengalahkan filter bulan/tahun dan UI harus menjelaskannya.

Ekspor:

- Excel `.xlsx` valid.
- PDF valid dan siap cetak.
- Nama file jelas dan memuat jenis laporan serta periode.
- Header laporan memuat nama aplikasi, nama instansi jika diatur, jenis laporan, periode, dan waktu pembuatan.
- Sanitasi nilai yang berpotensi menjadi formula spreadsheet.
- Jangan menyimpan hasil ekspor permanen.
- Batasi ekspor sinkron, misalnya maksimum 10.000 baris. Jika melebihi batas, minta admin mempersempit filter.
- Tampilkan error yang jelas jika pembuatan file gagal.

Laporan detail boleh menampilkan nama pegawai pada baris transaksi, tetapi jangan membuat dashboard atau laporan rekapitulasi khusus penggunaan per pegawai.

## 25. Pengguna

Admin dapat:

- Melihat daftar pegawai.
- Mencari berdasarkan nama atau username.
- Membuat pegawai.
- Mengaktifkan/nonaktifkan pegawai.
- Mengatur ulang password dengan password sementara.
- Melihat status `must_change_password`.
- Melihat waktu pembuatan dan aktivitas terakhir yang aman jika tersedia.

Ketentuan:

- UI tidak dapat membuat atau mempromosikan admin.
- Username tidak dapat diubah setelah akun memiliki transaksi, kecuali ada proses khusus yang menjaga mapping dan audit secara atomik.
- Nonaktifkan seluruh akses pengguna nonaktif pada database dan backend.
- Riwayat pengguna tetap dipertahankan.

## 26. Pengaturan

Menu Pengaturan harus berfungsi dan hanya mengelola field yang jelas:

- Nama instansi.
- Teks header laporan opsional.
- Jumlah label barcode default.
- Preferensi layout label yang telah divalidasi dalam batas aman.

Ketentuan:

- Nama aplikasi tetap `InventarisBarang` dan tidak dapat diubah melalui pengaturan.
- Zona waktu tetap Asia/Jakarta.
- Mata uang tetap IDR.
- Jangan menyediakan upload logo atau file jika tidak ada penyimpanan objek yang disetujui.
- Pengaturan hanya dapat dibaca/diubah admin, kecuali subset aman yang memang diperlukan untuk menampilkan nama instansi.
- Perubahan pengaturan masuk audit log.

## 27. Peringatan Stok

- Kuning untuk `HAMPIR_HABIS`.
- Merah untuk `HABIS`.
- Hijau untuk `AMAN`.
- Gunakan teks/ikon selain warna agar status aksesibel.
- Peringatan hanya muncul di website.
- Jangan membuat notifikasi WhatsApp, SMS, push, atau email.

## 28. Desain Antarmuka

Gunakan desain:

- Sederhana.
- Bersih.
- Profesional.
- Responsif.
- Mudah dipahami pengguna nonteknis.
- Latar putih atau abu-abu sangat muda.
- Biru sebagai warna utama.
- Teks abu-abu gelap.
- Kuning untuk peringatan.
- Merah untuk kesalahan atau stok habis.
- Hijau untuk keberhasilan.
- Tanpa gradasi dan ornamen berlebihan.
- Tombol cukup besar untuk layar sentuh.
- Form singkat dengan label jelas.
- Dialog konfirmasi untuk transaksi penting.
- Focus state, keyboard navigation, semantic HTML, dan kontras yang aksesibel.

Sediakan state:

- Loading.
- Skeleton jika sesuai.
- Empty state.
- Error state.
- Offline.
- Izin kamera ditolak.
- Kamera tidak ditemukan.
- Barcode tidak terdaftar.
- Barang nonaktif.
- Stok tidak mencukupi.
- Konflik transaksi atau request duplikat.
- Transaksi berhasil.
- Session berakhir.

Gunakan format:

- Tanggal/waktu dengan `Intl.DateTimeFormat` locale Indonesia dan zona Asia/Jakarta.
- Mata uang dengan `Intl.NumberFormat` locale Indonesia dan IDR.
- Pesan validasi dalam bahasa Indonesia.

## 29. PWA dan Offline

- Buat web app manifest.
- Buat ikon sederhana bertema kotak atau barcode dalam ukuran yang diperlukan.
- Buat service worker dengan strategi cache yang aman.
- Aplikasi dapat dipasang ke layar utama.
- Cache hanya application shell dan aset statis aman seperti CSS, JavaScript bundle, font lokal, dan ikon.
- Jangan cache respons Supabase, API, data autentikasi, profil, stok, transaksi, harga, laporan, atau halaman HTML berisi data pengguna.
- Mutation dan endpoint data menggunakan network-only dan `Cache-Control: no-store` jika relevan.
- Jangan menyimpan atau mengantre transaksi saat offline.
- Jangan menerapkan background sync untuk transaksi persediaan.
- Saat offline, nonaktifkan seluruh tombol transaksi dan tampilkan pemberitahuan jelas.
- Jangan menampilkan snapshot stok lama seolah-olah masih terbaru.
- Setelah kembali online, pengguna harus memuat data terbaru sebelum bertransaksi.
- Tangani pembaruan service worker tanpa merusak transaksi yang sedang berlangsung.

## 30. Keamanan

Wajib menerapkan defense in depth:

- RLS pada seluruh tabel exposed yang relevan.
- Grants tabel, view, sequence, dan function secara eksplisit.
- Pegawai hanya membaca data barang aman dan transaksi sendiri.
- Admin memperoleh akses sesuai peran.
- Harga tidak bocor kepada pegawai.
- Tabel biaya ditempatkan pada schema private/non-exposed jika memungkinkan.
- Gunakan DTO/view berbeda untuk admin dan pegawai.
- Validasi input pada client untuk UX, server untuk trust boundary, dan database untuk invariant.
- Jangan mempercayai nilai harga, stok, role, user ID, status aktif, atau hasil konversi dari client.
- Lindungi route admin dengan middleware untuk UX dan pemeriksaan server/database sebagai otorisasi sebenarnya.
- Lindungi dari SQL injection, XSS, CSRF, privilege escalation, IDOR, mass assignment, open redirect, dan spreadsheet formula injection.
- Jangan menaruh secret di repository.
- Buat `.env.example` tanpa nilai rahasia.
- Jangan log password, token, cookie, internal email, atau payload sensitif.
- Pesan login tidak membocorkan keberadaan akun.
- Semua respons sensitif menggunakan kebijakan cache yang aman.
- Pastikan error database mentah tidak ditampilkan ke pengguna.
- Jangan mengekspor service-role key ke client bundle.

Buat pengujian keamanan yang secara langsung mencoba:

- Pegawai membaca tabel/view harga.
- Pegawai membaca transaksi pengguna lain.
- Pegawai memanggil RPC admin.
- Pegawai mengirim `user_id` orang lain.
- Pengguna nonaktif dengan session lama mengakses aplikasi.
- Client mengubah stok atau transaksi secara langsung.
- Request pembalikan ganda.
- Request transaksi dengan payload dan idempotency key yang dimanipulasi.

## 31. Pengujian

Gunakan perangkat pengujian yang sesuai, misalnya:

- Vitest.
- Testing Library.
- Playwright.
- Supabase lokal atau project khusus test untuk integration test.

### 31.1 Unit Test

Uji minimal:

- Normalisasi username.
- Validasi username dan password.
- Format SKU.
- Validasi barcode dan checksum jika diterapkan.
- Konversi satuan.
- Format dan status stok.
- Perhitungan harga satuan dasar.
- Moving average.
- Rentang tanggal Asia/Jakarta ke UTC.
- Validasi file dan baris impor.
- Sanitasi spreadsheet.

### 31.2 Integration Test Database

Uji dengan database nyata terisolasi:

- Pembuatan admin bootstrap.
- Login admin.
- Login pegawai.
- Penolakan akses antarperan.
- Akun nonaktif.
- Pembuatan akun pegawai oleh admin.
- SKU otomatis dan concurrency SKU.
- Barcode unik.
- Stok awal hanya sekali.
- Barang masuk.
- Harga rata-rata.
- Barang keluar.
- Pengambilan melebihi stok.
- Dua transaksi bersamaan.
- Stok tidak pernah negatif.
- Idempotency request.
- Payload berbeda dengan request ID sama.
- Penyesuaian stok.
- Pembalikan transaksi.
- Pembalikan ganda.
- Pembalikan yang membuat nilai/stok invalid.
- Harga tidak dapat dibaca pegawai melalui query langsung.
- Riwayat pegawai hanya milik sendiri.
- Direct write ke stok/ledger ditolak.
- Audit log tercipta dan append-only.

### 31.3 End-to-End Test

Uji minimal:

- Login dan logout admin.
- Login dan logout pegawai.
- Wajib ganti password.
- Navigasi dan route protection.
- CRUD aman master data.
- Barang masuk.
- Scan menggunakan media/barcode fixture yang sesuai jika dapat diotomatisasi.
- Kamera tidak tersedia.
- Izin kamera ditolak.
- Input barcode manual.
- Barang tidak terdaftar.
- Pengambilan berhasil.
- Stok tidak cukup.
- Filter kategori dan status stok.
- Pencarian.
- Riwayat pegawai.
- Penyesuaian.
- Koreksi.
- Impor preview dan hasil parsial.
- Ekspor Excel.
- Ekspor PDF.
- Cetak barcode A4.
- Tampilan desktop.
- Tampilan mobile.
- Mode offline.

### 31.4 Pengujian File

- Parse kembali file `.xlsx` hasil ekspor dan verifikasi sheet, header, tipe cell, dan data penting.
- Verifikasi signature dan struktur PDF.
- Render PDF ke gambar jika tooling tersedia dan periksa layout barcode/laporan.
- Uji bahwa barcode hasil PDF dapat dibaca oleh decoder jika memungkinkan.

### 31.5 UAT Manual

Dokumen UAT harus memuat skenario, prasyarat, langkah, hasil yang diharapkan, status, dan catatan.

Tandai sebagai pengujian manual:

- Scan kamera belakang pada Android melalui HTTPS.
- Scan kamera belakang pada iPhone/Safari melalui HTTPS.
- Pemilihan kamera.
- Bunyi dan getaran perangkat.
- Instalasi PWA.
- Cetak PDF pada printer A4 nyata.

Jangan mengklaim pengujian perangkat nyata berhasil jika tidak benar-benar dilakukan.

### 31.6 Quality Gate

Jalankan:

- Format check jika tersedia.
- Lint.
- Type checking.
- Unit test.
- Integration test yang lingkungannya tersedia.
- End-to-end test yang dapat dijalankan.
- Production build.

Gunakan database test, bukan produksi. Dokumentasikan perintah, environment yang diperlukan, hasil, waktu pelaksanaan, dan kegagalan yang tersisa.

Jika test tertentu membutuhkan Docker, Supabase lokal, browser, kredensial test, atau layanan eksternal yang tidak tersedia:

- Jangan membuat hasil palsu.
- Tandai `BLOCKED` atau `NOT RUN`, bukan `PASS`.
- Jelaskan penyebab dan perintah tepat untuk menjalankannya.
- Bedakan `source code siap`, `terverifikasi lokal`, `terverifikasi dengan layanan`, dan `terverifikasi pada perangkat nyata`.

## 32. Deployment

Siapkan:

- `.env.example`.
- `README.md`.
- Panduan membuat proyek Supabase.
- Panduan menonaktifkan self-signup.
- Panduan menjalankan migration.
- Panduan membuat admin pertama.
- Panduan menjalankan aplikasi lokal.
- Panduan menjalankan test database lokal.
- Panduan menghubungkan repository ke Vercel.
- Panduan environment variable Vercel.
- Panduan deployment.
- Panduan verifikasi setelah deployment.
- Panduan rollback aplikasi dan database.

Buat script server-side, misalnya `scripts/create-admin.ts`, untuk membuat admin pertama atau admin tambahan.

Ketentuan script:

- Meminta username, nama, dan password melalui argumen/env/prompt aman.
- Tidak memiliki username/password hard-coded.
- Memvalidasi input.
- Membuat Auth user, private login mapping, dan profile secara konsisten.
- Melakukan rollback/cleanup aman jika salah satu langkah gagal.
- Tidak mencetak password atau service-role key ke log.

Jika kredensial Supabase atau Vercel belum tersedia:

- Tetap selesaikan source code, migration, test lokal yang mungkin, dan dokumentasi.
- Jangan menggunakan kredensial palsu seolah-olah deployment berhasil.
- Jangan mengklaim migration remote atau deployment berhasil.
- Laporkan kredensial/tindakan pengguna yang masih dibutuhkan.

## 33. Pemeliharaan

`docs/12-pemeliharaan.md` minimal menjelaskan:

- Pencadangan database yang sesuai dengan kemampuan plan yang digunakan.
- Ekspor data berkala.
- Pemulihan data.
- Verifikasi backup.
- Pemantauan kuota Vercel dan Supabase.
- Pemeriksaan log aplikasi, Auth, dan database.
- Pembaruan dependency dan lockfile.
- Pemeriksaan advisory keamanan.
- Rotasi secret.
- Penanganan akun terkunci/nonaktif.
- Penanganan barcode bermasalah.
- Penanganan perbedaan stok fisik.
- Penanganan impor gagal.
- Prosedur rollback.
- Jadwal pemeliharaan.
- Batasan pemulihan atau backup pada plan gratis tanpa mengklaim fitur yang tidak tersedia.

## 34. Ruang Lingkup yang Dilarang

Jangan menambahkan:

- Keranjang pengambilan.
- Multi-gudang.
- Foto barang.
- Data pemasok kompleks.
- Purchase order kompleks.
- Penjualan atau pembayaran.
- Harga jual.
- Batch dan tanggal kedaluwarsa.
- Akuntansi buku besar formal.
- Notifikasi WhatsApp, SMS, push, atau email.
- Rekap khusus penggunaan per pegawai.
- Kolom tujuan/keperluan pegawai.
- Approval bertingkat untuk pengambilan.
- Fitur berbayar tanpa persetujuan.
- Fitur tambahan yang mengalihkan fokus dari kebutuhan inti.

## 35. Tahapan Implementasi

Kerjakan dalam milestone berikut dan perbarui `docs/progress.md` setelah setiap milestone.

### Milestone 1 — Fondasi dan Analisis

- Pemeriksaan repository.
- Rencana eksekusi.
- Dokumen perencanaan, SRS, arsitektur awal, ERD awal, dan threat model.
- Setup Next.js, TypeScript strict, Tailwind, environment schema, dan struktur folder.
- Quality gate dasar.

### Milestone 2 — Database, Auth, dan RLS

- Migration schema public/private.
- Sequence, constraint, index, trigger, dan grants.
- Supabase Auth username mapping.
- Profile aktif, role, dan must-change-password.
- Bootstrap admin.
- RLS dan pengujian akses langsung.

### Milestone 3 — Master Data dan Ledger

- Kategori, satuan, barang, SKU, barcode, dan item units.
- Stok awal.
- Fungsi stok atomik.
- Idempotency dan concurrency test.

### Milestone 4 — Harga dan Transaksi Admin

- Private cost ledger.
- Moving average.
- Barang masuk.
- Penyesuaian.
- Pembalikan.
- Pengujian invariant kuantitas dan nilai.

### Milestone 5 — Alur Pegawai

- Dashboard pegawai.
- Cek stok aman.
- Scan barcode.
- Fallback manual.
- Barang keluar.
- Riwayat sendiri.
- Offline handling.

### Milestone 6 — Alur Admin

- Dashboard admin.
- Riwayat dan filter.
- Pengguna.
- Audit log.
- Pengaturan.

### Milestone 7 — Impor dan Dokumen

- Template Excel.
- Preview/revalidasi/impor parsial.
- Laporan Excel/PDF.
- Barcode label PDF A4.
- Pengujian file.

### Milestone 8 — PWA, Hardening, dan Penyelesaian

- Manifest, icon, service worker, dan offline UI.
- Accessibility dan responsive review.
- Unit, integration, E2E, dan manual UAT checklist.
- Production build.
- Update traceability matrix, kamus data, README, maintenance, dan release checklist.
- Final security review dan pemeriksaan tidak ada placeholder.

Jika platform mendukung beberapa agent, delegasikan hanya subtask yang independen dan tidak mengedit file/schema yang sama secara bersamaan. Agent utama tetap bertanggung jawab atas keputusan database, integrasi, hasil test, dan laporan akhir.

## 36. Definition of Done

Pekerjaan dianggap selesai pada tingkat source code jika seluruh hal berikut benar:

1. Repository memiliki source code produksi, bukan prototipe.
2. Aplikasi dapat menjalani production build tanpa error.
3. Type checking berhasil.
4. Lint berhasil.
5. Unit test berhasil.
6. Migration SQL berversi tersedia dan dapat dijalankan pada environment test yang sesuai.
7. Admin dan pegawai dapat login sesuai hak akses pada environment yang telah dikonfigurasi.
8. Self-signup tidak tersedia dan didokumentasikan cara menonaktifkannya pada Supabase.
9. Admin dapat membuat, menonaktifkan, dan reset password pegawai.
10. Pengguna nonaktif tidak dapat menggunakan session lama.
11. Admin dapat mengelola barang, kategori, dan satuan.
12. SKU otomatis aman terhadap concurrency.
13. Barcode pabrikan dan barcode internal berfungsi.
14. Kamera memiliki alur scan dan fallback manual.
15. Pegawai dapat memilih satuan, memasukkan jumlah, dan mengonfirmasi pengambilan.
16. Stok berkurang secara atomik dan tidak pernah negatif.
17. Retry/double-click tidak menghasilkan transaksi ganda.
18. Konversi satuan berfungsi.
19. Moving average dan cost snapshot berfungsi.
20. Harga tidak dapat diakses pegawai melalui UI maupun akses data langsung.
21. Penyesuaian fisik menghasilkan ledger.
22. Koreksi hanya dilakukan admin melalui reversal.
23. Dashboard dan tabel memiliki pencarian, filter, reset, serta pagination yang relevan.
24. Status stok minimum berfungsi sesuai rumus.
25. Impor Excel create-only, preview, revalidasi, dan hasil parsial berfungsi.
26. Ekspor Excel dan PDF valid.
27. Cetak barcode A4 valid.
28. Tampilan responsif pada PC dan HP.
29. PWA dapat dipasang secara teknis dan tidak mengantre transaksi offline.
30. RLS, grants, private cost schema, dan security-definer functions telah diuji.
31. Audit log append-only dan tidak menyimpan secret.
32. Dokumentasi SDLC, README, maintenance, data dictionary, dan deployment guide tersedia.
33. Traceability matrix sesuai dengan implementasi aktual.
34. Tidak ada tombol palsu, halaman kosong, TODO kritis, credential hard-coded, atau mock data produksi.
35. Hasil pengujian dilaporkan sesuai kenyataan.

Kelulusan pengujian eksternal harus dilaporkan terpisah:

- `PASS`: benar-benar dijalankan dan berhasil.
- `FAIL`: dijalankan dan gagal.
- `BLOCKED`: tidak dapat dijalankan karena dependency/kredensial/lingkungan belum tersedia.
- `NOT RUN`: belum dijalankan.

Jangan menyamakan `BLOCKED` atau `NOT RUN` dengan `PASS`.

## 37. Laporan Akhir

Setelah pekerjaan selesai atau platform mencapai batas eksekusi, berikan laporan akhir yang memuat:

- Ringkasan implementasi.
- Struktur proyek.
- Milestone yang selesai dan belum selesai.
- Fitur yang benar-benar berfungsi.
- Migration, schema private, grants, dan kebijakan RLS.
- Strategi autentikasi username.
- Strategi concurrency dan idempotency.
- Strategi pemisahan harga.
- Hasil lint, type checking, unit, integration, E2E, dan production build satu per satu.
- Pengujian manual yang belum dilakukan.
- Kekurangan atau batasan yang masih ada.
- Langkah konfigurasi Supabase.
- Langkah deployment Vercel.
- Kredensial atau tindakan pengguna yang masih dibutuhkan.
- Risiko yang belum terselesaikan.

Gunakan bukti dari command yang benar-benar dijalankan. Jangan mengarang hasil test, deployment URL, akun, data, atau kredensial.
