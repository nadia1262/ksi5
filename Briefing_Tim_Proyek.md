# BRIEFING TIM — Proyek Akhir Keamanan Sistem Informasi

> **Dokumen ini dibuat untuk dibaca bersama saat rapat tim.**
> Tujuannya: semua anggota tim punya pemahaman yang sama tentang **apa yang kita bikin, kenapa kita bikin, dan bagaimana cara bikinnya** — tanpa harus jadi expert dulu.

---

## BAGIAN 1: GAMBARAN BESAR — "Sebenarnya Kita Bikin Apa?"

### Jawaban Singkat (1 Kalimat)

Kita membuat sebuah **aplikasi web sederhana yang sengaja punya celah keamanan**, lalu kita bikin **"satpam pintar"** yang bisa mendeteksi dan memblokir serangan terhadap celah tersebut, dan kita buktikan bahwa satpam itu bekerja lewat **dashboard visual yang keren**.

### Jawaban Lebih Lengkap

Bayangkan kita punya **aplikasi kos-kosan online** (ini analogi, bukan aplikasi sungguhan). Di aplikasi ini ada 3 pemilik kos (disebut **Tenant**):
- **Tenant A** — Pak Budi, punya data 10 penghuni kos-nya.
- **Tenant B** — Bu Ani, punya data 8 penghuni kos-nya.
- **Tenant C** — Mas Doni, punya data 12 penghuni kos-nya.

Seharusnya, Pak Budi **hanya bisa lihat data penghuni kos miliknya sendiri**, dan tidak bisa mengintip data milik Bu Ani atau Mas Doni. Begitu juga sebaliknya.

**Masalahnya:** Di banyak aplikasi nyata di dunia, ada celah keamanan di mana Pak Budi bisa **mengganti angka di URL** (misalnya dari `/tenant/A/penghuni/1` menjadi `/tenant/B/penghuni/5`) dan **BOOM** — dia bisa melihat data milik Bu Ani! Ini namanya **BOLA (Broken Object Level Authorization)** dan merupakan celah keamanan **nomor 1 paling berbahaya** di dunia API menurut OWASP (organisasi keamanan software terbesar di dunia).

**Yang kita bikin:**
1. Aplikasi kos-kosan sederhana yang **sengaja punya celah BOLA** (untuk demo).
2. **"Satpam Pintar"** berupa middleware (kode yang berjalan di tengah-tengah) yang mengecek setiap permintaan: *"Eh, ini orang beneran punya hak akses atau lagi nyoba ngintip data orang lain?"*
3. **Dashboard** yang menampilkan secara visual: siapa yang nyerang, kapan, dan apakah berhasil diblokir atau tidak.

---

## BAGIAN 2: ISTILAH-ISTILAH KUNCI — "Kamus Proyek Kita"

Sebelum lanjut, mari kita sepakati arti istilah-istilah yang akan sering muncul. Kalau ada yang bingung saat rapat, tinggal buka bagian ini.

