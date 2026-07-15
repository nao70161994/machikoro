const connectClient = require('socket.io-client');

const EXPECTED_PRODUCTION_ORIGIN = 'https://machikoro-9jv2.onrender.com';
const DEFAULT_TIMEOUT_MS = 30000;
const USER_AGENT = 'machikoro-online-delivery-check/1.0';

function parseArgs(argv = process.argv.slice(2)) {
    const originIndex = argv.indexOf('--origin');
    const originArg = argv.find(arg => arg.startsWith('--origin='));
    const timeoutIndex = argv.indexOf('--timeout-ms');
    const timeoutArg = argv.find(arg => arg.startsWith('--timeout-ms='));
    const origin = originArg
        ? originArg.slice('--origin='.length)
        : (originIndex >= 0 ? argv[originIndex + 1] : '');
    const timeoutValue = timeoutArg
        ? timeoutArg.slice('--timeout-ms='.length)
        : (timeoutIndex >= 0 ? argv[timeoutIndex + 1] : DEFAULT_TIMEOUT_MS);
    const timeoutMs = Number(timeoutValue);
    return { origin, timeoutMs };
}

function validateProductionOrigin(origin) {
    let target;
    try {
        target = new URL(origin);
    } catch {
        throw new Error('production origin must be a valid URL');
    }
    if (target.origin !== EXPECTED_PRODUCTION_ORIGIN ||
            target.href !== EXPECTED_PRODUCTION_ORIGIN + '/' ||
            target.username || target.password) {
        throw new Error('production origin must exactly match ' + EXPECTED_PRODUCTION_ORIGIN);
    }
    return target.origin;
}

function validateTimeoutMs(value) {
    if (!Number.isInteger(value) || value < 1000 || value > 30000) {
        throw new Error('timeout must be an integer between 1000 and 30000ms');
    }
    return value;
}

function checkSocketHandshake(origin, timeoutMs = DEFAULT_TIMEOUT_MS, connector = connectClient) {
    const safeOrigin = validateProductionOrigin(origin);
    const safeTimeoutMs = validateTimeoutMs(timeoutMs);
    return new Promise((resolve, reject) => {
        const socket = connector(safeOrigin, {
            forceNew: true,
            reconnection: false,
            timeout: safeTimeoutMs,
            transports: ['websocket'],
            auth: {},
            extraHeaders: { 'User-Agent': USER_AGENT },
        });
        let settled = false;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.close();
            if (error) reject(error);
            else resolve({ origin: safeOrigin });
        };
        const timer = setTimeout(() => {
            finish(new Error('Socket.IO handshake timed out'));
        }, safeTimeoutMs + 1000);
        socket.once('connect', () => finish());
        socket.once('connect_error', () => {
            finish(new Error('Socket.IO handshake failed'));
        });
    });
}

async function main() {
    const options = parseArgs();
    await checkSocketHandshake(options.origin, options.timeoutMs);
    console.log('Socket.IO read-only handshake ok');
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = {
    EXPECTED_PRODUCTION_ORIGIN,
    DEFAULT_TIMEOUT_MS,
    USER_AGENT,
    parseArgs,
    validateProductionOrigin,
    validateTimeoutMs,
    checkSocketHandshake,
};
