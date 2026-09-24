// ============================================
// components/DashboardMonitoring.jsx
// ============================================
// Tab "Dashboard Monitoring" — SOC-style monitoring panel
// ZT toggle, risk gauge, statistik, dan real-time security logs

import { useState, useEffect, useRef } from 'react';
import { BarChartIcon, ShieldCheckIcon, ExternalLinkIcon } from './Icons';

// Helper formatting alasan evaluasi yang deskriptif dan mudah dipahami
function formatReason(log) {
    const rawReason = log.reason || '';
    const action = log.action;
    const score = log.riskScore ?? 0;

    if (action === 'BLOCKED') {
        if (rawReason.includes('Hard Violation') || rawReason.includes('BOLA')) {
            return (
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                    Pelanggaran Keras: BOLA Terdeteksi (Akses Lintas Wilayah Ditolak)
                </span>
            );
        }
        if (rawReason.includes('Soft Violation') || rawReason.includes('Threshold')) {
            return (
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                    Pelanggaran Kontekstual: Ambang Batas Risiko Terlampaui (≥50)
                </span>
            );
        }
        if (rawReason.includes('Blacklist')) {
            return (
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                    Token Di-Blacklist (Pelanggaran BOLA Sebelumnya)
                </span>
            );
        }
        if (rawReason.includes('Authorization') || rawReason.includes('Token')) {
            return (
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                    Kredensial Tidak Valid / Token Tidak Ditemukan
                </span>
            );
        }
        if (rawReason.includes('Policy Engine Unreachable')) {
            return (
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                    OPA Policy Engine Tidak Terhubung (Fail-Closed)
                </span>
            );
        }
        return <span style={{ color: '#b91c1c', fontWeight: 600 }}>{rawReason}</span>;
    }

    // Jika ALLOWED / DIIZINKAN
    if (rawReason.includes('Zero Trust Disabled') || rawReason.includes('Bypass')) {
        return <span style={{ color: '#64748b' }}>Bypass (Zero Trust Dinonaktifkan)</span>;
    }
    if (score === 0 || rawReason === 'None' || rawReason.includes('Normal Context')) {
        return (
            <span style={{ color: '#047857', fontWeight: 500 }}>
                Akses Sah (Identitas & Konteks Normal Terverifikasi)
            </span>
        );
    }
    return (
        <span style={{ color: '#b45309', fontWeight: 500 }}>
            Diizinkan: Anomali Kontekstual Rendah di Bawah Batas Toleransi (&lt;50)
        </span>
    );
}

// Helper rendering badge konteks dengan indikator warna dan bobot poin
function renderContextTags(log) {
    if (!log.contextFlags || log.contextFlags.length === 0) {
        return (
            <div className="context-tags">
                <span className="context-tag context-tag--success">Konteks Normal (Aman)</span>
            </div>
        );
    }

    return (
        <div className="context-tags">
            {log.contextFlags.map((flag, j) => {
                const label = typeof flag === 'object' ? flag.label : flag;
                const type = typeof flag === 'object' ? flag.type : 'info';
                return (
                    <span key={j} className={`context-tag context-tag--${type}`}>
                        {label}
                    </span>
                );
            })}
        </div>
    );
}

