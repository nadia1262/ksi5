// ============================================
// logger.js - Winston + Loki Logging Integration
// ============================================
// File ini mengelola logging audit Zero Trust ke Loki dan Console.

const winston = require('winston');
const LokiTransport = require('winston-loki');

const LOKI_HOST = process.env.LOKI_URL || 'http://localhost:3100';

const transports = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `[${timestamp}] [${level}]: ${message}${metaStr}`;
            })
        )
    })
];

// Transport Loki (kirim structured log ke Loki)
try {
    transports.push(
        new LokiTransport({
            host: LOKI_HOST,
            labels: { app: 'sidaptor', job: 'zero-trust-gateway' },
            json: true,
            replaceTimestamp: true,
            onConnectionError: (err) => {
                console.warn('[LOGGER] ⚠️  Loki unreachable at', LOKI_HOST, '-', err.message);
            }
        })
    );
    console.log(`[LOGGER] 🚀 Loki Transport diinisialisasi ke ${LOKI_HOST}`);
} catch (err) {
    console.warn('[LOGGER] ⚠️  Gagal inisialisasi Loki transport:', err.message);
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports
});

/**
 * Helper untuk log Security Event dari Zero Trust Middleware
 * @param {Object} event
 */
function logSecurityEvent(event) {
    const isBlocked = event.action === 'BLOCKED';
    const logLevel = isBlocked ? 'warn' : 'info';

    // Label dinamis untuk mempermudah query & filter di Grafana Loki
    const lokiLabels = {
        app: 'sidaptor',
        job: 'zero-trust-gateway',
        action: event.action || 'UNKNOWN',
        source_tenant: String(event.source_tenant || 'unknown'),
        target_tenant: String(event.target_tenant || 'unknown')
    };

    logger.log({
        level: logLevel,
        message: `[ZT-${event.action}] ${event.target_endpoint} - ${event.reason} (Risk Score: ${event.risk_score})`,
        labels: lokiLabels,
        security_event: {
            timestamp: event.timestamp || new Date().toISOString(),
            ip: event.ip,
            source_tenant: event.source_tenant,
            target_tenant: event.target_tenant,
            target_endpoint: event.target_endpoint,
            action: event.action,
            risk_score: event.risk_score,
            reason: event.reason,
            latency_ms: event.latency_ms,
            context: event.context || {}
        }
    });
}

module.exports = {
    logger,
    logSecurityEvent
};
