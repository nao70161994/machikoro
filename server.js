const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { postNtfyNotification } = require('./server/ntfyNotifier');
const { makeClientErrorReporting } = require('./server/clientErrorReporting');
const {
    requestHeader,
    requestBaseOrigin,
    hasClientReportOrigin,
    clientErrorAllowedOrigins,
    isClientErrorOriginAllowed,
    clientErrorSharedToken,
    isProductionNoOriginClientErrorBlocked,
    requestClientErrorToken,
    authorizeClientErrorRequest,
} = require('./server/clientErrorAuth');
const {
    pruneRateBuckets,
    isRateLimited: isReportRateLimited,
    rememberAndCheckDuplicate,
} = require('./server/reportThrottle');
const {
    resolveTrustProxySetting,
    clientReportRateKey,
    resolveNtfyTopic,
    isClientErrorTestEnabled,
    createClientErrorTestPayload,
    gameLifecycleDedupeKey,
} = require('./server/reportingPolicy');
const { makeGameLifecycleReporting } = require('./server/gameLifecycleReporting');
const { makeSocketPayloadValidation } = require('./server/socketPayload');
const { registerLobbySocketHandlers } = require('./server/lobbySocketHandlers');
const { registerRejoinSocketHandler } = require('./server/rejoinSocketHandler');
const { registerActionSocketHandler } = require('./server/actionSocketHandler');
const { registerRecreateSocketHandler } = require('./server/recreateSocketHandler');
const { selectRestoreSource, decideExistingRoomRestore } = require('./server/restoreGateway');
const makeRestoredRoom = require('./server/restoredRoom');
const GameSchemaWire = require('./js/gameSchemaWire');
const GameSchemaRecreateWire = require('./js/gameSchemaRecreateWire');
const OnlineReconnectState = require('./js/onlineReconnectState');
const makeGameSettings = require('./server/gameSettings');
const makeGameStartPayload = require('./server/gameStartPayload');
const {
    sanitizeName,
    isValidRoomId,
    generateRoomId: generateUniqueRoomId,
} = require('./server/roomValidation');
const {
    PUBLIC_ROOT_FILES,
    PUBLIC_STATIC_DIRS,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    isPublicRootFile,
} = require('./server/staticAssets');
const {
    findAcceptedClientAction,
    rememberAcceptedClientAction,
    acceptedClientActionRefs,
} = require('./server/actionAcceptance');
const makeRejoinPayload = require('./server/rejoinPayload');
const {
    generateReconnectToken,
    hashReconnectToken,
    getExpectedReconnectTokenHash,
    isValidRestoreReconnectTokenHashes,
} = require('./server/reconnectIdentity')({ crypto });
const {
    HOSTLESS_RESTORE_GENERATION_FIELD,
    HOSTLESS_RESTORE_COUNT_FIELD,
    makeHostlessRestoreGateway,
} = require('./server/hostlessRestoreGateway');
const { createHostlessRestoreCoordinator } = require('./server/hostlessRestoreCoordinator');
const {
    createHostlessRestoreRuntime,
    hostlessRestoreEnabled,
} = require('./server/hostlessRestoreRuntime');
const { createDisconnectSocketHandler } = require('./server/disconnectSocketHandler');
const {
    gameSchemaNegotiationEnabled,
    gameSchemaWireEnabled,
    gameSchemaSnapshotWireEnabled,
    gameSchemaRecreateWireEnabled,
    localSaveSchemaWriteEnabled,
    resolveClientGameSchemaCapabilities,
    negotiateRoomGameSchemaCandidate,
    isValidGameSchemaMetadata,
    supportsSelectedGameSchema,
    supportsSelectedGameSchemaForRuntime,
    gameSchemaStartMetadata,
} = require('./server/gameSchemaRuntime');
const GAME_SCHEMA_NEGOTIATION_ENABLED = gameSchemaNegotiationEnabled(process.env);
const GAME_SCHEMA_WIRE_ENABLED = GAME_SCHEMA_NEGOTIATION_ENABLED && gameSchemaWireEnabled(process.env);
const GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED = GAME_SCHEMA_NEGOTIATION_ENABLED &&
    gameSchemaSnapshotWireEnabled(process.env);
const GAME_SCHEMA_RECREATE_WIRE_ENABLED = GAME_SCHEMA_NEGOTIATION_ENABLED &&
    gameSchemaRecreateWireEnabled(process.env);
const LOCAL_SAVE_SCHEMA_WRITE_ENABLED = localSaveSchemaWriteEnabled(process.env);
const { gameSchemaShadowEnabled, makeGameSchemaShadow } = require('./server/gameSchemaShadow');
const {
    gameEngineTransitionAuthorityEnabled,
    makeGameEngineTransitionAuthority,
} = require('./server/gameEngineAuthority');
const GAME_SCHEMA_SHADOW_ENABLED = GAME_SCHEMA_NEGOTIATION_ENABLED && gameSchemaShadowEnabled(process.env);
const GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED = GAME_SCHEMA_SHADOW_ENABLED &&
    gameEngineTransitionAuthorityEnabled(process.env);
const ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED =
    OnlineReconnectState.eventAuthorityEnabled(process.env);

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
    ACTION_PAYLOAD_VALIDATORS,
    validateActionPayloadForState,
    getAllowedActions,
} = require('./server/actionValidation')({ gameRuntime });
const {
    CANONICAL_ACTION_PAYLOAD_KEYS,
    canonicalizeActionData,
    normalizeClientActionId,
} = require('./server/actionPayload')({ isPlainObject });
const {
    SERVER_AUTHORITATIVE_DICE_ACTIONS,
    isServerAuthoritativeDiceAction,
    makeServerDiceActionData,
} = require('./server/serverDice')({
    isPlainObject,
    stationName: gameRuntime.LANDMARK_NAMES.STATION,
    rollDie: rollServerDie,
});
const MAX_ACTION_LOG_LENGTH = 200;
const {
    serializeMirrorState,
    transitionMirrorEnvelope,
    restoreMirrorState,
    adoptTransitionSnapshotToRoomMirror,
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
const {
    buildRestoredHumanPlayers,
    sanitizeClientStateSnapshot,
    isValidGameStartPayload,
} = require('./server/restoreValidation')({
    isPlainObject,
    isValidUndoState,
    createCardByName: gameRuntime.createCardByName,
    cards: gameRuntime.CARDS,
    landmarkNames: gameRuntime.Player.landmarkNames,
    sanitizeName,
    isValidGameSchemaMetadata,
});
const {
    buildRestoredRoom,
    planRestoredRoomMetadata,
    planRestoredRoomActivation,
    activationDecisions: restoredRoomActivationDecisions,
} = makeRestoredRoom({
    sanitizeStateSnapshot: sanitizeClientStateSnapshot,
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
    createCanonicalStateStoreFromEnv,
    buildCanonicalStateRecord,
    validateCanonicalStateRecord,
} = require('./server/canonicalStateStore');
const {
    validateRestoreAuditRecord,
    buildUnsignedRestoreAuditRecord,
    buildSignedRestoreAuditRecord,
    verifySignedRestoreAuditRecord,
} = require('./server/restoreAudit');
const { restoreAuditKeyringConfig } = require('./server/restoreAuditKeyring');
const {
    restoreSnapshotActionSeq,
    sanitizeRestoreActionLogEntry,
    sanitizeRestoreActionLog,
} = require('./server/restoreSanitization')({
    isPlainObject,
    gameActionRegistry: gameRuntime.GAME_ACTION_REGISTRY,
    canonicalizeActionData,
    normalizeClientActionId,
    validateRestoreAuditRecord,
    isVerifiedRestoreActionAudit,
});
const {
    roomTimestamp,
    isRoomExpired,
    cleanupExpiredRooms,
    canCreateRoomForSocket,
    markCreateRoomForSocket,
    createRoomRateKeyForSocket,
    canCreateRoomForRateKey,
    markCreateRoomForRateKey,
    isSocketInActiveRoom,
    validateSocketCanEnterRoom,
    validateCreateRoomLifecycle,
    buildPlayerList: buildRoomPlayerList,
    countRoomHumanSlots: countRoomHumanSlotsForRoom,
    buildGameStartPlayerNames: buildGameStartPlayerNamesForRoom,
    shuffledPlayerOrder: shuffledRoomPlayerOrder,
    roomClientVersions: roomClientVersionsForSockets,
    roomReconnectTokenHashes: roomReconnectTokenHashesForRoom,
    getRemainingConnectedPlayers: getRemainingConnectedRoomPlayers,
    roomHostChangedPayload: buildRoomHostChangedPayload,
} = require('./server/roomLifecycle')({
    limits: ROOM_LIFECYCLE_LIMITS,
    defaultRooms: rooms,
    cpuDifficultyLabel,
    hashReconnectToken,
});
const {
    restorePayloadRank,
    restorePayloadRankDetails,
    isRestoreRankAction,
    isIncomingRestoreNewer,
    canReplaceRestoredRoom,
} = require('./server/restoreRank');
const {
    stableStateHash,
    canonicalMirrorStateHash,
    roomCanonicalMirrorMarker,
} = require('./server/canonicalMirrorMetadata')({
    serializeMirrorState,
    restorePayloadRank,
});
const gameSchemaShadow = makeGameSchemaShadow({
    enabled: GAME_SCHEMA_SHADOW_ENABLED,
    serializeMirrorState,
    transitionMirrorEnvelope,
    stableStateHash,
});
const gameEngineAuthority = makeGameEngineTransitionAuthority({
    enabled: GAME_ENGINE_TRANSITION_AUTHORITY_ENABLED,
});
const RESTORE_PAYLOAD_LIMITS = Object.freeze({
    maxJsonBytes: 1024 * 1024,
    maxActionLogEntries: 1000,
    maxStringLength: 4000,
    maxTotalStringChars: 200000,
    maxPlayerCardRefs: 5000,
});

const SOCKET_PAYLOAD_LIMITS = Object.freeze({
    maxJsonBytes: 16 * 1024,
    maxStringLength: 1000,
    maxTotalStringChars: 4000,
    maxDepth: 8,
});
const {
    validateSocketPayloadLimits,
    validateRestorePayloadLimits,
} = makeSocketPayloadValidation({
    isPlainObject,
    byteLength: value => Buffer.byteLength(value, 'utf8'),
    socketLimits: SOCKET_PAYLOAD_LIMITS,
    restoreLimits: RESTORE_PAYLOAD_LIMITS,
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
const GAME_LIFECYCLE_LIMITS = Object.freeze({
    duplicateWindowMs: 5 * 60 * 1000,
    rateLimitWindowMs: 60 * 1000,
    rateLimitMax: 12,
    rateLimitMaxBuckets: 1000,
});
const gameLifecycleRateBuckets = new Map();
const gameLifecycleDedupeCache = new Map();
const canonicalStateStore = createCanonicalStateStoreFromEnv(process.env);
function restoreAuditConfig() {
    return restoreAuditKeyringConfig(process.env);
}

function restoreAuditSecret() {
    return restoreAuditConfig().activeSecret;
}

function restoreAuditBuildOptions(now, source) {
    const config = restoreAuditConfig();
    const options = {
        crypto,
        secret: config.activeSecret,
        keyId: config.activeKeyId,
        now,
    };
    if (source) options.source = source;
    return options;
}

function restoreAuditVerificationOptions(roomId) {
    const config = restoreAuditConfig();
    return {
        roomId,
        crypto,
        keyring: config.keys,
        maxAgeMs: config.maxAgeMs,
        clockSkewMs: config.clockSkewMs,
    };
}

const {
    truncateText,
    scrubClientErrorText,
    normalizeClientErrorNumber,
    normalizeClientErrorPlayerIndex,
    normalizeClientErrorPayload,
    extractClientErrorFreezeKind,
    isStaleClientErrorVersion,
    classifyClientErrorReport,
    extractFreezeSummaryFromStack,
    formatNtfyFreezeSummary,
    formatNtfyClientErrorMessage,
    redactedClientErrorRoomId,
} = makeClientErrorReporting({
    isPlainObject,
    limits: CLIENT_ERROR_LIMITS,
    buildHash: () => BUILD_HASH,
    hashRoomId: roomId => crypto.createHash('sha256').update(roomId).digest('hex'),
});
const {
    lifecycleEventTitle,
    normalizeGameLifecyclePayload,
    formatNtfyGameLifecycleMessage,
} = makeGameLifecycleReporting({
    truncateText,
});

function pruneClientErrorRateBuckets(now, buckets = clientErrorRateBuckets) {
    pruneRateBuckets(now, buckets, CLIENT_ERROR_LIMITS.rateLimitWindowMs, CLIENT_ERROR_LIMITS.rateLimitMaxBuckets);
}

function isClientErrorRateLimited(key, now = Date.now(), buckets = clientErrorRateBuckets) {
    return isReportRateLimited(key, now, buckets, {
        windowMs: CLIENT_ERROR_LIMITS.rateLimitWindowMs,
        max: CLIENT_ERROR_LIMITS.rateLimitMax,
        maxBuckets: CLIENT_ERROR_LIMITS.rateLimitMaxBuckets,
    });
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
    return rememberAndCheckDuplicate(clientErrorDedupeKey(report), now, cache, CLIENT_ERROR_LIMITS.duplicateWindowMs);
}

async function notifyClientError(report, options = {}) {
    const classification = classifyClientErrorReport(report);
    return postNtfyNotification({
        topic: resolveNtfyTopic(options, options.env || process.env),
        fetchImpl: options.fetchImpl || global.fetch,
        title: classification.classification === 'unknown' ? '[ダイスシティ] Unknown Client Error' : '[ダイスシティ] Client Error',
        priority: classification.priority,
        tags: classification.tags,
        body: formatNtfyClientErrorMessage(report),
        onMissingTopic() {
            console.warn('[client-error]', report.message, 'phase=' + (report.phase || 'unknown'), 'room=' + redactedClientErrorRoomId(report.roomId));
        },
        fetchUnavailableMessage: '[client-error] fetch unavailable; ntfy notification skipped',
        statusFailureMessage: '[client-error] ntfy notification failed:',
        errorFailureMessage: '[client-error] ntfy notification failed:',
    });
}

async function handleClientErrorRequest(req, res, options = {}) {
    const auth = authorizeClientErrorRequest(req, options.env || process.env);
    if (!auth.ok) {
        res.status(403).json({ ok: false, error: auth.error });
        return;
    }
    const now = options.now || Date.now();
    const rateKey = clientReportRateKey(req);
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
        await notifyClientError(normalized.report, { env: options.env || process.env, ...(options.notifyOptions || {}) });
    }
    res.status(202).json({ ok: true, duplicate });
}


function buildClientErrorTestPayload(now = Date.now(), buildHash = BUILD_HASH) {
    return createClientErrorTestPayload(now, buildHash);
}

async function handleClientErrorTestRequest(req, res, options = {}) {
    const env = options.env || process.env;
    const auth = authorizeClientErrorRequest(req, env, { allowSameOriginWithoutToken: false });
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
    const result = await notifyClientError(normalized.report, { env, ...(options.notifyOptions || {}) });
    res.status(result.sent ? 202 : 503).json({ ok: result.sent, test: true, result });
}


function gameLifecycleRateKey(req) {
    return clientReportRateKey(req);
}

function isGameLifecycleRateLimited(key, now = Date.now(), buckets = gameLifecycleRateBuckets) {
    return isReportRateLimited(key, now, buckets, {
        windowMs: GAME_LIFECYCLE_LIMITS.rateLimitWindowMs,
        max: GAME_LIFECYCLE_LIMITS.rateLimitMax,
        maxBuckets: GAME_LIFECYCLE_LIMITS.rateLimitMaxBuckets,
    });
}

function isDuplicateGameLifecycle(report, now = Date.now(), cache = gameLifecycleDedupeCache) {
    return rememberAndCheckDuplicate(gameLifecycleDedupeKey(report), now, cache, GAME_LIFECYCLE_LIMITS.duplicateWindowMs);
}

async function notifyGameLifecycle(report, options = {}) {
    return postNtfyNotification({
        topic: resolveNtfyTopic(options, options.env || process.env),
        fetchImpl: options.fetchImpl || global.fetch,
        title: lifecycleEventTitle(report.event),
        priority: '2',
        tags: 'video_game,white_check_mark',
        body: formatNtfyGameLifecycleMessage(report),
        onMissingTopic() {
            console.warn('[game-lifecycle]', report.event, 'mode=' + report.mode, 'players=' + report.playerCount, 'cpu=' + report.cpuCount);
        },
        fetchUnavailableMessage: '[game-lifecycle] fetch unavailable; ntfy notification skipped',
        statusFailureMessage: '[game-lifecycle] ntfy notification failed:',
        errorFailureMessage: '[game-lifecycle] ntfy notification failed:',
    });
}

async function handleGameLifecycleRequest(req, res, options = {}) {
    const env = options.env || process.env;
    if (!isClientErrorOriginAllowed(req, env) || isProductionNoOriginClientErrorBlocked(req, env)) {
        res.status(403).json({ ok: false, error: 'forbidden_origin' });
        return;
    }
    const expectedToken = clientErrorSharedToken(env);
    if (!hasClientReportOrigin(req) && expectedToken && requestClientErrorToken(req) !== expectedToken) {
        res.status(403).json({ ok: false, error: 'invalid_client_error_token' });
        return;
    }
    const now = options.now || Date.now();
    if (isGameLifecycleRateLimited(gameLifecycleRateKey(req), now, options.rateBuckets || gameLifecycleRateBuckets)) {
        res.status(429).json({ ok: false, error: 'rate_limited' });
        return;
    }
    const normalized = normalizeGameLifecyclePayload(req.body, now);
    if (!normalized.ok) {
        res.status(400).json({ ok: false, error: normalized.reason });
        return;
    }
    const duplicate = isDuplicateGameLifecycle(normalized.report, now, options.dedupeCache || gameLifecycleDedupeCache);
    /** @type {{sent: boolean, reason?: string}} */
    let result = { sent: false, reason: duplicate ? 'duplicate' : 'not-sent' };
    if (!duplicate) result = await notifyGameLifecycle(normalized.report, { env, ...(options.notifyOptions || {}) });
    res.status(202).json({ ok: true, duplicate, result });
}


function resolveBuildHash() {
    if (process.env.BUILD_HASH) return process.env.BUILD_HASH;
    try {
        return execSync('git rev-parse --short HEAD', { timeout: 3000 }).toString().trim();
    } catch {
        return Date.now().toString(36);
    }
}

const IS_MAIN_MODULE = /** @type {{main?: unknown}} */ (require).main === module;
const BUILD_HASH = IS_MAIN_MODULE ? resolveBuildHash() : (process.env.BUILD_HASH || 'test');
if (IS_MAIN_MODULE) {
    console.log(`Build hash: ${BUILD_HASH}`);
}

// sw.jsにビルドハッシュを注入して返す（staticより前に登録する必要がある）
const swTemplate = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const swContent = injectServiceWorkerBuildHash(swTemplate, BUILD_HASH);
const indexTemplate = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const indexContent = injectIndexBuildHash(indexTemplate, BUILD_HASH, {
    gameSchemaNegotiationEnabled: GAME_SCHEMA_NEGOTIATION_ENABLED,
    gameSchemaWireEnabled: GAME_SCHEMA_WIRE_ENABLED,
    gameSchemaSnapshotWireEnabled: GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED,
    gameSchemaRecreateWireEnabled: GAME_SCHEMA_RECREATE_WIRE_ENABLED,
    localSaveSchemaWriteEnabled: LOCAL_SAVE_SCHEMA_WRITE_ENABLED,
    onlineReconnectEventAuthorityEnabled: ONLINE_RECONNECT_EVENT_AUTHORITY_ENABLED,
});
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
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ hash: BUILD_HASH });
});


