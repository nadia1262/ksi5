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
import sweepyLogo from './assets/Logo_Sweepy.png';

const BACKEND_URL = 'http://localhost:3001';
const KEYCLOAK_URL = 'http://localhost:8080';
const REALM = 'zt-realm';

// Daftar user operator yang terdaftar di Keycloak
const USERS = [
    { username: 'operator-jaksel', password: 'password', tenant: '3174', label: 'BPS Kota Adm. Jakarta Selatan', regionName: 'Kota Adm. Jakarta Selatan' },
    { username: 'operator-jakpus', password: 'password', tenant: '3171', label: 'BPS Kota Adm. Jakarta Pusat', regionName: 'Kota Adm. Jakarta Pusat' },
    { username: 'operator-bogor', password: 'password', tenant: '3201', label: 'BPS Kab. Bogor', regionName: 'Kab. Bogor' },
];

// Helper untuk memulihkan sesi dari sessionStorage saat refresh
function getInitialAuthState() {
    try {
        const savedToken = sessionStorage.getItem('zt_token');
        const savedUser = sessionStorage.getItem('zt_user');
        if (!savedToken || !savedUser) return { token: '', user: null };

        // Validasi apakah token JWT sudah kadaluarsa (exp claim)
        const parts = savedToken.split('.');
        if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                sessionStorage.removeItem('zt_token');
                sessionStorage.removeItem('zt_user');
                sessionStorage.removeItem('zt_active_tab');
                return { token: '', user: null };
            }
        }
        return { token: savedToken, user: JSON.parse(savedUser) };
    } catch {
        sessionStorage.removeItem('zt_token');
        sessionStorage.removeItem('zt_user');
        return { token: '', user: null };
    }
}

