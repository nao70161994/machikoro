const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const { execSync } = require('child_process');

const app = express();
app.set('trust proxy', resolveTrustProxySetting(process.env));
const server = http.createServer(app);
const io = new Server(server);
const gameRuntime = loadGameRuntime();
const {
    isPlainObject,
    isValidDieValue,
    validateBusinessPayload,
    validateCleaningPayload,
    validateMoverPayload,
    validateRenovationPayload,
    validateRollDicePayload,
    validateSelectDicePayload,
    validateRerollDicePayload,
    validateResolveHarborPayload,
    validateResolveITPayload,
    validateResolveTVPayload,
    validateBuildCardPayload,
    validateBuildLandmarkPayload,
    validateActionPayloadForState,
    getAllowedActions,
} = require('./server/actionValidation')({ gameRuntime });
const MAX_ACTION_LOG_LENGTH = 200;
const {
    serializeMirrorState,
    restoreMirrorState,
    compactRoomActionLog,
    createRoomMirror,
    applyActionToMirror,
    restoreUndoMirror,
    makeUndoStateFromMirror,
    isValidUndoState,
} = require('./server/mirrorReplay')({
    gameRuntime,
    maxActionLogLength: MAX_ACTION_LOG_LENGTH,
    isPlainObject,
    isValidDieValue,
    validateActionPayloadForState,
    getAllowedActions,
});
const ROOM_LIFECYCLE_LIMITS = Object.freeze({
    startedRoomTtlMs: 2 * 60 * 60 * 1000,
    pendingRoomTtlMs: 30 * 60 * 1000,
    maxRooms: 500,
    createRoomRateLimitMs: 5000,
    createRoomIpRateLimitWindowMs: 60 * 1000,
    createRoomIpRateLimitMax: 20,
    createRoomIpRateLimitMaxBuckets: 2000,
});
const rooms = Object.create(null);
const {
    roomTimestamp,
    isRoomExpired,
    cleanupExpiredRooms,
    canCreateRoomForSocket,
    markCreateRoomForSocket,
    createRoomRateKeyForSocket,
    canCreateRoomForRateKey,
    markCreateRoomForRateKey,
    validateCreateRoomLifecycle,
} = require('./server/roomLifecycle')({
    limits: ROOM_LIFECYCLE_LIMITS,
    defaultRooms: rooms,
});
const {
    restorePayloadRank,
    restorePayloadRankDetails,
    isIncomingRestoreNewer,
    canReplaceRestoredRoom,
} = require('./server/restoreRank');
const RESTORE_PAYLOAD_LIMITS = Object.freeze({
    maxJsonBytes: 1024 * 1024,
    maxActionLogEntries: 1000,
    maxStringLength: 4000,
    maxTotalStringChars: 200000,
    maxPlayerCardRefs: 5000,
});

const CLIENT_ERROR_LIMITS = Object.freeze({
    maxJsonBytes: 32 * 1024,
    maxStringLength: 4000,
    maxStackLength: 2400,
    maxMessageLength: 500,
    rateLimitWindowMs: 60 * 1000,
    rateLimitMax: 20,
    rateLimitMaxBuckets: 2000,
    duplicateWindowMs: 60 * 1000,
});
const clientErrorRateBuckets = new Map();
const clientErrorDedupeCache = new Map();
const CLIENT_ERROR_TEST_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function resolveTrustProxySetting(env = process.env) {
    const value = String(env.TRUST_PROXY || env.EXPRESS_TRUST_PROXY || '').trim();
    if (!value) return false;
    const lower = value.toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(lower)) return false;
    if (['1', 'true', 'yes', 'on'].includes(lower)) return 1;
    return value;
}

