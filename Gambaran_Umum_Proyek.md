# Gambaran Umum Proyek: Memahami Konsep dengan Bahasa Manusia

> **Judul Proyek:** Implementasi dan Evaluasi Context-Aware Authorization Berbasis Zero Trust untuk Mitigasi Broken Access Control (BOLA) pada REST API Multi Tenant

Judul ini mungkin terdengar penuh dengan istilah teknis yang berat. Mari kita bedah satu per satu menggunakan analogi sederhana agar terbayang sebenarnya **kita ini sedang membuat apa**.

---

## 1. Masalah yang Ingin Diselesaikan (The Problem)

### Apa itu "REST API Multi Tenant"?
Bayangkan sebuah **Gedung Perkantoran (Sistem Multi Tenant)**. Di dalam gedung ini terdapat banyak perusahaan berbeda yang menyewa ruangan (Tenant A, Tenant B, Tenant C). Mereka menggunakan pintu masuk, lift, dan koridor yang sama (REST API), tetapi ruang kerjanya harus benar-benar terpisah. Data Tenant A tidak boleh dilihat oleh Tenant B.

### Apa itu "Broken Access Control (BOLA)"?
*Broken Object Level Authorization (BOLA)* adalah kerentanan keamanan nomor 1 di dunia API saat ini.
**Analogi:** Bayangkan Anda adalah karyawan Tenant A. Anda diberi ID Card (Token) yang sah untuk masuk ke ruangan Anda (Ruang 101). Anda masuk ke lift, menempelkan ID Card, lalu iseng memencet tombol ke lantai perusahaan saingan (Tenant B, Ruang 201).
Sistem keamanan lift yang buruk (BOLA) berpikir: *"Oh, dia punya ID Card yang valid, biarkan saja dia masuk ke ruangan mana pun."* 
Di dunia API, ini terjadi ketika pengguna A mengganti nomor ID di URL dari `/api/data/101` menjadi `/api/data/201` dan tiba-tiba berhasil mencuri data orang lain.

---

## 2. Solusi yang Kita Buat (The Solution)

### Apa itu "Zero Trust"?
Prinsip keamanan konvensional mengatakan: *"Kalau dia sudah login (punya ID Card), berarti dia orang baik. Percayai saja."*
**Zero Trust** membuang pemikiran itu. Prinsipnya: **"Jangan percaya siapapun, selalu verifikasi."** Meskipun Anda sudah berada di dalam gedung dan punya ID Card, setiap kali Anda mau membuka pintu ruangan, sistem akan mencegat dan mengecek ulang identitas Anda.

### Apa itu "Context-Aware Authorization"?
Ini adalah **Otak** dari sistem Zero Trust yang akan kita bangun.
Pengecekan tidak lagi hanya melihat: *"Apakah dia bawa kunci (token)?"*
Sistem kita akan melihat **Konteks (Situasi)**, seperti seorang satpam yang sangat pintar dan curiga:
1. **Siapa ini?** (Apakah ID ini milik Tenant A?)
2. **Apa yang mau dia akses?** (Dia mau akses data Tenant B? Jelas tidak boleh!)
3. **Dari mana asalnya?** (Loh, IP Address-nya dari Rusia, padahal dia biasanya login dari Jakarta. Mencurigakan!)
4. **Kapan dia akses?** (Ini jam 3 pagi, kenapa dia narik data besar-besaran? Mencurigakan!)
5. **Perangkat apa yang dipakai?** (Dia login pakai HP yang belum pernah didaftarkan.)

Jika **konteksnya** aneh atau tidak sesuai, akses akan langsung **DITOLAK**, meskipun password dan tokennya benar.

---

## 3. Jadi, Secara Praktik Proyek Ini Ngapain? (The Implementation)

Di proyek ini, kita akan:

1. **Membuat Skenario Aplikasi "Sakit":**
   Kita akan membuat sebuah aplikasi / API (misalnya aplikasi kasir untuk banyak toko/tenant) yang sengaja dibuat "bodoh" (punya celah BOLA). Pengguna Toko A bisa mencuri data Toko B hanya dengan mengubah ID di URL.

2. **Membangun "Satpam Pintar" (Middleware Keamanan):**
   Kita akan ngoding sebuah sistem keamanan (Context-Aware Authorization). Sistem ini akan membaca setiap permintaan (request) yang masuk, lalu menganalisis konteksnya (Role, IP Address, Tenant ID, Waktu).

3. **Menerapkan "Satpam" ke Aplikasi:**
   Sistem keamanan yang sudah dibuat akan dipasang ke aplikasi "Sakit" tadi untuk menyembuhkannya.

4. **Melakukan Evaluasi (Pembuktian):**
   Kita akan mencoba meretas ulang aplikasi tersebut. Kita akan buktikan bahwa dengan adanya "Satpam Pintar" ini, serangan BOLA (seperti ganti-ganti ID atau mencuri sesi) berhasil digagalkan dengan persentase keberhasilan blokir yang tinggi, namun tetap tidak mengganggu pengguna asli (False Positive yang rendah).

---

## Kesimpulan Singkat

**"Kita sedang membuat sistem satpam super pintar (Context-Aware) yang tidak mudah dikelabui oleh orang dalam yang iseng (Zero Trust) untuk mencegah pencurian data antar perusahaan di sebuah aplikasi bersama (BOLA pada Multi Tenant)."**
