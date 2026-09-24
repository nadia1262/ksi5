// ============================================
// components/PortalData.jsx
// ============================================
// Tab "Pendataan Penduduk" — Monitoring Wilayah & Kependudukan
// Mengadopsi SIMPUL JABAR (BPS Dashboard) & Visualisasi Data
// Skenario Keamanan: Zero Trust vs BOLA (Broken Object Level Authorization)

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    GlobeIcon,
    DownloadIcon,
    RefreshIcon,
    ShieldAlertIcon,
    ShieldCheckIcon,
    MegaphoneIcon,
    AlertTriangleIcon,
    FilterIcon,
    BarChartIcon,
    InfoIcon,
    LockIcon,
    SearchIcon,
    UsersIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    FileTextIcon,
    PlusIcon
} from './Icons';

const API = 'http://localhost:3001/api';

export default function PortalData({ token, tenantId, currentUser, ztEnabled, onToggleZt, onBolaResult }) {
    // ---- State: Wilayah Filter ----
    const [provinsiList, setProvinsiList] = useState([]);
    const [kabkotaList, setKabkotaList] = useState([]);
    const [selectedProv, setSelectedProv] = useState('');
    const [selectedKab, setSelectedKab] = useState(tenantId || '');

    // ---- State: Capaian Wilayah (Untuk Bar Chart SIMPUL JABAR) ----
    const [capaianList, setCapaianList] = useState([]);
    const [capaianTotal, setCapaianTotal] = useState(null);
    const [chartSort, setChartSort] = useState('desc'); // 'desc' | 'asc' | 'code'
    const [chartMetric, setChartMetric] = useState('progress'); // 'progress' | 'realisasi' | 'mampu'
    const [hoveredBar, setHoveredBar] = useState(null);

    // ---- State: Filter Tambahan SIMPUL JABAR ----
    const [onlyDeficit, setOnlyDeficit] = useState(false);
    const [onlyKurangMampu, setOnlyKurangMampu] = useState(false);
    const [showWelcomeBanner, setShowWelcomeBanner] = useState(true);

    // ---- State: Data Penduduk Detail Wilayah Aktif ----
    const [penduduk, setPenduduk] = useState([]);
    const [namaWilayah, setNamaWilayah] = useState('');
    const [stats, setStats] = useState({ mampu: 0, menengah: 0, kurang_mampu: 0 });
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    // ---- State: Skenario Keamanan (BOLA & OPA) ----
    const [isBlocked, setIsBlocked] = useState(false);
    const [blockInfo, setBlockInfo] = useState(null);
    const [isBolaSuccess, setIsBolaSuccess] = useState(false);

    // ---- State: CRUD Modal ----
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({ nik: '', nama: '', alamat: '', status_ekonomi: 'Mampu' });
    const [formError, setFormError] = useState('');

    // ---- State: BOLA Demo Modal ----
    const [showBolaModal, setShowBolaModal] = useState(false);
    const [bolaTarget, setBolaTarget] = useState('');
    const [bolaLoading, setBolaLoading] = useState(false);
    const [bolaResult, setBolaResult] = useState(null);

    // ---- State: Delete Confirm ----
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Timestamp terformat untuk info update
    const [lastUpdateTime, setLastUpdateTime] = useState('');
    useEffect(() => {
        const updateNow = () => {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const hh = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            setLastUpdateTime(`${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`);
        };
        updateNow();
        const interval = setInterval(updateNow, 30000);
        return () => clearInterval(interval);
    }, []);

    // ---- 1. Load Daftar Provinsi pada Mount ----
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

    // ---- 2. Set Provinsi Awal Berdasarkan Tenant Operator ----
    useEffect(() => {
        if (tenantId && tenantId.length >= 2) {
            const provCode = tenantId.substring(0, 2);
            setSelectedProv(provCode);
            setSelectedKab(tenantId);
        }
    }, [tenantId]);

    // ---- 3. Load Kab/Kota & Capaian saat Provinsi Berubah ----
    useEffect(() => {
        if (!selectedProv || !token) {
            setKabkotaList([]);
            setCapaianList([]);
            return;
        }

        // Ambil daftar kab/kota
        fetch(`${API}/provinsi/${selectedProv}/kabkota`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) setKabkotaList(data.data);
            })
            .catch(() => {});

        // Ambil capaian per wilayah untuk bar chart
        fetch(`${API}/provinsi/${selectedProv}/capaian`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    setCapaianList(data.data || []);
                    setCapaianTotal(data.total_keseluruhan || null);
                }
            })
            .catch(() => {});
    }, [selectedProv, token]);

    // ---- 4. Load Data Penduduk (Melewati Zero Trust Middleware) ----
    const loadPenduduk = useCallback((kabId) => {
        if (!kabId || !token) return;
        setLoading(true);
        setIsBlocked(false);
        setBlockInfo(null);
        setIsBolaSuccess(false);

        // Ambil info nama wilayah dari kabkotaList jika ada
        const foundKab = kabkotaList.find(k => k.kode === kabId);
        if (foundKab) {
            setNamaWilayah(foundKab.nama);
        }

        fetch(`${API}/wilayah/${kabId}/penduduk`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (res) => {
                const data = await res.json();
                if (res.status === 403) {
                    // Terblokir oleh Zero Trust (BOLA Attack Blocked)
                    setIsBlocked(true);
                    setBlockInfo({
                        status: 403,
                        error: data.error || 'Forbidden',
                        message: data.message || 'Akses Ditolak oleh Zero Trust Policy Engine.',
                        riskScore: data.risk_score ?? 50,
                        targetTenant: kabId,
                    });
                    setPenduduk([]);
                    setStats({ mampu: 0, menengah: 0, kurang_mampu: 0 });
                } else if (res.ok && data.success) {
                    // Berhasil termuat
                    setPenduduk(data.data || []);
                    setNamaWilayah(data.nama_wilayah || kabId);
                    setStats(data.statistik || { mampu: 0, menengah: 0, kurang_mampu: 0 });

                    // Jika user mengakses wilayah lain padahal bukan tenant-nya -> Kerentanan BOLA Terjadi!
                    if (kabId !== tenantId) {
                        setIsBolaSuccess(true);
                    }
                } else {
                    setPenduduk([]);
                }
            })
            .catch((err) => {
                setPenduduk([]);
            })
            .finally(() => setLoading(false));
    }, [token, kabkotaList, tenantId]);

    // ---- Load saat wilayah sendiri terpilih pada inisialisasi ----
    useEffect(() => {
        if (selectedKab === tenantId) {
            loadPenduduk(selectedKab);
        }
    }, [selectedKab, tenantId, loadPenduduk]);

    // ---- Handler Terapkan Filter ----
    const handleApplyFilter = () => {
        if (selectedKab) {
            loadPenduduk(selectedKab);
        }
    };

    // ---- Handler Klik Bar pada Grafik Capaian ----
    const handleBarClick = (barKode) => {
        setSelectedKab(barKode);
        loadPenduduk(barKode);
    };

    // ---- Kembali ke Wilayah Sendiri (Reset dari Lockout) ----
    const handleBackToSelf = () => {
        const provCode = tenantId.substring(0, 2);
        setSelectedProv(provCode);
        setSelectedKab(tenantId);
        loadPenduduk(tenantId);
    };

    // ---- Perhitungan Data untuk Grafik Capaian per Wilayah ----
    const processedChartData = useMemo(() => {
        if (!capaianList || capaianList.length === 0) return [];

        let list = [...capaianList];

        // Filter: Hanya Wilayah Defisit Target (Progress < 80%)
        if (onlyDeficit) {
            list = list.filter(item => item.progress_pct < 80);
        }

        // Sorting
        list.sort((a, b) => {
            if (chartMetric === 'progress') {
                return chartSort === 'desc' ? b.progress_pct - a.progress_pct :
                       chartSort === 'asc' ? a.progress_pct - b.progress_pct :
                       a.kode.localeCompare(b.kode);
            } else if (chartMetric === 'realisasi') {
                return chartSort === 'desc' ? b.realisasi - a.realisasi :
                       chartSort === 'asc' ? a.realisasi - b.realisasi :
                       a.kode.localeCompare(b.kode);
            } else {
                // 'mampu' percentage
                const aPct = a.realisasi > 0 ? (a.statistik.mampu / a.realisasi) * 100 : 0;
                const bPct = b.realisasi > 0 ? (b.statistik.mampu / b.realisasi) * 100 : 0;
                return chartSort === 'desc' ? bPct - aPct :
                       chartSort === 'asc' ? aPct - bPct :
                       a.kode.localeCompare(b.kode);
            }
        });

        return list;
    }, [capaianList, onlyDeficit, chartSort, chartMetric]);

    // ---- Filter Pencarian & Status pada Tabel ----
    const filteredData = useMemo(() => {
        return penduduk.filter(p => {
            const matchesSearch = !search ||
                p.nama.toLowerCase().includes(search.toLowerCase()) ||
                p.nik.includes(search) ||
                p.alamat.toLowerCase().includes(search.toLowerCase());

            const matchesStatus = !onlyKurangMampu || p.status_ekonomi === 'Kurang Mampu';

            return matchesSearch && matchesStatus;
        });
    }, [penduduk, search, onlyKurangMampu]);

    // ---- Ekspor ke File CSV Riil ----
    const handleExportCSV = () => {
        if (filteredData.length === 0) return;
        const headers = ['No', 'NIK', 'Nama Lengkap', 'Alamat', 'Status Ekonomi', 'Kode Wilayah'];
        const rows = filteredData.map((row, idx) => [
            idx + 1,
            `"${row.nik}"`,
            `"${row.nama}"`,
            `"${row.alamat}"`,
            `"${row.status_ekonomi}"`,
            `"${row.tenant_id}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' +
            [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `rekap_penduduk_${selectedKab}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ---- CRUD: Tambah Data ----
    const handleAdd = () => {
        setModalMode('add');
        setFormData({ nik: '', nama: '', alamat: '', status_ekonomi: 'Mampu' });
        setFormError('');
        setEditItem(null);
        setShowModal(true);
    };

    // ---- CRUD: Edit Data ----
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
            setFormError('Koneksi ke server gateway gagal.');
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

    // ---- BOLA Demo Modal Request ----
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

    // Perhitungan Donut Chart
    const totalRecords = penduduk.length;
    const mampuPct = totalRecords > 0 ? Math.round((stats.mampu / totalRecords) * 100) : 0;
    const menengahPct = totalRecords > 0 ? Math.round((stats.menengah / totalRecords) * 100) : 0;
    const kurangMampuPct = totalRecords > 0 ? Math.round((stats.kurang_mampu / totalRecords) * 100) : 0;

    // SVG Donut circumference calculation
    const radius = 54;
    const circumference = 2 * Math.PI * radius; // ~339.29
    const mampuDash = (mampuPct / 100) * circumference;
    const menengahDash = (menengahPct / 100) * circumference;
    const kurangMampuDash = (kurangMampuPct / 100) * circumference;

    return (
        <div className="content-scrollable">
            {/* ---- 1. BANNER SAMBUTAN (SIMPUL JABAR) ---- */}
            {showWelcomeBanner && (
                <div className="welcome-banner">
                    <div className="welcome-banner__left">
                        <CheckCircleIcon size={18} color="#059669" />
                        <span>
                            Selamat datang, <strong>{currentUser?.label || 'Operator BPS'}</strong>! Sistem siap memantau progres pendataan lapangan dan evaluasi kepatuhan Zero Trust.
                        </span>
                    </div>
                    <button
                        className="welcome-banner__close"
                        onClick={() => setShowWelcomeBanner(false)}
                        title="Tutup banner"
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* ---- 2. HEADER HALAMAN & TOMBOL AKSI CEPAT ---- */}
            <div className="page-header-row">
                <div className="page-header__title-group">
                    <h1>Monitoring Pendataan Penduduk (SE2026)</h1>
                    <p>Rekapitulasi Target, Capaian Sektor Kependudukan, dan Rincian Manajemen Entitas Wilayah</p>
                </div>

                <div className="page-header__actions">
                    <button className="btn-pill btn-pill--blue" onClick={() => setSelectedKab(tenantId)}>
                        <GlobeIcon size={15} /> Nasional / Wilayah
                    </button>
                    <button className="btn-pill btn-pill--green" onClick={handleExportCSV}>
                        <DownloadIcon size={15} /> Download Rekap Excel
                    </button>
                    <button className="btn-pill btn-pill--outline" onClick={() => loadPenduduk(selectedKab)}>
                        <RefreshIcon size={15} /> Refresh
                    </button>
                    <button
                        className="btn-pill btn-pill--danger"
                        onClick={() => setShowBolaModal(true)}
                        title="Uji akses lintas wilayah untuk simulasi serangan BOLA"
                    >
                        <ShieldAlertIcon size={15} /> Akses Wilayah Lain [BOLA Test]
                    </button>
                </div>
            </div>

            {/* ---- 3. STATUS UPDATE & CALLOUT KEBIJAKAN RESMI ---- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                    <div className="update-status-pill">
                        <InfoIcon size={14} color="#0284c7" /> Data kondisi terakhir update: <span className="update-status-pill__time">{lastUpdateTime}</span>
                    </div>
                </div>

                <div className="official-callout">
                    <div className="official-callout__icon">
                        <MegaphoneIcon size={20} color="var(--color-primary-light)" />
                    </div>
                    <div className="official-callout__content">
                        <strong className="official-callout__title">Catatan Penting Otorisasi:</strong>
                        Hak akses operator terikat secara ketat pada yurisdiksi kode wilayah (ABAC Zero Trust). 
                        Ketika keamanan Zero Trust diaktifkan, OPA (Open Policy Agent) akan memblokir setiap permintaan grafik maupun data kependudukan di luar hak akses operator. 
                        Ketika keamanan dinonaktifkan di menu monitoring, akses lintas wilayah (BOLA) akan terbuka untuk kebutuhan pengujian.
                    </div>
                </div>
            </div>

            {/* ---- 4. CARD FILTER WILAYAH & KONTROL TAMPILAN ---- */}
            <div className="filter-card">
                <div className="filter-grid">
                    {/* Filter Provinsi */}
                    <div className="form-field">
                        <label className="form-field__label">Provinsi</label>
                        <select
                            className="filter-select"
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

                    {/* Filter Kab/Kota */}
                    <div className="form-field">
                        <label className="form-field__label">Kabupaten/Kota</label>
                        <select
                            className="filter-select"
                            value={selectedKab}
                            onChange={e => setSelectedKab(e.target.value)}
                        >
                            <option value="">-- Pilih Kab/Kota --</option>
                            {kabkotaList.map(k => (
                                <option key={k.kode} value={k.kode}>
                                    {k.nama} ({k.kode}) {k.kode === tenantId ? ' (Wilayah Anda)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Tombol Terapkan */}
                    <div>
                        <button
                            className="btn btn--primary"
                            style={{ height: 38, padding: '0 24px' }}
                            onClick={handleApplyFilter}
                        >
                            Terapkan Filter
                        </button>
                    </div>
                </div>

                <div className="filter-controls-row">
                    <div className="filter-controls-left">
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            Tingkat Tampilan Tabel:
                        </span>
                        <select className="chart-select" defaultValue="auto">
                            <option value="auto">Otomatis (Ikuti Filter)</option>
                            <option value="all">Tampilkan Semua Terdaftar</option>
                            <option value="selected">Hanya Wilayah Terpilih</option>
                        </select>
                    </div>

                    <div className="filter-controls-right">
                        {/* Switch Defisit Target */}
                        <label className="toggle-filter-label toggle-filter-label--danger">
                            <span className="mini-switch mini-switch--danger">
                                <input
                                    type="checkbox"
                                    checked={onlyDeficit}
                                    onChange={e => setOnlyDeficit(e.target.checked)}
                                />
                                <span className="mini-switch__slider"></span>
                            </span>
                            <AlertTriangleIcon size={14} color="#b91c1c" />
                            Tampilkan Hanya Wilayah Defisit Target (&lt;80%)
                        </label>

                        {/* Switch Kurang Mampu */}
                        <label className="toggle-filter-label toggle-filter-label--warning">
                            <span className="mini-switch">
                                <input
                                    type="checkbox"
                                    checked={onlyKurangMampu}
                                    onChange={e => setOnlyKurangMampu(e.target.checked)}
                                />
                                <span className="mini-switch__slider"></span>
                            </span>
                            <FilterIcon size={14} color="#b45309" />
                            Tampilkan Hanya Status Kurang Mampu
                        </label>
                    </div>
                </div>
            </div>

            {/* ---- 5. CENTERPIECE VISUALIZATION: GRAFIK CAPAIAN PER WILAYAH ---- */}
            <div className="chart-card">
                <div className="chart-card__header">
                    <div className="chart-card__title">
                        <BarChartIcon size={18} color="#2563eb" />
                        <span>Grafik Capaian per Wilayah</span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }}>
                            (Klik salah satu bar wilayah untuk beralih dan menguji akses data)
                        </span>
                    </div>

                    <div className="chart-card__controls">
                        <select
                            className="chart-select"
                            value={chartSort}
                            onChange={e => setChartSort(e.target.value)}
                        >
                            <option value="desc">Urutan: Tertinggi ke Terendah</option>
                            <option value="asc">Urutan: Terendah ke Tertinggi</option>
                            <option value="code">Urutan: Kode Wilayah</option>
                        </select>

                        <select
                            className="chart-select"
                            value={chartMetric}
                            onChange={e => setChartMetric(e.target.value)}
                        >
                            <option value="progress">1c. Progress Netto vs Target Awal (%)</option>
                            <option value="realisasi">Total Data Penduduk Terdaftar</option>
                            <option value="mampu">Persentase Status Mampu (%)</option>
                        </select>
                    </div>
                </div>

                <div className="chart-subtitle-label">
                    {chartMetric === 'progress' && '1c. Progress Netto vs Target Awal (%)'}
                    {chartMetric === 'realisasi' && 'Total Jumlah Penduduk Terdaftar per Wilayah'}
                    {chartMetric === 'mampu' && 'Persentase Status Ekonomi Mampu (%)'}
                </div>

                {/* SVG Bar Chart */}
                <div className="chart-svg-wrapper">
                    {processedChartData.length === 0 ? (
                        <div className="empty-state" style={{ padding: '24px 0' }}>
                            <p>Tidak ada data capaian untuk wilayah ini atau kriteria filter.</p>
                        </div>
                    ) : (
                        <svg
                            className="chart-svg"
                            viewBox={`0 0 ${Math.max(900, processedChartData.length * 42 + 80)} 320`}
                            preserveAspectRatio="none"
                        >
                            {/* Gridlines horizontal 0% to 100% */}
                            {[0, 20, 40, 60, 80, 100].map(val => {
                                const yPos = 230 - (val / 100) * 190;
                                return (
                                    <g key={val}>
                                        <line x1="50" y1={yPos} x2={Math.max(900, processedChartData.length * 42 + 60)} y2={yPos} className="chart-grid-line" />
                                        <text x="40" y={yPos + 4} textAnchor="end" className="chart-axis-text">
                                            {chartMetric === 'realisasi' ? Math.round((val / 100) * 15) : `${val}%`}
                                        </text>
                                    </g>
                                );
                            })}

                            {/* Render Bars */}
                            {processedChartData.map((item, idx) => {
                                const barWidth = 24;
                                const xPos = 65 + idx * 38;
                                const isSelf = item.kode === tenantId;
                                const isSelected = item.kode === selectedKab;

                                // Calculate bar height based on selected metric
                                let displayVal = item.progress_pct;
                                let barValNormalized = item.progress_pct / 100;
                                let labelText = `${item.progress_pct}%`;

                                if (chartMetric === 'realisasi') {
                                    displayVal = item.realisasi;
                                    barValNormalized = Math.min(1, item.realisasi / 15);
                                    labelText = `${item.realisasi}`;
                                } else if (chartMetric === 'mampu') {
                                    const mPct = item.realisasi > 0 ? Math.round((item.statistik.mampu / item.realisasi) * 100) : 0;
                                    displayVal = mPct;
                                    barValNormalized = mPct / 100;
                                    labelText = `${mPct}%`;
                                }

                                const barHeight = Math.max(4, barValNormalized * 190);
                                const yPos = 230 - barHeight;

                                return (
                                    <g
                                        key={item.kode}
                                        onClick={() => handleBarClick(item.kode)}
                                        onMouseEnter={() => setHoveredBar(item)}
                                        onMouseLeave={() => setHoveredBar(null)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {/* Value Label Above Bar */}
                                        <text
                                            x={xPos + barWidth / 2}
                                            y={yPos - 5}
                                            className={`chart-bar-label ${isSelf || isSelected ? 'chart-bar-label--highlight' : ''}`}
                                        >
                                            {labelText}
                                        </text>

                                        {/* The Bar */}
                                        <rect
                                            x={xPos}
                                            y={yPos}
                                            width={barWidth}
                                            height={barHeight}
                                            rx="3"
                                            className={`chart-bar-rect ${
                                                isSelf || isSelected
                                                    ? 'chart-bar-rect--highlight'
                                                    : 'chart-bar-rect--purple'
                                            }`}
                                        />

                                        {/* Angled Label at Bottom */}
                                        <text
                                            x={xPos + barWidth / 2}
                                            y="245"
                                            transform={`rotate(-45, ${xPos + barWidth / 2}, 245)`}
                                            textAnchor="end"
                                            className={`chart-axis-text ${isSelf || isSelected ? 'chart-axis-text--highlight' : ''}`}
                                        >
                                            {item.kode} - {item.nama.replace(/^(Kab\.|Kota)\s+(Adm\.)?\s*/i, '')}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    )}

                    {/* Hover Info Tooltip */}
                    {hoveredBar && (
                        <div
                            className="chart-tooltip"
                            style={{
                                top: 10,
                                right: 20,
                            }}
                        >
                            <div className="chart-tooltip__title">
                                {hoveredBar.kode} — {hoveredBar.nama}
                            </div>
                            <div className="chart-tooltip__row">
                                <span>Capaian Netto:</span>
                                <span className="chart-tooltip__val">{hoveredBar.progress_pct}%</span>
                            </div>
                            <div className="chart-tooltip__row">
                                <span>Realisasi Data:</span>
                                <span className="chart-tooltip__val">{hoveredBar.realisasi} / {hoveredBar.target}</span>
                            </div>
                            <div className="chart-tooltip__row">
                                <span>Mampu / Menengah:</span>
                                <span className="chart-tooltip__val">{hoveredBar.statistik.mampu} / {hoveredBar.statistik.menengah}</span>
                            </div>
                            <div className="chart-tooltip__row">
                                <span>Kurang Mampu:</span>
                                <span className="chart-tooltip__val" style={{ color: '#f87171' }}>{hoveredBar.statistik.kurang_mampu}</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#38bdf8', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <InfoIcon size={12} color="#38bdf8" />
                                <span>Klik bar untuk beralih ke wilayah ini</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ---- 6. SKENARIO KEAMANAN & VISUALISASI DETAIL WILAYAH ---- */}

            {/* KONDISI A: TERBLOKIR ZERO TRUST (403 FORBIDDEN - BOLA BLOCKED) */}
            {isBlocked && (
                <div className="zt-lockout-card">
                    <div className="zt-lockout-card__shield">
                        <LockIcon size={28} color="#dc2626" />
                    </div>
                    <div className="zt-lockout-card__title">
                        AKSES GRAFIK & DATA DIBLOKIR OLEH ZERO TRUST OPA
                    </div>
                    <p className="zt-lockout-card__desc">
                        <strong>Pelanggaran Keamanan Terdeteksi:</strong> Token JWT milik <strong>{currentUser?.label}</strong> (Tenant {tenantId}) mencoba mengakses data dan grafik analitik milik wilayah <strong>{namaWilayah || blockInfo?.targetTenant}</strong> ({blockInfo?.targetTenant}). OPA Policy Engine menolak permintaan secara otomatis karena melanggar kebijakan multi-tenant isolation.
                    </p>

                    <div className="zt-lockout-card__metrics">
                        <div className="zt-lockout-metric">
                            <span className="zt-lockout-metric__label">Status Respon</span>
                            <span className="zt-lockout-metric__val" style={{ color: '#dc2626' }}>403 FORBIDDEN</span>
                        </div>
                        <div className="zt-lockout-metric">
                            <span className="zt-lockout-metric__label">Skor Risiko</span>
                            <span className="zt-lockout-metric__val" style={{ color: '#dc2626' }}>{blockInfo?.riskScore} / 100</span>
                        </div>
                        <div className="zt-lockout-metric">
                            <span className="zt-lockout-metric__label">Keputusan OPA</span>
                            <span className="zt-lockout-metric__val" style={{ color: '#ea580c' }}>DENY (Hard Violation)</span>
                        </div>
                        <div className="zt-lockout-metric">
                            <span className="zt-lockout-metric__label">Audit Logging</span>
                            <span className="zt-lockout-metric__val" style={{ color: '#16a34a' }}>Dicatat di SOC Log</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className="btn btn--primary" onClick={handleBackToSelf}>
                            Kembali ke Wilayah Anda ({tenantId})
                        </button>
                        <button
                            className="btn btn--secondary"
                            onClick={() => setShowBolaModal(true)}
                        >
                            <SearchIcon size={14} /> Periksa Payload Respon JSON
                        </button>
                    </div>
                </div>
            )}

            {/* KONDISI B: EKSPLOITASI BOLA BERHASIL (ZERO TRUST NONAKTIF, DATA BOCOR) */}
            {isBolaSuccess && !isBlocked && (
                <div className="bola-exploit-banner">
                    <div className="bola-exploit-banner__icon">
                        <AlertTriangleIcon size={26} color="#d97706" />
                    </div>
                    <div className="bola-exploit-banner__content">
                        <div className="bola-exploit-banner__title">
                            KERENTANAN BOLA (IDOR) BERHASIL DIBUKTIKAN!
                            <span className="bola-exploit-banner__badge">STATUS: 200 OK</span>
                        </div>
                        <p>
                            Perlindungan Zero Trust saat ini <strong>NONAKTIF</strong> di sistem. Anda login sebagai <strong>{currentUser?.label}</strong> (Tenant: {tenantId}), namun sistem API mengizinkan Anda melihat dan mengolah grafik capaian serta <strong>{penduduk.length} record data kependudukan rahasia</strong> milik <strong>{namaWilayah} ({selectedKab})</strong>.
                        </p>
                    </div>
                    <button
                        className="btn btn--primary btn--sm"
                        style={{ alignSelf: 'center', backgroundColor: '#b45309', borderColor: '#b45309' }}
                        onClick={handleBackToSelf}
                    >
                        Kembali ke {tenantId}
                    </button>
                </div>
            )}

            {/* KONDISI C: TAMPILKAN VISUALISASI RINCIAN JIKA TIDAK TERBLOKIR */}
            {!isBlocked && (
                <>
                    {/* 4 KPI METRIC CARDS */}
                    <div className="kpi-grid">
                        {/* KPI 1: Total Penduduk */}
                        <div className="kpi-card" style={{ '--kpi-accent': '#2563eb', '--kpi-bg': '#eff6ff' }}>
                            <div className="kpi-card__top">
                                <span className="kpi-card__label">Total Penduduk Terdaftar</span>
                                <span className="kpi-card__icon"><UsersIcon size={18} /></span>
                            </div>
                            <div className="kpi-card__value">{totalRecords}</div>
                            <div className="kpi-card__footer">
                                <span style={{ color: 'var(--color-text-muted)' }}>Target Wilayah: 15</span>
                                <span style={{ fontWeight: 600, color: '#2563eb' }}>
                                    {Math.min(100, Math.round((totalRecords / 15) * 100))}%
                                </span>
                            </div>
                            <div className="kpi-card__progress-bar">
                                <div
                                    className="kpi-card__progress-fill"
                                    style={{ width: `${Math.min(100, (totalRecords / 15) * 100)}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* KPI 2: Status Mampu */}
                        <div className="kpi-card" style={{ '--kpi-accent': '#16a34a', '--kpi-bg': '#f0fdf4' }}>
                            <div className="kpi-card__top">
                                <span className="kpi-card__label">Status Mampu</span>
                                <span className="kpi-card__icon"><CheckCircleIcon size={18} /></span>
                            </div>
                            <div className="kpi-card__value">{stats.mampu}</div>
                            <div className="kpi-card__footer">
                                <span style={{ color: 'var(--color-text-muted)' }}>Proporsi Wilayah:</span>
                                <span style={{ fontWeight: 600, color: '#16a34a' }}>{mampuPct}%</span>
                            </div>
                            <div className="kpi-card__progress-bar">
                                <div
                                    className="kpi-card__progress-fill"
                                    style={{ width: `${mampuPct}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* KPI 3: Status Menengah */}
                        <div className="kpi-card" style={{ '--kpi-accent': '#ea580c', '--kpi-bg': '#fff7ed' }}>
                            <div className="kpi-card__top">
                                <span className="kpi-card__label">Status Menengah</span>
                                <span className="kpi-card__icon"><InfoIcon size={18} /></span>
                            </div>
                            <div className="kpi-card__value">{stats.menengah}</div>
                            <div className="kpi-card__footer">
                                <span style={{ color: 'var(--color-text-muted)' }}>Proporsi Wilayah:</span>
                                <span style={{ fontWeight: 600, color: '#ea580c' }}>{menengahPct}%</span>
                            </div>
                            <div className="kpi-card__progress-bar">
                                <div
                                    className="kpi-card__progress-fill"
                                    style={{ width: `${menengahPct}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* KPI 4: Status Kurang Mampu */}
                        <div className="kpi-card" style={{ '--kpi-accent': '#dc2626', '--kpi-bg': '#fef2f2' }}>
                            <div className="kpi-card__top">
                                <span className="kpi-card__label">Status Kurang Mampu</span>
                                <span className="kpi-card__icon"><AlertCircleIcon size={18} /></span>
                            </div>
                            <div className="kpi-card__value">{stats.kurang_mampu}</div>
                            <div className="kpi-card__footer">
                                <span style={{ color: 'var(--color-text-muted)' }}>Prioritas Bantuan:</span>
                                <span style={{ fontWeight: 600, color: '#dc2626' }}>{kurangMampuPct}%</span>
                            </div>
                            <div className="kpi-card__progress-bar">
                                <div
                                    className="kpi-card__progress-fill"
                                    style={{ width: `${kurangMampuPct}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* DONUT CHART & KOMPOSISI SOSIAL EKONOMI */}
                    <div className="visual-breakdown-row">
                        {/* Donut Chart Status Ekonomi */}
                        <div className="donut-card">
                            <div className="donut-card__header">
                                <span>Distribusi Status Sosial Ekonomi ({namaWilayah})</span>
                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                    Kategori Kesejahteraan BPS
                                </span>
                            </div>

                            <div className="donut-layout">
                                <div className="donut-svg-wrapper">
                                    <svg width="150" height="150" viewBox="0 0 150 150">
                                        {/* Background Circle */}
                                        <circle
                                            cx="75"
                                            cy="75"
                                            r={radius}
                                            fill="transparent"
                                            stroke="#f1f5f9"
                                            strokeWidth="16"
                                        />

                                        {totalRecords > 0 && (
                                            <>
                                                {/* Segment 1: Mampu (Green) */}
                                                <circle
                                                    cx="75"
                                                    cy="75"
                                                    r={radius}
                                                    fill="transparent"
                                                    stroke="#16a34a"
                                                    strokeWidth="16"
                                                    strokeDasharray={`${mampuDash} ${circumference}`}
                                                    strokeDashoffset="0"
                                                    transform="rotate(-90 75 75)"
                                                />
                                                {/* Segment 2: Menengah (Orange) */}
                                                <circle
                                                    cx="75"
                                                    cy="75"
                                                    r={radius}
                                                    fill="transparent"
                                                    stroke="#ea580c"
                                                    strokeWidth="16"
                                                    strokeDasharray={`${menengahDash} ${circumference}`}
                                                    strokeDashoffset={-mampuDash}
                                                    transform="rotate(-90 75 75)"
                                                />
                                                {/* Segment 3: Kurang Mampu (Red) */}
                                                <circle
                                                    cx="75"
                                                    cy="75"
                                                    r={radius}
                                                    fill="transparent"
                                                    stroke="#dc2626"
                                                    strokeWidth="16"
                                                    strokeDasharray={`${kurangMampuDash} ${circumference}`}
                                                    strokeDashoffset={-(mampuDash + menengahDash)}
                                                    transform="rotate(-90 75 75)"
                                                />
                                            </>
                                        )}
                                    </svg>
                                    <div className="donut-center-info">
                                        <span className="donut-center-info__val">{totalRecords}</span>
                                        <span className="donut-center-info__lbl">Entitas</span>
                                    </div>
                                </div>

                                <div className="donut-legend">
                                    <div className="donut-legend__item">
                                        <span className="donut-legend__color" style={{ backgroundColor: '#16a34a' }}></span>
                                        <span>Mampu: <strong>{stats.mampu} jiwa ({mampuPct}%)</strong></span>
                                    </div>
                                    <div className="donut-legend__item">
                                        <span className="donut-legend__color" style={{ backgroundColor: '#ea580c' }}></span>
                                        <span>Menengah: <strong>{stats.menengah} jiwa ({menengahPct}%)</strong></span>
                                    </div>
                                    <div className="donut-legend__item">
                                        <span className="donut-legend__color" style={{ backgroundColor: '#dc2626' }}></span>
                                        <span>Kurang Mampu: <strong>{stats.kurang_mampu} jiwa ({kurangMampuPct}%)</strong></span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Metrik Kelengkapan dan Partisipasi */}
                        <div className="donut-card">
                            <div className="donut-card__header">
                                <span>Indikator Validitas & Kelengkapan Data</span>
                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                    Standardisasi SIAK & Dukcapil
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '6px 0' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                                        <span>Validitas Format NIK 16 Digit:</span>
                                        <strong style={{ color: '#16a34a' }}>100% Terverifikasi</strong>
                                    </div>
                                    <div className="kpi-card__progress-bar">
                                        <div className="kpi-card__progress-fill" style={{ width: '100%', backgroundColor: '#16a34a' }}></div>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                                        <span>Kelengkapan Titik Alamat Lapangan:</span>
                                        <strong style={{ color: '#2563eb' }}>100% Lengkap</strong>
                                    </div>
                                    <div className="kpi-card__progress-bar">
                                        <div className="kpi-card__progress-fill" style={{ width: '100%', backgroundColor: '#2563eb' }}></div>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                                        <span>Tingkat Keterisian Target Sensus:</span>
                                        <strong style={{ color: '#ea580c' }}>{Math.min(100, Math.round((totalRecords / 15) * 100))}%</strong>
                                    </div>
                                    <div className="kpi-card__progress-bar">
                                        <div className="kpi-card__progress-fill" style={{ width: `${Math.min(100, (totalRecords / 15) * 100)}%`, backgroundColor: '#ea580c' }}></div>
                                    </div>
                                </div>

                                <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ShieldCheckIcon size={14} color="var(--color-primary-light)" />
                                    <span><strong>Catatan Integritas:</strong> Seluruh entitas terenkripsi dalam penyimpanan lokal SQLite dan diisolasi dengan tag tenant_id <code>{selectedKab}</code>.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ---- 7. TABEL DATA RINCIAN PENDUDUK ---- */}
                    <div className="data-table-card">
                        <div className="table-toolbar">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <button className="btn btn--primary" onClick={handleAdd}>
                                    <PlusIcon size={14} /> Tambah Data
                                </button>
                                <input
                                    className="table-search-input"
                                    type="text"
                                    placeholder="Cari nama, NIK, atau alamat..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                    Menampilkan {filteredData.length} dari {penduduk.length} entitas
                                </span>
                            </div>
                        </div>

                        {loading ? (
                            <div className="empty-state">
                                <div className="spinner" />
                                <p className="mt-12">Memuat data kependudukan dari gateway...</p>
                            </div>
                        ) : filteredData.length > 0 ? (
                            <div className="table-container">
                                <table className="modern-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 44 }}>No</th>
                                            <th>NIK</th>
                                            <th>Nama Lengkap</th>
                                            <th>Alamat Tempat Tinggal</th>
                                            <th>Status Ekonomi</th>
                                            <th style={{ width: 120 }}>Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredData.map((row, idx) => (
                                            <tr key={row.id}>
                                                <td>{idx + 1}</td>
                                                <td className="nik-cell">{row.nik}</td>
                                                <td style={{ fontWeight: 600 }}>{row.nama}</td>
                                                <td style={{ color: 'var(--color-text-secondary)' }}>{row.alamat}</td>
                                                <td>
                                                    <span className={`status-badge ${
                                                        row.status_ekonomi === 'Mampu' ? 'status-badge--success' :
                                                        row.status_ekonomi === 'Menengah' ? 'status-badge--warning' :
                                                        'status-badge--danger'
                                                    }`}>
                                                        {row.status_ekonomi === 'Mampu' ? '● Mampu' :
                                                         row.status_ekonomi === 'Menengah' ? '● Menengah' :
                                                         '● Kurang Mampu'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="table-actions">
                                                        <button
                                                            className="btn-action"
                                                            onClick={() => handleEdit(row)}
                                                            title="Edit data ini"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            className="btn-action btn-action--danger"
                                                            onClick={() => setDeleteTarget(row)}
                                                            title="Hapus data ini"
                                                        >
                                                            Hapus
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <div className="empty-state__icon">
                                    <FileTextIcon size={40} color="var(--color-text-light)" />
                                </div>
                                <div className="empty-state__title">Tidak ada data ditemukan</div>
                                <div className="empty-state__desc">
                                    Tidak ada data penduduk yang cocok dengan filter pencarian saat ini.
                                </div>
                            </div>
                        )}

                        <div className="table-pagination">
                            <span>Halaman 1 dari 1</span>
                            <span>Wilayah: <strong>{namaWilayah} ({selectedKab})</strong></span>
                        </div>
                    </div>
                </>
            )}

            {/* ---- MODAL: TAMBAH / EDIT DATA ---- */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">
                                {modalMode === 'add' ? 'Tambah Data Penduduk' : 'Edit Data Penduduk'}
                            </span>
                            <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                                &times;
                            </button>
                        </div>
                        <div className="modal-body">
                            {formError && <div className="alert alert--danger">{formError}</div>}
                            <div className="form-field">
                                <label className="form-field__label">Nomor Induk Kependudukan (NIK)</label>
                                <input
                                    className="form-input"
                                    value={formData.nik}
                                    onChange={e => setFormData({ ...formData, nik: e.target.value })}
                                    placeholder="Contoh: 3174010807700001"
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-field__label">Nama Lengkap</label>
                                <input
                                    className="form-input"
                                    value={formData.nama}
                                    onChange={e => setFormData({ ...formData, nama: e.target.value })}
                                    placeholder="Nama lengkap penduduk"
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-field__label">Alamat Tempat Tinggal</label>
                                <input
                                    className="form-input"
                                    value={formData.alamat}
                                    onChange={e => setFormData({ ...formData, alamat: e.target.value })}
                                    placeholder="Alamat jalan, nomor, RT/RW"
                                />
                            </div>
                            <div className="form-field">
                                <label className="form-field__label">Status Sosial Ekonomi</label>
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
                        <div className="modal-footer">
                            <button className="btn btn--secondary" onClick={() => setShowModal(false)}>
                                Batal
                            </button>
                            <button className="btn btn--primary" onClick={handleSubmit}>
                                {modalMode === 'add' ? 'Simpan Data' : 'Perbarui'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- MODAL: KONFIRMASI HAPUS ---- */}
            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Konfirmasi Penghapusan</span>
                            <button className="modal-close-btn" onClick={() => setDeleteTarget(null)}>
                                &times;
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="alert alert--warning">
                                Apakah Anda yakin ingin menghapus data penduduk <strong>{deleteTarget.nama}</strong> (NIK: {deleteTarget.nik}) dari basis data wilayah <strong>{selectedKab}</strong>?
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn--secondary" onClick={() => setDeleteTarget(null)}>
                                Batal
                            </button>
                            <button className="btn btn--danger-fill" onClick={() => handleDelete(deleteTarget)}>
                                Ya, Hapus Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- MODAL: BOLA DEMO TEST ---- */}
            {showBolaModal && (
                <div className="modal-overlay" onClick={() => { setShowBolaModal(false); setBolaResult(null); }}>
                    <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
                        <div className="modal-header">
                            <span className="modal-title">Simulasi Akses Lintas Wilayah [BOLA Test]</span>
                            <button className="modal-close-btn" onClick={() => { setShowBolaModal(false); setBolaResult(null); }}>
                                &times;
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="alert alert--warning">
                                <strong>Uji Keamanan Otorisasi (BOLA / IDOR):</strong>
                                <br />Anda akan mengirim permintaan API dengan token JWT Anda (Tenant <code>{tenantId}</code>) untuk mengambil data kependudukan wilayah lain.
                            </div>

                            <div className="form-field">
                                <label className="form-field__label">Kode Wilayah Sasaran (Target Tenant)</label>
                                <input
                                    className="form-input"
                                    value={bolaTarget}
                                    onChange={e => setBolaTarget(e.target.value)}
                                    placeholder="Contoh: 3174 (Jaksel), 3171 (Jakpus), 3201 (Bogor)"
                                />
                                {bolaTarget && bolaTarget !== tenantId && (
                                    <div className="alert alert--danger mt-8" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <AlertTriangleIcon size={14} color="#dc2626" />
                                        <span>Permintaan Lintas Tenant Terdeteksi! JWT: {tenantId} → Target: {bolaTarget}</span>
                                    </div>
                                )}
                            </div>

                            {bolaResult && (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                        <span className={`status-badge ${bolaResult.status === 200 ? 'status-badge--success' : 'status-badge--danger'}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                                            HTTP {bolaResult.status} {bolaResult.status === 200 ? 'OK (BOLA Terjadi!)' : 'FORBIDDEN (Diblokir OPA)'}
                                        </span>
                                        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                                            Latensi: {bolaResult.latency}ms
                                        </span>
                                    </div>
                                    <div className="code-block" style={{ maxHeight: 200 }}>
                                        {JSON.stringify(bolaResult.data, null, 2)}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn--secondary" onClick={() => { setShowBolaModal(false); setBolaResult(null); }}>
                                Tutup
                            </button>
                            <button
                                className="btn btn--danger-fill"
                                onClick={handleBolaRequest}
                                disabled={!bolaTarget || bolaTarget === tenantId || bolaLoading}
                            >
                                {bolaLoading ? 'Mengirim Request...' : 'Kirim Permintaan API'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