function truncateText(value, maxLength) {
    const text = String(value || '');
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function scrubClientErrorText(value) {
    return String(value || '').replace(/https?:\/\/[^\s)'\"]+/g, rawUrl => {
        try {
            const parsed = new URL(rawUrl);
            return parsed.origin + parsed.pathname;
        } catch (_error) {
            return rawUrl.split(/[?#]/)[0];
        }
    });
}

function normalizeClientErrorNumber(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 1000000 ? number : null;
}

function normalizeClientErrorPlayerIndex(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= -1 && number <= 20 ? number : null;
}

function normalizeClientErrorPayload(payload, now = Date.now()) {
    if (!isPlainObject(payload)) return { ok: false, reason: 'payload must be an object' };
    const message = truncateText(scrubClientErrorText(payload.message), CLIENT_ERROR_LIMITS.maxMessageLength).trim();
    const stack = truncateText(scrubClientErrorText(payload.stack), CLIENT_ERROR_LIMITS.maxStackLength);
    if (!message && !stack) return { ok: false, reason: 'message or stack is required' };
    const report = {
        source: truncateText(payload.source || 'client', 80),
        message: message || '(no message)',
        stack,
        filename: truncateText(scrubClientErrorText(payload.filename), 300),
        line: normalizeClientErrorNumber(payload.line),
        column: normalizeClientErrorNumber(payload.column),
        userAgent: truncateText(payload.userAgent, 300),
        phase: truncateText(payload.phase, 80),
        roomId: truncateText(payload.roomId, 40),
        playerIndex: normalizeClientErrorPlayerIndex(payload.playerIndex),
        timestamp: truncateText(payload.timestamp || new Date(now).toISOString(), 80),
        appVersion: truncateText(payload.appVersion || BUILD_HASH, 80),
        url: truncateText(scrubClientErrorText(payload.url), 300),
        receivedAt: new Date(now).toISOString(),
    };
    return { ok: true, report };
}

function clientErrorRateKey(req) {
    return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

function requestHeader(req, name) {
    if (!req) return '';
    if (typeof req.get === 'function') return req.get(name) || '';
    const headers = req.headers || {};
    return headers[name.toLowerCase()] || headers[name] || '';
}

function normalizeOriginValue(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
        const parsed = new URL(text);
        return parsed.origin;
    } catch (_error) {
        return '';
    }
}

function requestBaseOrigin(req) {
    const host = requestHeader(req, 'host');
    if (!host) return '';
    const forwardedProto = requestHeader(req, 'x-forwarded-proto').split(',')[0].trim();
    const proto = forwardedProto || req?.protocol || 'http';
    return normalizeOriginValue(proto + '://' + host);
}

function clientErrorAllowedOrigins(req, env = process.env) {
    const configured = String(env.CLIENT_ERROR_ALLOWED_ORIGINS || env.CLIENT_ERROR_ALLOWED_ORIGIN || '')
        .split(',')
        .map(normalizeOriginValue)
        .filter(Boolean);
    const sameOrigin = requestBaseOrigin(req);
    if (sameOrigin) configured.push(sameOrigin);
    return Array.from(new Set(configured));
}

function isClientErrorOriginAllowed(req, env = process.env) {
    const origin = normalizeOriginValue(requestHeader(req, 'origin')) || normalizeOriginValue(requestHeader(req, 'referer'));
    if (!origin) return true;
    const allowed = clientErrorAllowedOrigins(req, env);
    return allowed.includes(origin);
}

function isProductionNoOriginClientErrorBlocked(req, env = process.env) {
    const hasOrigin = !!(normalizeOriginValue(requestHeader(req, 'origin')) || normalizeOriginValue(requestHeader(req, 'referer')));
    if (hasOrigin) return false;
    if (clientErrorSharedToken(env)) return false;
    if (String(env.CLIENT_ERROR_ALLOW_NO_ORIGIN || '').trim()) return false;
    return String(env.NODE_ENV || '').toLowerCase() === 'production' && !!String(env.NTFY_TOPIC || '').trim();
}

function clientErrorSharedToken(env = process.env) {
    return String(env.CLIENT_ERROR_SHARED_TOKEN || env.CLIENT_ERROR_TOKEN || '').trim();
}

function requestClientErrorToken(req) {
    const headerToken = String(requestHeader(req, 'x-client-error-token') || '').trim();
    if (headerToken) return headerToken;
    const authorization = String(requestHeader(req, 'authorization') || '').trim();
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function authorizeClientErrorRequest(req, env = process.env) {
    if (!isClientErrorOriginAllowed(req, env)) return { ok: false, error: 'forbidden_origin' };
    if (isProductionNoOriginClientErrorBlocked(req, env)) return { ok: false, error: 'forbidden_origin' };
    const expectedToken = clientErrorSharedToken(env);
    if (!expectedToken) return { ok: true };
    return requestClientErrorToken(req) === expectedToken
        ? { ok: true }
        : { ok: false, error: 'invalid_client_error_token' };
}

function pruneClientErrorRateBuckets(now, buckets = clientErrorRateBuckets) {
    for (const [bucketKey, bucket] of buckets.entries()) {
        if (!bucket || now - bucket.windowStart >= CLIENT_ERROR_LIMITS.rateLimitWindowMs) buckets.delete(bucketKey);
    }
    if (buckets.size <= CLIENT_ERROR_LIMITS.rateLimitMaxBuckets) return;
    const overflow = buckets.size - CLIENT_ERROR_LIMITS.rateLimitMaxBuckets;
    for (const bucketKey of Array.from(buckets.keys()).slice(0, overflow)) buckets.delete(bucketKey);
}

function isClientErrorRateLimited(key, now = Date.now(), buckets = clientErrorRateBuckets) {
    pruneClientErrorRateBuckets(now, buckets);
    const bucket = buckets.get(key);
    if (!bucket) {
        buckets.set(key, { windowStart: now, count: 1 });
        return false;
    }
    bucket.count++;
    return bucket.count > CLIENT_ERROR_LIMITS.rateLimitMax;
}

function clientErrorDedupeKey(report) {
    return crypto.createHash('sha256').update(JSON.stringify({
        source: report.source,
        message: report.message,
        stack: report.stack.slice(0, 600),
        filename: report.filename,
        line: report.line,
        column: report.column,
        userAgent: report.userAgent,
        phase: report.phase,
        roomId: report.roomId,
    })).digest('hex');
}

function isDuplicateClientError(report, now = Date.now(), cache = clientErrorDedupeCache) {
    const key = clientErrorDedupeKey(report);
    const previous = cache.get(key);
    cache.set(key, now);
    for (const [cachedKey, timestamp] of cache.entries()) {
        if (now - timestamp > CLIENT_ERROR_LIMITS.duplicateWindowMs) cache.delete(cachedKey);
    }
    return previous !== undefined && now - previous < CLIENT_ERROR_LIMITS.duplicateWindowMs;
}

function summarizeUserAgent(userAgent) {
    const text = String(userAgent || 'unknown');
    if (/iPhone|iPad|iPod/.test(text) && /Safari/.test(text)) return 'Safari iPhone';
    if (/Android/.test(text) && /Chrome/.test(text)) return 'Android Chrome';
    if (/Safari/.test(text) && !/Chrome/.test(text)) return 'Safari';
    if (/Chrome/.test(text)) return 'Chrome';
    return text.slice(0, 80);
}

function redactedClientErrorRoomId(roomId) {
    const text = String(roomId || '').trim();
    if (!text) return '-';
    return 'hash:' + crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

function formatNtfyClientErrorMessage(report) {
    const lines = [
        'phase=' + (report.phase || 'unknown'),
        'room=' + redactedClientErrorRoomId(report.roomId),
        'player=' + (report.playerIndex ?? '-'),
        'version=' + (report.appVersion || '-'),
        summarizeUserAgent(report.userAgent),
        report.message,
    ];
    if (report.filename) lines.push(report.filename + ':' + (report.line ?? '-') + ':' + (report.column ?? '-'));
    if (report.stack) lines.push('', truncateText(report.stack, CLIENT_ERROR_LIMITS.maxStackLength));
    return lines.join('\n');
}

async function notifyClientError(report, options = {}) {
    const topic = options.topic || process.env.NTFY_TOPIC;
    if (!topic) {
        console.warn('[client-error]', report.message, 'phase=' + (report.phase || 'unknown'), 'room=' + redactedClientErrorRoomId(report.roomId));
        return { sent: false, reason: 'missing-topic' };
    }
    const fetchImpl = options.fetchImpl || global.fetch;
    if (typeof fetchImpl !== 'function') {
        console.warn('[client-error] fetch unavailable; ntfy notification skipped');
        return { sent: false, reason: 'fetch-unavailable' };
    }
    try {
        const response = await fetchImpl('https://ntfy.sh/' + encodeURIComponent(topic), {
            method: 'POST',
            headers: {
                Title: '[Machikoro] Client Error',
                Priority: '4',
                Tags: 'warning,computer',
            },
            body: formatNtfyClientErrorMessage(report),
        });
        if (response && response.ok === false) {
            console.warn('[client-error] ntfy notification failed:', response.status || 'unknown');
            return { sent: false, reason: 'ntfy-status' };
        }
        return { sent: true };
    } catch (error) {
        console.warn('[client-error] ntfy notification failed:', error?.message || error);
        return { sent: false, reason: 'ntfy-error' };
    }
}

async function handleClientErrorRequest(req, res, options = {}) {
    const auth = authorizeClientErrorRequest(req, options.env || process.env);
    if (!auth.ok) {
        res.status(403).json({ ok: false, error: auth.error });
        return;
    }
    const now = options.now || Date.now();
    const rateKey = clientErrorRateKey(req);
    if (isClientErrorRateLimited(rateKey, now, options.rateBuckets || clientErrorRateBuckets)) {
        res.status(429).json({ ok: false, error: 'rate_limited' });
        return;
    }
    const normalized = normalizeClientErrorPayload(req.body, now);
    if (!normalized.ok) {
        res.status(400).json({ ok: false, error: normalized.reason });
        return;
    }
    const duplicate = isDuplicateClientError(normalized.report, now, options.dedupeCache || clientErrorDedupeCache);
    if (!duplicate) {
        await notifyClientError(normalized.report, options.notifyOptions || {});
    }
    res.status(202).json({ ok: true, duplicate });
}


function isClientErrorTestEnabled(env = process.env) {
    const explicit = String(env.CLIENT_ERROR_TEST_ENABLED || '').toLowerCase();
    if (CLIENT_ERROR_TEST_ENABLED_VALUES.has(explicit)) return true;
    const nodeEnv = String(env.NODE_ENV || '').toLowerCase();
    return nodeEnv === 'development' || nodeEnv === 'test';
}

function buildClientErrorTestPayload(now = Date.now(), buildHash = BUILD_HASH) {
    return {
        source: 'manual-test-endpoint',
        message: 'Machikoro ntfy test notification',
        stack: 'Manual test via /api/client-error-test; no real client error occurred.',
        filename: 'server.js',
        line: null,
        column: null,
        userAgent: 'server-side test endpoint',
        phase: 'test',
        roomId: 'TEST01',
        playerIndex: 0,
        timestamp: new Date(now).toISOString(),
        appVersion: buildHash,
    };
}

async function handleClientErrorTestRequest(req, res, options = {}) {
    const env = options.env || process.env;
    const auth = authorizeClientErrorRequest(req, env);
    if (!auth.ok) {
        res.status(403).json({ ok: false, error: auth.error });
        return;
    }
    if (!isClientErrorTestEnabled(env)) {
        res.status(404).json({ ok: false, error: 'client_error_test_disabled' });
        return;
    }
    if (!env.NTFY_TOPIC && !(options.notifyOptions && options.notifyOptions.topic)) {
        console.warn('[client-error-test] NTFY_TOPIC is not set; test notification was not sent');
        res.status(503).json({ ok: false, error: 'missing_ntfy_topic', message: 'NTFY_TOPIC is not set' });
        return;
    }
    const now = options.now || Date.now();
    const normalized = normalizeClientErrorPayload(buildClientErrorTestPayload(now, options.buildHash || BUILD_HASH), now);
    if (!normalized.ok) {
        res.status(500).json({ ok: false, error: normalized.reason });
        return;
    }
    const result = await notifyClientError(normalized.report, options.notifyOptions || {});
    res.status(result.sent ? 202 : 503).json({ ok: result.sent, test: true, result });
}


function resolveBuildHash() {
    if (process.env.BUILD_HASH) return process.env.BUILD_HASH;
    try {
        return execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim();
    } catch {
        return Date.now().toString(36);
    }
}

function injectServiceWorkerBuildHash(content, buildHash) {
    return String(content).replace(/'machikoro-v[^']*'/, `'machikoro-${buildHash}'`);
}

function injectIndexBuildHash(content, buildHash) {
    const script = `<script>window.MACHIKORO_CLIENT_VERSION=${JSON.stringify(buildHash)};</script>`;
    return String(content).replace('</head>', `    ${script}\n</head>`);
}

const BUILD_HASH = require.main === module ? resolveBuildHash() : (process.env.BUILD_HASH || 'test');
if (require.main === module) {
    console.log(`Build hash: ${BUILD_HASH}`);
}

// sw.jsにビルドハッシュを注入して返す（staticより前に登録する必要がある）
const swTemplate = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const swContent = injectServiceWorkerBuildHash(swTemplate, BUILD_HASH);
const indexTemplate = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const indexContent = injectIndexBuildHash(indexTemplate, BUILD_HASH);
// TWA用 Digital Asset Links（ビルド後にSHA256フィンガープリントを更新すること）
const ASSET_LINKS = [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
        namespace: 'android_app',
        package_name: 'com.machikoro.game',
        sha256_cert_fingerprints: [
            '27:35:FB:EC:2C:82:C0:DD:5D:4D:24:C1:0F:36:6C:C2:F6:69:91:ED:6B:6B:80:15:BD:DE:2A:22:49:DC:2A:D1'
        ]
    }
}];
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(ASSET_LINKS);
});