export default function App() {
    // ---- Auth State (Persisted in sessionStorage) ----
    const initialAuth = getInitialAuthState();
    const [token, setToken] = useState(initialAuth.token);
    const [currentUser, setCurrentUser] = useState(initialAuth.user);
    const [loginUser, setLoginUser] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    // ---- App State ----
    const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('zt_active_tab') || 'portal');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [ztEnabled, setZtEnabled] = useState(true);
    const [securityLogs, setSecurityLogs] = useState([]);
    const [serverStats, setServerStats] = useState({});
    const [connected, setConnected] = useState(false);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        sessionStorage.setItem('zt_active_tab', tab);
    };

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
            sessionStorage.setItem('zt_token', data.access_token);
            sessionStorage.setItem('zt_user', JSON.stringify(user));
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
        sessionStorage.removeItem('zt_token');
        sessionStorage.removeItem('zt_user');
        sessionStorage.removeItem('zt_active_tab');
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12 }}>
                            <div style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <img src={sweepyLogo} alt="Sweepy Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 3px 6px rgba(0, 95, 95, 0.2))' }} />
                            </div>
                            <h1 style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em', fontSize: 26 }}>Sweepy</h1>
                        </div>
                        <p>Zero Trust Data Gateway & Governance Platform</p>
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
    // MAIN APP LAYOUT
    // ============================================
    return (
        <div className="app-layout">
            {/* ---- LEFT SIDEBAR ---- */}
            <aside className={`app-sidebar ${sidebarCollapsed ? 'app-sidebar--collapsed' : ''}`}>
                {/* Brand */}
                <div className="sidebar-brand">
                    <div className="sidebar-brand__logo">
                        <img src={sweepyLogo} alt="Sweepy Logo" />
                    </div>
                    {!sidebarCollapsed && (
                        <div className="sidebar-brand__text">
                            <div className="sidebar-brand__title">Sweepy</div>
                            <div className="sidebar-brand__subtitle">ZERO TRUST GATEWAY</div>
                        </div>
                    )}
                </div>

                {/* Sidebar Navigation Menu */}
                <div className="sidebar-menu">
                    <div className="sidebar-section-title">
                        {!sidebarCollapsed && 'Navigasi'}
                    </div>

                    {/* Menu Item 1: Pendataan Penduduk (Portal Data) */}
                    <button
                        className={`sidebar-item ${activeTab === 'portal' ? 'sidebar-item--active' : ''}`}
                        onClick={() => handleTabChange('portal')}
                        title="Portal Data Kependudukan"
                    >
                        <span className="sidebar-item__icon"><BuildingIcon size={18} /></span>
                        {!sidebarCollapsed && (
                            <span className="sidebar-item__text">Portal Data</span>
                        )}
                    </button>

                    {/* Menu Item 2: Simulator Keamanan */}
                    <button
                        className={`sidebar-item ${activeTab === 'simulator' ? 'sidebar-item--active' : ''}`}
                        onClick={() => handleTabChange('simulator')}
                        title="Simulator Keamanan API"
                    >
                        <span className="sidebar-item__icon"><ShieldIcon size={18} /></span>
                        {!sidebarCollapsed && (
                            <span className="sidebar-item__text">Simulator API</span>
                        )}
                    </button>

                    {/* Menu Item 3: Dashboard Monitoring & SOC */}
                    <button
                        className={`sidebar-item ${activeTab === 'monitoring' ? 'sidebar-item--active' : ''}`}
                        onClick={() => handleTabChange('monitoring')}
                        title="Dashboard Monitoring SOC"
                    >
                        <span className="sidebar-item__icon"><RadioTowerIcon size={18} /></span>
                        {!sidebarCollapsed && (
                            <span className="sidebar-item__text">Monitoring SOC</span>
                        )}
                    </button>
                </div>

                {/* Sidebar Footer */}
                <div className="sidebar-footer">
                    {!sidebarCollapsed ? (
                        <div className="sidebar-footer__tenant">
                            <span>Wilayah Operator</span>
                            <span className="sidebar-footer__badge">{currentUser.tenant}</span>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', color: '#ffffff', fontSize: 12, fontWeight: 600 }}>
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
                            <span style={{ fontWeight: 700, color: '#005F5F' }}>Sweepy</span>
                            <span style={{ color: 'var(--color-border)', margin: '0 4px' }}>|</span>
                            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 13.5 }}>Data Gateway</span>
                        </div>
                    </div>

                    <div className="top-header__right">
                        {/* Quick Zero Trust Indicator & Switch */}
                        <button
                            className="btn-pill btn-pill--outline"
                            onClick={handleToggleZt}
                            title="Klik untuk Toggle Zero Trust"
                            style={{
                                borderColor: ztEnabled ? '#A7F3D0' : '#FECACA',
                                backgroundColor: ztEnabled ? '#ECFDF5' : '#FEF2F2',
                                color: ztEnabled ? '#065F46' : '#991B1B',
                                padding: '5px 12px',
                                fontSize: 12,
                                fontWeight: 500,
                            }}
                        >
                            <span className={`status-dot ${ztEnabled ? 'status-dot--green' : 'status-dot--red'}`} />
                            Zero Trust: <strong>{ztEnabled ? 'AKTIF' : 'NONAKTIF'}</strong>
                        </button>

                        {/* Operator Badge */}
                        <div className="operator-badge">
                            <span className="operator-badge__dot" />
                            <span>{currentUser.label}</span>
                            <span style={{ opacity: 0.5, margin: '0 2px' }}>•</span>
                            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11.5 }}>{currentUser.tenant}</span>
                        </div>

                        {/* Logout Button */}
                        <button className="logout-btn" onClick={handleLogout} title="Keluar dari sesi">
                            <LogoutIcon size={14} /> Keluar
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
                                currentUser={currentUser}
                                users={USERS}
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
                        Backend: {connected ? 'Online' : 'Offline'}
                    </div>
                    <div className="status-bar__item">
                        <span className={`status-dot ${ztEnabled ? 'status-dot--green' : 'status-dot--red'}`} />
                        Zero Trust: {ztEnabled ? 'Active (OPA)' : 'Bypass'}
                    </div>
                    <div className="status-bar__item">
                        <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--yellow'}`} />
                        OPA Engine: {connected ? 'Online' : 'Standby'}
                    </div>
                    <div className="status-bar__item">
                        <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--yellow'}`} />
                        Redis Cache: {connected ? 'Online' : 'Standby'}
                    </div>
                    <div style={{ flex: 1 }} />
                    <div className="status-bar__item" style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        Wilayah: {currentUser.regionName} ({currentUser.tenant})
                    </div>
                </footer>
            </div>
        </div>
    );
}
