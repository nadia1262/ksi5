# SIDAPTOR — Sistem Data Penduduk Terintegrasi

Proyek akhir Keamanan Sistem Informasi: Mitigasi **BOLA (Broken Object Level Authorization)** menggunakan arsitektur **Zero Trust** dengan **OPA**, **Keycloak**, dan **Redis**.

---

## Prasyarat

Pastikan sudah terinstall:

| Software | Versi Minimum | Cek Instalasi |
|----------|---------------|---------------|
| **Node.js** | v18+ | `node --version` |
| **npm** | v9+ | `npm --version` |
| **Docker Desktop** | v4+ | `docker --version` |
| **Git** | v2+ | `git --version` |

> Docker Desktop harus **running** (bukan cuma terinstall).

---

## Cara Menjalankan

### 1. Clone Repository

```bash
git clone https://github.com/nadia1262/ksi5.git
cd ksi5
```

### 2. Nyalakan Docker Containers

```bash
docker-compose up -d
```

Tunggu sekitar 30-60 detik sampai Keycloak siap. Cek dengan:

```bash
docker ps
```

Harus ada 3 container running: `zt_keycloak`, `zt_opa`, `zt_redis`.

### 3. Install Dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 4. Setup Keycloak (Buat User Operator)

```bash
cd backend
node setup-keycloak.js
```

Tunggu sampai muncul pesan **"Keycloak Setup Selesai!"**. Ini membuat realm, client, dan 3 user operator di Keycloak.

> **PENTING:** Jika gagal dengan error "connect ECONNREFUSED", tunggu 30 detik lagi (Keycloak belum ready) lalu ulangi.

### 5. Jalankan Backend

```bash
cd backend
node server.js
```

Tunggu sampai muncul:
```
============================================
 ZERO TRUST API GATEWAY - PoC Server
============================================
  API Server    : http://localhost:3001
  ZT Status     : ON
============================================
```

### 6. Jalankan Frontend (Terminal Baru)

Buka terminal **baru** (jangan tutup terminal backend), lalu:

```bash
cd frontend
npm run dev
```

Tunggu sampai muncul:
```
  VITE ready in xxx ms
  Local: http://localhost:5173/
```

### 7. Buka di Browser

Buka **http://localhost:5173** di browser.

---

## Cara Menggunakan

### Login

Pilih salah satu operator:

| Operator | Password | Wilayah |
|----------|----------|---------|
| operator-jaksel | password | Kota Adm. Jakarta Selatan (3174) |
| operator-jakpus | password | Kota Adm. Jakarta Pusat (3171) |
| operator-bogor | password | Kab. Bogor (3201) |

### 3 Tab Utama

1. **Portal Data** — Lihat/tambah/edit/hapus data penduduk wilayah sendiri
2. **Simulator Keamanan** — Kirim request API manual dengan konteks simulasi
3. **Dashboard Monitoring** — Toggle Zero Trust ON/OFF, lihat log keamanan real-time

### Demo BOLA

1. Login sebagai **operator-bogor**
2. Tab Portal Data → Pilih Jawa Barat → Kab. Bogor → Terapkan
3. Tab Dashboard Monitoring → **Matikan** Zero Trust
4. Balik ke Portal Data → Klik **"Akses Wilayah Lain [BOLA Test]"** → ketik **3174** → Kirim
5. Hasil: **200 OK** — data Jakarta Selatan bocor! (BOLA terjadi)
6. Tab Dashboard Monitoring → **Nyalakan** Zero Trust
7. Balik dan ulangi langkah 4 → Kirim lagi
8. Hasil: **403 FORBIDDEN** — serangan diblokir, risk score 50

---

## Arsitektur

```
Browser (React)
    |
    v
Express API Gateway (server.js)
    |
    +-- Zero Trust Middleware
    |       |
    |       +-- JWT Validation (Keycloak)
    |       +-- Context Collection (Redis)
    |       +-- Policy Evaluation (OPA/Rego)
    |       +-- Decision: ALLOW / DENY
    |
    +-- SQLite Database
    |       +-- 38 Provinsi
    |       +-- 404 Kab/Kota
    |       +-- 3400+ Penduduk (fiktif)
    |
    +-- Socket.IO (Real-time logs ke Dashboard)
```

---

## Port yang Digunakan

| Service | Port |
|---------|------|
| Frontend (Vite) | http://localhost:5173 |
| Backend (Express) | http://localhost:3001 |
| Keycloak | http://localhost:8080 |
| OPA | http://localhost:8181 |
| Redis | localhost:6379 |

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Login gagal "connect ECONNREFUSED" | Keycloak belum ready. Tunggu 30 detik, coba lagi. |
| `setup-keycloak.js` gagal | Pastikan Docker running dan `docker ps` menunjukkan 3 container. |
| Data kosong setelah pilih wilayah | Klik tombol **Terapkan** setelah memilih provinsi dan kab/kota. |
| Port 3001 sudah dipakai | Kill proses lama: `npx kill-port 3001` |
| Port 5173 sudah dipakai | Kill proses lama: `npx kill-port 5173` |

---

## Mematikan Semua

```bash
# Terminal backend: Ctrl+C
# Terminal frontend: Ctrl+C
# Docker:
docker-compose down
```
