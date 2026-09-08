// ============================================
// App.jsx - SIDAPTOR Main Application
// ============================================
// Sistem Data Penduduk Terintegrasi
// Entry point yang mengatur: login, tab navigation,
// state management (JWT, WebSocket, ZT), dan komponen anak.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import PortalData from './components/PortalData';
import SimulatorKeamanan from './components/SimulatorKeamanan';
import DashboardMonitoring from './components/DashboardMonitoring';
import './App.css';

const BACKEND_URL = 'http://localhost:3001';
const KEYCLOAK_URL = 'http://localhost:8080';
const REALM = 'zt-realm';

// Daftar user yang tersedia di Keycloak
const USERS = [
    { username: 'operator-jaksel', password: 'password', tenant: '3174', label: 'Operator BPS Kota Adm. Jakarta Selatan' },
    { username: 'operator-jakpus', password: 'password', tenant: '3171', label: 'Operator BPS Kota Adm. Jakarta Pusat' },
    { username: 'operator-bogor', password: 'password', tenant: '3201', label: 'Operator BPS Kab. Bogor' },
];

// Tabs
const TABS = [
    { id: 'portal', label: 'Portal Data' },
    { id: 'simulator', label: 'Simulator Keamanan' },
    { id: 'monitoring', label: 'Dashboard Monitoring' },
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

        // Security event dari middleware
        socket.on('security-log', (event) => {
            const contextFlags = [];
            if (event.context?.is_new_ip) contextFlags.push('IP BARU');
            if (event.context?.is_off_hours) contextFlags.push('WAKTU');
            if (event.context?.is_high_velocity) contextFlags.push('KECEPATAN');

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
    // /api/stats tidak butuh auth karena di-mount langsung di server.js (bukan lewat router)
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

    // ============================================
    // Login via selected user
    // ============================================
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
    // Toggle ZT
    // ============================================
    const handleToggleZt = async () => {
        try {
            await fetch(`${BACKEND_URL}/api/toggle-zt`, { method: 'POST' });
        } catch (err) {
            // ignore — status akan datang via WebSocket
        }
    };

    // ============================================
    // Clear logs
    // ============================================
    const handleClearLogs = () => setSecurityLogs([]);

    // ============================================
    // LOGIN PAGE
    // ============================================
    if (!token || !currentUser) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div className="login-card__header">
                        <h1>SIDAPTOR</h1>
                        <p>Sistem Data Penduduk Terintegrasi</p>
                    </div>
                    <div className="login-card__body">
                        {loginError && (
                            <div className="alert alert--danger">{loginError}</div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Pilih Identitas Operator</label>
                            <select
                                className="form-select"
                                value={loginUser}
                                onChange={e => setLoginUser(e.target.value)}
                            >
                                <option value="">-- Pilih Operator --</option>
                                {USERS.map(u => (
                                    <option key={u.username} value={u.username}>
                                        {u.label} ({u.tenant})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                                className="form-input"
                                type="password"
                                value="password"
                                readOnly
                                style={{ color: 'var(--color-text-muted)' }}
                            />
                            <span className="text-sm text-muted">
                                Password default untuk semua operator PoC
                            </span>
                        </div>
                    </div>
                    <div className="login-card__footer">
                        <button
                            className="btn btn--primary btn--block"
                            onClick={handleLoginSubmit}
                            disabled={!loginUser || loginLoading}
                        >
                            {loginLoading ? 'Menghubungi Keycloak...' : 'Masuk'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================
    // MAIN APP (Post-Login)
    // ============================================
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* ---- HEADER ---- */}
            <header className="app-header">
                <div className="app-header__brand">
                    <div className="app-header__logo">S</div>
                    <div>
                        <div className="app-header__title">SIDAPTOR</div>
                        <div className="app-header__subtitle">Sistem Data Penduduk Terintegrasi</div>
                    </div>
                </div>
                <div className="app-header__user">
                    <span>Operator: <strong>{currentUser.label.replace('Operator BPS ', '')}</strong></span>
                    <span className="app-header__tenant-badge">
                        Wilayah: {currentUser.tenant}
                    </span>
                    <button className="app-header__logout" onClick={handleLogout}>
                        Keluar
                    </button>
                </div>
            </header>

            {/* ---- TABS ---- */}
            <nav className="app-tabs">
                {TABS.map((tab, i) => (
                    <React.Fragment key={tab.id}>
                        {i > 0 && <div className="app-tabs__separator" />}
                        <div
                            className={`app-tabs__item ${activeTab === tab.id ? 'app-tabs__item--active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </div>
                    </React.Fragment>
                ))}
            </nav>

            {/* ---- TAB CONTENT ---- */}
            {activeTab === 'portal' && (
                <PortalData
                    token={token}
                    tenantId={currentUser.tenant}
                />
            )}

            {activeTab === 'simulator' && (
                <SimulatorKeamanan
                    token={token}
                    tenantId={currentUser.tenant}
                    users={USERS}
                    onSelectUser={(username) => handleLogin(username)}
                />
            )}

            {activeTab === 'monitoring' && (
                <DashboardMonitoring
                    ztEnabled={ztEnabled}
                    onToggleZt={handleToggleZt}
                    logs={securityLogs}
                    onClearLogs={handleClearLogs}
                    stats={serverStats}
                />
            )}

            {/* ---- STATUS BAR ---- */}
            <div className="status-bar">
                <div className="status-bar__item">
                    <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--red'}`} />
                    Status: {connected ? 'Terhubung' : 'Terputus'}
                </div>
                <div className="status-bar__item">
                    <span className={`status-dot ${ztEnabled ? 'status-dot--green' : 'status-dot--red'}`} />
                    Zero Trust: {ztEnabled ? 'Aktif' : 'Nonaktif'}
                </div>
                <div className="status-bar__item">
                    <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--yellow'}`} />
                    OPA: {connected ? 'Terhubung' : 'Menunggu'}
                </div>
                <div className="status-bar__item">
                    <span className={`status-dot ${connected ? 'status-dot--green' : 'status-dot--yellow'}`} />
                    Redis: {connected ? 'Terhubung' : 'Menunggu'}
                </div>
                <div style={{ flex: 1 }} />
                <div className="status-bar__item text-muted">
                    Tenant: {currentUser.tenant}
                </div>
            </div>
        </div>
    );
}