app.use('/api/client-error', express.json({ limit: CLIENT_ERROR_LIMITS.maxJsonBytes }));
app.post('/api/client-error', (req, res) => {
    handleClientErrorRequest(req, res).catch((error) => {
        console.warn('[client-error] handler failed:', error?.message || error);
        res.status(202).json({ ok: true, notificationFailed: true });
    });
});

app.post('/api/client-error-test', express.json({ limit: '1kb' }), (req, res) => {
    handleClientErrorTestRequest(req, res).catch((error) => {
        console.warn('[client-error-test] handler failed:', error?.message || error);
        res.status(503).json({ ok: false, error: 'client_error_test_failed' });
    });
});

app.use('/api/game-lifecycle', express.json({ limit: '8kb' }));
app.post('/api/game-lifecycle', (req, res) => {
    handleGameLifecycleRequest(req, res).catch((error) => {
        console.warn('[game-lifecycle] handler failed:', error?.message || error);
        res.status(202).json({ ok: true, notificationFailed: true });
    });
});


function sendIndexWithBuildHash(req, res) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(indexContent);
}

app.get('/', sendIndexWithBuildHash);
app.get('/index.html', sendIndexWithBuildHash);

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
    const validation = validateSocketPayloadLimits(payload);
    if (validation.ok) return true;
    emitAppError(socket, '無効なリクエストです');
    return false;
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

