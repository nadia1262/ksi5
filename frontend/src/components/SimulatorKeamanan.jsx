// ============================================
// components/SimulatorKeamanan.jsx
// ============================================
// Tab "Simulator Keamanan" — Konfigurasi request API manual
// untuk menguji Zero Trust middleware (hard + soft violation)

import { useState } from 'react';
import { ArrowRightLeftIcon, ShieldAlertIcon, ShieldCheckIcon } from './Icons';

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

export default function SimulatorKeamanan({ token, tenantId, users, onSelectUser, onLogin }) {
    const [targetEndpoint, setTargetEndpoint] = useState(`/api/wilayah/3174/penduduk`);
    const [simIp, setSimIp] = useState('');
    const [simTime, setSimTime] = useState('');
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState('');

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

    // Handle user switch
    const handleUserChange = (username) => {
        setSelectedUser(username);
        setResponse(null);
        if (onSelectUser) {
            onSelectUser(username);
        }
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

                    {/* Identitas Operator */}
                    <div className="form-group mb-12">
                        <label className="form-label">Identitas Operator</label>
                        <select
                            className="form-select"
                            value={selectedUser}
                            onChange={e => handleUserChange(e.target.value)}
                        >
                            <option value="">-- Pilih Operator --</option>
                            {users.map(u => (
                                <option key={u.username} value={u.username}>
                                    {u.label} ({u.tenant})
                                </option>
                            ))}
                        </select>
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
                        <label className="form-label">Target Endpoint</label>
                        <input
                            className="form-input text-mono"
                            value={targetEndpoint}
                            onChange={e => setTargetEndpoint(e.target.value)}
                            placeholder="/api/wilayah/{kode}/penduduk"
                        />
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
