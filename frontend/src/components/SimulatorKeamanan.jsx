// ============================================
// components/SimulatorKeamanan.jsx
// ============================================
// Tab "Simulator Keamanan" — Konfigurasi request API manual
// untuk menguji Zero Trust middleware (hard + soft violation)

import { useState, useEffect } from 'react';
import { ArrowRightLeftIcon, ShieldAlertIcon, ShieldCheckIcon, LockIcon } from './Icons';

const API = 'http://localhost:3001/api';

const IP_OPTIONS = [
    { value: '', label: 'IP Default (IP Asli)' },
    { value: 'random', label: 'IP Random (IP Baru)' },
];

const TIME_OPTIONS = [
    { value: '', label: '-- Waktu Sekarang --' },
    { value: '03:00', label: '03:00 — Dini Hari (di luar jam kerja)' },
    { value: '09:00', label: '09:00 — Pagi (jam kerja normal)' },
    { value: '14:00', label: '14:00 — Siang (jam kerja normal)' },
    { value: '22:00', label: '22:00 — Malam (di luar jam kerja)' },
];

export default function SimulatorKeamanan({ token, tenantId, currentUser, users = [] }) {
    const [targetEndpoint, setTargetEndpoint] = useState(() => `/api/wilayah/${tenantId || '3174'}/penduduk`);
    const [simIp, setSimIp] = useState('');
    const [simTime, setSimTime] = useState('');
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(false);

    // Sinkronisasi target endpoint saat tenant terautentikasi berubah
    useEffect(() => {
        if (tenantId) {
            setTargetEndpoint(`/api/wilayah/${tenantId}/penduduk`);
        }
    }, [tenantId]);

    // Data operator aktif yang terautentikasi
    const currentOperator = currentUser || users.find(u => u.tenant === tenantId) || {
        label: `Operator Wilayah (${tenantId})`,
        tenant: tenantId,
    };

    // Referensi kode tenant lain untuk skenario pengujian pelanggaran BOLA
    const referenceTenants = [
        ...users.filter(u => u.tenant !== tenantId).map(u => ({
            tenant: u.tenant,
            label: u.label,
            name: u.regionName || u.label,
        })),
        ...(tenantId !== '3173' && !users.some(u => u.tenant === '3173')
            ? [{ tenant: '3173', label: 'BPS Kota Adm. Jakarta Barat', name: 'Kota Adm. Jakarta Barat' }]
            : []),
        ...(tenantId !== '3273' && !users.some(u => u.tenant === '3273')
            ? [{ tenant: '3273', label: 'BPS Kota Bandung', name: 'Kota Bandung' }]
            : []),
    ];

    // Deteksi cross-tenant
    const urlTenant = (() => {
        const match = targetEndpoint.match(/\/wilayah\/(\d+)/);
        return match ? match[1] : null;
    })();
    const isCrossTenant = urlTenant && urlTenant !== tenantId;

    // Kirim request
    const handleSend = async () => {
        if (!token) return;
        setLoading(true);
        setResponse(null);

        const startTime = performance.now();
        try {
            const headers = { Authorization: `Bearer ${token}` };
            let finalIp = '';
            if (simIp === 'random') {
                finalIp = `110.50.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
                headers['X-Simulated-IP'] = finalIp;
            }
            if (simTime) headers['X-Simulated-Time'] = simTime;

            const url = `http://localhost:3001${targetEndpoint}`;
            const res = await fetch(url, { headers });
            const latency = Math.round(performance.now() - startTime);
            const data = await res.json();

            // Ekstrak skor risiko dari header jika belum ada di data json
            const headerScore = res.headers.get('x-risk-score');
            if (data && typeof data === 'object' && data.risk_score === undefined && headerScore !== null) {
                data.risk_score = parseInt(headerScore, 10);
            }

            setResponse({
                status: res.status,
                statusText: res.statusText,
                latency,
                data,
                headers: {
                    ip: finalIp || '(IP Default)',
                    time: simTime || new Date().toLocaleTimeString('id-ID'),
                },
                timestamp: new Date().toLocaleTimeString('id-ID'),
            });
        } catch (err) {
            setResponse({
                status: 0,
                statusText: 'CONNECTION ERROR',
                latency: 0,
                data: { error: 'Koneksi Gagal', message: err.message },
                timestamp: new Date().toLocaleTimeString('id-ID'),
            });
        }
        setLoading(false);
    };

    // Kirim serangan beruntun (Intruder)
    const handleIntruderAttack = async () => {
        if (!token) return;
        setLoading(true);
        setResponse(null);

        const startTime = performance.now();
        let lastRes, lastData;

        // Jika IP Random, buat satu IP baru untuk keseluruhan paket serangan burst ini
        let finalIp = '';
        if (simIp === 'random') {
            finalIp = `110.50.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
        }

        try {
            // Jalankan 15 request berturut-turut untuk trigger high-velocity (limit: >10 per 60s)
            for (let i = 0; i < 15; i++) {
                const headers = { Authorization: `Bearer ${token}` };
                if (finalIp) headers['X-Simulated-IP'] = finalIp;
                if (simTime) headers['X-Simulated-Time'] = simTime;

                const url = `http://localhost:3001${targetEndpoint}?burst=${i}`;
                lastRes = await fetch(url, { headers });
                lastData = await lastRes.json();
            }

            const latency = Math.round(performance.now() - startTime);
            const headerScore = lastRes?.headers.get('x-risk-score');
            if (lastData && typeof lastData === 'object' && lastData.risk_score === undefined && headerScore !== null) {
                lastData.risk_score = parseInt(headerScore, 10);
            }

            setResponse({
                status: lastRes.status,
                statusText: lastRes.statusText,
                latency,
                data: lastData,
                headers: {
                    ip: finalIp || '(IP Default)',
                    time: simTime || new Date().toLocaleTimeString('id-ID'),
                },
                timestamp: new Date().toLocaleTimeString('id-ID'),
            });
        } catch (err) {
            setResponse({
                status: 0,
                statusText: 'CONNECTION ERROR',
                latency: 0,
                data: { error: 'Koneksi Gagal saat Intruder Attack', message: err.message },
                timestamp: new Date().toLocaleTimeString('id-ID'),
            });
        }
        setLoading(false);
    };

    // Truncate JWT untuk tampilan
    const truncatedToken = token
        ? token.substring(0, 60) + '...' + token.substring(token.length - 20)
        : '(Belum login)';

    return (
        <div className="content--full">
            <h1 className="page-title">Simulator Keamanan API</h1>
            <p className="page-subtitle">
                Konfigurasi request secara manual untuk menguji middleware Zero Trust.
                Ubah target endpoint dan konteks untuk melihat respons evaluasi keamanan.
            </p>

            <div className="two-col" style={{ flex: 1, minHeight: 0 }}>
                {/* ---- LEFT: Request Config ---- */}
                <div className="card">
                    <div className="card__header">Konfigurasi Request</div>

                    {/* Identitas Operator (Default sesuai sesi yang terautentikasi) */}
                    <div className="form-group mb-12">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <label className="form-label" style={{ margin: 0 }}>Identitas Operator</label>
                            <span style={{ fontSize: 11, color: '#005F5F', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <LockIcon size={12} /> Sesi Terautentikasi
                            </span>
                        </div>
                        <div
                            className="form-input"
                            style={{
                                backgroundColor: 'var(--color-bg)',
                                color: 'var(--color-text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'default',
                                borderColor: 'var(--color-border)',
                                userSelect: 'none',
                            }}
                        >
                            <span style={{ fontWeight: 500 }}>
                                {currentOperator.label}
                            </span>
                            <span
                                style={{
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: 12,
                                    backgroundColor: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    color: '#005F5F',
                                    fontWeight: 600,
                                }}
                            >
                                Tenant: {tenantId}
                            </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                            Identitas dibuat default sesuai login saat ini. Pengujian pelanggaran akses tenant lain dilakukan dengan mengedit kode tenant pada <strong>Target Endpoint</strong>.
                        </div>
                    </div>

                    {/* JWT Token */}
                    <div className="form-group mb-12">
                        <label className="form-label">Token JWT (dari Keycloak)</label>
                        <textarea
                            className="form-textarea"
                            value={truncatedToken}
                            readOnly
                            rows={3}
                        />
                    </div>

                    {/* Target Endpoint */}
                    <div className="form-group mb-12">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <label className="form-label" style={{ margin: 0 }}>Target Endpoint</label>
                            {targetEndpoint !== `/api/wilayah/${tenantId}/penduduk` && (
                                <button
                                    type="button"
                                    onClick={() => setTargetEndpoint(`/api/wilayah/${tenantId}/penduduk`)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#005F5F',
                                        fontSize: 11.5,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        textDecoration: 'underline',
                                        padding: 0
                                    }}
                                    title="Kembalikan ke endpoint wilayah sendiri"
                                >
                                    ↺ Reset ke Wilayah Sendiri ({tenantId})
                                </button>
                            )}
                        </div>
                        <input
                            className="form-input text-mono"
                            value={targetEndpoint}
                            onChange={e => setTargetEndpoint(e.target.value)}
                            placeholder="/api/wilayah/{kode}/penduduk"
                        />

                        {/* Referensi Kode Tenant Lain untuk Uji Pelanggaran BOLA */}
                        <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: 'var(--color-bg)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
                                Referensi Kode Tenant Lain (Uji Pelanggaran BOLA):
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {referenceTenants.map(t => {
                                    const isActive = urlTenant === t.tenant;
                                    return (
                                        <button
                                            key={t.tenant}
                                            type="button"
                                            onClick={() => setTargetEndpoint(`/api/wilayah/${t.tenant}/penduduk`)}
                                            style={{
                                                cursor: 'pointer',
                                                fontSize: 11.5,
                                                padding: '4px 9px',
                                                borderRadius: 6,
                                                border: isActive ? '1px solid #FCA5A5' : '1px solid var(--color-border)',
                                                backgroundColor: isActive ? '#FEF2F2' : 'var(--color-surface)',
                                                color: isActive ? '#991B1B' : 'var(--color-text-primary)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 5,
                                                transition: 'all 0.15s ease'
                                            }}
                                            title={`Klik untuk mencoba akses wilayah ${t.name} (Kode: ${t.tenant})`}
                                        >
                                            <code style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                                                {t.tenant}
                                            </code>
                                            <span>— {t.name}</span>
                                            {isActive && (
                                                <span style={{ fontSize: 10, backgroundColor: '#FEE2E2', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                                                    Aktif di URL
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.4 }}>
                                Ketik manual kode tenant di atas pada <strong>Target Endpoint</strong> (atau klik salah satu tombol referensi), lalu klik <strong>Kirim Normal</strong> untuk menguji respons blokir Zero Trust.
                            </div>
                        </div>
                    </div>

                    {/* Cross-tenant warning */}
                    {isCrossTenant && (
                        <div className="alert alert--danger mb-12">
                            <strong>PERINGATAN:</strong> Permintaan Lintas Wilayah Terdeteksi.
                            <br />JWT Tenant: {tenantId} — Target URL: {urlTenant}
                        </div>
                    )}

                    {/* Simulasi Konteks */}
                    <div className="sidebar__section-title mb-8">Simulasi Konteks</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="mb-16">
                        <div className="form-group">
                            <label className="form-label">Alamat IP</label>
                            <select className="form-select" value={simIp} onChange={e => setSimIp(e.target.value)}>
                                {IP_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Waktu Akses</label>
                            <select className="form-select" value={simTime} onChange={e => setSimTime(e.target.value)}>
                                {TIME_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                        <button
                            className="btn btn--primary"
                            style={{ flex: 1 }}
                            onClick={handleSend}
                            disabled={!token || loading}
                        >
                            {loading ? 'Mengirim...' : 'Kirim Normal'}
                        </button>
                        <button
                            className="btn btn--danger-fill"
                            style={{ flex: 1 }}
                            onClick={handleIntruderAttack}
                            disabled={!token || loading}
                            title="Mengirim 15 request dalam hitungan detik untuk mentrigger 'Velocity Exceeded'"
                        >
                            <ShieldAlertIcon size={15} />
                            {loading ? 'Menyerang...' : 'Serangan Intruder (15x)'}
                        </button>
                    </div>
                </div>

                {/* ---- RIGHT: Response ---- */}
                <div className="card">
                    <div className="card__header">Respons Server</div>

                    {!response ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">
                                <ArrowRightLeftIcon size={40} color="var(--color-text-light)" />
                            </div>
                            <div className="empty-state__title">Belum ada respons</div>
                            <div className="empty-state__desc">
                                Konfigurasikan request di sebelah kiri dan klik Kirim Permintaan.
                            </div>
                        </div>
                    ) : (
                        <div>
                            {/* HTTP Status */}
                            <div style={{ marginBottom: 12 }}>
                                <span className="text-sm text-muted">Hasil Evaluasi Zero Trust</span>
                            </div>
                            <div className={`http-status http-status--${response.status}`} style={{ marginBottom: 16 }}>
                                {response.status} {response.status === 200 ? 'OK' :
                                    response.status === 403 ? 'FORBIDDEN' :
                                    response.status === 404 ? 'NOT FOUND' :
                                    response.status === 500 ? 'SERVER ERROR' : 'ERROR'}
                            </div>

                            {/* OPA Decision */}
                            {response.data?.error === 'Forbidden' && (
                                <div className="alert alert--danger mb-12">
                                    <strong>Keputusan OPA: TOLAK</strong> — {response.data.message}
                                </div>
                            )}
                            {response.status === 200 && (
                                <div className="alert alert--success mb-12">
                                    <strong>Keputusan OPA: IZINKAN</strong> — {response.data?.risk_score > 0
                                        ? `Diizinkan (Terdeteksi anomali kontekstual rendah: Skor ${response.data.risk_score}/50)`
                                        : 'Permintaan dianggap aman (Konteks Normal).'}
                                </div>
                            )}

                            {/* JSON Response */}
                            <div className="code-block" style={{ maxHeight: 280, overflow: 'auto' }}>
                                {JSON.stringify(response.data, null, 2)}
                            </div>

                            {/* Metrics */}
                            <div className="metrics-row mt-12">
                                <div className="metrics-row__item">
                                    <span className="metrics-row__label">Latensi</span>
                                    <span className="metrics-row__value">{response.latency}ms</span>
                                </div>
                                <div className="metrics-row__item">
                                    <span className="metrics-row__label">Skor Risiko</span>
                                    <span className="metrics-row__value">
                                        {response.data?.risk_score !== undefined ? `${response.data.risk_score}/100` : '-'}
                                    </span>
                                </div>
                                <div className="metrics-row__item">
                                    <span className="metrics-row__label">Waktu</span>
                                    <span className="metrics-row__value">{response.timestamp}</span>
                                </div>
                            </div>

                            {/* Contextual Violation Badges */}
                            {response.data?.context && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                                    {response.data.context.is_new_ip && (
                                        <span className="badge badge--warning">IP Baru (+20)</span>
                                    )}
                                    {response.data.context.is_off_hours && (
                                        <span className="badge badge--warning">Luar Jam Kerja (+10)</span>
                                    )}
                                    {response.data.context.is_high_velocity && (
                                        <span className="badge badge--danger">High Velocity (+15)</span>
                                    )}
                                </div>
                            )}

                            {/* Blacklist note */}
                            {response.data?.risk_score >= 50 && (
                                <div className="alert alert--info mt-12" style={{ fontSize: 12 }}>
                                    Token JWT dimasukkan ke daftar hitam Redis selama 1 jam.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
