// ============================================
// routes/api.js - API Endpoints (Protected Resources)
// ============================================
// Rute API yang dilindungi oleh Zero Trust Middleware.
//
// Rute wilayah (GET): bypass ZT karena tidak match pattern /wilayah/:tenantId
// Rute penduduk CRUD: melalui ZT middleware (tenant check)
//
// Format URL penduduk: /api/wilayah/:tenantId/penduduk/:id
//
// Contoh serangan BOLA:
//   Operator BPS Bogor (tenant 3201) mencoba akses:
//   GET /api/wilayah/3174/penduduk  ← Data milik Jaksel!

const express = require('express');
const router = express.Router();

module.exports = function (db) {

    // ==========================================
    // WILAYAH ROUTES (Bypass ZT - data publik)
    // ==========================================

    // GET /api/provinsi — Daftar seluruh provinsi
    router.get('/provinsi', (req, res) => {
        try {
            const rows = db.prepare('SELECT kode, nama FROM provinsi ORDER BY kode').all();
            res.json({ success: true, total: rows.length, data: rows });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // GET /api/provinsi/:provId/kabkota — Daftar kab/kota dalam satu provinsi
    router.get('/provinsi/:provId/kabkota', (req, res) => {
        const { provId } = req.params;
        try {
            const rows = db.prepare(
                'SELECT kode, nama, kode_prov FROM kabkota WHERE kode_prov = ? ORDER BY kode'
            ).all(provId);
            res.json({ success: true, provinsi: provId, total: rows.length, data: rows });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // GET /api/kabkota — Seluruh kab/kota (untuk dropdown tanpa filter)
    router.get('/kabkota', (req, res) => {
        try {
            const rows = db.prepare(
                'SELECT k.kode, k.nama, k.kode_prov, p.nama as nama_prov FROM kabkota k JOIN provinsi p ON k.kode_prov = p.kode ORDER BY k.kode'
            ).all();
            res.json({ success: true, total: rows.length, data: rows });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // GET /api/stats/wilayah — Statistik ringkasan wilayah
    router.get('/stats/wilayah', (req, res) => {
        try {
            const provCount = db.prepare('SELECT COUNT(*) as total FROM provinsi').get();
            const kabCount = db.prepare('SELECT COUNT(*) as total FROM kabkota').get();
            const pendudukCount = db.prepare('SELECT COUNT(*) as total FROM penduduk').get();
            res.json({
                success: true,
                provinsi: provCount.total,
                kabkota: kabCount.total,
                penduduk: pendudukCount.total,
            });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // ==========================================
    // PENDUDUK ROUTES (Melalui ZT Middleware)
    // ==========================================

    // GET /api/wilayah/:tenantId/penduduk
    // Mengambil semua data penduduk untuk suatu wilayah (tenant)
    router.get('/wilayah/:tenantId/penduduk', (req, res) => {
        const { tenantId } = req.params;
        try {
            const rows = db.prepare('SELECT * FROM penduduk WHERE tenant_id = ?').all(tenantId);

            // Ambil info wilayah
            const wilayah = db.prepare('SELECT nama FROM kabkota WHERE kode = ?').get(tenantId);
            const namaWilayah = wilayah ? wilayah.nama : tenantId;

            // Hitung statistik status ekonomi
            const stats = db.prepare(`
                SELECT status_ekonomi, COUNT(*) as jumlah
                FROM penduduk WHERE tenant_id = ?
                GROUP BY status_ekonomi
            `).all(tenantId);

            const statsMap = {};
            for (const s of stats) {
                statsMap[s.status_ekonomi] = s.jumlah;
            }

            res.json({
                success: true,
                tenant_id: tenantId,
                nama_wilayah: namaWilayah,
                total: rows.length,
                statistik: {
                    mampu: statsMap['Mampu'] || 0,
                    menengah: statsMap['Menengah'] || 0,
                    kurang_mampu: statsMap['Kurang Mampu'] || 0,
                },
                data: rows,
            });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // GET /api/wilayah/:tenantId/penduduk/:id
    // Mengambil data penduduk spesifik berdasarkan ID
    router.get('/wilayah/:tenantId/penduduk/:id', (req, res) => {
        const { tenantId, id } = req.params;
        try {
            const row = db.prepare('SELECT * FROM penduduk WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!row) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Data penduduk dengan ID ${id} tidak ditemukan di wilayah ${tenantId}.`,
                });
            }
            res.json({ success: true, data: row });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // POST /api/wilayah/:tenantId/penduduk
    // Menambahkan data penduduk baru
    router.post('/wilayah/:tenantId/penduduk', (req, res) => {
        const { tenantId } = req.params;
        const { nik, nama, alamat, status_ekonomi } = req.body;

        // Validasi input
        if (!nik || !nama || !alamat || !status_ekonomi) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Field nik, nama, alamat, dan status_ekonomi wajib diisi.',
            });
        }

        const validStatus = ['Mampu', 'Menengah', 'Kurang Mampu'];
        if (!validStatus.includes(status_ekonomi)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: `status_ekonomi harus salah satu dari: ${validStatus.join(', ')}`,
            });
        }

        try {
            const id = `${tenantId}-${Date.now()}`;
            db.prepare(
                'INSERT INTO penduduk (id, tenant_id, nik, nama, alamat, status_ekonomi) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(id, tenantId, nik, nama, alamat, status_ekonomi);

            const newRow = db.prepare('SELECT * FROM penduduk WHERE id = ?').get(id);
            res.status(201).json({ success: true, message: 'Data penduduk berhasil ditambahkan.', data: newRow });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // PUT /api/wilayah/:tenantId/penduduk/:id
    // Memperbarui data penduduk
    router.put('/wilayah/:tenantId/penduduk/:id', (req, res) => {
        const { tenantId, id } = req.params;
        const { nik, nama, alamat, status_ekonomi } = req.body;

        try {
            // Cek apakah data ada
            const existing = db.prepare('SELECT * FROM penduduk WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!existing) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Data penduduk dengan ID ${id} tidak ditemukan di wilayah ${tenantId}.`,
                });
            }

            // Validasi status_ekonomi jika dikirim
            if (status_ekonomi) {
                const validStatus = ['Mampu', 'Menengah', 'Kurang Mampu'];
                if (!validStatus.includes(status_ekonomi)) {
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: `status_ekonomi harus salah satu dari: ${validStatus.join(', ')}`,
                    });
                }
            }

            // Update hanya field yang dikirim
            const updatedNik = nik || existing.nik;
            const updatedNama = nama || existing.nama;
            const updatedAlamat = alamat || existing.alamat;
            const updatedStatus = status_ekonomi || existing.status_ekonomi;

            db.prepare(
                'UPDATE penduduk SET nik = ?, nama = ?, alamat = ?, status_ekonomi = ? WHERE id = ? AND tenant_id = ?'
            ).run(updatedNik, updatedNama, updatedAlamat, updatedStatus, id, tenantId);

            const updatedRow = db.prepare('SELECT * FROM penduduk WHERE id = ?').get(id);
            res.json({ success: true, message: 'Data penduduk berhasil diperbarui.', data: updatedRow });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    // DELETE /api/wilayah/:tenantId/penduduk/:id
    // Menghapus data penduduk
    router.delete('/wilayah/:tenantId/penduduk/:id', (req, res) => {
        const { tenantId, id } = req.params;

        try {
            const existing = db.prepare('SELECT * FROM penduduk WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!existing) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: `Data penduduk dengan ID ${id} tidak ditemukan di wilayah ${tenantId}.`,
                });
            }

            db.prepare('DELETE FROM penduduk WHERE id = ? AND tenant_id = ?').run(id, tenantId);
            res.json({ success: true, message: 'Data penduduk berhasil dihapus.', deleted: existing });
        } catch (err) {
            res.status(500).json({ error: 'Database Error', message: err.message });
        }
    });

    return router;
};
