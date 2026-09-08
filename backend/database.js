// ============================================
// database.js - Setup SQLite Database
// ============================================
// Membuat database dengan data wilayah Indonesia (38 provinsi, 280+ kab/kota)
// dan penduduk fiktif yang di-generate secara prosedural.
// Data ini BUKAN data asli BPS, melainkan data fiktif untuk keperluan PoC.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { PROVINSI, KABKOTA, NAMA_DEPAN, NAMA_BELAKANG, JALAN, STATUS_EKONOMI } = require('./data/wilayah');

const DB_PATH = path.join(__dirname, 'data', 'penduduk.db');

// -------------------------------------------
// Deterministic hash untuk generate data yang konsisten
// -------------------------------------------
function simpleHash(str, seed = 0) {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// -------------------------------------------
// Membersihkan prefix nama kab/kota untuk alamat
// -------------------------------------------
function cleanKabName(nama) {
    return nama
        .replace(/^Kab\.\s+Adm\.\s+/i, '')
        .replace(/^Kota\s+Adm\.\s+/i, '')
        .replace(/^Kab\.\s+/i, '')
        .replace(/^Kota\s+/i, '');
}

// -------------------------------------------
// Generate penduduk fiktif untuk satu kab/kota
// -------------------------------------------
function generatePenduduk(kabKode, kabNama) {
    const records = [];
    const baseHash = simpleHash(kabKode);
    const count = (baseHash % 8) + 5; // 5 - 12 penduduk per kab/kota
    const lokasi = cleanKabName(kabNama);

    for (let i = 0; i < count; i++) {
        const h1 = simpleHash(kabKode + 'a', i * 31 + 7);
        const h2 = simpleHash(kabKode + 'b', i * 47 + 13);
        const h3 = simpleHash(kabKode + 'c', i * 61 + 19);
        const h4 = simpleHash(kabKode + 'd', i * 79 + 23);

        const namaDepan = NAMA_DEPAN[h1 % NAMA_DEPAN.length];
        const namaBelakang = NAMA_BELAKANG[h2 % NAMA_BELAKANG.length];
        const jalan = JALAN[h3 % JALAN.length];
        const noRumah = (h4 % 150) + 1;
        const status = STATUS_EKONOMI[h4 % STATUS_EKONOMI.length];

        // NIK: 16 digit (kode_kab + kecamatan + tgl_lahir + seq)
        const dd = String((h1 % 28) + 1).padStart(2, '0');
        const mm = String((h2 % 12) + 1).padStart(2, '0');
        const yy = String(65 + (h3 % 40)).padStart(2, '0'); // tahun lahir 1965-2004
        const seq = String(i + 1).padStart(4, '0');
        const nik = `${kabKode}01${dd}${mm}${yy}${seq}`;

        records.push({
            id: `${kabKode}-${String(i + 1).padStart(4, '0')}`,
            tenant_id: kabKode,
            nik: nik,
            nama: `${namaDepan} ${namaBelakang}`,
            alamat: `${jalan} No.${noRumah}, ${lokasi}`,
            status_ekonomi: status,
        });
    }

    return records;
}

// -------------------------------------------
// Inisialisasi database + seed
// -------------------------------------------
function initializeDatabase() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Buat tabel
    db.exec(`
        CREATE TABLE IF NOT EXISTS provinsi (
            kode TEXT PRIMARY KEY,
            nama TEXT NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS kabkota (
            kode TEXT PRIMARY KEY,
            nama TEXT NOT NULL,
            kode_prov TEXT NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS penduduk (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            nik TEXT NOT NULL,
            nama TEXT NOT NULL,
            alamat TEXT NOT NULL,
            status_ekonomi TEXT NOT NULL
        )
    `);

    // Cek apakah sudah ada data (hindari duplikasi saat restart)
    const provCount = db.prepare('SELECT COUNT(*) as total FROM provinsi').get();

    if (provCount.total === 0) {
        console.log('[DB] Menanam data wilayah Indonesia...');

        const insertProv = db.prepare(
            'INSERT INTO provinsi (kode, nama) VALUES (?, ?)'
        );
        const insertKab = db.prepare(
            'INSERT INTO kabkota (kode, nama, kode_prov) VALUES (?, ?, ?)'
        );
        const insertPenduduk = db.prepare(
            'INSERT INTO penduduk (id, tenant_id, nik, nama, alamat, status_ekonomi) VALUES (@id, @tenant_id, @nik, @nama, @alamat, @status_ekonomi)'
        );

        const seedAll = db.transaction(() => {
            // 1. Seed provinsi
            for (const prov of PROVINSI) {
                insertProv.run(prov.kode, prov.nama);
            }

            // 2. Seed kab/kota + generate penduduk
            let totalPenduduk = 0;
            for (const kab of KABKOTA) {
                insertKab.run(kab.kode, kab.nama, kab.kode_prov);

                const pendudukList = generatePenduduk(kab.kode, kab.nama);
                for (const p of pendudukList) {
                    insertPenduduk.run(p);
                }
                totalPenduduk += pendudukList.length;
            }

            return totalPenduduk;
        });

        const totalPenduduk = seedAll();
        console.log(`[DB] Berhasil menanam: ${PROVINSI.length} provinsi, ${KABKOTA.length} kab/kota, ${totalPenduduk} penduduk.`);
    } else {
        const kabCount = db.prepare('SELECT COUNT(*) as total FROM kabkota').get();
        const pendudukCount = db.prepare('SELECT COUNT(*) as total FROM penduduk').get();
        console.log(`[DB] Database sudah berisi: ${provCount.total} provinsi, ${kabCount.total} kab/kota, ${pendudukCount.total} penduduk. Skip seeding.`);
    }

    return db;
}

module.exports = { initializeDatabase };