app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(swContent);
});

app.get('/api/version', (req, res) => {
    res.json({ hash: BUILD_HASH });
});


app.use('/api/client-error', express.json({ limit: CLIENT_ERROR_LIMITS.maxJsonBytes }));
app.post('/api/client-error', (req, res) => {
    handleClientErrorRequest(req, res).catch((error) => {
        console.warn('[client-error] handler failed:', error?.message || error);
        res.status(202).json({ ok: true, notificationFailed: true });
    });
});

app.post('/api/client-error-test', (req, res) => {
    handleClientErrorTestRequest(req, res).catch((error) => {
        console.warn('[client-error-test] handler failed:', error?.message || error);
        res.status(503).json({ ok: false, error: 'client_error_test_failed' });
    });
});


function sendIndexWithBuildHash(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(indexContent);
}

app.get('/', sendIndexWithBuildHash);
app.get('/index.html', sendIndexWithBuildHash);

const PUBLIC_ROOT_FILES = Object.freeze(new Set([
    'style.css',
    'manifest.json',
    'sw.js',
    'privacy.html',
    'rules.html',
]));

const PUBLIC_STATIC_DIRS = Object.freeze([
    { route: '/js', directory: 'js' },
    { route: '/icons', directory: 'icons' },
    { route: '/models/rl_model/portfolio', directory: path.join('models', 'rl_model', 'portfolio') },
]);

function isPublicRootFile(fileName) {
    return PUBLIC_ROOT_FILES.has(String(fileName || '').replace(/^\/+/, ''));
}

function sendPublicRootFile(req, res, next) {
    const fileName = String(req.path || '').replace(/^\/+/, '');
    if (!isPublicRootFile(fileName)) return next();
    res.sendFile(path.join(__dirname, fileName));
}

app.get(Array.from(PUBLIC_ROOT_FILES).map(fileName => '/' + fileName), sendPublicRootFile);
for (const entry of PUBLIC_STATIC_DIRS) {
    app.use(entry.route, express.static(path.join(__dirname, entry.directory)));
}

// ===== Room lifecycle =====
const APP_ERROR_EVENT = 'appError';

function emitAppError(socket, message) {
    socket.emit(APP_ERROR_EVENT, message);
}

function requirePlainSocketPayload(socket, payload) {
    if (isPlainObject(payload)) return true;
    emitAppError(socket, '無効なリクエストです');
    return false;
}

