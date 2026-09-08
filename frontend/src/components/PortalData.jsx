// ============================================
// components/PortalData.jsx
// ============================================
// Tab "Portal Data" — Menampilkan data penduduk per wilayah
// Fitur: Filter provinsi/kab, tabel data, CRUD, dan tombol BOLA demo

import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:3001/api';

export default function PortalData({ token, tenantId, onBolaResult }) {
    // State: wilayah filter
    const [provinsiList, setProvinsiList] = useState([]);
    const [kabkotaList, setKabkotaList] = useState([]);
    const [selectedProv, setSelectedProv] = useState('');
    const [selectedKab, setSelectedKab] = useState(tenantId || '');

    // State: data penduduk
    const [penduduk, setPenduduk] = useState([]);
    const [namaWilayah, setNamaWilayah] = useState('');
    const [stats, setStats] = useState({ mampu: 0, menengah: 0, kurang_mampu: 0 });
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    // State: CRUD modal
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({ nik: '', nama: '', alamat: '', status_ekonomi: 'Mampu' });
    const [formError, setFormError] = useState('');

    // State: BOLA demo modal
    const [showBolaModal, setShowBolaModal] = useState(false);
    const [bolaTarget, setBolaTarget] = useState('');
    const [bolaLoading, setBolaLoading] = useState(false);
    const [bolaResult, setBolaResult] = useState(null);

    // State: delete confirm
    const [deleteTarget, setDeleteTarget] = useState(null);

    // ---- Load provinsi pada mount ----
    useEffect(() => {
        if (!token) return;
        fetch(`${API}/provinsi`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) setProvinsiList(data.data);
            })
            .catch(() => {});
    }, [token]);

    // ---- Set provinsi awal berdasarkan tenant ----
    useEffect(() => {
        if (tenantId && tenantId.length >= 2) {
            setSelectedProv(tenantId.substring(0, 2));
            setSelectedKab(tenantId);
        }
    }, [tenantId]);

    // ---- Load kab/kota saat provinsi berubah ----
    useEffect(() => {
        if (!selectedProv) {
            setKabkotaList([]);
            return;
        }
        fetch(`${API}/provinsi/${selectedProv}/kabkota`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) setKabkotaList(data.data);
            })
            .catch(() => {});
    }, [selectedProv]);

    // ---- Load data penduduk ----
    const loadPenduduk = useCallback((kabId) => {
        if (!kabId || !token) return;
        setLoading(true);
        fetch(`${API}/wilayah/${kabId}/penduduk`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    setPenduduk(data.data || []);
                    setNamaWilayah(data.nama_wilayah || kabId);
                    setStats(data.statistik || { mampu: 0, menengah: 0, kurang_mampu: 0 });
                } else {
                    setPenduduk([]);
                    setNamaWilayah(kabId);
                }
            })
            .catch(() => setPenduduk([]))
            .finally(() => setLoading(false));
    }, [token]);

    // ---- Load saat kab berubah (hanya untuk tenant sendiri) ----
    useEffect(() => {
        if (selectedKab === tenantId) {
            loadPenduduk(selectedKab);
        }
    }, [selectedKab, tenantId, loadPenduduk]);

    // ---- Handle filter apply ----
    const handleApplyFilter = () => {
        if (selectedKab) {
            loadPenduduk(selectedKab);
        }
    };

    // ---- Filter search ----
    const filteredData = penduduk.filter(p =>
        !search ||
        p.nama.toLowerCase().includes(search.toLowerCase()) ||
        p.nik.includes(search) ||
        p.alamat.toLowerCase().includes(search.toLowerCase())
    );

    // ---- CRUD: Tambah ----
    const handleAdd = () => {
        setModalMode('add');
        setFormData({ nik: '', nama: '', alamat: '', status_ekonomi: 'Mampu' });
        setFormError('');
        setEditItem(null);
        setShowModal(true);
    };

    // ---- CRUD: Edit ----
    const handleEdit = (item) => {
        setModalMode('edit');
        setFormData({
            nik: item.nik,
            nama: item.nama,
            alamat: item.alamat,
            status_ekonomi: item.status_ekonomi,
        });
        setFormError('');
        setEditItem(item);
        setShowModal(true);
    };

    // ---- CRUD: Submit (Add/Edit) ----
    const handleSubmit = async () => {
        if (!formData.nik || !formData.nama || !formData.alamat) {
            setFormError('Semua field wajib diisi.');
            return;
        }

        const targetKab = selectedKab || tenantId;
        const method = modalMode === 'add' ? 'POST' : 'PUT';
        const url = modalMode === 'add'
            ? `${API}/wilayah/${targetKab}/penduduk`
            : `${API}/wilayah/${targetKab}/penduduk/${editItem.id}`;

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });
            const data = await res.json();
            if (data.success) {
                setShowModal(false);
                loadPenduduk(targetKab);
            } else {
                setFormError(data.message || 'Gagal menyimpan data.');
            }
        } catch (err) {
            setFormError('Koneksi ke server gagal.');
        }
    };

    // ---- CRUD: Delete ----
    const handleDelete = async (item) => {
        const targetKab = selectedKab || tenantId;
        try {
            const res = await fetch(`${API}/wilayah/${targetKab}/penduduk/${item.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                loadPenduduk(targetKab);
            }
        } catch (err) {
            // ignore
        }
        setDeleteTarget(null);
    };

    // ---- BOLA Demo ----
    const handleBolaRequest = async () => {
        if (!bolaTarget || bolaTarget === tenantId) return;
        setBolaLoading(true);
        setBolaResult(null);

        const startTime = performance.now();
        try {
            const res = await fetch(`${API}/wilayah/${bolaTarget}/penduduk`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const latency = Math.round(performance.now() - startTime);
            const data = await res.json();
            const result = {
                status: res.status,
                latency,
                data,
                tenantJwt: tenantId,
                tenantTarget: bolaTarget,
                timestamp: new Date().toLocaleTimeString('id-ID'),
            };
            setBolaResult(result);
            if (onBolaResult) onBolaResult(result);
        } catch (err) {
            setBolaResult({ status: 0, error: 'Koneksi gagal', latency: 0 });
        }
        setBolaLoading(false);
    };

    return (
        <div className="app-main">
            {/* ---- SIDEBAR ---- */}
            <div className="sidebar">
                <div>
                    <div className="sidebar__section-title">Filter Wilayah</div>
                    <div className="form-group mb-12">
                        <label className="form-label">Provinsi</label>
                        <select
                            className="form-select"
                            value={selectedProv}
                            onChange={e => {
                                setSelectedProv(e.target.value);
                                setSelectedKab('');
                            }}
                        >
                            <option value="">-- Pilih Provinsi --</option>
                            {provinsiList.map(p => (
                                <option key={p.kode} value={p.kode}>{p.nama}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group mb-12">
                        <label className="form-label">Kabupaten/Kota</label>
                        <select
                            className="form-select"
                            value={selectedKab}
                            onChange={e => setSelectedKab(e.target.value)}
                        >
                            <option value="">-- Pilih Kab/Kota --</option>
                            {kabkotaList.map(k => (
                                <option key={k.kode} value={k.kode}>
                                    {k.nama} ({k.kode})
                                </option>
                            ))}
                        </select>
                    </div>
                    <button className="btn btn--primary btn--block" onClick={handleApplyFilter}>
                        Terapkan
                    </button>
                </div>

                {/* Ringkasan */}
                {penduduk.length > 0 && (
                    <div>
                        <div className="sidebar__section-title">Ringkasan Wilayah</div>
                        <div className="stats-row">
                            <span className="stats-row__label">Total Penduduk</span>
                            <span className="stats-row__value">{penduduk.length}</span>
                        </div>
                        <div className="stats-row">
                            <span className="stats-row__label">Mampu</span>
                            <span className="stats-row__value">{stats.mampu}</span>
                        </div>
                        <div className="stats-row">
                            <span className="stats-row__label">Menengah</span>
                            <span className="stats-row__value">{stats.menengah}</span>
                        </div>
                        <div className="stats-row">
                            <span className="stats-row__label">Kurang Mampu</span>
                            <span className="stats-row__value">{stats.kurang_mampu}</span>
                        </div>
                        <div className="text-sm text-muted mt-8">
                            Data per: {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                )}
            </div>

            {/* ---- MAIN CONTENT ---- */}
            <div className="content">
                <h1 className="page-title">Data Penduduk — {namaWilayah || 'Pilih Wilayah'}</h1>
                <p className="page-subtitle">
                    {penduduk.length > 0
                        ? `Menampilkan ${filteredData.length} dari ${penduduk.length} record`
                        : 'Pilih wilayah dan klik Terapkan untuk melihat data'}
                </p>

                {/* Toolbar */}
                <div className="toolbar">
                    <button className="btn btn--primary" onClick={handleAdd}>
                        Tambah Data
                    </button>
                    <input
                        className="form-input"
                        type="text"
                        placeholder="Cari nama, NIK, atau alamat..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <div className="toolbar__spacer" />
                    <button
                        className="btn btn--danger"
                        onClick={() => setShowBolaModal(true)}
                    >
                        Akses Wilayah Lain [BOLA Test]
                    </button>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="empty-state">
                        <div className="spinner" style={{ width: 24, height: 24 }} />
                        <p className="mt-12">Memuat data...</p>
                    </div>
                ) : filteredData.length > 0 ? (
                    <div className="data-table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 48 }}>No</th>
                                    <th>NIK</th>
                                    <th>Nama Lengkap</th>
                                    <th>Alamat</th>
                                    <th>Status Ekonomi</th>
                                    <th style={{ width: 100 }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.map((row, i) => (
                                    <tr key={row.id}>
                                        <td>{i + 1}</td>
                                        <td className="cell-nik">{row.nik}</td>
                                        <td>{row.nama}</td>
                                        <td>{row.alamat}</td>
                                        <td>
                                            <span className={`badge ${
                                                row.status_ekonomi === 'Mampu' ? 'badge--success' :
                                                row.status_ekonomi === 'Menengah' ? 'badge--warning' :
                                                'badge--danger'
                                            }`}>
                                                {row.status_ekonomi}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="cell-actions">
                                                <button
                                                    className="btn btn--secondary btn--sm"
                                                    onClick={() => handleEdit(row)}
                                                    title="Edit"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="btn btn--danger btn--sm"
                                                    onClick={() => setDeleteTarget(row)}
                                                    title="Hapus"
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="pagination">
                            <span>Halaman 1 dari 1</span>
                            <span>Menampilkan {filteredData.length} record</span>
                        </div>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state__icon">&#9744;</div>
                        <div className="empty-state__title">Tidak ada data</div>
                        <div className="empty-state__desc">
                            Pilih wilayah di sidebar dan klik Terapkan, atau tambahkan data baru.
                        </div>
                    </div>
                )}
            </div>

            {/* ---- MODAL: Add/Edit ---- */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <span className="modal__title">
                                {modalMode === 'add' ? 'Tambah Data Penduduk' : 'Edit Data Penduduk'}
                            </span>
                            <button className="modal__close" onClick={() => setShowModal(false)}>
                                &times;
                            </button>
                        </div>
                        <div className="modal__body">
                            {formError && <div className="alert alert--danger">{formError}</div>}
                            <div className="form-group">
                                <label className="form-label">NIK</label>
                                <input
                                    className="form-input"
                                    value={formData.nik}
                                    onChange={e => setFormData({ ...formData, nik: e.target.value })}
                                    placeholder="Nomor Induk Kependudukan"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Nama Lengkap</label>
                                <input
                                    className="form-input"
                                    value={formData.nama}
                                    onChange={e => setFormData({ ...formData, nama: e.target.value })}
                                    placeholder="Nama lengkap penduduk"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Alamat</label>
                                <input
                                    className="form-input"
                                    value={formData.alamat}
                                    onChange={e => setFormData({ ...formData, alamat: e.target.value })}
                                    placeholder="Alamat lengkap"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Status Ekonomi</label>
                                <select
                                    className="form-select"
                                    value={formData.status_ekonomi}
                                    onChange={e => setFormData({ ...formData, status_ekonomi: e.target.value })}
                                >
                                    <option value="Mampu">Mampu</option>
                                    <option value="Menengah">Menengah</option>
                                    <option value="Kurang Mampu">Kurang Mampu</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--secondary" onClick={() => setShowModal(false)}>
                                Batal
                            </button>
                            <button className="btn btn--primary" onClick={handleSubmit}>
                                {modalMode === 'add' ? 'Simpan' : 'Perbarui'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- MODAL: Delete Confirm ---- */}
            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <span className="modal__title">Konfirmasi Hapus</span>
                            <button className="modal__close" onClick={() => setDeleteTarget(null)}>
                                &times;
                            </button>
                        </div>
                        <div className="modal__body">
                            <div className="alert alert--warning">
                                Apakah Anda yakin ingin menghapus data penduduk
                                <strong> {deleteTarget.nama}</strong> (NIK: {deleteTarget.nik})?
                                Tindakan ini tidak dapat dibatalkan.
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--secondary" onClick={() => setDeleteTarget(null)}>
                                Batal
                            </button>
                            <button className="btn btn--danger-fill" onClick={() => handleDelete(deleteTarget)}>
                                Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- MODAL: BOLA Demo ---- */}
            {showBolaModal && (
                <div className="modal-overlay" onClick={() => { setShowBolaModal(false); setBolaResult(null); }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
                        <div className="modal__header">
                            <span className="modal__title">Akses Wilayah Lain [BOLA Test]</span>
                            <button className="modal__close" onClick={() => { setShowBolaModal(false); setBolaResult(null); }}>
                                &times;
                            </button>
                        </div>
                        <div className="modal__body">
                            <div className="alert alert--warning">
                                <strong>PERINGATAN:</strong> Anda akan mencoba mengakses data wilayah lain
                                menggunakan token JWT milik Anda (tenant {tenantId}).
                                Jika Zero Trust aktif, permintaan ini akan diblokir.
                            </div>
                            <div className="form-group">
                                <label className="form-label">Kode Wilayah Target</label>
                                <input
                                    className="form-input"
                                    value={bolaTarget}
                                    onChange={e => setBolaTarget(e.target.value)}
                                    placeholder="Masukkan kode wilayah target (misal: 3174)"
                                />
                                {bolaTarget && bolaTarget !== tenantId && (
                                    <div className="alert alert--danger mt-8" style={{ fontSize: 12 }}>
                                        Permintaan Lintas Wilayah Terdeteksi. JWT Tenant: {tenantId} — Target: {bolaTarget}
                                    </div>
                                )}
                            </div>

                            {bolaResult && (
                                <div>
                                    <div className={`http-status http-status--${bolaResult.status}`}
                                         style={{ marginBottom: 12 }}>
                                        {bolaResult.status} {bolaResult.status === 200 ? 'OK' :
                                            bolaResult.status === 403 ? 'FORBIDDEN' :
                                            bolaResult.status === 404 ? 'NOT FOUND' : 'ERROR'}
                                    </div>
                                    <div className="code-block">
                                        {JSON.stringify(bolaResult.data, null, 2)}
                                    </div>
                                    <div className="metrics-row mt-8">
                                        <div className="metrics-row__item">
                                            <span className="metrics-row__label">Latensi</span>
                                            <span className="metrics-row__value">{bolaResult.latency}ms</span>
                                        </div>
                                        <div className="metrics-row__item">
                                            <span className="metrics-row__label">Waktu</span>
                                            <span className="metrics-row__value">{bolaResult.timestamp}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--secondary" onClick={() => { setShowBolaModal(false); setBolaResult(null); }}>
                                Tutup
                            </button>
                            <button
                                className="btn btn--danger-fill"
                                onClick={handleBolaRequest}
                                disabled={!bolaTarget || bolaTarget === tenantId || bolaLoading}
                            >
                                {bolaLoading ? 'Mengirim...' : 'Kirim Permintaan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
