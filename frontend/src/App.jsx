// ============================================
// App.jsx - SIDAPTOR Main Application
// ============================================
// Sistem Data Penduduk Terintegrasi
// Theme: SIMPUL JABAR (BPS Enterprise Dashboard)
// Arsitektur Zero Trust & Mitigasi Kerentanan BOLA

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import PortalData from './components/PortalData';
import SimulatorKeamanan from './components/SimulatorKeamanan';
import DashboardMonitoring from './components/DashboardMonitoring';
import {
    BuildingIcon,
    ShieldIcon,
    RadioTowerIcon,
    BarChartIcon,
    MapIcon,
    ClockIcon,
    TrendingUpIcon,
    AlertTriangleIcon,
    ScaleIcon,
    MenuIcon,
    LogoutIcon
} from './components/Icons';
import './App.css';

const BACKEND_URL = 'http://localhost:3001';
const KEYCLOAK_URL = 'http://localhost:8080';
const REALM = 'zt-realm';

// Daftar user operator yang terdaftar di Keycloak
const USERS = [
    { username: 'operator-jaksel', password: 'password', tenant: '3174', label: 'BPS Kota Adm. Jakarta Selatan', regionName: 'Kota Adm. Jakarta Selatan' },
    { username: 'operator-jakpus', password: 'password', tenant: '3171', label: 'BPS Kota Adm. Jakarta Pusat', regionName: 'Kota Adm. Jakarta Pusat' },
    { username: 'operator-bogor', password: 'password', tenant: '3201', label: 'BPS Kab. Bogor', regionName: 'Kab. Bogor' },
];