function sanitizeName(name) {
    return String(name || '').trim().slice(0, 20).replace(/[<>&"'`]/g, '');
}

function cpuDifficultyLabel(difficulty) {
    if (difficulty === 'weak') return '弱';
    if (difficulty === 'normal') return '普';
    if (difficulty === 'strong') return '強';
    if (difficulty === 'rl') return '学';
    return '最強';
}

const ALLOWED_CPU_DIFFICULTIES = new Set(['weak', 'normal', 'strong', 'expert', 'rl']);
const ALLOWED_RL_MODEL_IDS = new Set([
    'self-only-4p-h256-lr1e5-5000-seed103',
    'self-only-both-h256-lr2e5-5000-seed71-rewardcap-top3',
    'self-only-both-h256-lr2e5-5000-seed70-rewardcap',
    'self-only-both-h256-lr2e5-5000-seed69-rewardcap',
]);

function normalizePlayerSettings(playerSettings, playerCount) {
    if (!Array.isArray(playerSettings)) {
        return Array.from({ length: playerCount }, () => ({ type: 'human', difficulty: 'normal' }));
    }
    const normalized = playerSettings.slice(0, playerCount).map((setting) => {
        if (!setting || setting.type !== 'cpu') return { type: 'human', difficulty: 'normal' };
        const difficulty = ALLOWED_CPU_DIFFICULTIES.has(setting.difficulty) ? setting.difficulty : 'normal';
        const normalized = { type: 'cpu', difficulty };
        if (difficulty === 'rl' && ALLOWED_RL_MODEL_IDS.has(setting.rlModelId)) {
            normalized.rlModelId = setting.rlModelId;
        }
        return normalized;
    });
    while (normalized.length < playerCount) {
        normalized.push({ type: 'human', difficulty: 'normal' });
    }
    return normalized;
}

function hasInvalidRlModelId(playerSettings) {
    if (!Array.isArray(playerSettings)) return false;
    return playerSettings.some(setting =>
        setting?.type === 'cpu' &&
        setting.difficulty === 'rl' &&
        typeof setting.rlModelId === 'string' &&
        !ALLOWED_RL_MODEL_IDS.has(setting.rlModelId)
    );
}

function hasMissingRlModelId(playerSettings) {
    if (!Array.isArray(playerSettings)) return false;
    return playerSettings.some(setting =>
        setting?.type === 'cpu' &&
        setting.difficulty === 'rl' &&
        typeof setting.rlModelId !== 'string'
    );
}

function hasInvalidOnlineRlModelSettings(playerSettings) {
    return hasMissingRlModelId(playerSettings) || hasInvalidRlModelId(playerSettings);
}

function normalizeCpuSpeed(cpuSpeed) {
    const value = Number(cpuSpeed);
    if (!Number.isFinite(value)) return 1500;
    return Math.max(0, Math.min(5000, Math.floor(value)));
}

function normalizeEnabledCards(enabledCards) {
    const allCards = gameRuntime.CARDS.map(card => card.name);
    if (!Array.isArray(enabledCards)) return allCards;
    const validCards = new Set(allCards);
    const selected = enabledCards.filter(name => validCards.has(name));
    return selected.length > 0 ? [...new Set(selected)] : allCards;
}

function generateReconnectToken() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

const ROOM_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function isValidRoomId(roomId) {
    if (typeof roomId !== 'string') return false;
    if (roomId.length < 1 || roomId.length > 64) return false;
    if (roomId === '__proto__' || roomId === 'constructor' || roomId === 'prototype') return false;
    return /^[A-Za-z0-9_-]+$/.test(roomId);
}

function hasOwnRoom(roomId) {
    return isValidRoomId(roomId) && Object.prototype.hasOwnProperty.call(rooms, roomId);
}

function generateRoomId(existingRooms = rooms) {
    let roomId;
    do {
        roomId = '';
        for (let i = 0; i < 6; i++) {
            roomId += ROOM_ID_ALPHABET[Math.floor(Math.random() * ROOM_ID_ALPHABET.length)];
        }
    } while (Object.prototype.hasOwnProperty.call(existingRooms, roomId));
    return roomId;
}

function hashReconnectToken(token) {
    return token ? crypto.createHash('sha256').update(String(token)).digest('hex') : '';
}

function acceptedClientActionKey(playerIndex, clientActionId) {
    return `${playerIndex}:${clientActionId}`;
}

function findAcceptedClientAction(room, clientActionId, playerIndex) {
    if (!room || typeof clientActionId !== 'string' || !clientActionId || !Number.isInteger(playerIndex)) return null;
    const matchesPlayer = entry => entry && entry.clientActionId === clientActionId && entry.playerIndex === playerIndex;
    const key = acceptedClientActionKey(playerIndex, clientActionId);
    if (room.acceptedClientActions && matchesPlayer(room.acceptedClientActions[key])) {
        return room.acceptedClientActions[key];
    }
    if (room.acceptedClientActions && matchesPlayer(room.acceptedClientActions[clientActionId])) {
        return room.acceptedClientActions[clientActionId];
    }
    return (room.actionLog || []).find(matchesPlayer) || null;
}

function rememberAcceptedClientAction(room, actionEntry) {
    if (!room || !actionEntry || typeof actionEntry.clientActionId !== 'string' || !actionEntry.clientActionId || !Number.isInteger(actionEntry.playerIndex)) return;
    if (!room.acceptedClientActions) room.acceptedClientActions = {};
    room.acceptedClientActions[acceptedClientActionKey(actionEntry.playerIndex, actionEntry.clientActionId)] = actionEntry;
    const ids = Object.keys(room.acceptedClientActions);
    if (ids.length > 100) {
        ids.sort((a, b) => (room.acceptedClientActions[a].seq || 0) - (room.acceptedClientActions[b].seq || 0));
        for (const id of ids.slice(0, ids.length - 100)) delete room.acceptedClientActions[id];
    }
}

function acceptedClientActionRefs(room) {
    if (!room || !room.acceptedClientActions) return [];
    return Object.values(room.acceptedClientActions)
        .filter(entry => entry && typeof entry.clientActionId === 'string' && Number.isInteger(entry.playerIndex))
        .map(entry => {
            const ref = { playerIndex: entry.playerIndex, clientActionId: entry.clientActionId };
            if (Number.isInteger(entry.seq)) ref.seq = entry.seq;
            return ref;
        });
}

// ===== Socket events =====
// 開始済み/未開始ルームのGC。未開始roomはspam対策として短めに削除する。
const roomGcInterval = setInterval(() => {
    cleanupExpiredRooms(Date.now(), rooms);
}, 10 * 60 * 1000);
if (typeof roomGcInterval.unref === 'function') {
    roomGcInterval.unref();
}

io.on('connection', (socket) => {
    console.log('接続:', socket.id);

    socket.on('createRoom', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { playerName, playerCount, playerSettings, cpuSpeed, enabledCards, enabledLandmarks, clientVersion } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        playerCount = Number(playerCount);
        if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) {
            emitAppError(socket, 'プレイヤー数が無効です');
            return;
        }
        if (hasInvalidOnlineRlModelSettings(playerSettings)) {
            emitAppError(socket, 'RLモデルIDが無効です');
            return;
        }
        playerSettings = normalizePlayerSettings(playerSettings, playerCount);
        cpuSpeed = normalizeCpuSpeed(cpuSpeed);
        const now = Date.now();
        const roomLifecycle = validateCreateRoomLifecycle(socket, now, rooms);
        if (!roomLifecycle.ok) {
            emitAppError(socket, roomLifecycle.message);
            return;
        }
        const roomId = generateRoomId();
        const reconnectToken = generateReconnectToken();
        const selectedCards = normalizeEnabledCards(enabledCards);
        const allLandmarks = gameRuntime.Player.landmarkNames();
        const validLandmarks = new Set(allLandmarks);
        const selectedLandmarks = Array.isArray(enabledLandmarks)
            ? enabledLandmarks.filter(name => validLandmarks.has(name))
            : allLandmarks;
        if (selectedLandmarks.length === 0) {
            emitAppError(socket, 'ランドマークは最低1つ必要です');
            return;
        }
        // ホストの人間枠を探す
        let hostIndex = 0;
        if (playerSettings && playerSettings.length > 0) {
            hostIndex = playerSettings.findIndex(s => s.type === "human");
            if (hostIndex === -1) {
                emitAppError(socket, 'オンライン対戦は最低1人の人間プレイヤーが必要です');
                return;
            }
        }
        markCreateRoomForSocket(socket, now);
        markCreateRoomForRateKey(createRoomRateKeyForSocket(socket), now);
        rooms[roomId] = {
            roomId,
            createdAt: now,
            lastTouchedAt: now,
            enabledCards: selectedCards,
            enabledLandmarks: selectedLandmarks,
            players: [{ id: socket.id, name: playerName, index: hostIndex, reconnectToken }],
            hostPlayerIndex: hostIndex,
            hostEpoch: 0,
            actionSeq: 0,
            acceptedClientActions: {},
            maxPlayers: playerCount,
            playerSettings,
            cpuSpeed,
            started: false,
        };
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = hostIndex;
        socket.emit('roomCreated', { roomId, playerIndex: hostIndex, reconnectToken });

        // 参加者リストを送信
        const playerList = buildPlayerList(rooms[roomId]);
        io.to(roomId).emit('playerList', playerList);

        // 人間が1人だけなら即開始チェック
        checkGameStart(io, roomId);
        console.log(`ルーム作成: ${roomId} (${playerCount}人)`);
    });

    socket.on('joinRoom', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        let { roomId, playerName, clientVersion } = payload;
        socket.clientVersion = clientVersion || 'unknown';
        playerName = sanitizeName(playerName);
        if (!playerName) { emitAppError(socket, '名前が無効です'); return; }
        if (!isValidRoomId(roomId)) { emitAppError(socket, 'ルームが見つかりません'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ルームが見つかりません'); return; }
        if (room.started) { emitAppError(socket, 'ゲームはすでに開始されています'); return; }

        // 重複参加チェック
        if (room.players.some(p => p.id === socket.id)) {
            emitAppError(socket, 'すでにこのルームに参加しています');
            return;
        }
        if (room.players.some(p => p.name === playerName)) {
            emitAppError(socket, 'その名前はすでに使われています');
            return;
        }

        // 人間枠を探す
        let playerIndex = -1;
        if (room.playerSettings.length > 0) {
            for (let i = 0; i < room.playerSettings.length; i++) {
                const taken = room.players.some(p => p.index === i);
                if (!taken && room.playerSettings[i].type === "human") {
                    playerIndex = i;
                    break;
                }
            }
        } else {
            if (room.players.length >= room.maxPlayers) {
                emitAppError(socket, '参加できる枠がありません');
                return;
            }
            playerIndex = room.players.length;
        }

        if (playerIndex === -1) {
            emitAppError(socket, '参加できる枠がありません');
            return;
        }

        const reconnectToken = generateReconnectToken();
        room.lastTouchedAt = Date.now();
        room.players.push({ id: socket.id, name: playerName, index: playerIndex, reconnectToken });
        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        socket.emit('roomJoined', { roomId, playerIndex, reconnectToken });

        // 参加者リストを送信
        const playerList = buildPlayerList(room);
        io.to(roomId).emit('playerList', playerList);

        // ゲーム開始チェック
        checkGameStart(io, roomId);
    });

    socket.on('gameAction', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const { action, data, clientActionId } = payload;
        const roomId = socket.roomId;
        if (!roomId) return;
        const room = rooms[roomId];
        if (!room || !room.started) return;
        if (!isActiveRoomSocket(room, socket)) {
            emitAppError(socket, 'INVALID_SESSION');
            return;
        }
        const safeClientActionId = normalizeClientActionId(clientActionId);
        const acceptedAction = findAcceptedClientAction(room, safeClientActionId, socket.playerIndex);
        if (acceptedAction) {
            socket.emit('actionAccepted', acceptedAction);
            return;
        }
        let validation;
        try {
            validation = validateGameAction(room, socket, action, data);
        } catch (e) {
            console.error('validateGameAction error:', e);
            emitAppError(socket, '無効な操作です');
            return;
        }
        if (!validation.ok) {
            emitAppError(socket, '無効な操作です');
            return;
        }
        let safeData = canonicalizeActionData(action, validation.data);
        if (action === 'buildCard' || action === 'buildLandmark') {
            room.lastUndoState = makeUndoStateFromMirror(validation.mirror.game, validation.mirror.shopStock);
        } else if (action === 'undoBuild') {
            safeData = { state: room.lastUndoState || validation.mirror.lastUndoState };
            room.lastUndoState = null;
        } else if (action === 'nextTurn') {
            room.lastUndoState = null;
        }
        const actionSeq = nextRoomActionSeq(room);
        const actionEntry = { action, data: safeData, playerIndex: socket.playerIndex, seq: actionSeq };
        if (safeClientActionId) actionEntry.clientActionId = safeClientActionId;
        if (!applyAcceptedActionToRoomCanonicalMirror(room, validation.mirror, actionEntry)) {
            emitAppError(socket, '無効な操作です');
            return;
        }
        room.lastUndoState = room.canonicalMirror?.lastUndoState || null;
        rememberAcceptedClientAction(room, actionEntry);
        if (room.actionLog) {
            room.actionLog.push(actionEntry);
            compactRoomActionLog(room);
            markRoomCanonicalMirrorCurrent(room);
            room.lastTouchedAt = Date.now();
        }
        socket.to(roomId).emit('gameAction', actionEntry);
        socket.emit('actionAccepted', actionEntry);
    });

    socket.on('rejoinRoom', (payload) => {
        if (!requirePlainSocketPayload(socket, payload)) return;
        const { roomId, playerIndex, playerName, reconnectToken } = payload;
        if (!isValidRoomId(roomId)) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        const room = rooms[roomId];
        if (!room) { emitAppError(socket, 'ROOM_NOT_FOUND'); return; }
        if (!room.started) { emitAppError(socket, 'ゲームはまだ開始されていません'); return; }
        const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
            emitAppError(socket, 'INVALID_TOKEN');
            return;
        }

        detachExistingPlayerSocket(room, roomId, playerIndex, socket.id);
        const player = resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socket.id);
        if (!player) { emitAppError(socket, '再接続情報が一致しません'); return; }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.playerIndex = playerIndex;
        room.lastTouchedAt = Date.now();

        socket.emit('rejoinData', {
            gameStartPayload: room.gameStartPayload,
            stateSnapshot: room.stateSnapshot || null,
            actionLog: room.actionLog || [],
            acceptedClientActions: acceptedClientActionRefs(room),
            playerIndex,
            hostPlayerIndex: room.hostPlayerIndex,
            hostEpoch: room.hostEpoch || 0,
        });
        io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
        console.log(`再接続: ${playerName} (ルーム: ${roomId})`);
    });

    // サーバー再起動後にホストがルームを復元する
    socket.on('recreateRoom', (payload) => {
        handleRecreateRoom(socket, payload);
    });

    socket.on('disconnect', () => {
        handleSocketDisconnect(io, socket);
    });
});