| Istilah | Arti Sederhana | Analogi |
|---------|---------------|---------|
| **BOLA** (Broken Object Level Authorization) | Celah keamanan di mana user A bisa akses data user B dengan mengganti ID di URL. | Pak Budi bisa buka loker Bu Ani cuma dengan mengubah nomor loker di kunci. |
| **REST API** | Cara aplikasi frontend (yang dilihat user) berkomunikasi dengan backend (server/database). Formatnya: `GET /api/tenants/1/employees/5`. | Seperti formulir pesanan di restoran — kamu tulis apa yang mau dipesan, kasih ke dapur. |
| **Multi-Tenant** | Satu aplikasi dipakai oleh banyak organisasi/pemilik yang datanya harus terpisah satu sama lain. | Satu gedung apartemen, banyak penghuni, tapi kunci kamar masing-masing harus berbeda. |
| **JWT (JSON Web Token)** | "Kartu identitas digital" yang diberikan server setelah user login. Berisi info: siapa kamu (`user_id`), kamu dari organisasi mana (`tenant_id`), dan peran kamu apa (`role`). | Seperti tanda pengenal karyawan yang ada foto, nama, dan divisi-nya. |
| **Middleware** | Kode yang berjalan **di antara** permintaan user dan database. Semua request harus melewati middleware dulu sebelum sampai ke data. | Satpam di pintu masuk gedung — semua tamu harus dicek dulu sebelum boleh masuk. |
| **Zero Trust** | Prinsip keamanan: **"Jangan pernah percaya siapapun, selalu verifikasi."** Bahkan kalau kamu sudah login (punya JWT), setiap request tetap dicek ulang. | Bahkan karyawan gedung sendiri tetap harus tap kartu setiap kali masuk — tidak ada yang dikecualikan. |
| **Context-Aware** | Keputusan keamanan tidak hanya berdasarkan "siapa kamu" tapi juga **konteks**: dari mana kamu akses, jam berapa, seberapa sering. | Satpam tidak hanya cek kartu, tapi juga cek: "Kok jam 3 pagi? Kok dari pintu belakang? Kok bolak-balik 20 kali dalam semenit?" |
| **Risk Score** | Angka (0-100) yang menunjukkan seberapa mencurigakan sebuah request. Makin tinggi = makin mencurigakan. | Seperti "level kecurigaan" satpam. Kalau sudah di atas 50, langsung ditolak masuk. |
| **PEP (Policy Enforcement Point)** | Titik di dalam sistem di mana aturan keamanan benar-benar diterapkan (di-*enforce*). Dalam proyek kita, PEP = middleware. | Pos satpam — tempat di mana pengecekan benar-benar terjadi. |
| **Toggle** | Tombol on/off untuk mengaktifkan atau menonaktifkan middleware Zero Trust. Ini penting untuk demo: tunjukkan serangan berhasil (off), lalu aktifkan (on), tunjukkan serangan gagal. | Seperti menyalakan/mematikan alarm rumah untuk menunjukkan bedanya. |
| **SOC Dashboard** | Security Operations Center Dashboard — layar monitoring yang menampilkan semua aktivitas keamanan secara real-time. | CCTV + monitor di ruang keamanan gedung. |
| **Tenant Mismatch** | Kondisi di mana `tenant_id` di JWT (kartu identitas) **tidak sama** dengan `tenant_id` di URL yang diminta. Ini indikasi kuat serangan BOLA. | Pak Budi (Tenant A) mencoba masuk ke kamar milik Bu Ani (Tenant B). |
| **Latency** | Waktu yang dibutuhkan server untuk merespons sebuah request (dalam milidetik). | Berapa lama satpam butuh waktu untuk mengecek kartu sebelum mempersilakan masuk. |

---

## BAGIAN 3: CARA KERJA SISTEM — "Alur dari A sampai Z"

### Skenario 1: Akses Normal (User Jujur)

```
Pak Budi (Tenant A) mau lihat data penghuni kos-nya sendiri.

1. Pak Budi login → Server kasih JWT berisi {user_id: 1, tenant_id: "A"}
2. Pak Budi klik "Lihat Data Penghuni" → Browser kirim request:
   GET /api/tenants/A/employees/1
   Header: Authorization: Bearer <JWT Pak Budi>

3. Request sampai di MIDDLEWARE (Satpam Pintar):
   [Cek 1] tenant_id di JWT = "A", tenant_id di URL = "A" → COCOK ✓ (Score: 0)
   [Cek 2] IP Address Pak Budi = 192.168.1.10 → Sudah dikenal ✓ (Score: 0)
   [Cek 3] Waktu sekarang = 10:00 pagi → Jam kerja ✓ (Score: 0)
   [Cek 4] Request per menit = 2 → Normal ✓ (Score: 0)

   TOTAL RISK SCORE = 0 (di bawah 50) → IZINKAN MASUK

4. Request diteruskan ke Database → Data penghuni kos Tenant A dikembalikan.
5. Dashboard: Log hijau — "Pak Budi akses data sendiri. Score: 0. Status: ALLOWED."
```

### Skenario 2: Serangan BOLA (Hacker)

```
Pak Budi (Tenant A) iseng mau intip data penghuni kos Bu Ani (Tenant B).

1. Pak Budi masih login dengan JWT-nya {user_id: 1, tenant_id: "A"}
2. Pak Budi MENGUBAH URL secara manual di browser:
   GET /api/tenants/B/employees/5    ← Perhatikan: "B" bukan "A"!
   Header: Authorization: Bearer <JWT Pak Budi>

3. Request sampai di MIDDLEWARE (Satpam Pintar):
   [Cek 1] tenant_id di JWT = "A", tenant_id di URL = "B" → TIDAK COCOK ✗ (Score: +50)
   [Cek 2] IP Address = 192.168.1.10 → Dikenal ✓ (Score tetap +50)
   [Cek 3] Waktu = 10:00 pagi → Normal ✓ (Score tetap +50)
   [Cek 4] Request per menit = 3 → Normal ✓ (Score tetap +50)

   TOTAL RISK SCORE = 50 (sama dengan threshold 50) → BLOKIR!

4. Server mengembalikan: 403 Forbidden — "Access Denied by Zero Trust Engine."
5. Dashboard: Log merah — "ALERT! Pak Budi (Tenant A) mencoba akses data Tenant B.
   Score: 50. Alasan: Tenant ID Mismatch. Status: BLOCKED."
```