const gameSettings = makeGameSettings({
    cardNames: gameRuntime.CARDS.map(card => card.name),
    allowedCpuDifficulties: ALLOWED_CPU_DIFFICULTIES,
    allowedRlModelIds: ALLOWED_RL_MODEL_IDS,
});

const {
    normalizePlayerSettings,
    hasInvalidOnlineRlModelSettings,
    normalizeCpuSpeed,
    normalizeEnabledCards,
} = gameSettings;

function hasOwnRoom(roomId) {
    return isValidRoomId(roomId) && Object.prototype.hasOwnProperty.call(rooms, roomId);
}

function generateRoomId(existingRooms = rooms) {
    return generateUniqueRoomId(existingRooms);
}

const { buildRejoinDataPayload: buildRawRejoinDataPayload } = makeRejoinPayload({
    acceptedClientActionRefs,
    buildRestoreSnapshotAudit,
});

function buildRejoinDataPayload(room, playerIndex, overrides = {}) {
    const payload = buildRawRejoinDataPayload(room, playerIndex, overrides);
    const selection = payload.gameStartPayload && payload.gameStartPayload.gameSchema || null;
    const encoded = GameSchemaWire.encodeSnapshotField(
        GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED,
        selection,
        payload
    );
    return encoded.ok ? encoded.value : null;
}

function persistRoomCanonicalState(roomId, room, reason, now = Date.now(), store = canonicalStateStore) {
    if (!store || typeof store.save !== 'function') return { ok: true, skipped: true };
    const record = buildCanonicalStateRecord(roomId, room, { reason, now });
    if (!record) return { ok: false, reason: 'invalid-record' };
    try {
        return store.save(record);
    } catch (error) {
        console.warn('[canonical-state-store] save failed:', error && error.message || error);
        return { ok: false, reason: 'save-failed' };
    }
}

function loadRoomCanonicalStateRecord(roomId, store = canonicalStateStore) {
    if (!store || typeof store.load !== 'function') return null;
    try {
        const record = store.load(roomId);
        const validation = validateCanonicalStateRecord(record);
        if (!validation.ok || record.roomId !== roomId) return null;
        return record;
    } catch (error) {
        console.warn('[canonical-state-store] load failed:', error && error.message || error);
        return null;
    }
}

function buildRestoreSnapshotAuditPayload(gameStartPayload, stateSnapshot) {
    if (!stateSnapshot || !gameStartPayload) return null;
    const playerCount = Array.isArray(gameStartPayload.playerNames) ? gameStartPayload.playerNames.length : 0;
    const normalizedGameStartPayload = Object.assign({}, gameStartPayload, {
        playerSettings: normalizePlayerSettings(gameStartPayload.playerSettings, playerCount),
    });
    return {
        gameStartPayload: normalizedGameStartPayload,
        stateSnapshot,
    };
}

function buildRestoreSnapshotAudit(roomId, gameStartPayload, stateSnapshot, now = Date.now()) {
    return buildSignedRestoreAuditRecord(
        roomId,
        buildRestoreSnapshotAuditPayload(gameStartPayload, stateSnapshot),
        restoreAuditBuildOptions(now)
    );
}

function isVerifiedClientRestoreSnapshot(roomId, gameStartPayload, stateSnapshot, restoreAudit) {
    if (!stateSnapshot) return true;
    const validation = verifySignedRestoreAuditRecord(
        restoreAudit,
        buildRestoreSnapshotAuditPayload(gameStartPayload, stateSnapshot),
        restoreAuditVerificationOptions(roomId)
    );
    return validation.ok;
}

function buildRestoreActionAuditPayload(actionEntry) {
    if (!actionEntry || typeof actionEntry.action !== 'string') return null;
    if (!Number.isInteger(actionEntry.playerIndex) || !Number.isInteger(actionEntry.seq)) return null;
    const payload = {
        action: actionEntry.action,
        data: canonicalizeActionData(actionEntry.action, actionEntry.data || {}),
        playerIndex: actionEntry.playerIndex,
        seq: actionEntry.seq,
    };
    const safeClientActionId = normalizeClientActionId(actionEntry.clientActionId);
    if (safeClientActionId) payload.clientActionId = safeClientActionId;
    return payload;
}

function buildRestoreActionAudit(roomId, actionEntry, now = Date.now()) {
    return buildSignedRestoreAuditRecord(
        roomId,
        buildRestoreActionAuditPayload(actionEntry),
        restoreAuditBuildOptions(now, 'server-action-log')
    );
}

function isVerifiedRestoreActionAudit(roomId, actionEntry) {
    const validation = verifySignedRestoreAuditRecord(
        actionEntry && actionEntry.restoreActionAudit,
        buildRestoreActionAuditPayload(actionEntry),
        restoreAuditVerificationOptions(roomId)
    );
    return validation.ok;
}