function handleSocketDisconnect(io, socket) {
    try {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            if (!room.started) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    const playerList = buildPlayerList(room);
                    io.to(roomId).emit('playerList', playerList);
                }
            } else {
                const disconnectedPlayer = room.players.find(p => p.index === socket.playerIndex);
                if (!disconnectedPlayer || disconnectedPlayer.id !== socket.id) return;
                disconnectedPlayer.id = null;
                io.to(roomId).emit('playerDisconnected', {
                    playerIndex: socket.playerIndex,
                    playerName: disconnectedPlayer.name || `プレイヤー${socket.playerIndex + 1}`,
                });
                // ホストが切断した場合、残存プレイヤーの中から新ホストを選出
                if (socket.playerIndex === room.hostPlayerIndex) {
                    const remaining = getRemainingConnectedPlayers(room, io.sockets.sockets, socket.id);
                    if (remaining.length > 0) {
                        setRoomHostPlayerIndex(room, remaining[0].index);
                        io.to(roomId).emit('hostChanged', { newHostPlayerIndex: room.hostPlayerIndex, hostEpoch: room.hostEpoch || 0 });
                        console.log(`ホスト移譲: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
                    }
                }
            }
            console.log(`切断: ${socket.id} (ルーム: ${roomId})`);
        }
    } catch (e) {
        console.error('disconnect handler error:', e);
    }
}

// ===== Room lifecycle helpers =====
function setRoomHostPlayerIndex(room, hostPlayerIndex) {
    if (room.hostPlayerIndex !== hostPlayerIndex) {
        room.hostEpoch = (Number.isInteger(room.hostEpoch) ? room.hostEpoch : 0) + 1;
    }
    room.hostPlayerIndex = hostPlayerIndex;
    if (room.gameStartPayload && typeof room.gameStartPayload === 'object') {
        room.gameStartPayload.hostPlayerIndex = hostPlayerIndex;
        room.gameStartPayload.hostEpoch = room.hostEpoch || 0;
    }
}

function nextRoomActionSeq(room) {
    const current = Number.isInteger(room.actionSeq) ? room.actionSeq : restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog).actionSeq;
    room.actionSeq = current + 1;
    if (room.gameStartPayload && typeof room.gameStartPayload === 'object') {
        room.gameStartPayload.actionSeq = room.actionSeq;
    }
    return room.actionSeq;
}


function resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socketId) {
    const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
    if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) return null;

    let player = room.players.find(p => p.index === playerIndex && p.name === playerName);
    if (!player) {
        player = {
            id: socketId,
            index: playerIndex,
            name: playerName,
            reconnectToken: '',
            reconnectTokenHash: expectedReconnectTokenHash,
        };
        room.players.push(player);
    } else if (!player.reconnectTokenHash) {
        player.reconnectTokenHash = expectedReconnectTokenHash;
    }
    player.id = socketId;
    return player;
}

function detachSocketFromRoom(socketId, roomId, message = 'INVALID_SESSION') {
    if (!socketId) return;
    const oldSocket = io.sockets.sockets.get(socketId);
    if (!oldSocket) return;
    emitAppError(oldSocket, message);
    oldSocket.leave(roomId);
    if (oldSocket.roomId === roomId) {
        oldSocket.roomId = null;
        oldSocket.playerIndex = null;
    }
}

function detachExistingPlayerSocket(room, roomId, playerIndex, newSocketId) {
    const existing = room?.players?.find(p => p.index === playerIndex);
    if (!existing || !existing.id || existing.id === newSocketId) return;
    detachSocketFromRoom(existing.id, roomId, 'INVALID_SESSION');
}

function detachRoomSockets(roomId, room, message = 'ROOM_REPLACED') {
    if (!room || !Array.isArray(room.players)) return;
    for (const player of room.players) {
        detachSocketFromRoom(player.id, roomId, message);
        player.id = null;
    }
}

function isActiveRoomSocket(room, socket) {
    if (!room || !socket || !Number.isInteger(socket.playerIndex)) return false;
    const player = room.players.find(p => p.index === socket.playerIndex);
    return !!player && player.id === socket.id;
}

function isRoomHostConnected(room) {
    if (!room || !Array.isArray(room.players) || !Number.isInteger(room.hostPlayerIndex)) return false;
    const hostPlayer = room.players.find(p => p.index === room.hostPlayerIndex);
    return !!(hostPlayer?.id && io.sockets.sockets.has(hostPlayer.id));
}

function getExpectedReconnectTokenHash(room, playerIndex, playerName) {
    const player = room.players.find(p => p.index === playerIndex && p.name === playerName);
    if (player?.reconnectTokenHash) return player.reconnectTokenHash;
    if (player?.reconnectToken) return hashReconnectToken(player.reconnectToken);

    const names = room.gameStartPayload?.playerNames || [];
    const reconnectTokenHashes = room.gameStartPayload?.reconnectTokenHashes;
    if (!Number.isInteger(playerIndex) || names[playerIndex] !== playerName || !Array.isArray(reconnectTokenHashes)) {
        return '';
    }
    return reconnectTokenHashes[playerIndex] || '';
}

function handleRecreateRoom(socket, payload = {}) {
    if (!isPlainObject(payload)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (!validateRestorePayloadLimits(payload).ok) {
        emitAppError(socket, '復元データが大きすぎます');
        return;
    }
    const { roomId, gameStartPayload, stateSnapshot, actionLog, playerIndex, playerName, reconnectToken } = payload;
    if (!roomId || !gameStartPayload || !reconnectToken) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (!isValidRoomId(roomId)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (hasOwnRoom(roomId)) {
        const room = rooms[roomId];
        if (!room.started) {
            emitAppError(socket, '同じルームIDが既に使用されています');
            return;
        }
        const existingReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        const incomingCanReplace = isValidGameStartPayload(gameStartPayload, Array.isArray(gameStartPayload.playerNames) ? gameStartPayload.playerNames.length : 0) &&
            !hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings) &&
            Number.isInteger(playerIndex) &&
            existingReconnectTokenHash &&
            hashReconnectToken(reconnectToken) === existingReconnectTokenHash &&
            room.hostPlayerIndex === playerIndex &&
            canReplaceRestoredRoom(room, playerIndex, gameStartPayload, stateSnapshot, actionLog);
        if (!incomingCanReplace) {
            const expectedReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
            if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
                emitAppError(socket, 'INVALID_TOKEN');
                return;
            }
            detachExistingPlayerSocket(room, roomId, playerIndex, socket.id);
            const player = resolveRejoinPlayer(room, playerIndex, playerName, reconnectToken, socket.id);
            if (!player) {
                emitAppError(socket, '再接続情報が一致しません');
                return;
            }
            socket.join(roomId);
            socket.roomId = roomId;
            socket.playerIndex = playerIndex;
            if (!isRoomHostConnected(room)) {
                setRoomHostPlayerIndex(room, playerIndex);
                io.to(roomId).emit('hostChanged', { newHostPlayerIndex: room.hostPlayerIndex, hostEpoch: room.hostEpoch || 0 });
                console.log(`ホスト再選出: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
            }
            room.lastTouchedAt = Date.now();
            socket.emit('rejoinData', {
                gameStartPayload: room.gameStartPayload,
                stateSnapshot: room.stateSnapshot || null,
                actionLog: room.actionLog || [],
                acceptedClientActions: acceptedClientActionRefs(room),
                playerIndex,
                hostPlayerIndex: room.hostPlayerIndex,
                hostEpoch: room.hostEpoch || 0,
            });
            io.to(roomId).emit('playerRejoined', { playerIndex, playerName });
            return;
        }
    }
    if (!Array.isArray(gameStartPayload.playerNames)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    const playerNames = gameStartPayload.playerNames;
    if (!isValidGameStartPayload(gameStartPayload, playerNames.length)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings)) {
        emitAppError(socket, 'RLモデルIDが無効です');
        return;
    }
    gameStartPayload.playerSettings = normalizePlayerSettings(gameStartPayload.playerSettings, playerNames.length);
    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerNames.length) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    const expectedReconnectTokenHash = getExpectedReconnectTokenHash({ players: [], gameStartPayload }, playerIndex, playerName);
    if (!expectedReconnectTokenHash || hashReconnectToken(reconnectToken) !== expectedReconnectTokenHash) {
        emitAppError(socket, 'INVALID_TOKEN');
        return;
    }
    if (!Number.isInteger(gameStartPayload.hostPlayerIndex) || gameStartPayload.hostPlayerIndex !== playerIndex) {
        emitAppError(socket, '復元は元のホストのみ実行できます');
        return;
    }
    const reconnectTokenHashes = Array.isArray(gameStartPayload.reconnectTokenHashes) ? gameStartPayload.reconnectTokenHashes : [];
    const restoredPlayers = playerNames
        .map((name, index) => {
            const setting = gameStartPayload.playerSettings?.[index];
            const reconnectTokenHash = reconnectTokenHashes[index];
            if (setting?.type === 'cpu' || !reconnectTokenHash) return null;
            return {
                id: index === playerIndex ? socket.id : null,
                index,
                name,
                reconnectToken: '',
                reconnectTokenHash,
            };
        })
        .filter(Boolean);
    const sanitizedActionLog = Array.isArray(actionLog)
        ? actionLog.filter(entry => entry && typeof entry.action === 'string')
            .map(entry => {
                const normalized = { action: entry.action, data: entry.data || {} };
                if (Number.isInteger(entry.playerIndex)) normalized.playerIndex = entry.playerIndex;
                if (Number.isInteger(entry.seq)) normalized.seq = entry.seq;
                const safeClientActionId = normalizeClientActionId(entry.clientActionId);
                if (safeClientActionId) normalized.clientActionId = safeClientActionId;
                return normalized;
            })
        : [];
    const restoredRank = restorePayloadRank(gameStartPayload, stateSnapshot, sanitizedActionLog);
    gameStartPayload.hostEpoch = restoredRank.hostEpoch;
    gameStartPayload.actionSeq = restoredRank.actionSeq;
    const restoredRoom = {
        roomId,
        players: restoredPlayers,
        playerSettings: gameStartPayload.playerSettings,
        maxPlayers: playerNames.length,
        started: true,
        restored: true,
        hostPlayerIndex: playerIndex,
        hostEpoch: restoredRank.hostEpoch,
        actionSeq: restoredRank.actionSeq,
        enabledCards: gameStartPayload.enabledCards || [],
        enabledLandmarks: gameStartPayload.enabledLandmarks || [],
        cpuSpeed: gameStartPayload.cpuSpeed || 1500,
        gameStartPayload,
        stateSnapshot: sanitizeClientStateSnapshot(stateSnapshot, playerNames.length),
        acceptedClientActions: {},
        actionLog: sanitizedActionLog,
        lastUndoState: null,
        lastTouchedAt: Date.now(),
    };
    for (const entry of restoredRoom.actionLog) rememberAcceptedClientAction(restoredRoom, entry);
    const restoredMirror = createRoomMirror(restoredRoom);
    if (!restoredMirror) {
        emitAppError(socket, '復元データが壊れています');
        return;
    }
    restoredRoom.canonicalMirror = restoredMirror;
    restoredRoom.lastUndoState = restoredMirror?.lastUndoState || null;
    restoredRoom.stateSnapshot = serializeMirrorState(
        restoredMirror.game,
        restoredMirror.shopStock,
        restoredRoom.lastUndoState,
        restoredRoom.actionSeq
    );
    restoredRoom.actionLog = [];
    if (hasOwnRoom(roomId)) {
        detachRoomSockets(roomId, rooms[roomId], 'ROOM_REPLACED');
        delete rooms[roomId];
    }
    rooms[roomId] = restoredRoom;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerIndex = playerIndex;
    socket.emit('rejoinData', {
        gameStartPayload,
        stateSnapshot: restoredRoom.stateSnapshot,
        actionLog: restoredRoom.actionLog,
        acceptedClientActions: acceptedClientActionRefs(restoredRoom),
        playerIndex,
        hostPlayerIndex: playerIndex,
        hostEpoch: restoredRoom.hostEpoch || 0,
    });
    console.log(`ルーム復元: ${roomId} by ${playerName}(${playerIndex})`);
}

