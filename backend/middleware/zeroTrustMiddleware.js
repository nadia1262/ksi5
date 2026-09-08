// ============================================
// middleware/zeroTrustMiddleware.js
// ============================================
// File ini adalah JANTUNG dari arsitektur Zero Trust kita.
// Setiap request API yang masuk WAJIB melewati middleware ini.
//
// Alur kerjanya (sesuai NIST SP 800-207):
// 1. Validasi JWT (dari Keycloak)
// 2. Kumpulkan konteks (IP, Waktu, Velocity)
// 3. Kirim ke OPA untuk evaluasi
// 4. Terima keputusan (Allow/Deny + Risk Score)
// 5. Eksekusi keputusan (teruskan atau blokir)

const axios = require('axios');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

// -------------------------------------------
// A. JWT Verification (Keycloak)
// -------------------------------------------
// Membuat JWKS client untuk memverifikasi signature JWT dari Keycloak
let jwksClient;

function getJwksClient() {
    if (!jwksClient) {
        jwksClient = jwksRsa({
            jwksUri: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`,
            cache: true,
            rateLimit: true,
        });
    }
    return jwksClient;
}

function getSigningKey(header, callback) {
    getJwksClient().getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        const signingKey = key.publicKey || key.rsaPublicKey;
        callback(null, signingKey);
    });
}

// -------------------------------------------
// B. Context Collector (Mengumpulkan data kontekstual)
// -------------------------------------------
async function collectContext(req, redisClient) {
    // 1. IP ADDRESS: Baca dari header simulasi, atau gunakan IP asli
    const ip = req.headers['x-simulated-ip'] || req.ip || '127.0.0.1';

    // 2. TIMESTAMP: Baca dari header simulasi, atau gunakan waktu server
    let currentHour;
    if (req.headers['x-simulated-time']) {
        currentHour = parseInt(req.headers['x-simulated-time'], 10);
    } else {
        currentHour = new Date().getHours();
    }

    // 3. IS OFF-HOURS? (Di luar jam kerja: sebelum 07:00 atau setelah 22:00)
    const isOffHours = currentHour < 7 || currentHour >= 22;

    // 4. IS NEW IP? (IP yang belum pernah terlihat untuk tenant ini)
    const tenantId = req.jwtPayload?.tenant_id || 'unknown';
    const ipKey = `known_ips:${tenantId}`;
    let isNewIp = true;

    if (redisClient) {
        try {
            const isMember = await redisClient.sismember(ipKey, ip);
            isNewIp = !isMember;
            // Jika IP baru, tambahkan ke daftar IP yang dikenal
            if (isNewIp) {
                await redisClient.sadd(ipKey, ip);
            }
        } catch (err) {
            console.warn('[ZT-MIDDLEWARE] Redis error, defaulting isNewIp=true:', err.message);
        }
    }

    // 5. VELOCITY CHECK (Berapa banyak request dalam 60 detik terakhir)
    const velocityKey = `velocity:${tenantId}:${ip}`;
    let isHighVelocity = false;

    let count = 0;

    if (redisClient) {
        try {
            count = await redisClient.incr(velocityKey);
            if (count === 1) {
                // Set expiry 60 detik untuk window velocity
                await redisClient.expire(velocityKey, 60);
            }
            // Jika lebih dari 10 request dalam 60 detik = mencurigakan
            isHighVelocity = count > 10;
        } catch (err) {
            console.warn('[ZT-MIDDLEWARE] Redis velocity error:', err.message);
        }
    }

    return {
        ip,
        timestamp: currentHour,
        is_new_ip: isNewIp,
        is_off_hours: isOffHours,
        is_high_velocity: isHighVelocity,
        velocity_count: count,
    };
}

// -------------------------------------------
// C. OPA Evaluator (Mengirim data ke OPA untuk diadili)
// -------------------------------------------
async function evaluatePolicy(jwtPayload, resourceTenantId, context) {
    const opaInput = {
        input: {
            jwt: {
                user_id: jwtPayload.sub || jwtPayload.user_id,
                tenant_id: Array.isArray(jwtPayload.tenant_id) ? jwtPayload.tenant_id[0] : jwtPayload.tenant_id,
                role: jwtPayload.role || 'operator',
            },
            resource: {
                tenant_id: resourceTenantId,
            },
            context: context,
        },
    };

    try {
        const response = await axios.post(process.env.OPA_URL, opaInput, {
            timeout: 2000, // Timeout 2 detik
        });

        return {
            allow: response.data.result?.allow || false,
            risk_score: response.data.result?.risk_score || 0,
            block_reason: response.data.result?.block_reason || 'Unknown',
        };
    } catch (err) {
        console.error('[ZT-MIDDLEWARE] OPA evaluation failed:', err.message);
        // Fail-closed: Jika OPA mati, tolak semua request (prinsip Zero Trust)
        return {
            allow: false,
            risk_score: 100,
            block_reason: 'Policy Engine Unreachable (Fail-Closed)',
        };
    }
}

// -------------------------------------------
// D. MAIN MIDDLEWARE FUNCTION
// -------------------------------------------
function createZeroTrustMiddleware(redisClient, io) {
    return async (req, res, next) => {
        const startTime = Date.now();

        // CEK 0: Apakah Zero Trust diaktifkan?
        if (req.app.locals.ztEnabled === false) {
            // ZT OFF = Skenario A/B (bypass semua pengecekan)
            const logEntry = {
                timestamp: new Date().toISOString(),
                ip: req.headers['x-simulated-ip'] || req.ip || '127.0.0.1',
                source_tenant: 'N/A (ZT OFF)',
                target_endpoint: req.originalUrl,
                action: 'ALLOWED',
                risk_score: 0,
                reason: 'Zero Trust Disabled (Bypass Mode)',
                latency_ms: Date.now() - startTime,
            };
            if (io) io.emit('security-log', logEntry);
            return next();
        }

        // CEK 1: Validasi JWT
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                ip: req.headers['x-simulated-ip'] || req.ip || '127.0.0.1',
                source_tenant: 'Unknown',
                target_endpoint: req.originalUrl,
                action: 'BLOCKED',
                risk_score: 100,
                reason: 'Missing or Invalid Authorization Header',
                latency_ms: Date.now() - startTime,
            };
            if (io) io.emit('security-log', logEntry);
            return res.status(401).json({ error: 'Unauthorized', message: 'Token JWT tidak ditemukan.' });
        }

        const token = authHeader.split(' ')[1];

        try {
            // Verifikasi JWT signature menggunakan JWKS dari Keycloak
            const decoded = await new Promise((resolve, reject) => {
                jwt.verify(token, getSigningKey, {
                    algorithms: ['RS256'],
                    issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
                }, (err, decoded) => {
                    if (err) reject(err);
                    else resolve(decoded);
                });
            });

            req.jwtPayload = decoded;

            // CEK 1.5: Apakah JWT di-blacklist di Redis?
            if (redisClient) {
                const jti = decoded.jti || token.substring(0, 20);
                try {
                    const isBlacklisted = await redisClient.get(`blacklist:${jti}`);
                    if (isBlacklisted) {
                        const logEntry = {
                            timestamp: new Date().toISOString(),
                            ip: req.headers['x-simulated-ip'] || req.ip || '127.0.0.1',
                            source_tenant: decoded.tenant_id || 'Unknown',
                            target_tenant: 'N/A',
                            target_endpoint: req.originalUrl,
                            action: 'BLOCKED',
                            risk_score: 100,
                            reason: 'JWT Blacklisted (Previous Security Violation)',
                            context: { is_new_ip: false, is_off_hours: false, is_high_velocity: false },
                            latency_ms: Date.now() - startTime,
                        };
                        if (io) io.emit('security-log', logEntry);
                        return res.status(403).json({ error: 'Forbidden', risk_score: 100, message: 'Token JWT telah di-blacklist karena pelanggaran keamanan sebelumnya.' });
                    }
                } catch (err) {
                    console.warn('[ZT-MIDDLEWARE] Failed to check blacklist:', err.message);
                }
            }

            // CEK 2: Ambil tenant_id dari URL path
            // Format: /api/wilayah/:tenantId/penduduk/:id
            // Karena dipasang sebelum router, req.params kosong. Ekstrak dari originalUrl:
            const pathParts = req.originalUrl.split('?')[0].split('/');
            // contoh: ['', 'api', 'wilayah', '3171', 'penduduk', '3171-0001']
            let resourceTenantId = null;
            if (pathParts[2] === 'wilayah' && pathParts[3]) {
                resourceTenantId = pathParts[3];
            }

            if (!resourceTenantId) {
                return next(); // Route yang tidak perlu tenant check (misal: /health atau /api/toggle-zt)
            }

            // CEK 3: Kumpulkan konteks
            const context = await collectContext(req, redisClient);

            // CEK 4: Kirim ke OPA untuk evaluasi
            const decision = await evaluatePolicy(decoded, resourceTenantId, context);

            // CEK 5: Buat log entry untuk SOC Dashboard
            const logEntry = {
                timestamp: new Date().toISOString(),
                ip: context.ip,
                source_tenant: decoded.tenant_id || 'Unknown',
                target_tenant: resourceTenantId,
                target_endpoint: req.originalUrl,
                action: decision.allow ? 'ALLOWED' : 'BLOCKED',
                risk_score: decision.risk_score,
                reason: decision.block_reason,
                context: {
                    is_new_ip: context.is_new_ip,
                    is_off_hours: context.is_off_hours,
                    is_high_velocity: context.is_high_velocity,
                },
                latency_ms: Date.now() - startTime,
            };

            // Kirim log ke SOC Dashboard via WebSocket
            if (io) io.emit('security-log', logEntry);

            // CEK 6: Eksekusi keputusan
            if (decision.allow) {
                console.log(`[ZT] ✅ ALLOW | Tenant ${decoded.tenant_id} → ${resourceTenantId} | Score: ${decision.risk_score}`);
                return next();
            } else {
                console.log(`[ZT] ❌ DENY  | Tenant ${decoded.tenant_id} → ${resourceTenantId} | Score: ${decision.risk_score} | Reason: ${decision.block_reason}`);

                // BLACKLIST JWT di Redis jika Hard Violation (BOLA)
                if (decision.block_reason.includes('Hard Violation') && redisClient) {
                    try {
                        const jti = decoded.jti || token.substring(0, 20);
                        await redisClient.set(`blacklist:${jti}`, 'blocked', 'EX', 3600);
                        console.log(`[ZT] 🚫 JWT ${jti} di-blacklist selama 1 jam.`);
                    } catch (err) {
                        console.warn('[ZT] Redis blacklist error:', err.message);
                    }
                }

                return res.status(403).json({
                    error: 'Forbidden',
                    message: `Access Denied. ${decision.block_reason}`,
                    risk_score: decision.risk_score,
                });
            }
        } catch (err) {
            console.error('[ZT] JWT Verification Failed:', err.message);
            const logEntry = {
                timestamp: new Date().toISOString(),
                ip: req.headers['x-simulated-ip'] || req.ip || '127.0.0.1',
                source_tenant: 'Unknown',
                target_endpoint: req.originalUrl,
                action: 'BLOCKED',
                risk_score: 100,
                reason: `JWT Verification Failed: ${err.message}`,
                latency_ms: Date.now() - startTime,
            };
            if (io) io.emit('security-log', logEntry);
            return res.status(401).json({ error: 'Unauthorized', message: `Token JWT tidak valid: ${err.message}` });
        }
    };
}

module.exports = { createZeroTrustMiddleware };