function attachCompactedRestoreSnapshotToAction(roomId, room, actionEntry, actionLogLengthBeforeCompact) {
    if (!room || !actionEntry || !room.stateSnapshot) return null;
    if (!Number.isInteger(actionLogLengthBeforeCompact) || actionLogLengthBeforeCompact <= MAX_ACTION_LOG_LENGTH) return null;
    if (Array.isArray(room.actionLog) && room.actionLog.length !== 0) return null;
    const restoreAudit = buildRestoreSnapshotAudit(roomId, room.gameStartPayload, room.stateSnapshot);
    if (!restoreAudit) return null;
    actionEntry.stateSnapshot = room.stateSnapshot;
    actionEntry.restoreAudit = restoreAudit;
    return { stateSnapshot: actionEntry.stateSnapshot, restoreAudit };
}

let hostlessRestoreRuntime = null;
const hostlessRestoreCoordinator = createHostlessRestoreCoordinator({
    onEvent: event => {
        logHostlessRestoreCoordinatorEvent(event);
        hostlessRestoreRuntime?.handleCoordinatorEvent(event);
    },
});
const hostlessRestoreGateway = makeHostlessRestoreGateway({
    crypto,
    isPlainObject,
    isValidRoomId,
    validateRestorePayloadLimits,
    validateRestoreAuditRecord,
    isVerifiedClientRestoreSnapshot,
    sanitizeRestoreActionLog,
    sanitizeClientStateSnapshot,
    isValidGameStartPayload,
    hasInvalidOnlineRlModelSettings,
    normalizePlayerSettings,
    isValidRestoreReconnectTokenHashes,
    getExpectedReconnectTokenHash,
    hashReconnectToken,
    restorePayloadRank,
    createRoomMirror,
    serializeMirrorState,
    restoreAuditSecret,
});

function hostlessRestoreRoomLogId(roomId) {
    if (typeof roomId !== 'string' || !roomId) return '-';
    return crypto.createHash('sha256').update(roomId).digest('hex').slice(0, 12);
}
function hostlessRestoreDiagnostic(event = {}) {
    const rank = event.rank && typeof event.rank === 'object'
        ? {
            hostEpoch: Number.isInteger(event.rank.hostEpoch) ? event.rank.hostEpoch : 0,
            actionSeq: Number.isInteger(event.rank.actionSeq) ? event.rank.actionSeq : 0,
        }
        : null;
    return Object.freeze({
        event: typeof event.type === 'string' ? event.type : 'unknown',
        roomHash: hostlessRestoreRoomLogId(event.roomId),
        generation: Number.isInteger(event.generation) ? event.generation : 0,
        stage: typeof event.stage === 'string' ? event.stage : '',
        candidateCount: Number.isInteger(event.candidateCount) ? event.candidateCount : 0,
        rank,
        reason: typeof event.reason === 'string' ? event.reason : '',
    });
}

function logHostlessRestoreCoordinatorEvent(event) {
    console.log('[hostless-restore]', JSON.stringify(hostlessRestoreDiagnostic(event)));
}


function approveHostlessRestoreCandidate(socket, payload, metadata = {}) {
    const roomId = typeof payload?.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
    if (!roomId || hasOwnRoom(roomId)) return { ok: false, reason: 'room-exists' };
    const result = handleRecreateRoom(socket, payload, {
        approvedHostless: true,
        candidateCount: metadata.candidateCount,
    });
    if (!result?.ok || !rooms[roomId]?.provisionalRestore) {
        return { ok: false, reason: result?.reason || 'restore-failed' };
    }
    return { ok: true };
}

hostlessRestoreRuntime = createHostlessRestoreRuntime({
    io,
    coordinator: hostlessRestoreCoordinator,
    gateway: hostlessRestoreGateway,
    hasRoom: hasOwnRoom,
    approveCandidate: approveHostlessRestoreCandidate,
    enabled: hostlessRestoreEnabled(process.env),
});
const disconnectSocketHandler = createDisconnectSocketHandler({
    io,
    rooms,
    buildPlayerList,
    getRemainingConnectedPlayers,
    setRoomHostPlayerIndex,
    emitRoomHostChanged,
    persistRoomCanonicalState,
    disconnectHostlessRestore: socket => hostlessRestoreRuntime.disconnect(socket),
});
const {
    removeWaitingRoomSocket,
    handleStartedRoomSocketDisconnect,
    handleSocketDisconnect,
} = disconnectSocketHandler;

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
    hostlessRestoreRuntime.registerSocket(socket);

    registerLobbySocketHandlers(socket, {
        requirePlainSocketPayload,
        sanitizeName,
        emitAppError,
        hasInvalidOnlineRlModelSettings,
        normalizePlayerSettings,
        normalizeCpuSpeed,
        validateCreateRoomLifecycle,
        rooms,
        generateRoomId,
        generateReconnectToken,
        normalizeEnabledCards,
        landmarkNames: gameRuntime.Player.landmarkNames,
        markCreateRoomForSocket,
        createRoomRateKeyForSocket,
        markCreateRoomForRateKey,
        buildPlayerList,
        io,
        checkGameStart,
        validateSocketCanEnterRoom,
        isValidRoomId,
        resolveClientGameSchemaCapabilities: value => resolveClientGameSchemaCapabilities(value, GAME_SCHEMA_NEGOTIATION_ENABLED),
        negotiateRoomGameSchemaCandidate: (room, playerIndex, capabilities) => negotiateRoomGameSchemaCandidate(room, playerIndex, capabilities, GAME_SCHEMA_NEGOTIATION_ENABLED),
    });

    registerActionSocketHandler(socket, {
        requirePlainSocketPayload,
        rooms,
        isActiveRoomSocket,
        emitAppError,
        normalizeClientActionId,
        findAcceptedClientAction,
        validateGameAction,
        canonicalizeActionData,
        makeUndoStateFromMirror,
        nextRoomActionSeq,
        gameSchemaShadow,
        gameEngineAuthority,
        adoptTransitionSnapshotToRoomMirror,
        decodeGameSchemaAction: (room, payload) => GameSchemaWire.decodeActionPayload(
            GAME_SCHEMA_WIRE_ENABLED,
            false,
            room.gameStartPayload && room.gameStartPayload.gameSchema || null,
            payload
        ),
        encodeGameSchemaAction: (room, payload) => GameSchemaWire.encodeActionPayload(
            GAME_SCHEMA_WIRE_ENABLED,
            GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED,
            room.gameStartPayload && room.gameStartPayload.gameSchema || null,
            payload
        ),
        buildRestoreActionAudit,
        applyAcceptedActionToRoomCanonicalMirror,
        rememberAcceptedClientAction,
        compactRoomActionLog,
        attachCompactedRestoreSnapshotToAction,
        markRoomCanonicalMirrorCurrent,
        persistRoomCanonicalState,
    });
    registerRejoinSocketHandler(socket, {
        requirePlainSocketPayload,
        isValidRoomId,
        emitAppError,
        rooms,
        getExpectedReconnectTokenHash,
        hashReconnectToken,
        detachExistingPlayerSocket,
        resolveRejoinPlayer,
        buildRejoinDataPayload,
        resolveClientGameSchemaCapabilities: value => resolveClientGameSchemaCapabilities(value, GAME_SCHEMA_NEGOTIATION_ENABLED),
        supportsSelectedGameSchema: (capabilities, selected) => supportsSelectedGameSchemaForRuntime(
            capabilities, selected, GAME_SCHEMA_NEGOTIATION_ENABLED
        ),
        io,
    });

    // サーバー再起動後にホストがルームを復元する
    registerRecreateSocketHandler(socket, {
        decodePayload: payload => GameSchemaRecreateWire.decode(
            GAME_SCHEMA_RECREATE_WIRE_ENABLED,
            payload
        ),
        emitAppError,
        handleRecreateRoom,
        hostRestored: roomId => hostlessRestoreRuntime.hostRestored(roomId),
    });

    disconnectSocketHandler.registerSocket(socket);
});

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