### Skenario 3: Serangan Otomatis / Enumeration (Hacker Level Lanjut)

```
Pak Budi menggunakan script otomatis untuk mengecek SEMUA ID satu per satu.

1. Pak Budi menjalankan script yang mengirim request beruntun:
   GET /api/tenants/B/employees/1
   GET /api/tenants/B/employees/2
   GET /api/tenants/B/employees/3
   ... (50 request dalam 1 menit)

3. MIDDLEWARE mendeteksi:
   [Cek 1] Tenant Mismatch → Score: +50
   [Cek 4] 50 req/menit (>20 threshold) → Score: +15

   TOTAL RISK SCORE = 65 → BLOKIR (dan semua request berikutnya juga diblokir)

5. Dashboard: Log merah berkedip — "CRITICAL! Automated enumeration detected.
   Source: Pak Budi. Velocity: 50 req/min. Score: 65. Status: BLOCKED."
```

---

## BAGIAN 4: ARSITEKTUR TEKNIS — "Kotak-Kotak Apa Saja yang Kita Bikin?"

Sistem kita terdiri dari **3 bagian besar**:

### BAGIAN A: Frontend (Yang Dilihat User di Browser)

**Teknologi:** React.js + Vite + Vanilla CSS

Frontend kita punya **1 halaman utama** dengan layout **split-screen** (layar dibagi dua):

```
┌─────────────────────────────────────────────────────────────────┐
│  [Toggle: Zero Trust ON / OFF]                                  │
├───────────────────────────────┬──────────────────────────────────┤
│                               │                                  │
│   CLIENT / ATTACKER VIEW      │     SOC SECURITY DASHBOARD       │
│                               │                                  │
│  ┌─────────────────────────┐  │  ┌────────────────────────────┐  │
│  │ Login As:               │  │  │ Risk Score Meter            │  │
│  │ [Dropdown: User A/B/C]  │  │  │ ┌──────────────────┐       │  │
│  │                         │  │  │ │   0 ──── 50 ── 100│       │  │
│  │ Request URL:            │  │  │ │         ▲         │       │  │
│  │ [/api/tenants/__/emp/__]│  │  │ └──────────────────┘       │  │
│  │                         │  │  │                            │  │
│  │ [Kirim Request]         │  │  │ Recent Activity Log:       │  │
│  │                         │  │  │ 10:01 - Budi → Tenant A ✓  │  │
│  │ Response:               │  │  │ 10:02 - Budi → Tenant B ✗  │  │
│  │ ┌─────────────────────┐ │  │  │ 10:02 - ALERT! BOLA       │  │
│  │ │ 200 OK / 403 Forbid │ │  │  │                            │  │
│  │ │ { data: ... }       │ │  │  │ Stats:                     │  │
│  │ └─────────────────────┘ │  │  │ Total Blocked: 5           │  │
│  └─────────────────────────┘  │  │ Total Allowed: 12          │  │
│                               │  └────────────────────────────┘  │
└───────────────────────────────┴──────────────────────────────────┘
```

**Sisi Kiri (Client View):**
- Dropdown untuk memilih login sebagai user dari Tenant A, B, atau C.
- Input field untuk mengetik URL API yang mau diakses.
- Tombol "Kirim Request" untuk mengirim permintaan ke backend.
- Area respons yang menampilkan hasil: apakah 200 OK (berhasil) atau 403 Forbidden (diblokir).

**Sisi Kanan (SOC Dashboard):**
- **Risk Score Meter** — semacam speedometer yang menunjukkan skor risiko dari request terakhir (0 = aman, 100 = sangat berbahaya).
- **Activity Log** — daftar kronologis semua request yang masuk, beserta statusnya (allowed/blocked).
- **Statistik** — ringkasan: berapa total yang diizinkan, berapa yang diblokir.