// ===== Snapshot limits and restore payload guards =====
function validateRestorePayloadLimits(payload, limits = RESTORE_PAYLOAD_LIMITS) {
    if (!isPlainObject(payload)) return { ok: false, reason: 'not-object' };
    let jsonBytes = 0;
    try {
        jsonBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch {
        return { ok: false, reason: 'json' };
    }
    if (jsonBytes > limits.maxJsonBytes) return { ok: false, reason: 'json-size', jsonBytes };
    if (Array.isArray(payload.actionLog) && payload.actionLog.length > limits.maxActionLogEntries) {
        return { ok: false, reason: 'action-log-length', actionLogEntries: payload.actionLog.length };
    }

    const stats = { stringChars: 0, playerCardRefs: 0 };
    const visit = (value, key = '', depth = 0) => {
        if (depth > 20) return false;
        if (typeof value === 'string') {
            if (value.length > limits.maxStringLength) return false;
            stats.stringChars += value.length;
            return stats.stringChars <= limits.maxTotalStringChars;
        }
        if (Array.isArray(value)) {
            if ((key === 'cards' || key === 'playerCardNames') && value.every(item => typeof item === 'string' || Array.isArray(item))) {
                stats.playerCardRefs += countNestedStrings(value);
                if (stats.playerCardRefs > limits.maxPlayerCardRefs) return false;
            }
            for (const item of value) {
                if (!visit(item, key, depth + 1)) return false;
            }
            return true;
        }
        if (isPlainObject(value)) {
            for (const [childKey, childValue] of Object.entries(value)) {
                if (!visit(childValue, childKey, depth + 1)) return false;
            }
        }
        return true;
    };

    if (!visit(payload)) {
        return { ok: false, reason: 'content-size', stringChars: stats.stringChars, playerCardRefs: stats.playerCardRefs };
    }
    return { ok: true, jsonBytes, actionLogEntries: Array.isArray(payload.actionLog) ? payload.actionLog.length : 0, playerCardRefs: stats.playerCardRefs };
}

function countNestedStrings(value) {
    if (typeof value === 'string') return 1;
    if (!Array.isArray(value)) return 0;
    return value.reduce((sum, item) => sum + countNestedStrings(item), 0);
}

function sanitizeClientStateSnapshot(stateSnapshot, playerCount) {
    if (!isPlainObject(stateSnapshot)) return null;
    const sanitized = Object.assign({}, stateSnapshot);
    if (sanitized.undoState != null &&
        !isValidUndoState(sanitized.undoState, playerCount, gameRuntime.createCardByName)) {
        sanitized.undoState = null;
    }
    return sanitized;
}

function isValidGameStartPayload(payload, playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10) return false;
    if (!Array.isArray(payload.playerNames) ||
        payload.playerNames.length !== playerCount ||
        payload.playerNames.some(name => typeof name !== 'string')) return false;
    if (payload.playerSettings != null &&
        (!Array.isArray(payload.playerSettings) ||
        (payload.playerSettings.length !== 0 && payload.playerSettings.length !== playerCount))) return false;
    if (payload.playerOrder != null) {
        if (!Array.isArray(payload.playerOrder) || payload.playerOrder.length !== playerCount) return false;
        const sorted = [...payload.playerOrder].sort((a, b) => a - b);
        for (let i = 0; i < playerCount; i++) {
            if (sorted[i] !== i) return false;
        }
    }
    if (!Number.isInteger(payload.hostPlayerIndex) ||
        payload.hostPlayerIndex < 0 ||
        payload.hostPlayerIndex >= playerCount) return false;
    const knownCards = new Set(gameRuntime.CARDS.map(card => card.name));
    if (payload.enabledCards != null &&
        (!Array.isArray(payload.enabledCards) || payload.enabledCards.some(name => !knownCards.has(name)))) return false;
    const knownLandmarks = new Set(gameRuntime.Player.landmarkNames());
    if (payload.enabledLandmarks != null &&
        (!Array.isArray(payload.enabledLandmarks) ||
        payload.enabledLandmarks.length === 0 ||
        payload.enabledLandmarks.some(name => !knownLandmarks.has(name)))) return false;
    if (payload.cpuSpeed != null && (!Number.isFinite(payload.cpuSpeed) || payload.cpuSpeed < 0)) return false;
    return true;
}