function roomHostChangedPayload(room) {
    return buildRoomHostChangedPayload(room);
}

function emitRoomHostChanged(roomId, room, ioInstance = io) {
    ioInstance.to(roomId).emit('hostChanged', roomHostChangedPayload(room));
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
    const roomSocket = /** @type {typeof oldSocket & {roomId?: string|null, playerIndex?: number|null}} */ (oldSocket);
    roomSocket.leave(roomId);
    if (roomSocket.roomId === roomId) {
        roomSocket.roomId = null;
        roomSocket.playerIndex = null;
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

function handleRecreateRoom(socket, payload = {}, options = {}) {
    const approvedHostless = options.approvedHostless === true;
    if (!isPlainObject(payload)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (!validateRestorePayloadLimits(payload).ok) {
        emitAppError(socket, '復元データが大きすぎます');
        return;
    }
    const { roomId, playerIndex, playerName, reconnectToken } = payload;
    if (!roomId || !payload.gameStartPayload || !reconnectToken) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (!isValidRoomId(roomId)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    if (approvedHostless && hasOwnRoom(roomId)) {
        emitAppError(socket, '同じルームIDが既に使用されています');
        return { ok: false, reason: 'room-exists' };
    }
    const loadedCanonicalRecord = approvedHostless ? null : loadRoomCanonicalStateRecord(roomId);
    const restoreSource = selectRestoreSource(payload, loadedCanonicalRecord, { approvedHostless });
    const canonicalRecord = restoreSource.canonicalRecord;
    let { gameStartPayload, stateSnapshot, actionLog } = restoreSource;
    const restoreAuditValidation = approvedHostless
        ? { ok: true }
        : validateRestoreAuditRecord(payload.restoreAudit, { roomId });
    if (!restoreAuditValidation.ok) {
        emitAppError(socket, '復元署名メタデータが無効です');
        return;
    }
    const clientSnapshotTrusted = approvedHostless || !!canonicalRecord ||
        (stateSnapshot && isVerifiedClientRestoreSnapshot(roomId, gameStartPayload, stateSnapshot, payload.restoreAudit));
    const replayStateSnapshot = clientSnapshotTrusted ? stateSnapshot : null;
    if (hasOwnRoom(roomId)) {
        const room = rooms[roomId];
        if (!room.started) {
            emitAppError(socket, '同じルームIDが既に使用されています');
            return;
        }
        const existingReconnectTokenHash = getExpectedReconnectTokenHash(room, playerIndex, playerName);
        const existingRestoreAuthenticated = Number.isInteger(playerIndex) &&
            existingReconnectTokenHash &&
            hashReconnectToken(reconnectToken) === existingReconnectTokenHash;
        const existingHostRestoreAuthenticated = existingRestoreAuthenticated && room.hostPlayerIndex === playerIndex;
        const rawSanitizedExistingRoomActionLog = sanitizeRestoreActionLog(actionLog, roomId, replayStateSnapshot, { requireSignedActionAudit: !!restoreAuditSecret() && !canonicalRecord });
        const sanitizedExistingRoomActionLog = rawSanitizedExistingRoomActionLog || [];
        const incomingRestoreLogValid = rawSanitizedExistingRoomActionLog !== null;
        const incomingCanReplace = incomingRestoreLogValid &&
            isValidGameStartPayload(gameStartPayload, Array.isArray(gameStartPayload.playerNames) ? gameStartPayload.playerNames.length : 0) &&
            !hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings) &&
            existingHostRestoreAuthenticated &&
            clientSnapshotTrusted &&
            canReplaceRestoredRoom(room, playerIndex, gameStartPayload, replayStateSnapshot, sanitizedExistingRoomActionLog);
        const incomingRestoreNewer = !incomingCanReplace && existingHostRestoreAuthenticated &&
            isIncomingRestoreNewer(
                room,
                gameStartPayload,
                replayStateSnapshot,
                sanitizedExistingRoomActionLog
            );
        const existingRoomDecision = decideExistingRoomRestore({
            incomingCanReplace,
            existingHostRestoreAuthenticated: !!existingHostRestoreAuthenticated,
            incomingRestoreNewer: !!incomingRestoreNewer,
        });
        if (existingRoomDecision.action !== 'replace') {
            if (existingRoomDecision.action === 'reject') {
                emitAppError(socket, '復元データが壊れています');
                return;
            }
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
                emitRoomHostChanged(roomId, room);
                persistRoomCanonicalState(roomId, room, 'host-reselected');
                console.log(`ホスト再選出: ${roomId} → プレイヤー${room.hostPlayerIndex}`);
            }
            room.lastTouchedAt = Date.now();
            socket.emit('rejoinData', buildRejoinDataPayload(room, playerIndex));
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
    if (!approvedHostless && (!Number.isInteger(gameStartPayload.hostPlayerIndex) || gameStartPayload.hostPlayerIndex !== playerIndex)) {
        emitAppError(socket, '復元は元のホストのみ実行できます');
        return;
    }
    if (!isValidRestoreReconnectTokenHashes(gameStartPayload)) {
        emitAppError(socket, '復元データが不完全です');
        return;
    }
    const restoredPlayers = buildRestoredHumanPlayers(gameStartPayload, playerIndex, socket.id);
    const sanitizedActionLog = sanitizeRestoreActionLog(actionLog, roomId, replayStateSnapshot, { requireSignedActionAudit: !!restoreAuditSecret() && !canonicalRecord });
    if (!sanitizedActionLog) {
        emitAppError(socket, '復元データが壊れています');
        return;
    }
    if (!canonicalRecord && !clientSnapshotTrusted && sanitizedActionLog.length === 0) {
        emitAppError(socket, '復元データが壊れています');
        return;
    }
    if (!canonicalRecord && !stateSnapshot && sanitizedActionLog.length === 0) {
        emitAppError(socket, '復元データが壊れています');
        return;
    }
    const restoredRank = canonicalRecord
        ? {
            hostEpoch: Number.isInteger(canonicalRecord.hostEpoch) ? canonicalRecord.hostEpoch : 0,
            actionSeq: Number.isInteger(canonicalRecord.actionSeq) ? canonicalRecord.actionSeq : restorePayloadRank(gameStartPayload, replayStateSnapshot, sanitizedActionLog).actionSeq,
        }
        : restorePayloadRank(gameStartPayload, replayStateSnapshot, sanitizedActionLog);
    const restoredMetadata = planRestoredRoomMetadata({
        playerIndex,
        hostEpoch: restoredRank.hostEpoch,
        actionSeq: restoredRank.actionSeq,
        approvedHostless,
        hostlessRestoreGeneration: gameStartPayload[HOSTLESS_RESTORE_GENERATION_FIELD],
        hostlessRestoreCount: gameStartPayload[HOSTLESS_RESTORE_COUNT_FIELD],
    });
    gameStartPayload.hostPlayerIndex = restoredMetadata.hostPlayerIndex;
    gameStartPayload.hostEpoch = restoredMetadata.hostEpoch;
    gameStartPayload.actionSeq = restoredMetadata.actionSeq;
    if (restoredMetadata.applyHostlessMetadata) {
        gameStartPayload[HOSTLESS_RESTORE_GENERATION_FIELD] = restoredMetadata.hostlessRestoreGeneration;
        gameStartPayload[HOSTLESS_RESTORE_COUNT_FIELD] = restoredMetadata.hostlessRestoreCount;
    }
    const restoredRoom = buildRestoredRoom({
        roomId,
        restoredPlayers,
        playerSettings: gameStartPayload.playerSettings,
        playerNames,
        playerIndex,
        restoredHostEpoch: restoredMetadata.hostEpoch,
        restoredActionSeq: restoredRank.actionSeq,
        enabledCards: gameStartPayload.enabledCards,
        enabledLandmarks: gameStartPayload.enabledLandmarks,
        cpuSpeed: gameStartPayload.cpuSpeed,
        gameStartPayload,
        replayStateSnapshot,
        sanitizedActionLog,
        now: Date.now(),
        approvedHostless,
        hostlessRestoreGeneration: gameStartPayload[HOSTLESS_RESTORE_GENERATION_FIELD],
        hostlessRestoreCount: gameStartPayload[HOSTLESS_RESTORE_COUNT_FIELD],
        candidateCount: options.candidateCount,
    });
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
    const activationPlan = planRestoredRoomActivation({
        roomExists: hasOwnRoom(roomId),
        approvedHostless,
    });
    if (activationPlan.decision === restoredRoomActivationDecisions.REJECT_EXISTING_HOSTLESS) {
        emitAppError(socket, '同じルームIDが既に使用されています');
        return { ok: false, reason: 'room-exists' };
    }
    if (activationPlan.detachExisting) {
        detachRoomSockets(roomId, rooms[roomId], 'ROOM_REPLACED');
    }
    if (activationPlan.deleteExisting) delete rooms[roomId];
    rooms[roomId] = restoredRoom;
    persistRoomCanonicalState(roomId, restoredRoom, 'server-restart-restore');
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerIndex = playerIndex;
    socket.emit('rejoinData', buildRejoinDataPayload(restoredRoom, playerIndex, {
        gameStartPayload,
        stateSnapshot: restoredRoom.stateSnapshot,
        actionLog: restoredRoom.actionLog,
        hostPlayerIndex: playerIndex,
    }));
    if (approvedHostless) {
        console.log(
            `[hostless-restore] roomHash=${hostlessRestoreRoomLogId(roomId)} ` +
            `candidates=${restoredRoom.hostlessRestoreCandidateCount} ` +
            `generation=${restoredRoom.hostlessRestoreGeneration} result=approved`
        );
    } else {
        console.log(`ルーム復元: ${roomId} by ${playerName}(${playerIndex})`);
    }
    return { ok: true, roomId, provisionalRestore: approvedHostless };
}

// ===== Snapshot limits and restore payload guards =====
function getRemainingConnectedPlayers(room, sockets, disconnectedSocketId) {
    return getRemainingConnectedRoomPlayers(room, sockets, disconnectedSocketId);
}

function rollServerDie() {
    return crypto.randomInt(1, 7);
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
    return buildRoomPlayerList(room);
}

function countRoomHumanSlots(room) {
    return countRoomHumanSlotsForRoom(room);
}

function buildGameStartPlayerNames(room) {
    return buildGameStartPlayerNamesForRoom(room);
}

function shuffledPlayerOrder(playerNames, randomFn = Math.random) {
    return shuffledRoomPlayerOrder(playerNames, randomFn);
}

function roomClientVersions(io, room) {
    return roomClientVersionsForSockets(io.sockets.sockets, room);
}

function roomReconnectTokenHashes(room, playerNames) {
    return roomReconnectTokenHashesForRoom(room, playerNames);
}

function roomHostlessRestoreCapabilities(ioInstance, room, playerNames) {
    return playerNames.map((_, index) => {
        const setting = Array.isArray(room.playerSettings) ? room.playerSettings[index] : null;
        if (setting?.type === 'cpu') return 0;
        const player = room.players.find(candidate => candidate.index === index);
        const playerSocket = player?.id ? ioInstance.sockets.sockets.get(player.id) : null;
        return playerSocket?.hostlessRestoreVersion === 1 ? 1 : 0;
    });
}

const { buildGameStartPayload } = makeGameStartPayload({
    defaultSchemaNegotiationEnabled: GAME_SCHEMA_NEGOTIATION_ENABLED,
    gameSchemaStartMetadata,
    buildGameStartPlayerNames,
    shuffledPlayerOrder,
    roomClientVersions,
    roomReconnectTokenHashes,
    roomHostlessRestoreCapabilities,
});

// ===== Mirror replay =====
function loadGameRuntime() {
    const context = { console };
    vm.createContext(context);
    for (const file of ['js/Card.js', 'js/Player.js', 'js/actionContract.js', 'js/GameManager.js']) {
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

function originalPlayerIndexForGamePosition(room, gamePosition) {
    const playerOrder = room?.gameStartPayload?.playerOrder;
    return Array.isArray(playerOrder) ? playerOrder[gamePosition] : gamePosition;
}

function canSocketSubmitCurrentAction(room, socket, game, cpuPlayers) {
    if (!room || !socket || !game) return false;
    const currentIndex = game.currentPlayerIndex;
    const currentIsCpu = !!cpuPlayers?.[currentIndex];
    if (currentIsCpu) return socket.playerIndex === room.hostPlayerIndex;

    // playerOrderシャッフル後のゲーム内位置→元のプレイヤーインデックスに変換
    return socket.playerIndex === originalPlayerIndexForGamePosition(room, currentIndex);
}

function validateGameAction(room, socket, action, data) {
    const mirror = getRoomCanonicalMirror(room);
    if (!mirror) return { ok: false };
    const { game, cpuPlayers, shopStock } = mirror;
    if (game.checkWinner && game.checkWinner()) return { ok: false };
    if (!canSocketSubmitCurrentAction(room, socket, game, cpuPlayers)) return { ok: false };

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


function markRoomGameStarted(room, gameStartPayload, now = Date.now()) {
    room.started = true;
    room.gameStartPayload = gameStartPayload;
    room.stateSnapshot = null;
    room.actionLog = [];
    room.lastUndoState = null;
    resetRoomCanonicalMirror(room);
    room.lastTouchedAt = now;
    persistRoomCanonicalState(room.roomId, room, 'game-start', now);
}

function checkGameStart(io, roomId) {
    const room = rooms[roomId];
    if (!room || room.started) return;

    if (room.players.length >= countRoomHumanSlots(room)) {
        const gameStartPayload = buildGameStartPayload(io, room);
        if (!gameStartPayload) return;
        markRoomGameStarted(room, gameStartPayload);
        io.to(roomId).emit('gameStart', gameStartPayload);
        console.log(`ゲーム開始: ${roomId} プレイヤー: ${gameStartPayload.playerNames.join(', ')}`);
    }
}

process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
});

const PORT = /** @type {number} */ (process.env.PORT || 3000);
if (IS_MAIN_MODULE) {
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
    isSocketInActiveRoom,
    validateSocketCanEnterRoom,
    validateCreateRoomLifecycle,
    RESTORE_PAYLOAD_LIMITS,
    SOCKET_PAYLOAD_LIMITS,
    validateSocketPayloadLimits,
    validateRestorePayloadLimits,
    validateRestoreAuditRecord,
    buildUnsignedRestoreAuditRecord,
    buildSignedRestoreAuditRecord,
    verifySignedRestoreAuditRecord,
    restoreSnapshotActionSeq,
    sanitizeRestoreActionLogEntry,
    sanitizeRestoreActionLog,
    CLIENT_ERROR_LIMITS,
    GAME_LIFECYCLE_LIMITS,
    normalizeGameLifecyclePayload,
    formatNtfyGameLifecycleMessage,
    notifyGameLifecycle,
    handleGameLifecycleRequest,
    isDuplicateGameLifecycle,
    resolveTrustProxySetting,
    normalizeClientErrorPayload,
    requestHeader,
    requestBaseOrigin,
    hasClientReportOrigin,
    clientErrorAllowedOrigins,
    isClientErrorOriginAllowed,
    clientErrorSharedToken,
    isProductionNoOriginClientErrorBlocked,
    requestClientErrorToken,
    authorizeClientErrorRequest,
    handleClientErrorRequest,
    isClientErrorRateLimited,
    pruneRateBuckets,
    pruneClientErrorRateBuckets,
    isDuplicateClientError,
    extractClientErrorFreezeKind,
    isStaleClientErrorVersion,
    classifyClientErrorReport,
    extractFreezeSummaryFromStack,
    formatNtfyFreezeSummary,
    formatNtfyClientErrorMessage,
    redactedClientErrorRoomId,
    notifyClientError,
    isClientErrorTestEnabled,
    buildClientErrorTestPayload,
    handleClientErrorTestRequest,
    postNtfyNotification,
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
    buildRejoinDataPayload,
    persistRoomCanonicalState,
    loadRoomCanonicalStateRecord,
    buildRestoreSnapshotAuditPayload,
    buildRestoreSnapshotAudit,
    isVerifiedClientRestoreSnapshot,
    buildRestoreActionAuditPayload,
    buildRestoreActionAudit,
    isVerifiedRestoreActionAudit,
    attachCompactedRestoreSnapshotToAction,
    generateRoomId,
    isValidRoomId,
    buildRestoredHumanPlayers,
    CANONICAL_ACTION_PAYLOAD_KEYS,
    canonicalizeActionData,
    normalizeClientActionId,
    nextRoomActionSeq,
    roomHostChangedPayload,
    emitRoomHostChanged,
    restorePayloadRank,
    restorePayloadRankDetails,
    isRestoreRankAction,
    countRoomHumanSlots,
    buildGameStartPlayerNames,
    shuffledPlayerOrder,
    roomClientVersions,
    roomReconnectTokenHashes,
    roomHostlessRestoreCapabilities,
    buildGameStartPayload,
    markRoomGameStarted,
    buildPlayerList,
    resolveRejoinPlayer,
    removeWaitingRoomSocket,
    handleStartedRoomSocketDisconnect,
    handleSocketDisconnect,
    handleRecreateRoom,
    approveHostlessRestoreCandidate,
    hostlessRestoreEnabled,
    hostlessRestoreRoomLogId,
    getRemainingConnectedPlayers,
    hostlessRestoreDiagnostic,
    serializeMirrorState,
    transitionMirrorEnvelope,
    restoreMirrorState,
    adoptTransitionSnapshotToRoomMirror,
    compactRoomActionLog,
    createRoomMirror,
    applyActionToMirror,
    restoreUndoMirror,
    makeUndoStateFromMirror,
    rollServerDie,
    SERVER_AUTHORITATIVE_DICE_ACTIONS,
    isServerAuthoritativeDiceAction,
    makeServerDiceActionData,
    originalPlayerIndexForGamePosition,
    canSocketSubmitCurrentAction,
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
    ACTION_PAYLOAD_VALIDATORS,
    validateActionPayloadForState,
    validateGameAction,
    getAllowedActions,
    checkGameStart,
    loadGameRuntime,
    __io: io,
};