**Toggle di atas:**
- Tombol ON/OFF yang mengaktifkan atau menonaktifkan middleware Zero Trust.
- Saat OFF, semua request akan lolos (termasuk serangan BOLA) — ini untuk mendemonstrasikan bahwa tanpa perlindungan, data bocor.
- Saat ON, middleware aktif dan serangan akan terdeteksi serta diblokir.

---

### BAGIAN B: Backend (Server yang Memproses Request)

**Teknologi:** Node.js + Express.js + SQLite

Backend adalah "dapur" dari aplikasi kita. Dia yang menerima request dari frontend, memprosesnya, dan mengembalikan data. Strukturnya:

```
backend/
├── server.js                  ← File utama, menjalankan Express server
├── routes/
│   └── tenantRoutes.js        ← Mendefinisikan endpoint API
├── middleware/
│   ├── authMiddleware.js      ← Cek JWT (kartu identitas valid atau tidak)
│   └── zeroTrustEngine.js     ← INI INTI PROYEK KITA (Satpam Pintar)
├── controllers/
│   └── employeeController.js  ← Logika mengambil data dari database
├── database/
│   ├── db.js                  ← Koneksi ke SQLite
│   └── seed.js                ← Data dummy untuk 3 tenant
└── utils/
    └── jwtHelper.js           ← Fungsi untuk membuat dan memverifikasi JWT
```

**Endpoint API yang akan kita buat (minimal):**

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/api/auth/login` | Login → dapat JWT token |
| `GET` | `/api/tenants/:tid/employees` | Lihat semua karyawan di tenant tertentu |
| `GET` | `/api/tenants/:tid/employees/:eid` | Lihat detail 1 karyawan |
| `PUT` | `/api/tenants/:tid/employees/:eid` | Edit data karyawan |
| `DELETE` | `/api/tenants/:tid/employees/:eid` | Hapus data karyawan |

**Yang PALING PENTING di backend — File `zeroTrustEngine.js`:**

Ini adalah jantung dari seluruh proyek. File ini berisi fungsi middleware yang melakukan 4 pengecekan. Secara pseudocode (bukan kode sungguhan, tapi menggambarkan logikanya):

```
FUNGSI zeroTrustEngine(request):

    // Ambil info dari JWT (kartu identitas user)
    user_tenant = request.jwt.tenant_id     // Tenant si user
    target_tenant = request.url.tenant_id   // Tenant yang mau diakses
    user_ip = request.ip_address
    waktu_sekarang = jam sekarang
    jumlah_request = hitung request user ini dalam 1 menit terakhir

    risk_score = 0
    alasan = []

    // CEK 1: Apakah user mengakses data tenant-nya sendiri?
    JIKA user_tenant TIDAK SAMA DENGAN target_tenant:
        risk_score = risk_score + 50
        alasan.tambah("Tenant ID Mismatch")

    // CEK 2: Apakah IP-nya dikenali?
    JIKA user_ip TIDAK ADA di daftar IP yang pernah dipakai user ini:
        risk_score = risk_score + 20
        alasan.tambah("Unknown IP Address")

    // CEK 3: Apakah aksesnya di jam wajar?
    JIKA waktu_sekarang < 07:00 ATAU waktu_sekarang > 22:00:
        risk_score = risk_score + 10
        alasan.tambah("Off-Hours Access")

    // CEK 4: Apakah terlalu sering request? (indikasi bot/script)
    JIKA jumlah_request > 20 per menit:
        risk_score = risk_score + 15
        alasan.tambah("High Velocity")

    // KEPUTUSAN AKHIR
    JIKA risk_score >= 50:
        kirim_alert_ke_dashboard(user, risk_score, alasan)
        TOLAK request → kembalikan 403 Forbidden
    SELAINNYA:
        kirim_log_ke_dashboard(user, risk_score, "OK")
        IZINKAN request → lanjut ke controller untuk ambil data
```

Perhatikan bahwa **Cek 1 (Tenant Mismatch) saja sudah cukup untuk memblokir**, karena bobotnya 50 (langsung sama dengan threshold). Ini disengaja karena Tenant Mismatch adalah indikasi paling kuat dari serangan BOLA.

---

### BAGIAN C: Database (Tempat Menyimpan Data)

**Teknologi:** SQLite (file database, tidak perlu install server database terpisah)

Kita hanya butuh beberapa tabel sederhana:

```
TABEL: tenants
┌────────────┬─────────────────┐
│ tenant_id  │ tenant_name     │
├────────────┼─────────────────┤
│ A          │ PT Maju Jaya    │
│ B          │ CV Sentosa      │
│ C          │ UD Berkah       │
└────────────┴─────────────────┘