function getRemainingConnectedPlayers(room, sockets, disconnectedSocketId) {
    return room.players.filter(p =>
        p.id &&
        p.id !== disconnectedSocketId &&
        sockets.has(p.id)
    );
}

function rollServerDie() {
    return crypto.randomInt(1, 7);
}

function makeServerDiceActionData(game, action, data, rollDie = rollServerDie) {
    if (!isPlainObject(data)) return data;
    const tunaDice = () => [rollDie(), rollDie()];
    if (action === 'rollDice') {
        if (game.currentPlayer().landmarks[gameRuntime.LANDMARK_NAMES.STATION]) {
            return { forceDice: null, tunaDice: null };
        }
        return { forceDice: rollDie(), tunaDice: tunaDice() };
    }
    if (action === 'selectDice') {
        if (typeof data.useTwo !== 'boolean') return data;
        return {
            useTwo: data.useTwo,
            diceCount: data.useTwo ? 2 : 1,
            d1: rollDie(),
            d2: data.useTwo ? rollDie() : 0,
            tunaDice: tunaDice(),
        };
    }
    if (action === 'rerollDice') {
        return { forceDice: rollDie(), tunaDice: tunaDice() };
    }
    return data;
}

function stableHashStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map(stableHashStringify).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    return '{' + keys.map(key => JSON.stringify(key) + ':' + stableHashStringify(value[key])).join(',') + '}';
}

function stableStateHash(value) {
    return crypto.createHash('sha256').update(stableHashStringify(value)).digest('hex').slice(0, 16);
}

function canonicalMirrorStateHash(mirror) {
    if (!mirror || !mirror.game) return null;
    const state = serializeMirrorState(mirror.game, mirror.shopStock, mirror.lastUndoState || null, 0);
    return stableStateHash(state);
}

function recordCanonicalMirrorMismatch(room, marker, previousHash, rebuiltHash) {
    if (!room || !previousHash || !rebuiltHash || previousHash === rebuiltHash) return;
    room.lastCanonicalMirrorMismatch = {
        previousHash,
        rebuiltHash,
        marker,
        detectedAt: Date.now(),
    };
    console.warn('canonical mirror mismatch detected', {
        roomId: room.roomId || null,
        previousHash,
        rebuiltHash,
        marker,
    });
}

function roomCanonicalMirrorMarker(room) {
    return {
        actionSeq: restorePayloadRank(room.gameStartPayload, room.stateSnapshot, room.actionLog).actionSeq,
        actionLogLength: Array.isArray(room.actionLog) ? room.actionLog.length : 0,
    };
}

function markRoomCanonicalMirrorCurrent(room) {
    const marker = roomCanonicalMirrorMarker(room);
    room.canonicalMirrorActionSeq = marker.actionSeq;
    room.canonicalMirrorActionLogLength = marker.actionLogLength;
    room.canonicalMirrorStateHash = canonicalMirrorStateHash(room.canonicalMirror);
}

function resetRoomCanonicalMirror(room) {
    room.canonicalMirror = createRoomMirror(room);
    markRoomCanonicalMirrorCurrent(room);
    return room.canonicalMirror;
}

function getRoomCanonicalMirror(room) {
    if (!room) return null;
    const marker = roomCanonicalMirrorMarker(room);
    if (!room.canonicalMirror ||
            room.canonicalMirrorActionSeq !== marker.actionSeq ||
            room.canonicalMirrorActionLogLength !== marker.actionLogLength) {
        const recordedHash = room.canonicalMirrorStateHash;
        const currentHash = canonicalMirrorStateHash(room.canonicalMirror);
        const mirror = createRoomMirror(room);
        const rebuiltHash = canonicalMirrorStateHash(mirror);
        if (recordedHash && currentHash && recordedHash !== currentHash) {
            recordCanonicalMirrorMismatch(room, marker, currentHash, rebuiltHash);
        }
        room.canonicalMirror = mirror;
        markRoomCanonicalMirrorCurrent(room);
        return room.canonicalMirror;
    }
    return room.canonicalMirror;
}

function applyAcceptedActionToRoomCanonicalMirror(room, mirror, actionEntry) {
    if (!room || !mirror || !actionEntry) return false;
    const { action, data } = actionEntry;
    if (action === 'buildCard' || action === 'buildLandmark') {
        mirror.lastUndoState = makeUndoStateFromMirror(mirror.game, mirror.shopStock);
    }
    const ok = applyActionToMirror(mirror.game, mirror.shopStock, action, data, gameRuntime.createCardByName) !== false;
    if (!ok) return false;
    if (action === 'undoBuild' || action === 'nextTurn') {
        mirror.lastUndoState = null;
    }
    room.canonicalMirror = mirror;
    return true;
}


function buildPlayerList(room) {
    if (room.playerSettings.length === 0) {
        return room.players.map(p => p.name);
    }
    return room.playerSettings.map((s, i) => {
        if (s.type === "cpu") {
            const diffLabel = cpuDifficultyLabel(s.difficulty);
            return `CPU（${diffLabel}）`;
        }
        const p = room.players.find(p => p.index === i);
        if (p) return p.name;
        return "待機中...";
    });
}

// ===== Mirror replay =====
function loadGameRuntime() {
    const context = { console };
    vm.createContext(context);
    for (const file of ['js/Card.js', 'js/Player.js', 'js/GameManager.js']) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }
    vm.runInContext(
        'this.Card = Card; this.Player = Player; this.GameManager = GameManager; this.CARDS = CARDS; this.createCardByName = createCardByName; this.getInitialCardStock = getInitialCardStock; this.getShopStockCount = getShopStockCount; this.setShopStockCount = setShopStockCount; this.decrementShopStock = decrementShopStock; this.assignShopStockSnapshot = assignShopStockSnapshot; this.resolveCardStockName = resolveCardStockName; this.GAME_PHASES = GAME_PHASES; this.GAME_ACTIONS = GAME_ACTIONS; this.GAME_ACTION_REGISTRY = GAME_ACTION_REGISTRY; this.GAME_PHASE_ACTIONS = GAME_PHASE_ACTIONS; this.CARD_CATEGORIES = CARD_CATEGORIES; this.LANDMARK_NAMES = LANDMARK_NAMES;',
        context
    );
    return context;
}