export default function DashboardMonitoring({ ztEnabled, onToggleZt, logs, onClearLogs, stats }) {
    const logEndRef = useRef(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // Auto-scroll ke log terbaru
    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll]);

    // Hitung statistik dari logs
    const allowed = logs.filter(l => l.action === 'ALLOWED').length;
    const blocked = logs.filter(l => l.action === 'BLOCKED').length;
    const latestScore = logs.length > 0 ? logs[logs.length - 1].riskScore : 0;
    const blacklisted = stats?.jwt_blacklisted || 0;

    // Risk gauge SVG
    const gaugeAngle = (latestScore / 100) * 180;
    const gaugeColor = latestScore < 30 ? '#0F7B3F' : latestScore < 50 ? '#E65100' : '#C62828';

    return (
        <div className="content--full">
            <h1 className="page-title">Dashboard Monitoring Keamanan</h1>
            <p className="page-subtitle">
                Pemantauan real-time terhadap evaluasi Zero Trust pada setiap permintaan API.
            </p>

            {/* ---- TOP CARDS ---- */}
            <div className="three-cards">
                {/* Card 1: ZT Status */}
                <div className="card">
                    <div className="card__header">Status Zero Trust</div>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div style={{ marginBottom: 12 }}>
                            <span className="text-sm text-muted">Mode Perlindungan</span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={ztEnabled}
                                onChange={onToggleZt}
                            />
                            <span className="toggle-switch__slider"></span>
                        </label>
                        <div style={{ marginTop: 12 }}>
                            <span className={`badge ${ztEnabled ? 'badge--success' : 'badge--danger'}`}
                                  style={{ fontSize: 12, padding: '4px 12px' }}>
                                {ztEnabled ? 'AKTIF' : 'NONAKTIF'}
                            </span>
                        </div>
                        <div className="text-sm text-muted mt-8">
                            {ztEnabled
                                ? 'Seluruh permintaan dievaluasi oleh OPA'
                                : 'Permintaan melewati tanpa evaluasi'}
                        </div>
                    </div>
                </div>

                {/* Card 2: Risk Score Gauge */}
                <div className="card">
                    <div className="card__header">Skor Risiko Terkini</div>
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <div className="risk-gauge">
                            <svg viewBox="0 0 160 90" width="160" height="90">
                                {/* Background arc */}
                                <path
                                    d="M 10 80 A 70 70 0 0 1 150 80"
                                    fill="none"
                                    stroke="#E8ECF0"
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                />
                                {/* Value arc */}
                                {latestScore > 0 && (
                                    <path
                                        d="M 10 80 A 70 70 0 0 1 150 80"
                                        fill="none"
                                        stroke={gaugeColor}
                                        strokeWidth="10"
                                        strokeLinecap="round"
                                        strokeDasharray={`${(gaugeAngle / 180) * 220} 220`}
                                    />
                                )}
                            </svg>
                            <div className={`risk-gauge__value ${
                                latestScore < 30 ? 'risk-gauge__value--low' :
                                latestScore < 50 ? 'risk-gauge__value--medium' :
                                'risk-gauge__value--high'
                            }`}>
                                {latestScore}
                            </div>
                        </div>
                        <div className="risk-gauge__label">
                            Skala 0 (aman) — 100 (berbahaya)
                        </div>
                        {logs.length > 0 && (
                            <div className="text-sm text-muted mt-8">
                                Terakhir: {logs[logs.length - 1].time}
                            </div>
                        )}
                    </div>
                </div>

                {/* Card 3: Statistics */}
                <div className="card">
                    <div className="card__header">Statistik Sesi</div>
                    <div style={{ padding: '12px 0' }}>
                        <div className="stats-row">
                            <span className="stats-row__label">Diizinkan</span>
                            <span className="stats-row__value" style={{ color: '#0F7B3F', fontSize: 20 }}>
                                {allowed}
                            </span>
                        </div>
                        <div className="stats-row">
                            <span className="stats-row__label">Diblokir</span>
                            <span className="stats-row__value" style={{ color: '#C62828', fontSize: 20 }}>
                                {blocked}
                            </span>
                        </div>
                        <div className="stats-row">
                            <span className="stats-row__label">Daftar Hitam JWT</span>
                            <span className="stats-row__value" style={{ color: '#E65100', fontSize: 20 }}>
                                {blacklisted}
                            </span>
                        </div>
                        <div className="stats-row">
                            <span className="stats-row__label">Total Permintaan</span>
                            <span className="stats-row__value" style={{ fontSize: 20 }}>
                                {logs.length}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ---- LOGS TABLE ---- */}
            <div className="log-section">
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="log-header">
                        <span className="log-header__title">Log Kejadian Keamanan Real-Time</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={autoScroll}
                                    onChange={e => setAutoScroll(e.target.checked)}
                                />
                                Auto-scroll
                            </label>
                            <button className="btn btn--secondary btn--sm" onClick={onClearLogs}>
                                Hapus Log
                            </button>
                            <a
                                href="http://localhost:3200"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn--secondary btn--sm"
                                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                title="Buka Grafana Monitoring Dashboard"
                            >
                                <BarChartIcon size={14} /> Grafana
                                <ExternalLinkIcon size={12} color="var(--color-text-muted)" />
                            </a>
                        </div>
                    </div>

                    {logs.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state__icon">
                                <ShieldCheckIcon size={42} color="var(--color-text-light)" />
                            </div>
                            <div className="empty-state__title">Belum ada log</div>
                            <div className="empty-state__desc">
                                Log akan muncul secara real-time saat ada permintaan ke API.
                            </div>
                        </div>
                    ) : (
                        <div className="data-table-wrapper" style={{ flex: 1, overflow: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 80 }}>Waktu</th>
                                        <th style={{ width: 110 }}>Alamat IP</th>
                                        <th style={{ width: 65 }}>Asal</th>
                                        <th style={{ width: 65 }}>Target</th>
                                        <th>Endpoint</th>
                                        <th style={{ width: 95 }}>Tindakan</th>
                                        <th style={{ width: 55 }}>Skor</th>
                                        <th style={{ minWidth: 240 }}>Alasan Evaluasi</th>
                                        <th style={{ minWidth: 160 }}>Konteks Keamanan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log, i) => (
                                        <tr key={i} className={log.action === 'BLOCKED' ? 'row--danger' : ''}>
                                            <td className="text-mono text-sm">{log.time}</td>
                                            <td className="text-mono text-sm">{log.ip}</td>
                                            <td className="text-mono text-sm">{log.tenantJwt || '-'}</td>
                                            <td className="text-mono text-sm">{log.tenantTarget || '-'}</td>
                                            <td className="text-mono text-sm" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {log.endpoint}
                                            </td>
                                            <td>
                                                <span className={`badge ${
                                                    log.action === 'BLOCKED' ? 'badge--danger' : 'badge--success'
                                                }`}>
                                                    {log.action === 'BLOCKED' ? 'DIBLOKIR' : 'DIIZINKAN'}
                                                </span>
                                            </td>
                                            <td className="text-mono text-sm" style={{ fontWeight: 600 }}>
                                                {log.riskScore}
                                            </td>
                                            <td className="text-sm">
                                                {formatReason(log)}
                                            </td>
                                            <td>
                                                {renderContextTags(log)}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr ref={logEndRef}><td colSpan={9} style={{ padding: 0, border: 'none' }} /></tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
