// ============================================
// server.js - Main Entry Point
// ============================================
// File ini menyatukan semua komponen:
// Express (API Gateway) + SQLite (DB) + Redis (Context Store)
// + OPA (Policy Engine via Middleware) + Socket.IO (Real-time)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const { initializeDatabase } = require('./database');
const { createZeroTrustMiddleware } = require('./middleware/zeroTrustMiddleware');
const createApiRoutes = require('./routes/api');

const PORT = process.env.PORT || 3001;

// -------------------------------------------
// 1. Inisialisasi Express + HTTP Server + Socket.IO
// -------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'http://localhost:3000'], // Frontend React (Vite / CRA)
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
});

app.use(cors());
app.use(express.json());

// -------------------------------------------
// 2. Inisialisasi Database SQLite
// -------------------------------------------
const db = initializeDatabase();
console.log('[SERVER] ✅ SQLite Database siap.');

// -------------------------------------------
// 3. Inisialisasi Redis
// -------------------------------------------
let redisClient = null;
try {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            if (times > 3) {
                console.warn('[SERVER] ⚠️  Redis tidak tersedia. Lanjut tanpa Redis (velocity & IP tracking disabled).');
                return null; // Stop retrying
            }
            return Math.min(times * 200, 1000);
        },
    });

    redisClient.on('connect', () => {
        console.log('[SERVER] ✅ Redis terhubung.');
    });

    redisClient.on('error', (err) => {
        console.warn('[SERVER] ⚠️  Redis error:', err.message);
    });
} catch (err) {
    console.warn('[SERVER] ⚠️  Gagal inisialisasi Redis:', err.message);
}

// -------------------------------------------
// 4. State Management: Zero Trust Toggle
// -------------------------------------------
// Default: ZT aktif (sesuai .env)
app.locals.ztEnabled = process.env.ZT_ENABLED !== 'false';
console.log(`[SERVER] 🛡️  Zero Trust: ${app.locals.ztEnabled ? 'ON' : 'OFF'}`);

// -------------------------------------------
// 5. Health Check & System Control Endpoints
// -------------------------------------------
// Endpoint untuk cek apakah server hidup
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        zt_enabled: app.locals.ztEnabled,
        timestamp: new Date().toISOString(),
    });
});

// Endpoint untuk Toggle Zero Trust ON/OFF (dipanggil dari Dashboard)
app.post('/api/toggle-zt', (req, res) => {
    app.locals.ztEnabled = !app.locals.ztEnabled;
    const status = app.locals.ztEnabled ? 'ON' : 'OFF';
    console.log(`[SERVER] 🛡️  Zero Trust diubah menjadi: ${status}`);

    // Kirim notifikasi ke semua client SOC Dashboard
    io.emit('zt-status', { enabled: app.locals.ztEnabled });

    res.json({ success: true, zt_enabled: app.locals.ztEnabled, message: `Zero Trust is now ${status}` });
});

// Endpoint untuk mendapatkan statistik blacklist dari Redis
app.get('/api/stats', async (req, res) => {
    let blacklistCount = 0;
    if (redisClient) {
        try {
            const keys = await redisClient.keys('blacklist:*');
            blacklistCount = keys.length;
        } catch (err) {
            console.warn('[SERVER] Redis stats error:', err.message);
        }
    }
    res.json({
        zt_enabled: app.locals.ztEnabled,
        jwt_blacklisted: blacklistCount,
    });
});

// -------------------------------------------
// 6. Pasang Zero Trust Middleware + API Routes
// -------------------------------------------
// Middleware ini akan mencegat SEMUA request ke /api/*
const ztMiddleware = createZeroTrustMiddleware(redisClient, io);
app.use('/api', ztMiddleware, createApiRoutes(db));

// -------------------------------------------
// 7. Socket.IO Event Handlers
// -------------------------------------------
io.on('connection', (socket) => {
    console.log(`[WS] Client terhubung: ${socket.id}`);

    // Kirim status ZT saat client baru connect
    socket.emit('zt-status', { enabled: app.locals.ztEnabled });

    socket.on('disconnect', () => {
        console.log(`[WS] Client terputus: ${socket.id}`);
    });
});

// -------------------------------------------
// 8. Jalankan Server
// -------------------------------------------
server.listen(PORT, () => {
    console.log('');
    console.log('============================================');
    console.log(' 🛡️  ZERO TRUST API GATEWAY - PoC Server');
    console.log('============================================');
    console.log(`  API Server    : http://localhost:${PORT}`);
    console.log(`  Health Check  : http://localhost:${PORT}/health`);
    console.log(`  Keycloak      : ${process.env.KEYCLOAK_URL}`);
    console.log(`  OPA           : ${process.env.OPA_URL}`);
    console.log(`  Redis         : ${process.env.REDIS_URL}`);
    console.log(`  ZT Status     : ${app.locals.ztEnabled ? '🟢 ON' : '🔴 OFF'}`);
    console.log('============================================');
    console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SERVER] Mematikan server...');
    db.close();
    if (redisClient) redisClient.disconnect();
    server.close(() => process.exit(0));
});