// ===== Validation =====
function canonicalizeActionData(action, data) {
    if (!isPlainObject(data)) return {};
    switch (action) {
        case 'rollDice':
            return { forceDice: data.forceDice, tunaDice: data.tunaDice };
        case 'selectDice':
            return { useTwo: data.useTwo, diceCount: data.diceCount, d1: data.d1, d2: data.d2, tunaDice: data.tunaDice };
        case 'rerollDice':
            return { forceDice: data.forceDice, tunaDice: data.tunaDice };
        case 'skipReroll':
        case 'nextTurn':
            return {};
        case 'resolveHarbor':
            return { useBonus: data.useBonus };
        case 'resolveTV':
            return { targetIndex: data.targetIndex };
        case 'resolveBusiness':
            return { myCard: data.myCard, targetIndex: data.targetIndex, theirCard: data.theirCard };
        case 'resolveCleaning':
            return { cardName: data.cardName };
        case 'resolveMover':
            return Number.isInteger(data.cardIndex)
                ? { cardIndex: data.cardIndex, targetIndex: data.targetIndex }
                : { cardName: data.cardName, targetIndex: data.targetIndex };
        case 'resolveRenovation':
            return { landmarkName: data.landmarkName };
        case 'resolveIT':
            return { doSave: data.doSave };
        case 'buildCard':
            return { cardName: data.cardName };
        case 'buildLandmark':
            return { name: data.name };
        case 'undoBuild':
            return {};
        default:
            return {};
    }
}

function normalizeClientActionId(clientActionId) {
    if (typeof clientActionId !== 'string') return '';
    return /^[A-Za-z0-9:_-]{1,120}$/.test(clientActionId) ? clientActionId : '';
}

function validateGameAction(room, socket, action, data) {
    const mirror = getRoomCanonicalMirror(room);
    if (!mirror) return { ok: false };
    const { game, cpuPlayers, shopStock } = mirror;
    if (game.checkWinner && game.checkWinner()) return { ok: false };
    const currentIndex = game.currentPlayerIndex;
    const currentIsCpu = !!cpuPlayers[currentIndex];
    const hostPlayerIndex = room.hostPlayerIndex;

    // playerOrderシャッフル後のゲーム内位置→元のプレイヤーインデックスに変換
    const playerOrder = room.gameStartPayload?.playerOrder;
    const originalCurrentIndex = playerOrder ? playerOrder[currentIndex] : currentIndex;

    if (currentIsCpu) {
        if (socket.playerIndex !== hostPlayerIndex) return { ok: false };
    } else if (socket.playerIndex !== originalCurrentIndex) {
        return { ok: false };
    }

    const allowed = getAllowedActions(game);
    if (!allowed.has(action)) return { ok: false };

    const authoritativeData = makeServerDiceActionData(game, action, data);
    return {
        ok: validateActionPayloadForState(room, game, shopStock, action, authoritativeData, {
            undoState: room.lastUndoState || mirror.lastUndoState,
            requireUndoPayload: false,
        }),
        mirror,
        data: authoritativeData,
    };
}


function checkGameStart(io, roomId) {
    const room = rooms[roomId];
    if (!room || room.started) return;

    // 人間枠が全員揃ったか確認
    const humanSlots = room.playerSettings.length > 0
        ? room.playerSettings.filter(s => s.type === "human").length
        : room.maxPlayers;

    if (room.players.length >= humanSlots) {
        room.started = true;
        let cpuCount = 0;
        const playerNames = room.playerSettings.length > 0
            ? room.playerSettings.map((s, i) => {
                if (s.type === "cpu") {
                    cpuCount++;
                    const diffLabel = cpuDifficultyLabel(s.difficulty);
                    return `CPU${cpuCount}（${diffLabel}）`;
                }
                const p = room.players.find(p => p.index === i);
                if (p) return p.name;
                return "不明";
            })
            : room.players.map(p => p.name);

        // ターン順をランダムにシャッフル
        const playerOrder = playerNames.map((_, i) => i);
        for (let i = playerOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerOrder[i], playerOrder[j]] = [playerOrder[j], playerOrder[i]];
        }

        const versions = room.players.map(p => {
            const s = io.sockets.sockets.get(p.id);
            return s ? (s.clientVersion || 'unknown') : 'unknown';
        });
        const gameStartPayload = {
            enabledCards: room.enabledCards,
            enabledLandmarks: room.enabledLandmarks,
            playerNames,
            playerSettings: room.playerSettings,
            cpuSpeed: room.cpuSpeed,
            playerOrder,
            hostPlayerIndex: room.hostPlayerIndex,
            hostEpoch: room.hostEpoch || 0,
            actionSeq: room.actionSeq || 0,
            versions,
            reconnectTokenHashes: playerNames.map((_, index) => {
                const player = room.players.find(p => p.index === index);
                return player?.reconnectToken ? hashReconnectToken(player.reconnectToken) : '';
            })
        };
        rooms[roomId].gameStartPayload = gameStartPayload;
        rooms[roomId].stateSnapshot = null;
        rooms[roomId].actionLog = [];
        rooms[roomId].lastUndoState = null;
        resetRoomCanonicalMirror(rooms[roomId]);
        rooms[roomId].lastTouchedAt = Date.now();
        io.to(roomId).emit('gameStart', gameStartPayload);
        console.log(`ゲーム開始: ${roomId} プレイヤー: ${playerNames.join(', ')}`);
    }
}

process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`サーバー起動: http://localhost:${PORT}`);
    });
}

// ===== Test exports =====
module.exports = {
    __rooms: rooms,
    APP_ERROR_EVENT,
    emitAppError,
    requirePlainSocketPayload,
    ROOM_LIFECYCLE_LIMITS,
    isRoomExpired,
    cleanupExpiredRooms,
    canCreateRoomForSocket,
    markCreateRoomForSocket,
    createRoomRateKeyForSocket,
    canCreateRoomForRateKey,
    markCreateRoomForRateKey,
    validateCreateRoomLifecycle,
    RESTORE_PAYLOAD_LIMITS,
    validateRestorePayloadLimits,
    CLIENT_ERROR_LIMITS,
    resolveTrustProxySetting,
    normalizeClientErrorPayload,
    requestHeader,
    requestBaseOrigin,
    clientErrorAllowedOrigins,
    isClientErrorOriginAllowed,
    clientErrorSharedToken,
    isProductionNoOriginClientErrorBlocked,
    requestClientErrorToken,
    authorizeClientErrorRequest,
    handleClientErrorRequest,
    isClientErrorRateLimited,
    pruneClientErrorRateBuckets,
    isDuplicateClientError,
    formatNtfyClientErrorMessage,
    redactedClientErrorRoomId,
    notifyClientError,
    isClientErrorTestEnabled,
    buildClientErrorTestPayload,
    handleClientErrorTestRequest,
    PUBLIC_ROOT_FILES,
    PUBLIC_STATIC_DIRS,
    isPublicRootFile,
    resolveBuildHash,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    sanitizeName,
    cpuDifficultyLabel,
    ALLOWED_RL_MODEL_IDS,
    normalizePlayerSettings,
    hasInvalidOnlineRlModelSettings,
    normalizeCpuSpeed,
    normalizeEnabledCards,
    isActiveRoomSocket,
    findAcceptedClientAction,
    rememberAcceptedClientAction,
    acceptedClientActionRefs,
    generateRoomId,
    isValidRoomId,
    canonicalizeActionData,
    normalizeClientActionId,
    nextRoomActionSeq,
    restorePayloadRank,
    restorePayloadRankDetails,
    buildPlayerList,
    resolveRejoinPlayer,
    handleSocketDisconnect,
    handleRecreateRoom,
    getRemainingConnectedPlayers,
    serializeMirrorState,
    restoreMirrorState,
    compactRoomActionLog,
    createRoomMirror,
    applyActionToMirror,
    restoreUndoMirror,
    makeUndoStateFromMirror,
    rollServerDie,
    makeServerDiceActionData,
    stableStateHash,
    canonicalMirrorStateHash,
    resetRoomCanonicalMirror,
    getRoomCanonicalMirror,
    markRoomCanonicalMirrorCurrent,
    applyAcceptedActionToRoomCanonicalMirror,
    validateBusinessPayload,
    validateCleaningPayload,
    validateMoverPayload,
    validateRenovationPayload,
    validateRollDicePayload,
    validateSelectDicePayload,
    validateRerollDicePayload,
    validateResolveHarborPayload,
    validateResolveITPayload,
    validateResolveTVPayload,
    validateBuildCardPayload,
    validateBuildLandmarkPayload,
    validateActionPayloadForState,
    validateGameAction,
    getAllowedActions,
    checkGameStart,
    loadGameRuntime,
    __io: io,
};