export default function App() {
    // ---- Auth State ----
    const [token, setToken] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const [loginUser, setLoginUser] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    // ---- App State ----
    const [activeTab, setActiveTab] = useState('portal');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [ztEnabled, setZtEnabled] = useState(true);
    const [securityLogs, setSecurityLogs] = useState([]);
    const [serverStats, setServerStats] = useState({});
    const [connected, setConnected] = useState(false);

    // ---- Socket ref ----
    const socketRef = useRef(null);

    // ============================================
    // WebSocket Setup
    // ============================================
    useEffect(() => {
        const socket = io(BACKEND_URL);
        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));

        // ZT status dari server
        socket.on('zt-status', (data) => {
            setZtEnabled(data.enabled);
        });

        // Security event dari Zero Trust Middleware
        socket.on('security-log', (event) => {
            const contextFlags = [];

            // 1. Deteksi BOLA / Hard Violation
            const isHardMismatch = event.source_tenant && event.target_tenant &&
                event.source_tenant !== event.target_tenant &&
                event.source_tenant !== 'N/A' &&
                event.source_tenant !== 'Unknown';

            if (event.action === 'BLOCKED' && (
                event.reason?.includes('Hard Violation') ||
                event.reason?.includes('BOLA') ||
                isHardMismatch
            )) {
                contextFlags.push({ label: 'Tenant Mismatch / BOLA (+50)', type: 'danger' });
            }

            if (event.reason?.includes('Blacklist')) {
                contextFlags.push({ label: 'JWT Blacklisted', type: 'danger' });
            }

            // 2. Sinyal Kontekstual (Soft Violation)
            if (event.context?.is_new_ip) {
                contextFlags.push({ label: 'IP Baru (+20)', type: 'warning' });
            }
            if (event.context?.is_off_hours) {
                contextFlags.push({ label: 'Luar Jam Kerja (+10)', type: 'warning' });
            }
            if (event.context?.is_high_velocity) {
                contextFlags.push({ label: 'Frekuensi Tinggi (+15)', type: 'danger' });
            }

            // 3. Bypass ZT
            if (event.reason?.includes('Zero Trust Disabled') || event.reason?.includes('Bypass')) {
                contextFlags.push({ label: 'Bypass (ZT Nonaktif)', type: 'info' });
            }

            // 4. Jika kondisi bersih / normal (tanpa anomali)
            if (contextFlags.length === 0) {
                contextFlags.push({ label: 'Konteks Normal (Aman)', type: 'success' });
            }

            const log = {
                time: new Date().toLocaleTimeString('id-ID'),
                ip: event.ip || '-',
                tenantJwt: event.source_tenant || '-',
                tenantTarget: event.target_tenant || '-',
                endpoint: event.target_endpoint || '-',
                action: event.action || 'ALLOWED',
                riskScore: event.risk_score ?? 0,
                reason: event.reason || '',
                contextFlags,
            };
            setSecurityLogs(prev => [...prev, log]);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    // ---- Fetch server stats periodically ----
    useEffect(() => {
        const fetchStats = () => {
            fetch(`${BACKEND_URL}/api/stats`)
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data) setServerStats(data); })
                .catch(() => {});
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    // ============================================
    // Login via Keycloak
    // ============================================
    const handleLogin = useCallback(async (username) => {
        const user = USERS.find(u => u.username === username);
        if (!user) return;

        setLoginLoading(true);
        setLoginError('');

        try {
            const params = new URLSearchParams({
                grant_type: 'password',
                client_id: 'zt-client',
                username: user.username,
                password: user.password,
            });

            const res = await fetch(
                `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params,
                }
            );

            if (!res.ok) {
                throw new Error(`Login gagal (HTTP ${res.status}). Pastikan Keycloak berjalan di ${KEYCLOAK_URL}.`);
            }

            const data = await res.json();
            setToken(data.access_token);
            setCurrentUser(user);
            setLoginError('');
        } catch (err) {
            setLoginError(err.message);
        }
        setLoginLoading(false);
    }, []);

    const handleLoginSubmit = () => {
        if (loginUser) handleLogin(loginUser);
    };

    // ============================================
    // Logout
    // ============================================
    const handleLogout = () => {
        setToken('');
        setCurrentUser(null);
        setLoginUser('');
        setSecurityLogs([]);
    };

    // ============================================
    // Toggle Zero Trust
    // ============================================
    const handleToggleZt = async () => {
        try {
            await fetch(`${BACKEND_URL}/api/toggle-zt`, { method: 'POST' });
        } catch (err) {
            // ignore — status akan datang via WebSocket
        }
    };

    const handleClearLogs = () => setSecurityLogs([]);

    // ============================================
    // LOGIN PAGE
    // ============================================
    if (!token || !currentUser) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div className="login-card__header">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                            <div className="sidebar-brand__logo" style={{ width: 44, height: 44, fontSize: 22 }}>
                                S
                            </div>
                            <h1 style={{ margin: 0 }}>SIDAPTOR</h1>
                        </div>
                        <p>Sistem Data Penduduk Terintegrasi — BPS Zero Trust Gateway</p>
                    </div>
                    <div className="login-card__body">
                        {loginError && (
                            <div className="alert alert--danger">{loginError}</div>
                        )}
                        <div className="form-field">
                            <label className="form-field__label">Pilih Identitas Operator</label>
                            <select
                                className="form-select"
                                value={loginUser}
                                onChange={e => setLoginUser(e.target.value)}
                            >
                                <option value="">-- Pilih Akun Operator BPS --</option>
                                {USERS.map(u => (
                                    <option key={u.username} value={u.username}>
                                        {u.label} (Kode Tenant: {u.tenant})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-field">
                            <label className="form-field__label">Kata Sandi (Keycloak Realm)</label>
                            <input
                                className="form-input"
                                type="password"
                                value="password"
                                readOnly
                                style={{ color: 'var(--color-text-muted)', backgroundColor: '#f8fafc' }}
                            />
                            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                Kata sandi default PoC: <code>password</code>
                            </span>
                        </div>
                    </div>
                    <div className="login-card__footer">
                        <button
                            className="btn btn--primary"
                            style={{ width: '100%', height: 42, fontSize: 14 }}
                            onClick={handleLoginSubmit}
                            disabled={!loginUser || loginLoading}
                        >
                            {loginLoading ? 'Memverifikasi ke Keycloak...' : 'Masuk ke Sistem'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================
    // MAIN APP LAYOUT (SIMPUL JABAR Redesign)
    // ============================================
    return (
        <div className="app-layout">
            {/* ---- LEFT SIDEBAR ---- */}
            <aside className={`app-sidebar ${sidebarCollapsed ? 'app-sidebar--collapsed' : ''}`}>
                {/* Brand */}
                <div className="sidebar-brand">
                    <div className="sidebar-brand__logo">S</div>
                    {!sidebarCollapsed && (
                        <div className="sidebar-brand__text">
                            <div className="sidebar-brand__title">SIDAPTOR</div>
                            <div className="sidebar-brand__subtitle">MONITORING BPS</div>
                        </div>
                    )}
                </div>

                {/* Sidebar Navigation Menu */}
                <div className="sidebar-menu">
                    <div className="sidebar-section-title">
                        {!sidebarCollapsed && 'MONITORING'}
                    </div>

                    {/* Menu Item 1: Pendataan Penduduk (Portal Data) */}
                    <button
                        className={`sidebar-item ${activeTab === 'portal' ? 'sidebar-item--active' : ''}`}
                        onClick={() => setActiveTab('portal')}
                        title="Pendataan Penduduk"
                    >
                        <span className="sidebar-item__icon"><BuildingIcon size={17} /></span>
                        {!sidebarCollapsed && (
                            <>
                                <span className="sidebar-item__text">Pendataan Penduduk</span>
                            </>
                        )}
                    </button>

                    {/* Menu Item 2: Simulator Keamanan */}
                    <button
                        className={`sidebar-item ${activeTab === 'simulator' ? 'sidebar-item--active' : ''}`}
                        onClick={() => setActiveTab('simulator')}
                        title="Simulator Keamanan API"
                    >
                        <span className="sidebar-item__icon"><ShieldIcon size={17} /></span>
                        {!sidebarCollapsed && (
                            <>
                                <span className="sidebar-item__text">Simulator Keamanan</span>
                                <span className="sidebar-item__badge">API</span>
                            </>
                        )}
                    </button>

                    {/* Menu Item 3: Dashboard Monitoring & SOC */}
                    <button
                        className={`sidebar-item ${activeTab === 'monitoring' ? 'sidebar-item--active' : ''}`}
                        onClick={() => setActiveTab('monitoring')}
                        title="Dashboard Monitoring SOC"
                    >
                        <span className="sidebar-item__icon"><RadioTowerIcon size={17} /></span>
                        {!sidebarCollapsed && (
                            <>
                                <span className="sidebar-item__text">Monitoring & SOC</span>
                                <span className="sidebar-item__badge" style={{ backgroundColor: ztEnabled ? '#15803d' : '#b91c1c' }}>
                                    {ztEnabled ? 'ZT: ON' : 'ZT: OFF'}
                                </span>
                            </>
                        )}
                    </button>

                    {/* Enterprise BPS Menu Items (Authentic SIMPUL JABAR Reference Items) */}
                    {!sidebarCollapsed && (
                        <>
                            <div className="sidebar-section-title">ANALISIS & REKAP</div>
                            <button className="sidebar-item" onClick={() => setActiveTab('portal')} title="Analisis Sosek Kependudukan">
                                <span className="sidebar-item__icon"><BarChartIcon size={17} /></span>
                                <span className="sidebar-item__text">SE UMKM dan Sosek</span>
                            </button>
                            <button className="sidebar-item" onClick={() => setActiveTab('portal')} title="Peta Sebaran Pendataan">
                                <span className="sidebar-item__icon"><MapIcon size={17} /></span>
                                <span className="sidebar-item__text">Peta Pendataan</span>
                            </button>
                            <button className="sidebar-item" onClick={() => setActiveTab('portal')} title="Monitoring Kecepatan Petugas">
                                <span className="sidebar-item__icon"><ClockIcon size={17} /></span>
                                <span className="sidebar-item__text">Monitoring Pace Mikro</span>
                            </button>
                            <button className="sidebar-item" onClick={() => setActiveTab('portal')} title="Evaluasi Capaian Wilayah">
                                <span className="sidebar-item__icon"><TrendingUpIcon size={17} /></span>
                                <span className="sidebar-item__text">Kontrak Kinerja SE</span>
                            </button>

                            <div className="sidebar-section-title">AUDIT KEAMANAN</div>
                            <button className="sidebar-item" onClick={() => setActiveTab('monitoring')} title="Deteksi Anomali BOLA">
                                <span className="sidebar-item__icon"><AlertTriangleIcon size={17} /></span>
                                <span className="sidebar-item__text">Anomali Akses BOLA</span>
                            </button>
                            <button className="sidebar-item" onClick={() => setActiveTab('monitoring')} title="Log Kepatuhan OPA Zero Trust">
                                <span className="sidebar-item__icon"><ScaleIcon size={17} /></span>
                                <span className="sidebar-item__text">Audit OPA Rego</span>
                            </button>
                        </>
                    )}
                </div>

                {/* Sidebar Footer */}
                <div className="sidebar-footer">
                    {!sidebarCollapsed ? (
                        <>
                            <div className="sidebar-footer__tenant">
                                <span>Yurisdiksi Operator:</span>
                                <span className="sidebar-footer__badge">{currentUser.tenant}</span>
                            </div>
                            <div className="sidebar-footer__tenant" style={{ fontSize: 10.5 }}>
                                <span>Zero Trust Policy:</span>
                                <span style={{ color: ztEnabled ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                                    {ztEnabled ? '● AKTIF (OPA)' : '○ NONAKTIF'}
                                </span>
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', color: '#38bdf8', fontSize: 12, fontWeight: 700 }}>
                            {currentUser.tenant}
                        </div>
                    )}
                </div>
            </aside>

            {/* ---- MAIN AREA (Top Header + Content + Status Bar) ---- */}
            <div className="app-main-wrapper">
                {/* Top Header Bar */}
                <header className="top-header">
                    <div className="top-header__left">
                        <button
                            className="top-header__toggle-btn"
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            title="Buka/Tutup Sidebar"
                        >
                            <MenuIcon size={18} />
                        </button>
                        <div className="top-header__system-title">
                            <span>Sistem Monitoring Progress Pendataan Lapangan & Keamanan Terintegrasi</span>
                        </div>
                    </div>

                    <div className="top-header__right">
                        {/* Quick Zero Trust Indicator & Switch */}
                        <button
                            className="btn-pill btn-pill--outline"
                            onClick={handleToggleZt}
                            title="Klik untuk Toggle Zero Trust secara instan"
                            style={{
                                borderColor: ztEnabled ? '#bbf7d0' : '#fecaca',
                                backgroundColor: ztEnabled ? '#f0fdf4' : '#fef2f2',
                                color: ztEnabled ? '#15803d' : '#b91c1c',
                                padding: '4px 12px',
                                fontSize: 11.5,
                            }}
                        >
                            <span className={`status-dot ${ztEnabled ? 'status-dot--green' : 'status-dot--red'}`} />
                            Zero Trust: <strong>{ztEnabled ? 'AKTIF' : 'NONAKTIF'}</strong>
                        </button>

                        {/* Operator Badge */}
                        <div className="operator-badge">
                            <span className="operator-badge__dot" />
                            <span>{currentUser.label}</span>
                        </div>

                        {/* Tenant Badge */}
                        <div className="tenant-pill">
                            Wilayah: <strong>{currentUser.tenant}</strong>
                        </div>

                        {/* Logout Button */}
                        <button className="logout-btn" onClick={handleLogout} title="Keluar dari sesi">
                            <LogoutIcon size={14} /> Logout
                        </button>
                    </div>
                </header>

                {/* Tab Content Display */}
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {activeTab === 'portal' && (
                        <PortalData
                            token={token}
                            tenantId={currentUser.tenant}
                            currentUser={currentUser}
                            ztEnabled={ztEnabled}
                            onToggleZt={handleToggleZt}
                        />
                    )}

                    {activeTab === 'simulator' && (
                        <div className="content-scrollable">
                            <SimulatorKeamanan
                                token={token}
                                tenantId={currentUser.tenant}
                                users={USERS}
                                onSelectUser={(username) => handleLogin(username)}
                            />
                        </div>
                    )}

                    {activeTab === 'monitoring' && (
                        <div className="content-scrollable">
                            <DashboardMonitoring
                                ztEnabled={ztEnabled}
                                onToggleZt={handleToggleZt}
                                logs={securityLogs}
                                onClearLogs={handleClearLogs}
                                stats={serverStats}
                            />
                        </div>
                    )}
                </div>

                {/* Bottom Status Bar */}
                <footer className="status-bar">
                    <div className="status-bar__item">
                        <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--red'}`} />
                        Server: {connected ? 'Terhubung (Port 3001)' : 'Terputus'}
                    </div>
                    <div className="status-bar__item">
                        <span className={`status-dot ${ztEnabled ? 'status-dot--green' : 'status-dot--red'}`} />
                        Zero Trust Mode: {ztEnabled ? 'Strict Enforcement (OPA)' : 'Bypass / Insecure Mode'}
                    </div>
                    <div className="status-bar__item">
                        <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--yellow'}`} />
                        OPA Engine: {connected ? 'Terhubung (Port 8181)' : 'Standby'}
                    </div>
                    <div className="status-bar__item">
                        <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--yellow'}`} />
                        Redis Store: {connected ? 'Aktif' : 'Standby'}
                    </div>
                    <div style={{ flex: 1 }} />
                    <div className="status-bar__item" style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        Hak Akses Aktif: {currentUser.regionName} ({currentUser.tenant})
                    </div>
                </footer>
            </div>
        </div>
    );
}