TABEL: users
┌─────────┬──────────┬────────────┬──────────┐
│ user_id │ username │ tenant_id  │ role     │
├─────────┼──────────┼────────────┼──────────┤
│ 1       │ budi     │ A          │ admin    │
│ 2       │ ani      │ B          │ admin    │
│ 3       │ doni     │ C          │ admin    │
│ 4       │ rina     │ A          │ staff    │
└─────────┴──────────┴────────────┴──────────┘

TABEL: employees (data yang dilindungi)
┌─────────────┬──────────┬────────────┬───────────┬────────────┐
│ employee_id │ name     │ tenant_id  │ position  │ salary     │
├─────────────┼──────────┼────────────┼───────────┼────────────┤
│ 1           │ Sari     │ A          │ Staff     │ 5.000.000  │
│ 2           │ Joko     │ A          │ Manager   │ 8.000.000  │
│ 3           │ Maya     │ B          │ Staff     │ 5.500.000  │
│ 4           │ Rudi     │ B          │ Director  │ 12.000.000 │
│ 5           │ Fani     │ C          │ Staff     │ 4.800.000  │
└─────────────┴──────────┴────────────┴───────────┴────────────┘

TABEL: access_logs (untuk dashboard dan IP profiling)
┌────────┬─────────┬────────────────┬─────────────────────┬─────────┐
│ log_id │ user_id │ ip_address     │ timestamp           │ action  │
├────────┼─────────┼────────────────┼─────────────────────┼─────────┤
│ 1      │ 1       │ 192.168.1.10   │ 2025-06-01 09:00:00 │ ALLOWED │
│ 2      │ 1       │ 192.168.1.10   │ 2025-06-01 09:05:00 │ BLOCKED │
└────────┴─────────┴────────────────┴─────────────────────┴─────────┘
```

Perhatikan bahwa **setiap employee punya kolom `tenant_id`**. Inilah yang menjadi kunci: middleware harus mengecek apakah `tenant_id` di JWT user cocok dengan `tenant_id` dari employee yang mau diakses.

---

## BAGIAN 5: ALUR PRESENTASI / DEMO — "Nanti di Depan Dosen Ngapain?"

Ini adalah bagian terpenting karena presentasi yang bagus = nilai yang bagus. Demo kita terdiri dari **2 fase**:

### FASE 1: "Lihat Betapa Bahayanya!" (Zero Trust OFF)

1. Buka aplikasi di browser, toggle Zero Trust ke posisi **OFF**.
2. Login sebagai **Budi (Tenant A)**.
3. Akses data karyawan Tenant A sendiri → **200 OK** (normal, tidak ada masalah).
4. **Sekarang yang seru:** Ubah URL dari `/tenants/A/employees/1` ke `/tenants/B/employees/3`.
5. Hasilnya: **200 OK** — Data karyawan milik Tenant B (Bu Ani) berhasil diambil oleh Pak Budi!
6. Tunjukkan ke dosen: *"Ini yang disebut serangan BOLA, Pak/Bu. Data organisasi lain bocor hanya dengan mengubah angka di URL."*

### FASE 2: "Lihat Solusi Kami!" (Zero Trust ON)

1. Klik toggle ke posisi **ON** (aktifkan middleware Zero Trust).
2. Ulangi langkah yang **persis sama**: login sebagai Budi, akses `/tenants/B/employees/3`.
3. Hasilnya: **403 Forbidden** — Request diblokir!
4. Tunjukkan dashboard di sisi kanan: *"Sistem kami mendeteksi Tenant ID Mismatch, memberikan Risk Score 50, dan otomatis memblokir request ini. Alert juga langsung muncul di SOC Dashboard."*
5. **Bonus:** Jalankan script otomatis yang mencoba mengakses ID 1 sampai 50, tunjukkan bahwa seluruhnya diblokir dan dashboard menampilkan *"Automated enumeration detected!"*

### Kalimat Penutup Demo:

*"Dengan Context-Aware Authorization Engine yang kami implementasikan, serangan BOLA yang tadinya berhasil 100% kini terdeteksi dan diblokir 100%, dengan overhead latency di bawah 50 milidetik. True Positive Rate mencapai 100% dan False Positive Rate 0% — akses sah dari user tidak terganggu sama sekali."*

---

## BAGIAN 6: PEMBAGIAN TUGAS — "Siapa Ngerjain Apa?"

Berikut adalah saran pembagian tugas untuk 5 anggota tim:

### Orang 1: Backend Engineer (API & Database)

**Tanggung jawab:**
- Setup project Node.js + Express.js.
- Buat endpoint REST API (login, GET, PUT, DELETE employees).
- Buat database SQLite dan isi data dummy (3 tenant, masing-masing punya karyawan).
- Buat fungsi JWT (generate token saat login, verify token saat request).

**Skill yang dibutuhkan:** JavaScript dasar, paham konsep API (request-response).

**Estimasi waktu:** 3-5 hari.

---

### Orang 2: Security / Middleware Engineer (Inti Proyek)

**Tanggung jawab:**
- Membuat file `zeroTrustEngine.js` — ini jantung proyek kita.
- Implementasi 4 pengecekan: Tenant Mismatch, IP Profiling, Time Window, Velocity.
- Implementasi mekanisme Toggle ON/OFF via flag di backend.
- Membuat sistem logging (mencatat setiap request beserta risk score-nya).

**Skill yang dibutuhkan:** JavaScript, pemahaman logika if-else, dan konsep middleware Express.

**Estimasi waktu:** 4-6 hari.

---

### Orang 3: Frontend Engineer (Dashboard & UI)

**Tanggung jawab:**
- Setup project React.js + Vite.
- Membuat layout Split-Screen (Client View + SOC Dashboard).
- Membuat komponen: Login dropdown, URL input, tombol kirim, area respons.
- Membuat komponen dashboard: Risk Score Meter, Activity Log, statistik.
- Membuat Toggle Switch yang mengirim perintah ke backend.

**Skill yang dibutuhkan:** JavaScript, React dasar (useState, useEffect, fetch API), CSS.

**Estimasi waktu:** 5-7 hari.

---

### Orang 4: QA & Penetration Tester

**Tanggung jawab:**
- Setelah backend dan middleware jadi, lakukan pengujian manual pakai Postman/cURL.
- Eksekusi semua skenario pengujian (Baseline B1-B3, Defense D1-D3, Validasi V1-V3).
- Buat script otomatis untuk mengukur latency (berapa milidetik tambahan karena middleware).
- Hitung metrik: TPR, FPR, Blocking Rate.
- Dokumentasikan semua hasil pengujian dalam tabel.

**Skill yang dibutuhkan:** Bisa pakai Postman, pemahaman dasar HTTP status code, bisa bikin tabel hasil.

**Estimasi waktu:** 3-4 hari (setelah backend & middleware jadi).

---

### Orang 5: Technical Writer & Project Manager

**Tanggung jawab:**
- Menyusun dokumen proposal lengkap (Bab I - V) menggunakan template yang sudah ada.
- Mengumpulkan dan memformat referensi literatur (OWASP, NIST, paper jurnal).
- Membuat slide presentasi.
- Menyusun jadwal kerja tim dan memastikan setiap orang on-track.
- Menulis README (instruksi cara menjalankan aplikasi).

**Skill yang dibutuhkan:** Kemampuan menulis akademis, Microsoft Word/PowerPoint, manajemen waktu.

**Estimasi waktu:** Berjalan paralel sepanjang proyek.

---

## BAGIAN 7: TECH STACK — "Software Apa yang Perlu Di-Install?"

Setiap anggota tim perlu menginstall:

| Software | Kegunaan | Link Download |
|----------|----------|---------------|
| **Node.js** (versi LTS) | Menjalankan backend server | [nodejs.org](https://nodejs.org/) |
| **Visual Studio Code** | Code editor | [code.visualstudio.com](https://code.visualstudio.com/) |
| **Git** | Version control (kolaborasi kode) | [git-scm.com](https://git-scm.com/) |
| **Postman** | Testing API secara manual | [postman.com](https://www.postman.com/) |

Library/Package yang akan di-install via `npm` (tidak perlu download manual):

| Package | Fungsi |
|---------|--------|
| `express` | Framework backend (membuat API server) |
| `jsonwebtoken` | Membuat dan memverifikasi JWT token |
| `better-sqlite3` | Koneksi ke database SQLite |
| `cors` | Mengizinkan frontend berkomunikasi dengan backend |
| `react` + `vite` | Framework frontend |

---

## BAGIAN 8: FAQ — "Pertanyaan yang Mungkin Muncul Saat Rapat"

**Q: Kenapa kita tidak pakai OPA (Open Policy Agent) atau Keycloak?**
A: OPA dan Keycloak itu untuk skala enterprise (perusahaan raksasa dengan ratusan microservices). Proyek kita adalah Proof of Concept (PoC) dengan arsitektur monolith sederhana. Custom middleware sudah sangat valid dan justru lebih bagus untuk demo karena kita bisa menunjukkan kodenya baris per baris ke dosen. Di dunia nyata, startup dan perusahaan menengah juga menggunakan custom middleware.

**Q: Ini beneran bisa selesai?**
A: Sangat bisa. Dengan 5 orang dan pembagian tugas yang jelas, ini proyek yang sangat realistis. Backend-nya sederhana (CRUD biasa), middleware-nya pada dasarnya hanya fungsi if-else, frontend-nya 1 halaman saja, dan pengujiannya tinggal jalankan request lalu catat hasilnya.

**Q: Berapa lama estimasi pengerjaannya?**
A: Kalau semua anggota mengerjakan bagiannya secara paralel: 2-3 minggu sudah cukup. Minggu 1: Backend + Database. Minggu 2: Middleware + Frontend. Minggu 3: Testing + Dokumentasi + Polish.

**Q: Kalau ada yang stuck gimana?**
A: Setiap anggota fokus di satu bagian saja. Kalau stuck di middleware misalnya, logika dasarnya sudah ada di pseudocode (Bagian 4 dokumen ini). Tinggal terjemahkan ke JavaScript. Komunikasi di grup chat, daily check-in singkat (5 menit) setiap hari.

**Q: Apa yang bikin proyek ini keliatan "WOW" di mata dosen?**
A: Tiga hal: (1) Demo live yang dramatis — serangan berhasil lalu gagal setelah toggle dinyalakan. (2) Dashboard visual yang real-time — dosen suka melihat sesuatu yang bergerak, bukan cuma terminal hitam. (3) Data kuantitatif — TPR 100%, FPR 0%, latency < 50ms. Angka-angka ini membuat proyek terasa riset, bukan sekadar tugas coding.

**Q: Kalau dosen tanya "ini kan cuma simulasi, bagaimana di production?"**
A: Jawab bahwa prinsip dan algoritma Risk Scoring-nya sama persis. Yang berubah di production hanya skalanya: middleware kita bisa dijadikan package NPM dan dipasang di aplikasi manapun, atau untuk skala lebih besar bisa di-migrate ke OPA/Keycloak. Konsep dan algoritmanya tetap relevan.

---

## BAGIAN 9: TIMELINE KERJA YANG DISARANKAN

```
MINGGU 1 ──────────────────────────────────────────
│ Orang 1: Setup Express + SQLite + Data Seed
│ Orang 2: Pelajari konsep middleware, mulai draft zeroTrustEngine.js
│ Orang 3: Setup React+Vite, buat layout split-screen (belum connect ke backend)
│ Orang 4: Belajar Postman, siapkan daftar skenario pengujian
│ Orang 5: Mulai menulis BAB I & BAB II, kumpulkan referensi

MINGGU 2 ──────────────────────────────────────────
│ Orang 1: Buat semua endpoint API (login, CRUD employees)
│ Orang 2: Implementasi 4 cek + toggle mechanism + logging
│ Orang 3: Hubungkan frontend ke backend (fetch API), buat dashboard
│ Orang 4: Mulai testing manual (baseline scenario)
│ Orang 5: Lanjut BAB II + mulai BAB IV (jadwal & pembagian tugas)

MINGGU 3 ──────────────────────────────────────────
│ Semua  : Integrasi seluruh komponen
│ Orang 4: Testing lengkap (defense + validasi), ukur metrik
│ Orang 3: Polish UI (animasi, warna, responsif)
│ Orang 5: Finalisasi proposal + slide presentasi
│ Semua  : Latihan demo bersama
```

---

> **Pesan untuk tim:** Proyek ini sebenarnya tidak serumit kedengarannya. Kalau dipecah, masing-masing orang hanya mengerjakan 1 komponen kecil yang spesifik. Kunci keberhasilannya: **komunikasi harian yang konsisten** dan **jangan takut bertanya kalau stuck**. Kita semua sedang belajar, dan itu bukan kelemahan — itu proses.
