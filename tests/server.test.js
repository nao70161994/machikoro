process.env.RESTORE_AUDIT_SECRET = process.env.RESTORE_AUDIT_SECRET || 'test-restore-audit-secret';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const GameEngine = require('../js/gameEngine');
const { OnlinePayload } = require('../js/onlinePayload');
const {
    APP_ERROR_EVENT,
    emitAppError,
    requirePlainSocketPayload,
    SOCKET_PAYLOAD_LIMITS,
    validateSocketPayloadLimits,
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
    SOCKET_IO_MAX_HTTP_BUFFER_SIZE,
    validateRestorePayloadLimits,
    validateRestoreAuditRecord,
    buildUnsignedRestoreAuditRecord,
    buildRestoreSnapshotAudit,
    buildRestoreActionAudit,
    isVerifiedRestoreActionAudit,
    attachCompactedRestoreSnapshotToAction,
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
    rememberDuplicateGameLifecycle,
    resolveTrustProxySetting,
    normalizeClientErrorPayload,
    requestBaseOrigin,
    hasClientReportOrigin,
    clientErrorAllowedOrigins,
    isClientErrorOriginAllowed,
    isProductionNoOriginClientErrorBlocked,
    requestClientErrorToken,
    authorizeClientErrorRequest,
    handleClientErrorRequest,
    isClientErrorRateLimited,
    pruneRateBuckets,
    pruneClientErrorRateBuckets,
    isDuplicateClientError,
    rememberDuplicateClientError,
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
    loadGameRuntime,
    sanitizeName,
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
    resolveRejoinPlayer,
    handleSocketDisconnect,
    handleRecreateRoom,
    hostlessRestoreRoomLogId,
    hostlessRestoreDiagnostic,
    getRemainingConnectedPlayers,
    serializeMirrorState,
    transitionMirrorEnvelope,
    restoreMirrorState,
    compactRoomActionLog,
    createRoomMirror,
    validateGameAction,
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
    makeUndoStateFromMirror,
    applyActionToMirror,
    restoreUndoMirror,
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
    getAllowedActions,
    buildPlayerList,
    removeWaitingRoomSocket,
    handleStartedRoomSocketDisconnect,
    checkGameStart,
    __rooms,
    __io,
} = require('../server');
const makeRoomLifecycle = require('../server/roomLifecycle');
const makeRoomProjection = require('../server/roomProjection');
const {
    CANONICAL_STATE_STORE_MODES,
    canonicalStateStoreMode,
    buildCanonicalStateRecord,
    validateCanonicalStateRecord,
    createNoopCanonicalStateStore,
    createMemoryCanonicalStateStore,
} = require('../server/canonicalStateStore');
const {
    makePendingAckRequiresLogOrSnapshotFixture,
    makeSeqRankUsesMaxFieldsFixture,
} = require('./helpers/online-restore-fixtures');

function runTest(name, fn) {
    try {
        for (const roomId of Object.keys(__rooms)) delete __rooms[roomId];
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        console.error(error.stack);
        process.exitCode = 1;
    } finally {
        for (const roomId of Object.keys(__rooms)) delete __rooms[roomId];
    }
}

function makeRoom() {
    return {
        hostPlayerIndex: 0,
        started: true,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        gameStartPayload: {
            playerNames: ['A', 'B'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
            enabledCards: ['麦畑', 'パン屋', 'カフェ', 'ビジネスセンター', '引越し屋'],
            enabledLandmarks: ['駅', 'ショッピングモール'],
        },
        actionLog: [],
        lastUndoState: null,
    };
}

function makeGame() {
    const runtime = loadGameRuntime();
    return {
        GameManager: runtime.GameManager,
        createCardByName: runtime.createCardByName,
    };
}

function extractActionValidatorBranches(functionBody) {
    return [...functionBody.matchAll(/action === ['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
}

function makeRestoreAudit(roomId, gameStartPayload, stateSnapshot) {
    return buildRestoreSnapshotAudit(roomId, gameStartPayload, stateSnapshot, 1234567890);
}

function signRestoreActionLog(roomId, actionLog, stateSnapshot = null) {
    if (!Array.isArray(actionLog)) return actionLog;
    let nextSeq = restoreSnapshotActionSeq(stateSnapshot);
    return actionLog.map(entry => {
        if (!entry) return entry;
        const signed = Object.assign({}, entry);
        if (!Number.isInteger(signed.seq)) return signed;
        nextSeq = Math.max(nextSeq, signed.seq);
        if (signed.restoreActionAudit) return signed;
        const audit = buildRestoreActionAudit(roomId, signed, 1234567890);
        if (audit) signed.restoreActionAudit = audit;
        return signed;
    });
}

function signedRestorePayload(payload) {
    if (payload && payload.roomId && Array.isArray(payload.actionLog)) {
        payload.actionLog = signRestoreActionLog(payload.roomId, payload.actionLog, payload.stateSnapshot);
    }
    if (payload && payload.roomId && payload.gameStartPayload && payload.stateSnapshot && !payload.restoreAudit) {
        payload.restoreAudit = makeRestoreAudit(payload.roomId, payload.gameStartPayload, payload.stateSnapshot);
    }
    return payload;
}

function makeSnapshot(overrides = {}) {
    const runtime = loadGameRuntime();
    const game = new runtime.GameManager(2);
    game.players[0].name = 'A';
    game.players[1].name = 'B';
    return Object.assign(serializeMirrorState(game, { 麦畑: 6, パン屋: 0, カフェ: 0, ビジネスセンター: 0, 引越し屋: 0 }), overrides);
}


runTest('canonical state store は既定noopでmemory adapterはrecordをclone保存する', () => {
    assert.strictEqual(canonicalStateStoreMode({}), CANONICAL_STATE_STORE_MODES.NOOP);
    assert.strictEqual(canonicalStateStoreMode({ CANONICAL_STATE_STORE: 'memory' }), CANONICAL_STATE_STORE_MODES.MEMORY);

    const room = {
        gameStartPayload: { playerNames: ['A', 'B'], reconnectTokenHashes: ['h1', 'h2'] },
        stateSnapshot: { actionSeq: 3, players: [] },
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 4, clientActionId: 'c1' }],
        acceptedClientActions: { key: { playerIndex: 0, clientActionId: 'c1', seq: 4 } },
        hostPlayerIndex: 0,
        hostEpoch: 2,
        actionSeq: 4,
        lastTouchedAt: 1700000000000,
    };
    const record = buildCanonicalStateRecord('ROOM01', room, { reason: 'test', now: 1700000001000 });
    assert.deepStrictEqual(validateCanonicalStateRecord(record), { ok: true });
    assert.strictEqual(record.reason, 'test');
    assert.strictEqual(record.acceptedClientActions.length, 1);

    const noop = createNoopCanonicalStateStore();
    assert.deepStrictEqual(noop.save(record), { ok: true, skipped: true });
    assert.strictEqual(noop.load('ROOM01'), null);

    const memory = createMemoryCanonicalStateStore();
    assert.deepStrictEqual(memory.save(record), { ok: true });
    record.actionLog.push({ action: 'rollDice' });
    const loaded = memory.load('ROOM01');
    assert.strictEqual(loaded.actionLog.length, 1);
    loaded.actionLog.push({ action: 'rollDice' });
    assert.strictEqual(memory.load('ROOM01').actionLog.length, 1);
    assert.strictEqual(memory.list().length, 1);
});

runTest('persistRoomCanonicalState はstore失敗をゲーム進行から分離する', () => {
    const room = { roomId: 'ROOM02', gameStartPayload: {}, actionLog: [], acceptedClientActions: {}, hostEpoch: 0, actionSeq: 0 };
    const result = persistRoomCanonicalState('ROOM02', room, 'test', 1700000000000, { save() { throw new Error('disk down'); } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'save-failed');
});

runTest('server module.exports は重複した公開名を持たない', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const match = source.match(/module\.exports\s*=\s*\{([\s\S]*?)\n\};/);
    assert.ok(match, 'module.exports block not found');
    const names = match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(line => line.replace(/,$/, '').split(':')[0].trim())
        .filter(Boolean);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    assert.deepStrictEqual(duplicates, []);
});

runTest('Socket.IO transport上限はrestore validatorの上限とenvelope余裕を含む', () => {
    assert.strictEqual(__io.engine.opts.maxHttpBufferSize, SOCKET_IO_MAX_HTTP_BUFFER_SIZE);
    assert.ok(SOCKET_IO_MAX_HTTP_BUFFER_SIZE > RESTORE_PAYLOAD_LIMITS.maxJsonBytes);
});

runTest('generateRoomId は紛らわしい文字を含まない6文字IDを生成する', () => {
    for (let i = 0; i < 200; i++) {
        const roomId = generateRoomId();
        assert.match(roomId, /^[2-9A-HJ-NP-Z]{6}$/);
        assert(!/[01IO]/.test(roomId));
    }
});

runTest('isValidRoomId は prototype key と危険形式を拒否する', () => {
    assert.strictEqual(isValidRoomId('REST_EMPTY_SETTINGS'), true);
    assert.strictEqual(isValidRoomId('ABC-123_foo'), true);
    for (const roomId of ['__proto__', 'constructor', 'prototype', 'bad space', 'x'.repeat(65), '', null, {}]) {
        assert.strictEqual(isValidRoomId(roomId), false);
    }
});

runTest('cleanupExpiredRooms は未開始roomをTTLで削除し新しいroomを残す', () => {
    const now = ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs * 2;
    const targetRooms = {
        oldPending: { started: false, createdAt: now - ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs - 1, lastTouchedAt: now - ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs - 1 },
        freshPending: { started: false, createdAt: now - ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs + 1, lastTouchedAt: now - ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs + 1 },
    };

    assert.strictEqual(isRoomExpired(targetRooms.oldPending, now), true);
    assert.strictEqual(isRoomExpired(targetRooms.freshPending, now), false);
    assert.strictEqual(cleanupExpiredRooms(now, targetRooms), 1);
    assert.strictEqual(targetRooms.oldPending, undefined);
    assert.ok(targetRooms.freshPending);
});

runTest('cleanupExpiredRooms は開始済みroomの既存TTLを維持する', () => {
    const now = ROOM_LIFECYCLE_LIMITS.startedRoomTtlMs * 2;
    const targetRooms = {
        oldStarted: { started: true, lastTouchedAt: now - ROOM_LIFECYCLE_LIMITS.startedRoomTtlMs - 1 },
        freshStarted: { started: true, lastTouchedAt: now - ROOM_LIFECYCLE_LIMITS.startedRoomTtlMs + 1 },
    };

    assert.strictEqual(cleanupExpiredRooms(now, targetRooms), 1);
    assert.strictEqual(targetRooms.oldStarted, undefined);
    assert.ok(targetRooms.freshStarted);
});

runTest('validateCreateRoomLifecycle は期限切れroomを掃除してから上限を判定する', () => {
    const now = 3000000;
    const targetRooms = {};
    for (let i = 0; i < ROOM_LIFECYCLE_LIMITS.maxRooms - 1; i++) {
        targetRooms[`fresh${i}`] = { started: false, createdAt: now, lastTouchedAt: now };
    }
    targetRooms.expired = { started: false, createdAt: now - ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs - 1, lastTouchedAt: now - ROOM_LIFECYCLE_LIMITS.pendingRoomTtlMs - 1 };

    assert.deepStrictEqual(validateCreateRoomLifecycle({}, now, targetRooms), { ok: true });
    assert.strictEqual(targetRooms.expired, undefined);

    targetRooms.full = { started: false, createdAt: now, lastTouchedAt: now };
    assert.strictEqual(validateCreateRoomLifecycle({}, now, targetRooms).ok, false);
});

runTest('room projectionとlifecycleは開始payload投影とhost候補判定を分担する', () => {
    const lifecycle = makeRoomLifecycle({
        limits: ROOM_LIFECYCLE_LIMITS,
        defaultRooms: {},
    });
    const projection = makeRoomProjection({
        cpuDifficultyLabel: difficulty => ({ strong: '強', rl: '学' }[difficulty] || '普'),
        hashReconnectToken: token => 'hash:' + token,
    });
    const room = {
        maxPlayers: 4,
        playerSettings: [
            { type: 'cpu', difficulty: 'rl' },
            { type: 'human' },
            { type: 'cpu', difficulty: 'strong' },
            { type: 'human' },
        ],
        players: [
            { id: 'socket-a', index: 1, name: 'Alice', reconnectToken: 'ta' },
            { id: 'socket-b', index: 3, name: 'Bob', reconnectToken: 'tb' },
            { id: 'socket-stale', index: 9, name: 'Ghost' },
        ],
    };

    assert.deepStrictEqual(projection.buildPlayerList(room), ['CPU（学）', 'Alice', 'CPU（強）', 'Bob']);
    assert.strictEqual(projection.countRoomHumanSlots(room), 2);
    assert.deepStrictEqual(projection.buildGameStartPlayerNames(room), ['CPU1（学）', 'Alice', 'CPU2（強）', 'Bob']);
    assert.deepStrictEqual(projection.roomClientVersions(new Map([['socket-a', { clientVersion: 'v-a' }]]), room), ['v-a', 'unknown', 'unknown']);
    assert.deepStrictEqual(projection.roomReconnectTokenHashes(room, ['CPU1（学）', 'Alice', 'CPU2（強）', 'Bob']), ['', 'hash:ta', '', 'hash:tb']);
    assert.deepStrictEqual(
        lifecycle.getRemainingConnectedPlayers(room, new Map([['socket-b', {}]]), 'socket-a').map(player => player.index),
        [3]
    );
    assert.deepStrictEqual(projection.shuffledPlayerOrder(['A', 'B', 'C'], () => 0), [1, 2, 0]);
});

runTest('room lifecycle は同じsocketの別room入室を拒否する', () => {
    const rooms = {
        OLDROOM: { started: false, players: [{ id: 'socket-1', index: 0 }] },
        TARGET: { started: false, players: [] },
    };
    const socket = { id: 'socket-1', roomId: 'OLDROOM' };

    assert.strictEqual(isSocketInActiveRoom(socket, rooms), true);
    assert.deepStrictEqual(validateSocketCanEnterRoom(socket, 'TARGET', rooms), {
        ok: false,
        message: 'すでに別のルームに参加しています',
    });
    assert.deepStrictEqual(validateCreateRoomLifecycle(socket, 4000000, rooms), {
        ok: false,
        message: 'すでに別のルームに参加しています',
    });
    assert.deepStrictEqual(validateSocketCanEnterRoom(socket, 'OLDROOM', rooms), { ok: true });
    assert.deepStrictEqual(validateSocketCanEnterRoom({ id: 'socket-2', roomId: 'GONE' }, 'TARGET', rooms), { ok: true });
    assert.deepStrictEqual(validateSocketCanEnterRoom({ id: 'socket-2', roomId: 'OLDROOM' }, 'TARGET', rooms), { ok: true });
});

runTest('createRoom rate limit は同一socketの連続作成だけを拒否する', () => {
    const now = 4000000;
    const socket = {};

    assert.strictEqual(canCreateRoomForSocket(socket, now), true);
    markCreateRoomForSocket(socket, now);
    assert.strictEqual(canCreateRoomForSocket(socket, now + ROOM_LIFECYCLE_LIMITS.createRoomRateLimitMs - 1), false);
    assert.strictEqual(validateCreateRoomLifecycle(socket, now + ROOM_LIFECYCLE_LIMITS.createRoomRateLimitMs - 1, {}).ok, false);
    assert.strictEqual(canCreateRoomForSocket(socket, now + ROOM_LIFECYCLE_LIMITS.createRoomRateLimitMs), true);
    assert.strictEqual(validateCreateRoomLifecycle({}, now + 1, {}).ok, true);
});

runTest('createRoom rate limit は同一IPの再接続連投も抑止する', () => {
    const now = 5000000;
    const socket = { handshake: { address: '203.0.113.9' } };
    assert.strictEqual(createRoomRateKeyForSocket(socket), '203.0.113.9');
    for (let i = 0; i < ROOM_LIFECYCLE_LIMITS.createRoomIpRateLimitMax; i++) {
        assert.strictEqual(canCreateRoomForRateKey('203.0.113.9', now + i), true);
        markCreateRoomForRateKey('203.0.113.9', now + i);
    }
    assert.strictEqual(canCreateRoomForRateKey('203.0.113.9', now + ROOM_LIFECYCLE_LIMITS.createRoomIpRateLimitMax + 1), false);
    assert.strictEqual(validateCreateRoomLifecycle(socket, now + ROOM_LIFECYCLE_LIMITS.createRoomIpRateLimitMax + 1, {}).ok, false);
    assert.strictEqual(canCreateRoomForRateKey('203.0.113.9', now + ROOM_LIFECYCLE_LIMITS.createRoomIpRateLimitWindowMs + 1), true);
});

runTest('public static はアプリ資産だけをallowlist公開する', () => {
    assert.strictEqual(isPublicRootFile('style.css'), true);
    assert.strictEqual(isPublicRootFile('/manifest.json'), true);
    assert.strictEqual(isPublicRootFile('/manifest.webmanifest'), true);
    assert.strictEqual(isPublicRootFile('server.js'), false);
    assert.strictEqual(isPublicRootFile('package.json'), false);
    assert.ok(PUBLIC_STATIC_DIRS.some(entry => entry.route === '/js'));
    assert.ok(PUBLIC_STATIC_DIRS.some(entry => entry.route === '/models/rl_model/portfolio'));
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(!source.includes('app.use(express.static(path.join(__dirname)))'));
});

runTest('client error payload は必要項目を正規化し長すぎるstackを切り詰める', () => {
    const normalized = normalizeClientErrorPayload({
        source: 'window.onerror',
        message: 'updatePendingModalContent recursion',
        stack: 'x'.repeat(CLIENT_ERROR_LIMITS.maxStackLength + 100),
        filename: 'js/ui.js',
        line: 12,
        column: 3,
        userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1',
        phase: 'build',
        roomId: 'ABCD',
        playerIndex: 1,
        appVersion: 'abc123',
    }, 1700000000000);

    assert.strictEqual(normalized.ok, true);
    assert.strictEqual(normalized.report.message, 'updatePendingModalContent recursion');
    assert.strictEqual(normalized.report.phase, 'build');
    assert.strictEqual(normalized.report.roomId, 'ABCD');
    assert.strictEqual(normalized.report.playerIndex, 1);
    assert.ok(normalized.report.stack.length <= CLIENT_ERROR_LIMITS.maxStackLength + 3);
});

runTest('client error payload はmessage/url/stack/filenameのURL query/hashを除去する', () => {
    const normalized = normalizeClientErrorPayload({
        message: 'boom https://machikoro.example.test/play?token=secret#frag',
        stack: 'Error: boom\n at https://machikoro.example.test/js/ui.js?token=secret#frag:10:2',
        filename: 'https://machikoro.example.test/js/ui.js?room=SECRET#hash',
        url: 'https://machikoro.example.test/?room=SECRET#hash',
    }, 1700000000000);

    assert.strictEqual(normalized.ok, true);
    assert.ok(!normalized.report.message.includes('secret'));
    assert.ok(!normalized.report.stack.includes('secret'));
    assert.ok(!normalized.report.filename.includes('SECRET'));
    assert.ok(!normalized.report.url.includes('SECRET'));
    assert.ok(normalized.report.stack.includes('https://machikoro.example.test/js/ui.js'));
    assert.strictEqual(normalized.report.filename, 'https://machikoro.example.test/js/ui.js');
    assert.strictEqual(normalized.report.url, 'https://machikoro.example.test/');
});

runTest('client error rate limit と duplicate suppression は短時間の連投を抑止する', () => {
    const buckets = new Map();
    const cache = new Map();
    const now = 1700000000000;
    for (let i = 0; i < CLIENT_ERROR_LIMITS.rateLimitMax; i++) {
        assert.strictEqual(isClientErrorRateLimited('ip1', now + i, buckets), false);
    }
    assert.strictEqual(isClientErrorRateLimited('ip1', now + CLIENT_ERROR_LIMITS.rateLimitMax + 1, buckets), true);
    assert.strictEqual(isClientErrorRateLimited('ip1', now + CLIENT_ERROR_LIMITS.rateLimitWindowMs + 1, buckets), false);
    buckets.set('stale-ip', { windowStart: now - CLIENT_ERROR_LIMITS.rateLimitWindowMs - 1, count: 1 });
    pruneClientErrorRateBuckets(now, buckets);
    assert.strictEqual(buckets.has('stale-ip'), false);

    const overflowBuckets = new Map([
        ['oldest', { windowStart: now, count: 1 }],
        ['middle', { windowStart: now, count: 1 }],
        ['newest', { windowStart: now, count: 1 }],
    ]);
    pruneRateBuckets(now, overflowBuckets, CLIENT_ERROR_LIMITS.rateLimitWindowMs, 2);
    assert.deepStrictEqual([...overflowBuckets.keys()], ['middle', 'newest']);

    const report = normalizeClientErrorPayload({ message: 'same', stack: 'stack', phase: 'build' }, now).report;
    assert.strictEqual(isDuplicateClientError(report, now, cache), false);
    rememberDuplicateClientError(report, now, cache);
    assert.strictEqual(isDuplicateClientError(report, now + 1000, cache), true);
    assert.strictEqual(isDuplicateClientError(report, now + CLIENT_ERROR_LIMITS.duplicateWindowMs + 1001, cache), false);

    const lifecycleCache = new Map();
    const lifecycleReport = { event: 'play-start', roomIdHash: 'hash' };
    assert.strictEqual(isDuplicateGameLifecycle(lifecycleReport, now, lifecycleCache), false);
    rememberDuplicateGameLifecycle(lifecycleReport, now, lifecycleCache);
    assert.strictEqual(isDuplicateGameLifecycle(lifecycleReport, now + 1000, lifecycleCache), true);
});

runTest('trust proxy は明示設定時だけ有効化する', () => {
    assert.strictEqual(resolveTrustProxySetting({}), false);
    assert.strictEqual(resolveTrustProxySetting({ TRUST_PROXY: '0' }), false);
    assert.strictEqual(resolveTrustProxySetting({ TRUST_PROXY: '1' }), 1);
    assert.strictEqual(resolveTrustProxySetting({ EXPRESS_TRUST_PROXY: 'loopback' }), 'loopback');
});

function makeMockReq({ headers = {}, body = {}, protocol = 'https', ip = '127.0.0.1' } = {}) {
    const normalizedHeaders = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    return {
        body,
        protocol,
        ip,
        headers: normalizedHeaders,
        get(name) { return normalizedHeaders[String(name).toLowerCase()] || ''; },
    };
}

function makeMockRes() {
    return {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

runTest('client error auth は same-origin を許可し cross-origin と不正tokenを拒否する', () => {
    const sameOriginReq = makeMockReq({
        headers: { host: 'example.com', origin: 'https://example.com' },
    });
    assert.strictEqual(requestBaseOrigin(sameOriginReq), 'https://example.com');
    assert.ok(clientErrorAllowedOrigins(sameOriginReq, {}).includes('https://example.com'));
    assert.strictEqual(isClientErrorOriginAllowed(sameOriginReq, {}), true);
    assert.deepStrictEqual(authorizeClientErrorRequest(sameOriginReq, {}), { ok: true });

    const crossOriginReq = makeMockReq({
        headers: { host: 'example.com', origin: 'https://evil.example' },
    });
    assert.strictEqual(authorizeClientErrorRequest(crossOriginReq, {}).error, 'forbidden_origin');

    const tokenReq = makeMockReq({
        headers: { host: 'example.com', origin: 'https://example.com', authorization: 'Bearer secret-token' },
    });
    assert.strictEqual(requestClientErrorToken(tokenReq), 'secret-token');
    assert.deepStrictEqual(authorizeClientErrorRequest(tokenReq, { CLIENT_ERROR_SHARED_TOKEN: 'secret-token' }), { ok: true });
    assert.deepStrictEqual(authorizeClientErrorRequest(sameOriginReq, { CLIENT_ERROR_SHARED_TOKEN: 'secret-token' }), { ok: true });

    const noOriginTokenlessReq = makeMockReq({ headers: { host: 'example.com' } });
    assert.strictEqual(authorizeClientErrorRequest(noOriginTokenlessReq, { CLIENT_ERROR_SHARED_TOKEN: 'secret-token' }).error, 'invalid_client_error_token');
});

runTest('client error auth は production ntfy の no-origin 無tokenを拒否する', () => {
    const noOriginReq = makeMockReq({ headers: { host: 'example.com' } });
    const env = { NODE_ENV: 'production', NTFY_TOPIC: 'topic' };

    assert.strictEqual(isProductionNoOriginClientErrorBlocked(noOriginReq, env), true);
    assert.strictEqual(authorizeClientErrorRequest(noOriginReq, env).error, 'forbidden_origin');

    const sameOriginReq = makeMockReq({ headers: { host: 'example.com', origin: 'https://example.com' } });
    assert.deepStrictEqual(authorizeClientErrorRequest(sameOriginReq, env), { ok: true });

    const tokenReq = makeMockReq({ headers: { host: 'example.com', authorization: 'Bearer secret-token' } });
    assert.deepStrictEqual(authorizeClientErrorRequest(tokenReq, { ...env, CLIENT_ERROR_SHARED_TOKEN: 'secret-token' }), { ok: true });
});

runTest('client error auth の no-origin 例外は明示的な真値だけを許可する', () => {
    const noOriginReq = makeMockReq({ headers: { host: 'example.com' } });
    const production = { NODE_ENV: 'production', NTFY_TOPIC: 'topic' };

    for (const value of ['', '0', 'false', 'no', 'off', ' disabled ']) {
        const env = { ...production, CLIENT_ERROR_ALLOW_NO_ORIGIN: value };
        assert.strictEqual(isProductionNoOriginClientErrorBlocked(noOriginReq, env), true, value);
        assert.strictEqual(authorizeClientErrorRequest(noOriginReq, env).error, 'forbidden_origin', value);
    }
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'on']) {
        const env = { ...production, CLIENT_ERROR_ALLOW_NO_ORIGIN: value };
        assert.strictEqual(isProductionNoOriginClientErrorBlocked(noOriginReq, env), false, value);
        assert.deepStrictEqual(authorizeClientErrorRequest(noOriginReq, env), { ok: true }, value);
    }
});

runTest('client error request は no-origin tokenなしなら通知前に拒否する', () => {
    const res = makeMockRes();
    handleClientErrorRequest(makeMockReq({
        headers: { host: 'example.com' },
        body: { message: 'boom' },
    }), res, { env: { CLIENT_ERROR_SHARED_TOKEN: 'secret-token' } });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'invalid_client_error_token');
});

runTest('client error test endpoint は shared token 設定時 same-origin でも token を要求する', async () => {
    const env = { NODE_ENV: 'test', NTFY_TOPIC: 'topic', CLIENT_ERROR_SHARED_TOKEN: 'secret-token' };
    const sameOrigin = makeMockReq({ headers: { host: 'example.com', origin: 'https://example.com' } });
    const blocked = makeMockRes();
    await handleClientErrorTestRequest(sameOrigin, blocked, { env });
    assert.strictEqual(blocked.statusCode, 403);
    assert.strictEqual(blocked.body.error, 'invalid_client_error_token');

    const tokenReq = makeMockReq({ headers: { host: 'example.com', origin: 'https://example.com', 'x-client-error-token': 'secret-token' } });
    const accepted = makeMockRes();
    await handleClientErrorTestRequest(tokenReq, accepted, { env, notifyOptions: { topic: 'topic', fetchImpl() { return { ok: true }; } } });
    assert.strictEqual(accepted.statusCode, 202);
});

runTest('ntfy client error message は classification/phase/room/UA と本文を含む', () => {
    const report = normalizeClientErrorPayload({
        message: 'updatePendingModalContent recursion',
        stack: 'stack line',
        phase: 'build',
        roomId: 'ABCD',
        playerIndex: 2,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1',
        appVersion: 'abc123',
    }, 1700000000000).report;
    const message = formatNtfyClientErrorMessage(report);

    assert.ok(message.includes('classification=known-pattern'));
    assert.ok(message.includes('pattern=pending-render-recovery'));
    assert.ok(message.includes('phase=build'));
    assert.ok(message.includes('room=' + redactedClientErrorRoomId('ABCD')));
    assert.ok(!message.includes('room=ABCD'));
    assert.ok(message.includes('player=2'));
    assert.ok(message.includes('version=abc123'));
    assert.ok(message.includes('Safari iPhone'));
    assert.ok(message.includes('updatePendingModalContent recursion'));
});

runTest('ntfy client error message はURL queryとtoken値をredactする', () => {
    const report = normalizeClientErrorPayload({
        message: 'failed reconnectToken=secret-token at https://example.com/play?room=ABCD&token=query-secret',
        stack: 'stack sessionId:"session-secret" token=plain-secret x-client-error-token=header-secret',
        filename: 'https://example.com/app.js?cache=private',
        url: 'https://example.com/game?room=ABCD&reconnectToken=url-secret',
    }, 1700000000000).report;
    const message = formatNtfyClientErrorMessage(report);

    assert.ok(message.includes('reconnectToken=[redacted]'));
    assert.ok(message.includes('sessionId:"[redacted]"'));
    assert.ok(message.includes('token=[redacted]'));
    assert.ok(message.includes('x-client-error-token=[redacted]'));
    assert.ok(message.includes('https://example.com/play'));
    assert.ok(message.includes('https://example.com/app.js'));
    assert.ok(!message.includes('secret-token'));
    assert.ok(!message.includes('query-secret'));
    assert.ok(!message.includes('session-secret'));
    assert.ok(!message.includes('plain-secret'));
    assert.ok(!message.includes('header-secret'));
    assert.ok(!message.includes('cache=private'));
});

runTest('ntfy client error message はJSON形式のtoken/session値もredactする', () => {
    const report = normalizeClientErrorPayload({
        message: 'json token payload',
        stack: 'FREEZE_SUMMARY {"reconnectToken":"json-secret","sessionId":"json-session","nested":{"token":"nested-secret"}}',
    }, 1700000000000).report;
    const message = formatNtfyClientErrorMessage(report);

    assert.ok(message.includes('"reconnectToken":"[redacted]"'));
    assert.ok(message.includes('"sessionId":"[redacted]"'));
    assert.ok(message.includes('"token":"[redacted]"'));
    assert.ok(!message.includes('json-secret'));
    assert.ok(!message.includes('json-session'));
    assert.ok(!message.includes('nested-secret'));
});

runTest('ntfy freeze summary は本文先頭にUI lock原因を短く出す', () => {
    const stack = 'FREEZE_SUMMARY ' + JSON.stringify({
        freezeKind: 'human-turn-ui-locked',
        phase: 'build',
        allowedActions: ['buildCard', 'buildLandmark', 'nextTurn', 'undoBuild'],
        interactabilityIssues: [{
            kind: 'allowed-action-container-not-clickable',
            action: 'buildLandmark',
            target: 'buildMenu',
            actionTarget: 'buildLandmark',
            reason: 'action-child-not-clickable',
        }],
        recovery: { attempted: true, success: true },
        noisyLargeField: 'x'.repeat(2000),
    });
    const report = normalizeClientErrorPayload({
        message: 'human-turn-ui-locked after 5000ms',
        stack,
        phase: 'build',
        appVersion: 'current-build',
        roomId: 'ROOM42',
    }, 1700000000000).report;
    const message = formatNtfyClientErrorMessage(report);

    assert.deepStrictEqual(extractFreezeSummaryFromStack(report.stack).allowedActions, ['buildCard', 'buildLandmark', 'nextTurn', 'undoBuild']);
    assert.ok(message.startsWith('UI_LOCK_SUMMARY\n'));
    assert.ok(message.includes('freezeKind=human-turn-ui-locked'));
    assert.ok(message.includes('phase=build'));
    assert.ok(message.includes('version=current-build'));
    assert.ok(message.includes('actions=buildCard,buildLandmark,nextTurn,undoBuild'));
    assert.ok(message.includes('issue=allowed-action-container-not-clickable'));
    assert.ok(message.includes('action=buildLandmark'));
    assert.ok(message.includes('target=buildMenu'));
    assert.ok(message.includes('actionTarget=buildLandmark'));
    assert.ok(message.includes('reason=action-child-not-clickable'));
    assert.ok(message.includes('recovery=success'));
    assert.ok(message.includes('staleClient=false'));
    assert.ok(message.indexOf('UI_LOCK_SUMMARY') < message.indexOf('classification=known-pattern'));
    assert.ok(!message.includes('room=ROOM42'));
});

runTest('ntfy freeze summary は stale client 判定を先頭要約へ含める', () => {
    const report = normalizeClientErrorPayload({
        message: 'post-build-ui-blocked after 5000ms',
        stack: 'FREEZE_SUMMARY ' + JSON.stringify({ freezeKind: 'post-build-ui-blocked', phase: 'build', recovery: { attempted: true, success: false } }),
        phase: 'build',
        appVersion: '86136c7',
    }, 1700000000000).report;
    const summary = formatNtfyFreezeSummary(report);

    assert.ok(summary.startsWith('UI_LOCK_SUMMARY\n'));
    assert.ok(summary.includes('freezeKind=post-build-ui-blocked'));
    assert.ok(summary.includes('recovery=failed'));
    assert.ok(summary.includes('staleClient=true'));
});

runTest('client error classification は stale client と未知通知を分ける', () => {
    const stale = normalizeClientErrorPayload({
        message: 'post-build-ui-blocked after 5000ms',
        stack: 'FREEZE_SUMMARY {"freezeKind":"post-build-ui-blocked"}',
        appVersion: '86136c7',
    }, 1700000000000).report;
    assert.strictEqual(extractClientErrorFreezeKind(stale), 'post-build-ui-blocked');
    assert.strictEqual(isStaleClientErrorVersion('86136c7'), true);
    assert.deepStrictEqual(classifyClientErrorReport(stale), {
        classification: 'stale-client',
        priority: '2',
        tags: 'hourglass,known,stale_client',
        freezeKind: 'post-build-ui-blocked',
        knownPatternId: 'fixed-version-prefix',
    });

    const currentCpuStall = normalizeClientErrorPayload({
        message: 'cpu-turn-stalled after 275000ms',
        stack: 'FREEZE_SUMMARY {"freezeKind":"cpu-turn-stalled","phase":"pending","allowedActions":["resolveIT"]}',
        appVersion: 'current-build',
    }, 1700000000000).report;
    assert.deepStrictEqual(classifyClientErrorReport(currentCpuStall), {
        classification: 'known-pattern',
        priority: '3',
        tags: 'warning,known,ui_lock',
        freezeKind: 'cpu-turn-stalled',
        knownPatternId: 'cpu-turn-stalled',
    });

    const slowCpuStep = normalizeClientErrorPayload({
        source: 'cpu-step-slow',
        message: 'slow CPU step pending strong pending resolveBusiness',
        stack: 'CPU_STEP_SLOW {"step":"pending","durationMs":1450}',
        appVersion: 'current-build',
    }, 1700000000000).report;
    assert.deepStrictEqual(classifyClientErrorReport(slowCpuStep), {
        classification: 'known-pattern',
        priority: '3',
        tags: 'warning,known,performance',
        freezeKind: '',
        knownPatternId: 'cpu-step-slow',
    });

    const versionMismatch = normalizeClientErrorPayload({
        source: 'version-mismatch',
        message: 'Client version mismatch',
        stack: 'client=0a7a9fe\nserver=bf2f17d',
        appVersion: '0a7a9fe',
    }, 1700000000000).report;
    assert.deepStrictEqual(classifyClientErrorReport(versionMismatch), {
        classification: 'known-pattern',
        priority: '2',
        tags: 'hourglass,known,stale_client',
        freezeKind: '',
        knownPatternId: 'client-version-mismatch',
    });

    const unknown = normalizeClientErrorPayload({
        message: 'new unrecovered crash',
        stack: 'new stack',
        appVersion: 'current-build',
    }, 1700000000000).report;
    assert.strictEqual(classifyClientErrorReport(unknown).classification, 'unknown');
    assert.strictEqual(classifyClientErrorReport(unknown).priority, '5');
});

runTest('notifyClientError は未知だけ高優先度にし既知UI lockは低めにPOSTする', () => {
    const calls = [];
    const unknown = normalizeClientErrorPayload({ message: 'boom', phase: 'build', roomId: 'ABCD' }, 1700000000000).report;
    notifyClientError(unknown, {
        topic: 'machikoro-test-topic',
        fetchImpl(url, options) {
            calls.push({ url, options });
            return { ok: true };
        },
    });

    assert.strictEqual(calls.length, 1);
    const unknownUrl = new URL(calls[0].url);
    assert.strictEqual(unknownUrl.origin + unknownUrl.pathname, 'https://ntfy.sh/machikoro-test-topic');
    assert.strictEqual(calls[0].options.method, 'POST');
    assert.strictEqual(unknownUrl.searchParams.get('title'), '[ダイスシティ] Unknown Client Error');
    assert.strictEqual(unknownUrl.searchParams.get('priority'), '5');
    assert.ok(unknownUrl.searchParams.get('tags').includes('unknown'));
    assert.ok(calls[0].options.body.includes('classification=unknown'));

    const known = normalizeClientErrorPayload({ message: 'pending-ui-locked after 5000ms', stack: 'FREEZE_SUMMARY {"freezeKind":"pending-ui-locked"}' }, 1700000000000).report;
    notifyClientError(known, {
        topic: 'machikoro-test-topic',
        fetchImpl(url, options) {
            calls.push({ url, options });
            return { ok: true };
        },
    });
    const knownUrl = new URL(calls[1].url);
    assert.strictEqual(knownUrl.searchParams.get('title'), '[ダイスシティ] Client Error');
    assert.strictEqual(knownUrl.searchParams.get('priority'), '3');
    assert.ok(knownUrl.searchParams.get('tags').includes('known'));
});


runTest('notifyClientError は production 以外の環境変数NTFY_TOPICへ誤送信しない', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousTopic = process.env.NTFY_TOPIC;
    process.env.NODE_ENV = 'development';
    process.env.NTFY_TOPIC = 'non-game-local-topic';
    const calls = [];
    const report = normalizeClientErrorPayload({ message: 'boom', phase: 'build' }, 1700000000000).report;

    const result = await notifyClientError(report, {
        fetchImpl(url, options) {
            calls.push({ url, options });
            return { ok: true };
        },
    });

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousTopic === undefined) delete process.env.NTFY_TOPIC;
    else process.env.NTFY_TOPIC = previousTopic;

    assert.deepStrictEqual(calls, []);
    assert.strictEqual(result.sent, false);
    assert.strictEqual(result.reason, 'missing-topic');
});

runTest('notifyGameLifecycle は production 以外の環境変数NTFY_TOPICへ誤送信しない', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousTopic = process.env.NTFY_TOPIC;
    process.env.NODE_ENV = 'development';
    process.env.NTFY_TOPIC = 'non-game-local-topic';
    const calls = [];
    const report = normalizeGameLifecyclePayload({ event: 'play-start', mode: 'local', playerCount: 2, cpuCount: 1, sessionId: 'local-topic-guard' }, 1700000000000).report;

    const result = await notifyGameLifecycle(report, {
        fetchImpl(url, options) {
            calls.push({ url, options });
            return { ok: true };
        },
    });

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousTopic === undefined) delete process.env.NTFY_TOPIC;
    else process.env.NTFY_TOPIC = previousTopic;

    assert.deepStrictEqual(calls, []);
    assert.strictEqual(result.sent, false);
    assert.strictEqual(result.reason, 'missing-topic');
});

runTest('postNtfyNotification helper は ntfy POST options を一箇所で組み立てる', () => {
    const calls = [];
    postNtfyNotification({
        topic: 'helper-topic',
        title: '[ダイスシティ] Helper Test',
        priority: '5',
        tags: 'test,gear',
        body: 'hello',
        fetchImpl(url, options) {
            calls.push({ url, options });
            return { ok: true };
        },
    });

    assert.strictEqual(calls.length, 1);
    const helperUrl = new URL(calls[0].url);
    assert.strictEqual(helperUrl.origin + helperUrl.pathname, 'https://ntfy.sh/helper-topic');
    assert.strictEqual(calls[0].options.method, 'POST');
    assert.strictEqual(helperUrl.searchParams.get('title'), '[ダイスシティ] Helper Test');
    assert.strictEqual(helperUrl.searchParams.get('priority'), '5');
    assert.strictEqual(helperUrl.searchParams.get('tags'), 'test,gear');
    assert.strictEqual(calls[0].options.body, 'hello');
    assert.deepStrictEqual(calls[0].options.headers, {});
});

runTest('postNtfyNotification helper はserver専用tokenと代替base URLを使える', async () => {
    const calls = [];
    await postNtfyNotification({
        topic: 'private/topic',
        baseUrl: 'https://notify.example.test/root/',
        accessToken: 'secret-token',
        fetchImpl(url, options) {
            calls.push({ url, options });
            return { ok: true };
        },
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://notify.example.test/root/private%2Ftopic');
    assert.deepStrictEqual(calls[0].options.headers, {
        Authorization: 'Bearer secret-token',
    });
});

runTest('postNtfyNotification helper は拒否statusを秘密情報なしで返す', async () => {
    const result = await postNtfyNotification({
        topic: 'helper-topic',
        fetchImpl() {
            return {
                ok: false,
                status: 429,
                headers: { get: () => '7' },
            };
        },
    });
    assert.deepStrictEqual(result, {
        sent: false,
        reason: 'ntfy-status',
        status: 429,
        retryAfterMs: 7000,
    });
});

runTest('postNtfyNotification helper は応答停止をtimeoutとして中断する', async () => {
    let cleared = null;
    class FakeAbortController {
        constructor() {
            this.signal = { aborted: false };
        }
        abort() {
            this.signal.aborted = true;
        }
    }
    const result = await postNtfyNotification({
        topic: 'helper-topic',
        AbortControllerImpl: FakeAbortController,
        setTimeoutFn(callback) {
            callback();
            return 7;
        },
        clearTimeoutFn(id) { cleared = id; },
        async fetchImpl(url, options) {
            assert.strictEqual(options.signal.aborted, true);
            throw new Error('aborted');
        },
    });
    assert.deepStrictEqual(result, { sent: false, reason: 'ntfy-timeout' });
    assert.strictEqual(cleared, 7);
});

runTest('client error test endpoint helper は production 既定で無効、dev/debug で有効になる', () => {
    assert.strictEqual(isClientErrorTestEnabled({ NODE_ENV: 'production' }), false);
    assert.strictEqual(isClientErrorTestEnabled({ NODE_ENV: 'production', CLIENT_ERROR_TEST_ENABLED: '1' }), true);
    assert.strictEqual(isClientErrorTestEnabled({ NODE_ENV: 'development' }), true);
    assert.strictEqual(isClientErrorTestEnabled({ NODE_ENV: 'test' }), true);
    assert.strictEqual(isClientErrorTestEnabled({}), false);
});

runTest('client error test payload は実エラーではないことが分かる通知内容を作る', () => {
    const payload = buildClientErrorTestPayload(1700000000000, 'testhash');
    const normalized = normalizeClientErrorPayload(payload, 1700000000000);
    assert.strictEqual(normalized.ok, true);
    assert.strictEqual(normalized.report.source, 'manual-test-endpoint');
    assert.strictEqual(normalized.report.message, 'ダイスシティ ntfy test notification');
    assert.strictEqual(normalized.report.phase, 'test');
    assert.strictEqual(normalized.report.roomId, 'TEST01');
    assert.strictEqual(normalized.report.appVersion, 'testhash');
    assert.ok(normalized.report.stack.includes('no real client error occurred'));
});

runTest('client error test endpoint は無効時404、NTFY_TOPIC未設定時503を返す', () => {
    const disabledRes = makeMockRes();
    handleClientErrorTestRequest({}, disabledRes, { env: { NODE_ENV: 'production' } });
    assert.strictEqual(disabledRes.statusCode, 404);
    assert.strictEqual(disabledRes.body.error, 'client_error_test_disabled');

    const missingTopicRes = makeMockRes();
    handleClientErrorTestRequest({}, missingTopicRes, { env: { NODE_ENV: 'development' } });
    assert.strictEqual(missingTopicRes.statusCode, 503);
    assert.strictEqual(missingTopicRes.body.error, 'missing_ntfy_topic');
});

runTest('game lifecycle payload は名前とroomなしの短い通知本文へ正規化する', () => {
    const normalized = normalizeGameLifecyclePayload({
        event: 'play-finish',
        mode: 'online',
        playerCount: 4,
        cpuCount: 3,
        turn: 14,
        winnerKind: 'cpu',
        winnerCpuDifficulty: 'strong',
        sessionId: 'abc123',
        playerName: 'Alice',
        roomId: 'ABCD',
    }, 1700000000000);

    assert.strictEqual(normalized.ok, true);
    assert.strictEqual(normalized.report.mode, 'online');
    const message = formatNtfyGameLifecycleMessage(normalized.report);
    assert.ok(message.includes('event=play-finish'));
    assert.ok(message.includes('mode=online'));
    assert.ok(message.includes('players=4'));
    assert.ok(message.includes('cpu=3'));
    assert.ok(message.includes('winnerKind=cpu'));
    assert.ok(message.includes('winnerDifficulty=strong'));
    assert.ok(!message.includes('winner=CPU Strong'));
    assert.ok(message.includes('turn=14'));
    assert.ok(!message.includes('Alice'));
    assert.ok(!message.includes('ABCD'));
});

runTest('notifyGameLifecycle は ntfy topic 設定時に軽量titleでPOSTする', async () => {
    const calls = [];
    const report = normalizeGameLifecyclePayload({ event: 'play-start', mode: 'local', playerCount: 4, cpuCount: 3, sessionId: 'start1' }, 1700000000000).report;
    await notifyGameLifecycle(report, {
        topic: 'machikoro-life-topic',
        fetchImpl(url, options) {
            calls.push({ url, options });
            return { ok: true };
        },
    });

    assert.strictEqual(calls.length, 1);
    const lifecycleUrl = new URL(calls[0].url);
    assert.strictEqual(lifecycleUrl.origin + lifecycleUrl.pathname, 'https://ntfy.sh/machikoro-life-topic');
    assert.strictEqual(calls[0].options.method, 'POST');
    assert.strictEqual(lifecycleUrl.searchParams.get('title'), '[ダイスシティ] Game Started');
    assert.strictEqual(lifecycleUrl.searchParams.get('priority'), '2');
    assert.ok(calls[0].options.body.includes('mode=local'));
    assert.ok(calls[0].options.body.includes('players=4'));
});


runTest('game lifecycle endpoint は no-origin scripted request にtokenを要求しsame-origin browserを壊さない', async () => {
    const env = { NODE_ENV: 'production', NTFY_TOPIC: 'topic', CLIENT_ERROR_SHARED_TOKEN: 'life-secret' };
    const body = { event: 'play-start', mode: 'local', playerCount: 2, cpuCount: 1, sessionId: 'life-auth' };

    const noOrigin = makeMockReq({ headers: { host: 'example.com' }, body });
    assert.strictEqual(hasClientReportOrigin(noOrigin), false);
    const blocked = makeMockRes();
    await handleGameLifecycleRequest(noOrigin, blocked, { env, rateBuckets: new Map(), dedupeCache: new Map() });
    assert.strictEqual(blocked.statusCode, 403);
    assert.strictEqual(blocked.body.error, 'invalid_client_error_token');

    const tokenReq = makeMockReq({ headers: { host: 'example.com', 'x-client-error-token': 'life-secret' }, body: { ...body, sessionId: 'life-auth-token' } });
    const tokenRes = makeMockRes();
    await handleGameLifecycleRequest(tokenReq, tokenRes, { env, rateBuckets: new Map(), dedupeCache: new Map(), notifyOptions: { topic: 'topic', fetchImpl() { return { ok: true }; } } });
    assert.strictEqual(tokenRes.statusCode, 202);

    const sameOrigin = makeMockReq({ headers: { host: 'example.com', origin: 'https://example.com' }, body: { ...body, sessionId: 'life-auth-browser' } });
    assert.strictEqual(hasClientReportOrigin(sameOrigin), true);
    const sameOriginRes = makeMockRes();
    await handleGameLifecycleRequest(sameOrigin, sameOriginRes, { env, rateBuckets: new Map(), dedupeCache: new Map(), notifyOptions: { topic: 'topic', fetchImpl() { return { ok: true }; } } });
    assert.strictEqual(sameOriginRes.statusCode, 202);
});

runTest('game lifecycle endpoint は duplicate を抑止する', async () => {
    const calls = [];
    const cache = new Map();
    const req = makeMockReq({ body: { event: 'play-start', mode: 'local', playerCount: 2, cpuCount: 1, sessionId: 'dupe-session' } });
    const first = makeMockRes();
    await handleGameLifecycleRequest(req, first, {
        env: { NTFY_TOPIC: 'topic' },
        now: 1700000000000,
        dedupeCache: cache,
        rateBuckets: new Map(),
        notifyOptions: { topic: 'topic', fetchImpl(url, options) { calls.push({ url, options }); return { ok: true }; } },
    });
    const second = makeMockRes();
    await handleGameLifecycleRequest(req, second, {
        env: { NTFY_TOPIC: 'topic' },
        now: 1700000001000,
        dedupeCache: cache,
        rateBuckets: new Map(),
        notifyOptions: { topic: 'topic', fetchImpl(url, options) { calls.push({ url, options }); return { ok: true }; } },
    });

    assert.strictEqual(first.statusCode, 202);
    assert.strictEqual(first.body.duplicate, false);
    assert.strictEqual(second.statusCode, 202);
    assert.strictEqual(second.body.duplicate, true);
    assert.strictEqual(calls.length, 1);
});

runTest('action metadata は server validator/canonical payload/replay 契約と同じaction集合を使う', () => {
    const runtime = loadGameRuntime();
    const actions = Object.values(runtime.GAME_ACTIONS).sort();
    assert.deepStrictEqual(Object.keys(runtime.GAME_ACTION_REGISTRY).sort(), actions, 'registry action set drift');
    assert.deepStrictEqual(Object.keys(ACTION_PAYLOAD_VALIDATORS).sort(), actions, 'server validator action set drift');
    assert.deepStrictEqual(Object.keys(CANONICAL_ACTION_PAYLOAD_KEYS).sort(), actions, 'canonical payload action set drift');
    for (const action of actions) {
        const entry = runtime.GAME_ACTION_REGISTRY[action];
        assert.strictEqual(entry.action, action, action + ' registry action mismatch');
        assert.strictEqual(entry.serverPayload, true, action + ' must declare server payload support');
        assert.strictEqual(entry.serverReplay, true, action + ' must declare server replay support');
        assert.strictEqual(entry.clientApply, true, action + ' must declare client apply support');
        assert.strictEqual(typeof ACTION_PAYLOAD_VALIDATORS[action], 'function', action + ' validator missing');
        assert.ok(Array.isArray(CANONICAL_ACTION_PAYLOAD_KEYS[action]), action + ' canonical payload keys missing');
    }
});

runTest('GAME_ACTION_REGISTRY は server payload validator と mirror apply で網羅される', () => {
    const runtime = loadGameRuntime();
    const actions = Object.values(runtime.GAME_ACTIONS).sort();
    const registry = runtime.GAME_ACTION_REGISTRY;
    const validationSource = fs.readFileSync(path.join(__dirname, '..', 'server/actionValidation.js'), 'utf8');

    assert.deepStrictEqual(Object.keys(registry).sort(), actions);
    for (const action of actions) {
        const entry = registry[action];
        assert.strictEqual(entry.action, action);
        assert.ok(Object.values(runtime.GAME_PHASES).includes(entry.phase));
        assert.ok(entry.payloadKind);
        assert.strictEqual(entry.serverPayload, true);
        assert.strictEqual(entry.serverReplay, true);
    }

    const validatorActions = Object.keys(ACTION_PAYLOAD_VALIDATORS).sort();
    const mirrorActions = Array.from(GameEngine.handledActions).sort();
    const serverPayloadActions = actions.filter(action => registry[action].serverPayload);
    const serverReplayActions = actions.filter(action => registry[action].serverReplay);

    assert.deepStrictEqual(validatorActions, serverPayloadActions);
    assert.ok(Object.isFrozen(ACTION_PAYLOAD_VALIDATORS));
    for (const action of validatorActions) {
        assert.strictEqual(typeof ACTION_PAYLOAD_VALIDATORS[action], 'function', `${action} validator missing`);
    }
    assert.deepStrictEqual(mirrorActions, serverReplayActions);
    assert.ok(validationSource.includes('ACTION_PAYLOAD_VALIDATORS'));
});

runTest('server validateBusinessPayload はカードindex指定を許可する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    game.currentPlayer().cards = [
        createCardByName('麦畑'),
        createCardByName('パン屋'),
        createCardByName('ビジネスセンター'),
    ];
    game.players[1].cards = [
        createCardByName('麦畑'),
        createCardByName('カフェ'),
    ];
    game.phase = 'pending';
    game.pendingBusiness = 1;
    const result = validateBusinessPayload(game, {
        myCard: 1,
        targetIndex: 1,
        theirCard: 1,
    });
    assert.strictEqual(result, true);
});

runTest('server validateBusinessPayload はpending中の明示的な不使用だけを許可する', () => {
    const { GameManager } = makeGame();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingBusiness = 1;

    assert.strictEqual(validateBusinessPayload(game, { skip: true }), true);
    assert.strictEqual(validateBusinessPayload(game, { skip: false }), false);
    game.pendingBusiness = 0;
    assert.strictEqual(validateBusinessPayload(game, { skip: true }), false);
});

runTest('server validateMoverPayload はカードindex指定を許可する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    game.currentPlayer().cards = [
        createCardByName('麦畑'),
        createCardByName('パン屋'),
        createCardByName('引越し屋'),
    ];
    game.phase = 'pending';
    game.pendingMover = 1;
    const result = validateMoverPayload(game, {
        cardIndex: 2,
        targetIndex: 1,
    });
    assert.strictEqual(result, true);
});

runTest('online validateGameAction は lastUndoState があると undoBuild を許可する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 }];
    const baseMirror = validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: 'カフェ' });
    room.lastUndoState = makeUndoStateFromMirror(baseMirror.mirror.game, baseMirror.mirror.shopStock);
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 },
        { action: 'buildCard', data: { cardName: 'カフェ' }, playerIndex: 0 },
    ];
    const result = validateGameAction(room, { playerIndex: 0 }, 'undoBuild', {});
    assert.strictEqual(result.ok, true);
});

runTest('validateGameAction は勝利後の nextTurn と undoBuild を拒否する', () => {
    const room = makeRoom();
    room.gameStartPayload.enabledLandmarks = ['駅'];
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 },
        { action: 'buildLandmark', data: { name: '駅' }, playerIndex: 0 },
    ];

    const mirror = createRoomMirror(room);
    assert.ok(mirror.game.checkWinner());
    assert.strictEqual(validateGameAction(room, { playerIndex: 0 }, 'nextTurn', {}).ok, false);
    assert.strictEqual(validateGameAction(room, { playerIndex: 0 }, 'undoBuild', {}).ok, false);
});

runTest('createRoomMirror は勝利後の replay action を拒否する', () => {
    for (const tailAction of ['nextTurn', 'undoBuild']) {
        const room = makeRoom();
        room.gameStartPayload.enabledLandmarks = ['駅'];
        room.actionLog = [
            { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 },
            { action: 'buildLandmark', data: { name: '駅' }, playerIndex: 0 },
            { action: tailAction, data: {}, playerIndex: 0 },
        ];

        assert.strictEqual(createRoomMirror(room), null, tailAction + ' should be rejected after winner');
    }
});

runTest('createRoomMirror は build action replay から lastUndoState を復元する', () => {
    const room = makeRoom();
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 },
        { action: 'buildCard', data: { cardName: 'カフェ' }, playerIndex: 0 },
    ];

    const mirror = createRoomMirror(room);
    assert.ok(mirror.lastUndoState);
    assert.strictEqual(mirror.lastUndoState.playerCoins[0], 4);
    assert.strictEqual(mirror.lastUndoState.shopStock['カフェ'], 6);
});

runTest('server mirror snapshot は serialize/restore/serialize でroundtripできる', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    const shopStock = { 麦畑: 4, パン屋: 5, カフェ: 6, ビジネスセンター: 4, 引越し屋: 5 };
    game.players[0].name = 'Alice';
    game.players[0].coins = 9;
    game.players[0].cards = [createCardByName('麦畑'), createCardByName('カフェ')];
    game.players[0].dormantCards = [game.players[0].cards[1]];
    game.players[0].landmarks['駅'] = true;
    game.players[0].itVentureCoins = 3;
    game.players[0].hasYakusho = false;
    game.players[1].name = 'Bob';
    game.players[1].coins = 5;
    game.players[1].cards = [createCardByName('パン屋')];
    game.currentPlayerIndex = 1;
    game.phase = 'pending';
    game.log = [{ type: 'system', message: 'roundtrip' }];
    game.lastDiceResult = 10;
    game.lastDice1 = 4;
    game.lastDice2 = 6;
    game.builtThisTurn = true;
    game.pendingTV = 1;
    game.usedReroll = true;
    game.pendingTunaDice = [3, 4];
    game.turnCount = 7;
    game.hadAmusementParkAtRoll = true;
    const undoState = makeUndoStateFromMirror(game, shopStock);
    const snapshot = serializeMirrorState(game, shopStock, undoState, 42);

    const restoredGame = new GameManager(2);
    const restoredShopStock = {};
    restoreMirrorState(restoredGame, restoredShopStock, snapshot, createCardByName);
    const roundtrip = serializeMirrorState(restoredGame, restoredShopStock, snapshot.undoState, snapshot.actionSeq);

    assert.deepStrictEqual(roundtrip, snapshot);
});

runTest('server mirror snapshot は長いlogを末尾30件に制限する', () => {
    const { GameManager } = makeGame();
    const game = new GameManager(2);
    game.log = Array.from({ length: 40 }, (_, index) => ({ type: 'system', message: `log-${index}` }));

    const snapshot = serializeMirrorState(game, { 麦畑: 6 }, null, 1);

    assert.strictEqual(snapshot.log.length, 30);
    assert.strictEqual(snapshot.log[0].message, 'log-10');
    assert.strictEqual(snapshot.log[29].message, 'log-39');
});

runTest('createRoomMirror は過大または壊れたsnapshot logを描画前に拒否する', () => {
    const baseRoom = makeRoom();
    const baseMirror = createRoomMirror(baseRoom);
    const baseSnapshot = serializeMirrorState(baseMirror.game, baseMirror.shopStock);
    const invalidLogs = [
        Array.from({ length: 31 }, (_, index) => ({ type: 'system', message: `log-${index}` })),
        [null],
        [{ type: 'system' }],
        [{ message: 'missing type' }],
    ];
    for (const log of invalidLogs) {
        const room = makeRoom();
        room.stateSnapshot = Object.assign({}, baseSnapshot, { log });
        assert.strictEqual(createRoomMirror(room), null);
    }
});

runTest('createRoomMirror は snapshot の undoState から undoBuild replay を復元する', () => {
    const room = makeRoom();
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 },
        { action: 'buildCard', data: { cardName: 'カフェ' }, playerIndex: 0 },
    ];
    const builtMirror = createRoomMirror(room);
    room.stateSnapshot = serializeMirrorState(builtMirror.game, builtMirror.shopStock, builtMirror.lastUndoState);
    room.actionLog = [{ action: 'undoBuild', data: {}, playerIndex: 0 }];

    const mirror = createRoomMirror(room);

    assert.ok(mirror);
    assert.strictEqual(mirror.game.currentPlayer().coins, builtMirror.lastUndoState.playerCoins[0]);
    assert.strictEqual(mirror.game.currentPlayer().countCard('カフェ'), 0);
    assert.strictEqual(mirror.shopStock['カフェ'], builtMirror.lastUndoState.shopStock['カフェ']);
    assert.strictEqual(mirror.lastUndoState, null);
});

runTest('online validateGameAction は無効化されたランドマーク建設を拒否する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 }];
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildLandmark', { name: '港' });
    assert.strictEqual(result.ok, false);
});

runTest('createRoomMirror は snapshot 内の無効化カード所持を拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.players[0].cards = ['鉱山'];
    snapshot.shopStock['鉱山'] = 0;
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror は snapshot 内の有効カード初期在庫超過を拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.shopStock['ビジネスセンター'] = 3;
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror はsnapshotとundoの所持card物量超過を拒否する', () => {
    const inflatedRoom = makeRoom();
    const inflated = makeSnapshot();
    inflated.players[0].cards = Array(9).fill('麦畑');
    inflated.players[1].cards = [];
    inflated.shopStock = {};
    inflatedRoom.stateSnapshot = inflated;
    assert.strictEqual(createRoomMirror(inflatedRoom), null);

    const duplicateMajorRoom = makeRoom();
    const duplicateMajor = makeSnapshot();
    duplicateMajor.players[0].cards = ['ビジネスセンター', 'ビジネスセンター'];
    duplicateMajor.players[1].cards = [];
    duplicateMajor.shopStock = {};
    duplicateMajorRoom.stateSnapshot = duplicateMajor;
    assert.strictEqual(createRoomMirror(duplicateMajorRoom), null);

    const undoRoom = makeRoom();
    const undoSnapshot = makeSnapshot();
    undoSnapshot.undoState = makeUndoStateFromMirror(
        createRoomMirror(undoRoom).game,
        createRoomMirror(undoRoom).shopStock
    );
    undoSnapshot.undoState.playerCardNames[0] = Array(9).fill('パン屋');
    undoSnapshot.undoState.playerCardNames[1] = [];
    undoSnapshot.undoState.shopStock = {};
    undoRoom.stateSnapshot = undoSnapshot;
    assert.strictEqual(createRoomMirror(undoRoom), null);
});

runTest('createRoomMirror は snapshot 内の無効化カード在庫復元を拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.shopStock['鉱山'] = 1;
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror は snapshot 内の無効化ランドマーク建設済みを拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.players[0].landmarks['港'] = true;
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror は snapshot undoState 内の無効化カード復元を拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.undoState = makeUndoStateFromMirror(createRoomMirror(room).game, createRoomMirror(room).shopStock);
    snapshot.undoState.playerCardNames[0] = ['鉱山'];
    snapshot.undoState.shopStock['鉱山'] = 0;
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror は snapshot undoState 内の無効化カード在庫復元を拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.undoState = makeUndoStateFromMirror(createRoomMirror(room).game, createRoomMirror(room).shopStock);
    snapshot.undoState.shopStock['鉱山'] = 1;
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror は snapshot 内の重複休業indexを拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.players[0].dormantIndices = [0, 0];
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror は snapshot の pendingActions action/field 不一致を拒否する', () => {
    const mismatch = makeSnapshot({
        phase: 'pending',
        pendingTV: 1,
        pendingActions: [{ action: 'resolveBusiness', field: 'pendingTV' }],
    });
    const countMismatch = makeSnapshot({
        phase: 'pending',
        pendingTV: 1,
        pendingActions: [],
    });

    const mismatchRoom = makeRoom();
    mismatchRoom.stateSnapshot = mismatch;
    assert.strictEqual(createRoomMirror(mismatchRoom), null);

    const countRoom = makeRoom();
    countRoom.stateSnapshot = countMismatch;
    assert.strictEqual(createRoomMirror(countRoom), null);
});

runTest('createRoomMirror は snapshot の pending と phase 不整合や過大countを拒否する', () => {
    const phaseMismatch = makeSnapshot({
        phase: 'build',
        pendingTV: 1,
        pendingActions: [{ action: 'resolveTV', field: 'pendingTV' }],
    });
    const pendingItMismatch = makeSnapshot({
        phase: 'build',
        pendingIT: true,
    });
    const excessivePending = makeSnapshot({
        phase: 'pending',
        pendingTV: 51,
    });
    const emptyPending = makeSnapshot({ phase: 'pending' });
    const mixedPending = makeSnapshot({
        phase: 'pending',
        pendingIT: true,
        pendingTV: 1,
    });

    for (const snapshot of [phaseMismatch, pendingItMismatch, excessivePending, emptyPending, mixedPending]) {
        const room = makeRoom();
        room.stateSnapshot = snapshot;
        assert.strictEqual(createRoomMirror(room), null);
    }
});

runTest('createRoomMirror は解決対象数を超える清掃業pendingを拒否する', () => {
    const validRoom = makeRoom();
    validRoom.stateSnapshot = makeSnapshot({
        phase: 'pending',
        pendingCleaning: 2,
        pendingActions: Array.from({ length: 2 }, () => ({
            action: 'resolveCleaning', field: 'pendingCleaning',
        })),
    });
    assert.ok(createRoomMirror(validRoom));

    const invalidRoom = makeRoom();
    invalidRoom.stateSnapshot = makeSnapshot({
        phase: 'pending',
        pendingCleaning: 3,
        pendingActions: Array.from({ length: 3 }, () => ({
            action: 'resolveCleaning', field: 'pendingCleaning',
        })),
    });
    assert.strictEqual(createRoomMirror(invalidRoom), null);
});

runTest('createRoomMirror は自分の通常施設数を超える引越し屋pendingを拒否する', () => {
    const room = makeRoom();
    room.stateSnapshot = makeSnapshot({
        phase: 'pending',
        pendingMover: 3,
        pendingActions: Array.from({ length: 3 }, () => ({
            action: 'resolveMover', field: 'pendingMover',
        })),
    });
    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror は対象のない改装屋pendingを拒否する', () => {
    const validRoom = makeRoom();
    const valid = makeSnapshot({
        phase: 'pending',
        pendingRenovation: 2,
        pendingActions: Array.from({ length: 2 }, () => ({
            action: 'resolveRenovation', field: 'pendingRenovation',
        })),
    });
    valid.players[0].landmarks['駅'] = true;
    valid.players[0].landmarks['ショッピングモール'] = true;
    validRoom.stateSnapshot = valid;
    assert.ok(createRoomMirror(validRoom));

    const invalidRoom = makeRoom();
    const invalid = makeSnapshot({
        phase: 'pending',
        pendingRenovation: 2,
        pendingActions: Array.from({ length: 2 }, () => ({
            action: 'resolveRenovation', field: 'pendingRenovation',
        })),
    });
    invalid.players[0].landmarks['駅'] = true;
    invalidRoom.stateSnapshot = invalid;
    assert.ok(createRoomMirror(invalidRoom));
    invalid.players[0].landmarks['駅'] = false;
    assert.strictEqual(createRoomMirror(invalidRoom), null);
});

runTest('createRoomMirror は非連続な改装屋runごとの対象消費を検証する', () => {
    const snapshot = makeSnapshot({
        phase: 'pending',
        pendingTV: 1,
        pendingRenovation: 2,
        pendingActions: [
            { action: 'resolveRenovation', field: 'pendingRenovation' },
            { action: 'resolveTV', field: 'pendingTV' },
            { action: 'resolveRenovation', field: 'pendingRenovation' },
        ],
    });
    snapshot.players[0].landmarks['駅'] = true;
    const oneTargetRoom = makeRoom();
    oneTargetRoom.stateSnapshot = snapshot;
    assert.strictEqual(createRoomMirror(oneTargetRoom), null);

    snapshot.players[0].landmarks['ショッピングモール'] = true;
    const twoTargetRoom = makeRoom();
    twoTargetRoom.stateSnapshot = snapshot;
    assert.ok(createRoomMirror(twoTargetRoom));

    snapshot.pendingTV = 0;
    snapshot.pendingActions = [
        { action: 'resolveRenovation', field: 'pendingRenovation' },
        { action: 'resolveRenovation', field: 'pendingRenovation' },
    ];
    snapshot.players[0].landmarks['ショッピングモール'] = false;
    const consecutiveRoom = makeRoom();
    consecutiveRoom.stateSnapshot = snapshot;
    assert.ok(createRoomMirror(consecutiveRoom));

    delete snapshot.pendingActions;
    const legacyRoom = makeRoom();
    legacyRoom.stateSnapshot = snapshot;
    assert.ok(createRoomMirror(legacyRoom));

    const earlierLongRunRoom = makeRoom();
    earlierLongRunRoom.gameStartPayload.enabledLandmarks.push('遊園地');
    const earlierLongRun = makeSnapshot({
        phase: 'pending',
        pendingTV: 1,
        pendingRenovation: 3,
        pendingActions: [
            { action: 'resolveRenovation', field: 'pendingRenovation' },
            { action: 'resolveRenovation', field: 'pendingRenovation' },
            { action: 'resolveTV', field: 'pendingTV' },
            { action: 'resolveRenovation', field: 'pendingRenovation' },
        ],
    });
    earlierLongRun.players[0].landmarks['駅'] = true;
    earlierLongRun.players[0].landmarks['ショッピングモール'] = true;
    earlierLongRunRoom.stateSnapshot = earlierLongRun;
    assert.strictEqual(createRoomMirror(earlierLongRunRoom), null);
    earlierLongRun.players[0].landmarks['遊園地'] = true;
    assert.ok(createRoomMirror(earlierLongRunRoom));
});

runTest('createRoomMirror のpending対象検査は旧snapshotのcards欠落を許容する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot({
        phase: 'pending',
        pendingMover: 2,
        pendingActions: Array.from({ length: 2 }, () => ({
            action: 'resolveMover', field: 'pendingMover',
        })),
    });
    delete snapshot.players[0].cards;
    delete snapshot.players[0].dormantIndices;
    room.stateSnapshot = snapshot;
    const mirror = createRoomMirror(room);
    assert.ok(mirror);
    assert.strictEqual(mirror.game.currentPlayer().getMinorCards().length, 2);
});

runTest('createRoomMirror は旧snapshotのcards欠落時に初期カードを維持する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    delete snapshot.players[0].cards;
    delete snapshot.players[0].dormantIndices;
    room.stateSnapshot = snapshot;

    const mirror = createRoomMirror(room);

    assert.ok(mirror);
    assert.deepStrictEqual(Array.from(mirror.game.players[0].cards, card => card.name), ['麦畑', 'パン屋']);
});

runTest('createRoomMirror は snapshot 内の小数コインを拒否する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    snapshot.players[0].coins = 3.5;
    room.stateSnapshot = snapshot;

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('createRoomMirror はsnapshotとundoのunsafe数値や不正diceを拒否する', () => {
    const baseRoom = makeRoom();
    const baseMirror = createRoomMirror(baseRoom);
    const baseSnapshot = serializeMirrorState(baseMirror.game, baseMirror.shopStock);
    const unsafe = Number.MAX_SAFE_INTEGER + 1;
    const mutations = [
        snapshot => { snapshot.players[0].coins = unsafe; },
        snapshot => { snapshot.players[0].itVentureCoins = unsafe; },
        snapshot => { snapshot.shopStock['麦畑'] = unsafe; },
        snapshot => { snapshot.lastDiceResult = 15; },
        snapshot => { snapshot.lastDice1 = 7; },
        snapshot => { snapshot.turnCount = unsafe; },
        snapshot => { snapshot.cpuSpeed = 'immediate'; },
        snapshot => {
            snapshot.undoState = makeUndoStateFromMirror(baseMirror.game, baseMirror.shopStock);
            snapshot.undoState.playerCoins[0] = unsafe;
        },
    ];
    for (const mutate of mutations) {
        const room = makeRoom();
        room.stateSnapshot = JSON.parse(JSON.stringify(baseSnapshot));
        mutate(room.stateSnapshot);
        assert.strictEqual(createRoomMirror(room), null);
    }
});

runTest('createRoomMirror は旧snapshotの補完可能な欠落フィールドを許容する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    delete snapshot.shopStock;
    delete snapshot.log;
    delete snapshot.lastDice1;
    delete snapshot.lastDice2;
    delete snapshot.pendingMover;
    delete snapshot.players[0].landmarks;
    room.stateSnapshot = snapshot;

    const mirror = createRoomMirror(room);

    assert.ok(mirror);
    assert.strictEqual(mirror.game.players.length, 2);
    assert.strictEqual(mirror.shopStock['麦畑'], 6);
    assert.strictEqual(mirror.game.players[0].landmarks['駅'], false);
    assert.strictEqual(mirror.game.players[0].landmarks['ショッピングモール'], false);
});

runTest('restoreUndoMirror は旧undoStateのlog欠落を空ログとして復元する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    const shopStock = { 麦畑: 6 };
    const undoState = {
        playerCoins: [5, 3],
        playerCardNames: [[], []],
        playerDormantIndices: [[], []],
        playerLandmarks: [{}, {}],
        playerItVenture: [0, 0],
        shopStock: { 麦畑: 6 },
        builtThisTurn: false,
    };

    const ok = restoreUndoMirror(game, shopStock, undoState, createCardByName);

    assert.strictEqual(ok, true);
    assert.deepStrictEqual(game.log, []);
    assert.strictEqual(game.players[0].coins, 5);
});

// ===== sanitizeName =====

runTest('sanitizeName がHTMLタグ・特殊文字を除去し20文字に制限する', () => {
    assert.strictEqual(sanitizeName('<b>name</b>'), 'bname/b');
    assert.strictEqual(sanitizeName('a'.repeat(25)), 'a'.repeat(20));
    assert.strictEqual(sanitizeName('  Alice  '), 'Alice');
    assert.strictEqual(sanitizeName(null), '');
    assert.strictEqual(sanitizeName('<>&"\'`'), '');
});

runTest('handleRecreateRoom は未sanitizeの復元playerNameを拒否する', () => {
    const crypto = require('crypto');
    const reconnectToken = 'token-host';
    const emitted = [];
    handleRecreateRoom({
        id: 'socket-host-name',
        emit(name, payload) { emitted.push({ name, payload }); },
        join() {},
    }, {
        roomId: 'REST_BAD_NAME',
        gameStartPayload: {
            playerNames: ['Alice<script>', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ actionSeq: 0 }),
        actionLog: [],
        playerIndex: 0,
        playerName: 'Alice<script>',
        reconnectToken,
    });

    assert.strictEqual(__rooms.REST_BAD_NAME, undefined);
    assert.strictEqual(emitted[0].name, APP_ERROR_EVENT);
});

runTest('normalizePlayerSettings は5人以上のrl CPUを維持する', () => {
    const settings = normalizePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'weak' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
    ], 5);

    assert.deepStrictEqual(settings, [
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'weak' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
    ]);
});

runTest('normalizePlayerSettings はrl model idを保持する', () => {
    const settings = normalizePlayerSettings([
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-4p-h256-lr1e5-5000-seed103' },
        { type: 'human' },
    ], 2);

    assert.strictEqual(settings[0].difficulty, 'rl');
    assert.strictEqual(settings[0].rlModelId, 'self-only-4p-h256-lr1e5-5000-seed103');
});

runTest('normalizePlayerSettings は不正なrl model idを保持しない', () => {
    const settings = normalizePlayerSettings([
        { type: 'cpu', difficulty: 'rl', rlModelId: 'unknown-model' },
    ], 1);

    assert.strictEqual(settings[0].difficulty, 'rl');
    assert.strictEqual(settings[0].rlModelId, undefined);
});

runTest('hasInvalidOnlineRlModelSettings はrl model id未指定を拒否対象にする', () => {
    assert.strictEqual(hasInvalidOnlineRlModelSettings([
        { type: 'cpu', difficulty: 'rl' },
        { type: 'human', difficulty: 'normal' },
    ]), true);
    assert.strictEqual(hasInvalidOnlineRlModelSettings([
        { type: 'cpu', difficulty: 'rl', rlModelId: 'self-only-4p-h256-lr1e5-5000-seed103' },
    ]), false);
});

runTest('server のRLモデル許可リストは portfolio と一致する', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'js', 'rlModelCatalog.js'), 'utf8')}\n${fs.readFileSync(path.join(__dirname, '..', 'js', 'RLModelPortfolio.js'), 'utf8')}\nthis.__portfolioIds = RLModelPortfolio.models.map(model => model.id);`, context);
    const portfolioIds = Array.from(context.__portfolioIds).sort();
    assert.deepStrictEqual([...ALLOWED_RL_MODEL_IDS].sort(), portfolioIds);
});



runTest('normalizePlayerSettings は4人以下ならrl CPUを維持する', () => {
    const settings = normalizePlayerSettings([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
    ], 4);

    assert.strictEqual(settings[1].difficulty, 'rl');
    assert.strictEqual(settings.length, 4);
    assert.deepStrictEqual(settings[2], { type: 'human', difficulty: 'normal' });
    assert.deepStrictEqual(settings[3], { type: 'human', difficulty: 'normal' });
});

runTest('normalizePlayerSettings は不正difficultyをnormalへ倒す', () => {
    const settings = normalizePlayerSettings([
        { type: 'cpu', difficulty: 'evil' },
    ], 2);

    assert.deepStrictEqual(settings[0], { type: 'cpu', difficulty: 'normal' });
    assert.deepStrictEqual(settings[1], { type: 'human', difficulty: 'normal' });
});

runTest('normalizeCpuSpeed は非数値と極端値を安全範囲へ丸める', () => {
    assert.strictEqual(normalizeCpuSpeed('bad'), 1500);
    assert.strictEqual(normalizeCpuSpeed(-10), 0);
    assert.strictEqual(normalizeCpuSpeed(999999), 5000);
    assert.strictEqual(normalizeCpuSpeed(1234.9), 1234);
});

runTest('normalizeEnabledCards は既知カード名配列だけを採用する', () => {
    assert.deepStrictEqual(normalizeEnabledCards(['麦畑', '存在しないカード']), ['麦畑']);
    assert.ok(normalizeEnabledCards({}).includes('麦畑'));
    assert.ok(normalizeEnabledCards([]).includes('麦畑'));
});

runTest('isActiveRoomSocket は再接続後の古いsocketを拒否する', () => {
    const room = {
        players: [{ id: 'new-socket', index: 0, name: 'Alice' }],
    };
    assert.strictEqual(isActiveRoomSocket(room, { id: 'new-socket', playerIndex: 0 }), true);
    assert.strictEqual(isActiveRoomSocket(room, { id: 'old-socket', playerIndex: 0 }), false);
});

runTest('sanitizeRestoreActionLogEntry は復元action dataをcanonicalizeする', () => {
    const result = sanitizeRestoreActionLogEntry({
        action: 'buildCard',
        data: { cardName: '麦畑', huge: 'x'.repeat(1000) },
        playerIndex: 0,
        seq: 1,
    }, 'ROOM01', 0);

    assert.deepStrictEqual(result.entry.data, { cardName: '麦畑' });
});

runTest('canonicalizeActionData は action log に余分なpayload keyを残さない', () => {
    assert.deepStrictEqual(canonicalizeActionData('nextTurn', { extra: 'x' }), {});
    assert.deepStrictEqual(canonicalizeActionData('buildCard', { cardName: '麦畑', huge: 'x'.repeat(1000) }), { cardName: '麦畑' });
    assert.deepStrictEqual(canonicalizeActionData('resolveMover', { cardIndex: 1, cardName: '麦畑', targetIndex: 2, extra: true }), { cardIndex: 1, targetIndex: 2 });
    assert.deepStrictEqual(canonicalizeActionData('resolveMover', { cardName: '麦畑', targetIndex: 2, extra: true }), { cardName: '麦畑', targetIndex: 2 });
});

runTest('canonicalizeActionData は GAME_ACTIONS 全体のpayload shapeを固定する', () => {
    const { GAME_ACTIONS } = loadGameRuntime();
    const noisyPayload = {
        forceDice: 3,
        tunaDice: [1, 2],
        useTwo: true,
        diceCount: 2,
        d1: 3,
        d2: 4,
        useBonus: true,
        targetIndex: 1,
        myCard: 0,
        theirCard: 2,
        cardName: '麦畑',
        cardIndex: 5,
        landmarkName: '駅',
        doSave: false,
        name: '港',
        extra: 'drop',
    };
    const expectedKeysByAction = {
        [GAME_ACTIONS.ROLL_DICE]: ['forceDice', 'tunaDice'],
        [GAME_ACTIONS.SELECT_DICE]: ['useTwo', 'diceCount', 'd1', 'd2', 'tunaDice'],
        [GAME_ACTIONS.REROLL_DICE]: ['forceDice', 'tunaDice'],
        [GAME_ACTIONS.SKIP_REROLL]: [],
        [GAME_ACTIONS.RESOLVE_HARBOR]: ['useBonus'],
        [GAME_ACTIONS.RESOLVE_TV]: ['targetIndex'],
        [GAME_ACTIONS.RESOLVE_BUSINESS]: ['myCard', 'targetIndex', 'theirCard'],
        [GAME_ACTIONS.RESOLVE_CLEANING]: ['cardName'],
        [GAME_ACTIONS.RESOLVE_MOVER]: ['cardName', 'targetIndex'],
        [GAME_ACTIONS.RESOLVE_RENOVATION]: ['landmarkName'],
        [GAME_ACTIONS.RESOLVE_IT]: ['doSave'],
        [GAME_ACTIONS.BUILD_CARD]: ['cardName'],
        [GAME_ACTIONS.BUILD_LANDMARK]: ['name'],
        [GAME_ACTIONS.UNDO_BUILD]: [],
        [GAME_ACTIONS.NEXT_TURN]: [],
    };
    const expectedMoverIndexKeys = ['cardIndex', 'targetIndex'];

    assert.deepStrictEqual(Object.keys(expectedKeysByAction).sort(), Object.values(GAME_ACTIONS).sort());
    assert.deepStrictEqual(Object.keys(CANONICAL_ACTION_PAYLOAD_KEYS).sort(), Object.values(GAME_ACTIONS).sort());
    for (const action of Object.values(GAME_ACTIONS)) {
        const expectedKeys = action === GAME_ACTIONS.RESOLVE_MOVER ? expectedMoverIndexKeys : expectedKeysByAction[action];
        assert.deepStrictEqual(Array.from(CANONICAL_ACTION_PAYLOAD_KEYS[action]), expectedKeysByAction[action], `${action} canonical payload table changed`);
        assert.deepStrictEqual(Object.keys(canonicalizeActionData(action, noisyPayload)), expectedKeys, `${action} canonical payload keys changed`);
    }
});

runTest('normalizeClientActionId は現行protocolの境界と文字集合を固定する', () => {
    const cases = [
        ['a', 'a'],
        ['client-action_1:2', 'client-action_1:2'],
        ['x'.repeat(120), 'x'.repeat(120)],
        ['__proto__', '__proto__'],
        ['', ''],
        ['x'.repeat(121), ''],
        ['bad space', ''],
        ['m1.stream.1', ''],
        ['slash/action', ''],
        ['日本語', ''],
        [null, ''],
        [42, ''],
    ];
    for (const [input, expected] of cases) {
        assert.strictEqual(normalizeClientActionId(input), expected, String(input));
    }
});

runTest('accepted clientActionId は再送時に既存actionAcceptedを返すため保持できる', () => {
    const room = makeRoom();
    room.acceptedClientActions = {};
    const actionEntry = {
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 7,
        clientActionId: 'client-action-1',
    };

    rememberAcceptedClientAction(room, actionEntry);

    assert.strictEqual(findAcceptedClientAction(room, 'client-action-1', 0), actionEntry);
    assert.strictEqual(findAcceptedClientAction(room, 'client-action-1', 1), null);
    assert.strictEqual(findAcceptedClientAction(room, 'missing', 0), null);
});

runTest('acceptedClientActionRefs は reconnect ack metadata 用の最小refを返す', () => {
    const room = makeRoom();
    room.acceptedClientActions = {};
    const actionEntry = {
        action: 'nextTurn',
        data: {},
        playerIndex: 1,
        seq: 11,
        clientActionId: 'client-action-ref',
    };

    rememberAcceptedClientAction(room, actionEntry);

    assert.deepStrictEqual(acceptedClientActionRefs(room), [{ playerIndex: 1, clientActionId: 'client-action-ref', seq: 11 }]);
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const helperSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'rejoinPayload.js'), 'utf8');
    const occurrences = helperSource.match(/acceptedClientActions: acceptedClientActionRefs/g) || [];
    assert.strictEqual(occurrences.length, 1);
    assert.ok(serverSource.includes('buildRejoinDataPayload(input.room, input.playerIndex)'));
    assert.ok(serverSource.includes("require('./server/rejoinPayload')"));
});

runTest('buildRejoinDataPayload は reconnect payload metadata を一箇所で組み立てる', () => {
    const room = makeRoom();
    room.gameStartPayload = { playerNames: ['Alice', 'Bob'] };
    room.stateSnapshot = { actionSeq: 3 };
    room.actionLog = [{ action: 'nextTurn', data: {}, seq: 4 }];
    room.hostPlayerIndex = 1;
    room.hostEpoch = 2;
    room.acceptedClientActions = {};
    rememberAcceptedClientAction(room, {
        action: 'buildCard',
        data: { cardName: '麦畑' },
        playerIndex: 0,
        seq: 5,
        clientActionId: 'ack-1',
    });

    const payload = buildRejoinDataPayload(room, 0);

    assert.strictEqual(payload.gameStartPayload, room.gameStartPayload);
    assert.strictEqual(payload.stateSnapshot, room.stateSnapshot);
    assert.strictEqual(payload.actionLog, room.actionLog);
    assert.deepStrictEqual(payload.acceptedClientActions, [{ playerIndex: 0, clientActionId: 'ack-1', seq: 5 }]);
    assert.strictEqual(payload.playerIndex, 0);
    assert.strictEqual(payload.hostPlayerIndex, 1);
    assert.strictEqual(payload.hostEpoch, 2);

    const overridePayload = buildRejoinDataPayload(room, 1, { stateSnapshot: null, actionLog: [], hostPlayerIndex: 0, hostEpoch: 9 });
    assert.strictEqual(overridePayload.stateSnapshot, null);
    assert.strictEqual(overridePayload.actionLog.length, 0);
    assert.strictEqual(overridePayload.hostPlayerIndex, 0);
    assert.strictEqual(overridePayload.hostEpoch, 9);
});

runTest('accepted clientActionId はactionLog内の既存entryからも見つけられる', () => {
    const room = makeRoom();
    const actionEntry = {
        action: 'buildCard',
        data: { cardName: '麦畑' },
        playerIndex: 0,
        seq: 3,
        clientActionId: 'client-action-log',
    };
    room.actionLog = [actionEntry];

    assert.strictEqual(findAcceptedClientAction(room, 'client-action-log', 0), actionEntry);
    assert.strictEqual(findAcceptedClientAction(room, 'client-action-log', 1), null);
});

runTest('accepted clientActionId は共通fixtureのsnapshot圧縮済みpendingを既承認として返す', () => {
    const fixture = makePendingAckRequiresLogOrSnapshotFixture();
    const room = makeRoom();
    const actionEntry = Object.assign({}, fixture.pendingAction);
    room.actionSeq = fixture.pendingAction.seq;
    room.gameStartPayload = Object.assign({}, fixture.snapshotCompactedBundle.gameStartPayload);
    room.stateSnapshot = Object.assign({}, fixture.snapshotCompactedBundle.stateSnapshot);
    room.actionLog = [];
    room.acceptedClientActions = {};

    rememberAcceptedClientAction(room, actionEntry);

    assert.ok(room.stateSnapshot.actionSeq >= fixture.pendingAction.seq);
    assert.strictEqual(findAcceptedClientAction(room, fixture.pendingAction.clientActionId, fixture.pendingAction.playerIndex), actionEntry);
    assert.strictEqual(findAcceptedClientAction(room, fixture.pendingAction.clientActionId, fixture.pendingAction.playerIndex + 1), null);
});

runTest('accepted clientActionId は旧形式cacheでも送信者一致時だけ返す', () => {
    const room = makeRoom();
    const actionEntry = {
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 8,
        clientActionId: 'legacy-client-action',
    };
    room.acceptedClientActions = {
        [actionEntry.clientActionId]: actionEntry,
    };

    assert.strictEqual(findAcceptedClientAction(room, actionEntry.clientActionId, 0), actionEntry);
    assert.strictEqual(findAcceptedClientAction(room, actionEntry.clientActionId, 1), null);
});

runTest('emitAppError は appError イベントでメッセージを送る', () => {
    const emitted = [];
    emitAppError({ emit(name, payload) { emitted.push({ name, payload }); } }, 'bad');
    assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: 'bad' }]);
});

runTest('requirePlainSocketPayload は非object payloadをappErrorで拒否する', () => {
    const invalidPayloads = [null, undefined, [], 'x', 1, true];
    for (const payload of invalidPayloads) {
        const emitted = [];
        const ok = requirePlainSocketPayload({ emit(name, body) { emitted.push({ name, body }); } }, payload);
        assert.strictEqual(ok, false);
        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, body: '無効なリクエストです' }]);
    }
});

runTest('requirePlainSocketPayload は過大なsocket payloadをappErrorで拒否する', () => {
    const payloads = [
        { playerName: 'a'.repeat(SOCKET_PAYLOAD_LIMITS.maxStringLength + 1) },
        { playerName: 'a'.repeat(900), roomId: 'b'.repeat(900), clientVersion: 'c'.repeat(900), extra: 'd'.repeat(900), more: 'e'.repeat(900) },
        { nested: { a: { b: { c: { d: { e: { f: { g: { h: { i: true } } } } } } } } } },
    ];

    for (const payload of payloads) {
        const emitted = [];
        const ok = requirePlainSocketPayload({ emit(name, body) { emitted.push({ name, body }); } }, payload);
        assert.strictEqual(ok, false);
        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, body: '無効なリクエストです' }]);
    }
});

runTest('validateSocketPayloadLimits は通常payloadとrestore payloadの上限を分離する', () => {
    assert.deepStrictEqual(validateSocketPayloadLimits({ roomId: 'ABC123', playerName: 'Alice' }).ok, true);
    assert.strictEqual(validateSocketPayloadLimits({ data: 'x'.repeat(SOCKET_PAYLOAD_LIMITS.maxJsonBytes) }).ok, false);
});

runTest('requirePlainSocketPayload はplain object payloadを許可する', () => {
    const emitted = [];
    const ok = requirePlainSocketPayload({ emit(name, body) { emitted.push({ name, body }); } }, { unexpected: true });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(emitted, []);
});

runTest('resolveBuildHash は環境変数 BUILD_HASH を優先する', () => {
    const before = process.env.BUILD_HASH;
    try {
        process.env.BUILD_HASH = 'from-env';
        assert.strictEqual(resolveBuildHash(), 'from-env');
    } finally {
        if (before === undefined) delete process.env.BUILD_HASH;
        else process.env.BUILD_HASH = before;
    }
});

runTest('injectServiceWorkerBuildHash は現在のcache versionをビルドハッシュへ置換する', () => {
    const content = "const CACHE_NAME = 'machikoro-v3';";
    assert.strictEqual(
        injectServiceWorkerBuildHash(content, 'abc123'),
        "const CACHE_NAME = 'machikoro-abc123';"
    );
});

runTest('injectIndexBuildHash はクライアントversionをheadへ注入する', () => {
    const html = '<html><head><title>x</title></head><body></body></html>';
    const injected = injectIndexBuildHash(html, 'abc123');

    assert.ok(injected.includes('window.MACHIKORO_CLIENT_VERSION="abc123";'));
    assert.ok(injected.indexOf('window.MACHIKORO_CLIENT_VERSION') < injected.indexOf('</head>'));
});

runTest('/api/version は static metadata adapter経由でstale cacheを避ける', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const assetSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'staticAssets.js'), 'utf8');
    assert.ok(serverSource.includes('registerStaticMetadataRoutes({'));
    assert.ok(assetSource.includes("app.get('/api/version'"));
    assert.ok(assetSource.includes("res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');"));
});

runTest('/api/client-error-test route はdebug endpointにも小さなJSON上限を持つ', () => {
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const routeSource = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'reportingHttpRoutes.js'),
        'utf8'
    );
    assert.ok(serverSource.includes("require('./server/reportingHttpRoutes')"));
    assert.ok(serverSource.includes('registerReportingHttpRoutes({'));
    assert.ok(routeSource.includes("app.post('/api/client-error-test', json({ limit: '1kb' })"));
});

// ===== validateGameAction =====

runTest('validateGameAction は非現在プレイヤーのアクションを拒否する', () => {
    const room = makeRoom();
    room.actionLog = []; // プレイヤー0のターン
    // プレイヤー1がrollDiceを試みる
    const result = validateGameAction(room, { playerIndex: 1 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は enabledCards に含まれないカードの建設を拒否する', () => {
    const room = makeRoom();
    // enabledCards: ['麦畑','パン屋','カフェ','ビジネスセンター','引越し屋']
    // 鉱山はリストにない
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 }];
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: '鉱山' });
    assert.strictEqual(result.ok, false);
});

runTest('getAllowedActions は pendingIT でも PENDING フェーズ外なら通常phaseを優先する', () => {
    const { GameManager, GAME_ACTIONS } = loadGameRuntime();
    const game = new GameManager(2);
    game.phase = 'build';
    game.pendingIT = true;
    assert.deepStrictEqual(
        [...getAllowedActions(game)].sort(),
        [GAME_ACTIONS.BUILD_CARD, GAME_ACTIONS.BUILD_LANDMARK, GAME_ACTIONS.NEXT_TURN, GAME_ACTIONS.UNDO_BUILD].sort()
    );
});

runTest('getAllowedActions は pending queue の先頭actionだけを返す', () => {
    const { GameManager, GAME_ACTIONS } = loadGameRuntime();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingTV = 1;
    game.pendingBusiness = 1;
    game.pendingCleaning = 1;
    game.pendingMover = 1;
    game.pendingRenovation = 1;
    assert.deepStrictEqual([...getAllowedActions(game)], [GAME_ACTIONS.RESOLVE_TV]);
});

runTest('getAllowedActions は単純 phase の許可 action を GameManager と共有する', () => {
    const { GameManager, GAME_PHASES, GAME_PHASE_ACTIONS } = loadGameRuntime();
    const game = new GameManager(2);
    for (const phase of [
        GAME_PHASES.ROLL,
        GAME_PHASES.SELECT_DICE,
        GAME_PHASES.REROLL_CONFIRM,
        GAME_PHASES.HARBOR_CHOICE,
        GAME_PHASES.BUILD,
    ]) {
        game.phase = phase;
        assert.deepStrictEqual([...getAllowedActions(game)], [...GAME_PHASE_ACTIONS[phase]]);
        assert.deepStrictEqual([...getAllowedActions(game)], [...GameManager.allowedActionsFor(game)]);
    }
});

runTest('getAllowedActions は pendingIT を他の pending より優先する', () => {
    const { GameManager, GAME_ACTIONS } = loadGameRuntime();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingTV = 1;
    game.pendingBusiness = 1;
    game.pendingIT = true;

    assert.deepStrictEqual([...getAllowedActions(game)], [GAME_ACTIONS.RESOLVE_IT]);
    assert.deepStrictEqual([...getAllowedActions(game)], [...GameManager.allowedActionsFor(game)]);
});

// ===== validateCleaningPayload =====

runTest('validateCleaningPayload は休業済みカードを対象にできない', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    const cafe = createCardByName('カフェ');
    game.currentPlayer().cards = [cafe];
    game.currentPlayer().dormantCards = [];
    game.players[1].cards = [];
    game.players[1].dormantCards = [];
    game.phase = 'pending';
    game.pendingCleaning = 1;
    // アクティブなカフェは対象にできる
    assert.strictEqual(validateCleaningPayload(game, { cardName: 'カフェ' }), true);
    // 休業中は対象にできない
    game.currentPlayer().makeDormant(cafe);
    assert.strictEqual(validateCleaningPayload(game, { cardName: 'カフェ' }), false);
    // 存在しないカード名は拒否
    assert.strictEqual(validateCleaningPayload(game, { cardName: '存在しないカード' }), false);
    const stadium = createCardByName('スタジアム');
    game.players[1].cards = [stadium];
    assert.strictEqual(validateCleaningPayload(game, { cardName: 'スタジアム' }), false);
});

// ===== validateRenovationPayload =====

runTest('validateRenovationPayload は建設済みランドマークのみ受け付ける', () => {
    const { GameManager } = makeGame();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingRenovation = 1;
    // 未建設は拒否
    assert.strictEqual(validateRenovationPayload(game, { landmarkName: '駅' }), false);
    // 建設済みは許可
    game.currentPlayer().landmarks['駅'] = true;
    assert.strictEqual(validateRenovationPayload(game, { landmarkName: '駅' }), true);
    // 無効なランドマーク名は拒否
    assert.strictEqual(validateRenovationPayload(game, { landmarkName: '存在しないランドマーク' }), false);
});

// ===== フェーズガード =====

runTest('validateGameAction は ROLL フェーズ以外で rollDice を拒否する', () => {
    const room = makeRoom();
    // rollDice後はBUILDフェーズになっている
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 3, tunaDice: [1, 1] }, playerIndex: 0 }];
    const result = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: 2, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は SELECT_DICE フェーズ以外で selectDice を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'selectDice', { useTwo: true, d1: 3, d2: 4, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は REROLL_CONFIRM フェーズ以外で rerollDice を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'rerollDice', { forceDice: 5, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は REROLL_CONFIRM フェーズ以外で skipReroll を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'skipReroll', {});
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は HARBOR_CHOICE フェーズ以外で resolveHarbor を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveHarbor', { useBonus: true });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveTV を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveTV', { targetIndex: 1 });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveBusiness を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveBusiness', { myCard: 0, targetIndex: 1, theirCard: 0 });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveCleaning を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveCleaning', { cardName: '麦畑' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveMover を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveMover', { cardName: '麦畑', targetIndex: 1 });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveRenovation を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveRenovation', { landmarkName: '駅' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は PENDING フェーズ以外で resolveIT を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ（pendingIT もない）
    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveIT', { doSave: true });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は BUILD フェーズ以外で buildCard を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: '麦畑' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は BUILD フェーズ以外で buildLandmark を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'buildLandmark', { name: '駅' });
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は BUILD フェーズ以外で nextTurn を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'nextTurn', {});
    assert.strictEqual(result.ok, false);
});

runTest('validateGameAction は replay 不能な nextTurn payload を拒否する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 }];

    const invalid = validateGameAction(room, { playerIndex: 0 }, 'nextTurn', null);
    const valid = validateGameAction(room, { playerIndex: 0 }, 'nextTurn', {});

    assert.strictEqual(invalid.ok, false);
    assert.strictEqual(valid.ok, true);
});

runTest('validateActionPayloadForState は payload 判定専用で phase gate は validateGameAction 側に残す', () => {
    const room = makeRoom();
    const runtime = loadGameRuntime();
    const game = new runtime.GameManager(2);
    const shopStock = { 麦畑: 6, パン屋: 6, カフェ: 6, ビジネスセンター: 2, 引越し屋: 6 };
    game.phase = runtime.GAME_PHASES.ROLL;
    game.currentPlayer().coins = 5;

    assert.strictEqual(validateActionPayloadForState(room, game, shopStock, 'buildCard', { cardName: 'カフェ' }), true);
    assert.strictEqual(validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: 'カフェ' }).ok, false);
});

runTest('validateActionPayloadForState はAction Contractの不正値を盤面参照前に拒否する', () => {
    for (const [action, data] of [
        ['rollDice', { forceDice: Infinity, tunaDice: [1, 2] }],
        ['selectDice', { useTwo: false, diceCount: 2, d1: 1, d2: 2, tunaDice: [1, 2] }],
        ['resolveTV', { targetIndex: NaN }],
        ['resolveBusiness', { skip: false }],
        ['resolveMover', { cardIndex: -1, targetIndex: 1 }],
        ['resolveIT', { doSave: 1 }],
        ['buildCard', { cardName: '' }],
    ]) {
        assert.strictEqual(validateActionPayloadForState(null, null, null, action, data), false, action);
    }
});

runTest('validateActionPayloadForState は validateGameAction と build payload 判定を共有する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 }];

    const valid = validateGameAction(room, { playerIndex: 0 }, 'buildCard', { cardName: 'カフェ' });
    assert.strictEqual(valid.ok, true);
    assert.strictEqual(
        validateActionPayloadForState(room, valid.mirror.game, valid.mirror.shopStock, 'buildCard', { cardName: 'カフェ' }),
        true
    );
    assert.strictEqual(
        validateBuildCardPayload(room, valid.mirror.game, valid.mirror.shopStock, { cardName: '鉱山' }),
        false
    );
});

runTest('validateBuildCardPayload は ID key の shopStock を読める', () => {
    const runtime = loadGameRuntime();
    const room = makeRoom();
    const { game } = createRoomMirror(room);
    game.phase = 'build';
    game.currentPlayer().coins = 10;
    const cafe = runtime.createCardByName('カフェ');
    const shopStock = { [cafe.id]: 1 };

    assert.strictEqual(validateBuildCardPayload(room, game, shopStock, { cardName: 'カフェ' }), true);
});

runTest('validateActionPayloadForState は resolveTV と buildLandmark payload helper を共有する', () => {
    const { GameManager } = makeGame();
    const room = makeRoom();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingTV = 1;

    assert.strictEqual(validateResolveTVPayload(game, { targetIndex: 1 }), true);
    assert.strictEqual(validateActionPayloadForState(room, game, {}, 'resolveTV', { targetIndex: 0 }), false);

    game.phase = 'build';
    game.pendingTV = 0;
    game.currentPlayer().coins = 10;
    assert.strictEqual(validateBuildLandmarkPayload(room, game, { name: '駅' }), true);
    assert.strictEqual(validateActionPayloadForState(room, game, {}, 'buildLandmark', { name: '港' }), false);
});

runTest('validateBuildLandmarkPayload は enabledLandmarks に混入した未知名を拒否する', () => {
    const { GameManager } = makeGame();
    const room = makeRoom();
    room.gameStartPayload.enabledLandmarks = ['駅', '謎ランドマーク'];
    const game = new GameManager(2);
    game.phase = 'build';
    game.currentPlayer().coins = 10;

    assert.strictEqual(validateBuildLandmarkPayload(room, game, { name: '謎ランドマーク' }), false);
});

runTest('validateGameAction は BUILD フェーズ以外で undoBuild を拒否する', () => {
    const room = makeRoom();
    // actionLog なし → ROLLフェーズ
    const result = validateGameAction(room, { playerIndex: 0 }, 'undoBuild', {});
    assert.strictEqual(result.ok, false);
});

runTest('validateBusinessPayload は範囲外のカードindexを拒否する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    game.currentPlayer().cards = [
        createCardByName('麦畑'),
        createCardByName('ビジネスセンター'),
    ];
    game.players[1].cards = [createCardByName('カフェ')];
    game.currentPlayer().dormantCards = [];
    game.players[1].dormantCards = [];
    game.phase = 'pending';
    game.pendingBusiness = 1;
    // 存在しないindex(99)は拒否
    assert.strictEqual(validateBusinessPayload(game, { myCard: 99, targetIndex: 1, theirCard: 0 }), false);
    // 相手indexが自分と同じは拒否
    assert.strictEqual(validateBusinessPayload(game, { myCard: 0, targetIndex: 0, theirCard: 0 }), false);
});

runTest('validateBusinessPayload は曖昧な文字列カード参照を拒否し validateMoverPayload は旧cardNameを許可する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    game.currentPlayer().cards = [
        createCardByName('麦畑'),
        createCardByName('ビジネスセンター'),
        createCardByName('引越し屋'),
    ];
    game.players[1].cards = [createCardByName('カフェ')];
    game.phase = 'pending';
    game.pendingBusiness = 1;
    assert.strictEqual(validateBusinessPayload(game, { myCard: '麦畑', targetIndex: 1, theirCard: 'カフェ' }), false);

    game.pendingBusiness = 0;
    game.pendingMover = 1;
    assert.strictEqual(validateMoverPayload(game, { cardName: '麦畑', targetIndex: 1 }), true);
    assert.strictEqual(validateMoverPayload(game, { cardName: '存在しないカード', targetIndex: 1 }), false);
});

runTest('validateGameAction は gameStartPayload がない場合に拒否する', () => {
    const room = makeRoom();
    room.gameStartPayload = null;
    const result = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: 1, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, false);
});

runTest('validateRollDicePayload は不正な出目を拒否する', () => {
    assert.strictEqual(validateRollDicePayload({ forceDice: 1, tunaDice: [1, 6] }), true);
    assert.strictEqual(validateRollDicePayload({ forceDice: 0 }), false);
    assert.strictEqual(validateRollDicePayload({ forceDice: 7 }), false);
    assert.strictEqual(validateRollDicePayload({ forceDice: 2, tunaDice: [1, 7] }), false);
    assert.strictEqual(validateRollDicePayload({ forceDice: 2, tunaDice: [] }), false);
    assert.strictEqual(validateRollDicePayload({ forceDice: 2, tunaDice: [1] }), false);
    assert.strictEqual(validateRollDicePayload({ forceDice: 2, tunaDice: [1, 2, 3] }), false);
});

runTest('validateGameAction は駅あり rollDice の forceDice null を許可する', () => {
    const room = makeRoom();
    room.stateSnapshot = makeSnapshot({
        players: [
            { name: 'A', coins: 3, cards: [], dormantIndices: [], landmarks: { 駅: true, ショッピングモール: false }, itVentureCoins: 0, hasYakusho: true },
            { name: 'B', coins: 3, cards: [], dormantIndices: [], landmarks: { 駅: false, ショッピングモール: false }, itVentureCoins: 0, hasYakusho: true },
        ],
        currentPlayerIndex: 0,
        phase: 'roll',
    });
    const result = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: null, tunaDice: null });
    assert.strictEqual(result.ok, true);
});

runTest('validateGameAction は accepted payload を canonicalize できるdataへ正規化する', () => {
    const room = makeRoom();
    room.canonicalMirror = createRoomMirror(room);
    const validation = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: null, tunaDice: null, extra: 'drop' });
    assert.strictEqual(validation.ok, true);
    const safeData = canonicalizeActionData('rollDice', validation.data);
    assert.deepStrictEqual(Object.keys(safeData).sort(), ['forceDice', 'tunaDice']);
});

runTest('validateGameAction は駅なし online rollDice の client dice を server dice へ置き換える', () => {
    const room = makeRoom();
    room.gameStartPayload.enabledLandmarks = ['ショッピングモール'];
    const result = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: null, tunaDice: null });
    assert.strictEqual(result.ok, true);
    assert.ok(Number.isInteger(result.data.forceDice));
    assert.ok(result.data.forceDice >= 1 && result.data.forceDice <= 6);
    assert.ok(Array.isArray(result.data.tunaDice));
    assert.strictEqual(result.data.tunaDice.length, 2);
});

runTest('SERVER_AUTHORITATIVE_DICE_ACTIONS はサーバーが出目を書き換えるactionだけを明示する', () => {
    const runtime = loadGameRuntime();
    const expected = [runtime.GAME_ACTIONS.ROLL_DICE, runtime.GAME_ACTIONS.SELECT_DICE, runtime.GAME_ACTIONS.REROLL_DICE].sort();
    assert.deepStrictEqual(Object.keys(SERVER_AUTHORITATIVE_DICE_ACTIONS).sort(), expected);
    assert.ok(Object.isFrozen(SERVER_AUTHORITATIVE_DICE_ACTIONS));
    for (const action of Object.values(runtime.GAME_ACTIONS)) {
        assert.strictEqual(isServerAuthoritativeDiceAction(action), expected.includes(action), `${action} dice authority flag`);
    }
});

runTest('makeServerDiceActionData は select/reroll の出目を deterministic roller で生成する', () => {
    const room = makeRoom();
    const mirror = createRoomMirror(room);
    const rolls = [2, 3, 4, 5, 6, 1, 2, 3, 4, 5];
    const rollDie = () => rolls.shift();
    const selectOne = makeServerDiceActionData(mirror.game, 'selectDice', { useTwo: false, diceCount: 1, d1: 6, tunaDice: [6, 6] }, rollDie);
    assert.deepStrictEqual(selectOne, { useTwo: false, diceCount: 1, d1: 2, d2: 0, tunaDice: [3, 4] });
    const selectTwo = makeServerDiceActionData(mirror.game, 'selectDice', { useTwo: true, diceCount: 2, d1: 6, d2: 6 }, rollDie);
    assert.deepStrictEqual(selectTwo, { useTwo: true, diceCount: 2, d1: 5, d2: 6, tunaDice: [1, 2] });
    const reroll = makeServerDiceActionData(mirror.game, 'rerollDice', {}, rollDie);
    assert.deepStrictEqual(reroll, { forceDice: 3, tunaDice: [4, 5] });
});

runTest('canonical mirror は accepted action を actionLog replay なしで次検証へ反映する', () => {
    const room = makeRoom();
    resetRoomCanonicalMirror(room);
    const validation = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: null, tunaDice: null });
    assert.strictEqual(validation.ok, true);
    const actionEntry = { action: 'rollDice', data: validation.data, playerIndex: 0, seq: 1 };
    room.actionSeq = actionEntry.seq;
    assert.strictEqual(applyAcceptedActionToRoomCanonicalMirror(room, validation.mirror, actionEntry), true);
    markRoomCanonicalMirrorCurrent(room);
    assert.strictEqual(getRoomCanonicalMirror(room).game.phase, 'build');
    assert.strictEqual(room.actionLog.length, 0);
    const repeatRoll = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: null, tunaDice: null });
    assert.strictEqual(repeatRoll.ok, false);
});

runTest('canonical mirror は stale rebuild 時に state hash mismatch を記録する', () => {
    const room = makeRoom();
    resetRoomCanonicalMirror(room);
    const initialHash = canonicalMirrorStateHash(room.canonicalMirror);
    assert.strictEqual(room.canonicalMirrorStateHash, initialHash);
    assert.strictEqual(stableStateHash({ b: 2, a: 1 }), stableStateHash({ a: 1, b: 2 }));

    room.canonicalMirror.game.players[0].coins += 5;
    const corruptedHash = canonicalMirrorStateHash(room.canonicalMirror);
    room.canonicalMirrorActionSeq = -1;

    const realWarn = console.warn;
    let warned = null;
    console.warn = (message, detail) => { warned = { message, detail }; };
    try {
        const rebuilt = getRoomCanonicalMirror(room);
        assert.ok(rebuilt);
    } finally {
        console.warn = realWarn;
    }

    assert.strictEqual(room.lastCanonicalMirrorMismatch.previousHash, corruptedHash);
    assert.strictEqual(room.lastCanonicalMirrorMismatch.rebuiltHash, initialHash);
    assert.strictEqual(room.canonicalMirrorStateHash, initialHash);
    assert.strictEqual(warned.message, 'canonical mirror mismatch detected');
});

runTest('validateSelectDicePayload は型と出目範囲を検証する', () => {
    assert.strictEqual(validateSelectDicePayload({ useTwo: false, diceCount: 1, d1: 3, tunaDice: [2, 3] }), true);
    assert.strictEqual(validateSelectDicePayload({ useTwo: true, diceCount: 2, d1: 4, d2: 5 }), true);
    assert.strictEqual(validateSelectDicePayload({ useTwo: false, d1: 3, d2: 0, tunaDice: [2, 3] }), true);
    assert.strictEqual(validateSelectDicePayload({ useTwo: true, d1: 4, d2: 5 }), true);
    assert.strictEqual(validateSelectDicePayload({ useTwo: 'yes', diceCount: 2, d1: 4, d2: 5 }), false);
    assert.strictEqual(validateSelectDicePayload({ useTwo: false, diceCount: 2, d1: 4, d2: 5 }), false);
    assert.strictEqual(validateSelectDicePayload({ useTwo: true, diceCount: 3, d1: 4, d2: 5 }), false);
    assert.strictEqual(validateSelectDicePayload({ useTwo: true, diceCount: 2, d1: 4, d2: 7 }), false);
    assert.strictEqual(validateSelectDicePayload({ useTwo: false, diceCount: 1, d1: 3, tunaDice: [2] }), false);
});

runTest('validateGameAction は旧クライアントの diceCount なし selectDice を許可する', () => {
    const runtime = loadGameRuntime();
    const room = makeRoom();
    const game = new runtime.GameManager(2);
    const shopStock = {};
    for (const card of runtime.CARDS) {
        shopStock[card.name] = room.gameStartPayload.enabledCards.includes(card.name)
            ? runtime.getInitialCardStock(card, 2)
            : 0;
    }
    game.currentPlayer().landmarks['駅'] = true;
    game.phase = runtime.GAME_PHASES.SELECT_DICE;
    room.stateSnapshot = serializeMirrorState(game, shopStock);
    const result = validateGameAction(room, { playerIndex: 0 }, 'selectDice', { useTwo: true, d1: 3, d2: 4, tunaDice: [1, 1] });
    assert.strictEqual(result.ok, true);
});

runTest('validateRerollDicePayload は不正な出目を拒否する', () => {
    assert.strictEqual(validateRerollDicePayload({ forceDice: 6, tunaDice: [1, 1] }), true);
    assert.strictEqual(validateRerollDicePayload({ forceDice: -1 }), false);
    assert.strictEqual(validateRerollDicePayload({ forceDice: 5, tunaDice: [0] }), false);
    assert.strictEqual(validateRerollDicePayload({ forceDice: 5, tunaDice: [1] }), false);
});

runTest('validateResolveHarborPayload は boolean のみ許可する', () => {
    assert.strictEqual(validateResolveHarborPayload({ useBonus: true }), true);
    assert.strictEqual(validateResolveHarborPayload({ useBonus: false }), true);
    assert.strictEqual(validateResolveHarborPayload({ useBonus: 'true' }), false);
});

runTest('validateResolveITPayload は boolean のみ許可する', () => {
    assert.strictEqual(validateResolveITPayload({ doSave: true }), true);
    assert.strictEqual(validateResolveITPayload({ doSave: false }), true);
    assert.strictEqual(validateResolveITPayload({ doSave: 'true' }), false);
    assert.strictEqual(validateResolveITPayload({}), false);
});

runTest('validateGameAction は pendingIT 中の resolveIT payload を検証する', () => {
    const { GameManager } = makeGame();
    const room = makeRoom();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingIT = true;
    room.stateSnapshot = serializeMirrorState(game, { 麦畑: 6 });

    const allow = validateGameAction(room, { playerIndex: 0 }, 'resolveIT', { doSave: false });
    assert.strictEqual(allow.ok, true);

    const denyMissing = validateGameAction(room, { playerIndex: 0 }, 'resolveIT', {});
    assert.strictEqual(denyMissing.ok, false);

    const denyString = validateGameAction(room, { playerIndex: 0 }, 'resolveIT', { doSave: 'false' });
    assert.strictEqual(denyString.ok, false);
});

runTest('validateGameAction は resolveTV の不正payloadを例外にせず拒否する', () => {
    const { GameManager } = makeGame();
    const room = makeRoom();
    const game = new GameManager(2);
    game.phase = 'pending';
    game.pendingTV = 1;
    room.stateSnapshot = serializeMirrorState(game, { 麦畑: 6 });

    const result = validateGameAction(room, { playerIndex: 0 }, 'resolveTV', null);
    assert.strictEqual(result.ok, false);
});

runTest('canSocketSubmitCurrentAction は playerOrder と CPUホスト代理を判定する', () => {
    const room = {
        hostPlayerIndex: 2,
        gameStartPayload: { playerOrder: [3, 2, 4, 0, 1] },
    };
    const humanTurnGame = { currentPlayerIndex: 1 };
    assert.strictEqual(originalPlayerIndexForGamePosition(room, 1), 2);
    assert.strictEqual(canSocketSubmitCurrentAction(room, { playerIndex: 2 }, humanTurnGame, []), true);
    assert.strictEqual(canSocketSubmitCurrentAction(room, { playerIndex: 1 }, humanTurnGame, []), false);

    const cpuTurnGame = { currentPlayerIndex: 0 };
    const cpuPlayers = [{ difficulty: 'normal' }];
    assert.strictEqual(canSocketSubmitCurrentAction(room, { playerIndex: 2 }, cpuTurnGame, cpuPlayers), true);
    assert.strictEqual(canSocketSubmitCurrentAction(room, { playerIndex: 3 }, cpuTurnGame, cpuPlayers), false);
});

runTest('validateGameAction はCPUターン中にホストのアクションを許可し非ホストを拒否する', () => {
    const room = makeRoom();
    // p0のターン（CPUに設定）
    room.playerSettings = [{ type: 'cpu', difficulty: 'normal' }, { type: 'human' }];
    room.gameStartPayload.playerSettings = room.playerSettings;
    room.hostPlayerIndex = 1; // p1がホスト

    // ホスト(p1)はp0のCPUターンを代理できる
    const allow = validateGameAction(room, { playerIndex: 1 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(allow.ok, true);

    // 非ホスト(p0自身)はCPUターンを操作できない
    const deny = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(deny.ok, false);
});

runTest('validateGameAction は5人CPUターンをplayerOrder越しにホストだけ許可する', () => {
    const room = {
        hostPlayerIndex: 2,
        started: true,
        playerSettings: [
            { type: 'cpu', difficulty: 'normal' },
            { type: 'cpu', difficulty: 'strong' },
            { type: 'human', difficulty: 'normal' },
            { type: 'cpu', difficulty: 'expert' },
            { type: 'human', difficulty: 'normal' },
        ],
        gameStartPayload: {
            playerNames: ['CPU1（普）', 'CPU2（強）', 'Host', 'CPU3（最強）', 'Guest'],
            playerSettings: [
                { type: 'cpu', difficulty: 'normal' },
                { type: 'cpu', difficulty: 'strong' },
                { type: 'human', difficulty: 'normal' },
                { type: 'cpu', difficulty: 'expert' },
                { type: 'human', difficulty: 'normal' },
            ],
            cpuSpeed: 1500,
            playerOrder: [3, 2, 4, 0, 1],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
        },
        actionLog: [],
        lastUndoState: null,
    };

    const allowHost = validateGameAction(room, { playerIndex: 2 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(allowHost.ok, true);

    const denyGuest = validateGameAction(room, { playerIndex: 4 }, 'rollDice', { forceDice: 3, tunaDice: [1, 1] });
    assert.strictEqual(denyGuest.ok, false);
});

runTest('createRoomMirror はCPUターン復元ログをホスト名義だけ許可する', () => {
    const room = makeRoom();
    room.hostPlayerIndex = 1;
    room.playerSettings = [{ type: 'cpu', difficulty: 'normal' }, { type: 'human' }];
    room.gameStartPayload.playerSettings = room.playerSettings;
    room.gameStartPayload.hostPlayerIndex = 1;
    room.gameStartPayload.playerNames = ['CPU1（普）', 'Host'];
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 3, tunaDice: [1, 1] }, playerIndex: 1 },
    ];

    assert.ok(createRoomMirror(room));

    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 3, tunaDice: [1, 1] }, playerIndex: 0 },
    ];

    assert.strictEqual(createRoomMirror(room), null);
});

runTest('resolveRejoinPlayer は復元済みルームでも正しいトークン一致時のみ既存プレイヤーを再利用する', () => {
    const room = {
        restored: true,
        players: [{ id: null, index: 0, name: 'Alice', reconnectTokenHash: 'token-hash' }],
        gameStartPayload: { playerNames: ['Alice', 'Bob'], reconnectTokenHashes: ['token-hash', 'other-hash'] },
    };

    const originalCreateHash = require('crypto').createHash;
    require('crypto').createHash = () => ({ update: () => ({ digest: () => 'token-hash' }) });
    try {
        const player = resolveRejoinPlayer(room, 0, 'Alice', 'valid-token', 'socket-1');
        assert.ok(player);
        assert.strictEqual(room.players.length, 1);
        assert.strictEqual(room.players[0].id, 'socket-1');
    } finally {
        require('crypto').createHash = originalCreateHash;
    }
});

runTest('resolveRejoinPlayer は復元済みルームでトークン不一致なら未登録プレイヤーを追加しない', () => {
    const room = {
        restored: true,
        players: [{ id: null, index: 0, name: 'Alice', reconnectTokenHash: 'token-hash' }],
        gameStartPayload: { playerNames: ['Alice', 'Bob'], reconnectTokenHashes: ['token-hash', 'bob-hash'] },
    };

    const player = resolveRejoinPlayer(room, 1, 'Bob', 'invalid-token', 'socket-2');
    assert.strictEqual(player, null);
    assert.strictEqual(room.players.length, 1);
});
runTest('handleRecreateRoom は署名secret未設定なら無署名full actionLogで復元できる', () => {
    const crypto = require('crypto');
    const previousRestoreSecret = process.env.RESTORE_AUDIT_SECRET;
    const previousMachikoroRestoreSecret = process.env.MACHIKORO_RESTORE_AUDIT_SECRET;
    const emitted = [];
    const joined = [];
    const reconnectToken = 'token-host';
    const socket = {
        id: 'socket-host-unsigned',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const payload = {
        roomId: 'REST_UNSIGNED_LOG',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
            actionSeq: 1,
        },
        stateSnapshot: null,
        actionLog: [{ action: 'rollDice', data: { forceDice: 1 }, playerIndex: 0, seq: 1 }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };

    try {
        delete process.env.RESTORE_AUDIT_SECRET;
        delete process.env.MACHIKORO_RESTORE_AUDIT_SECRET;

        handleRecreateRoom(socket, payload);

        assert.deepStrictEqual(joined, ['REST_UNSIGNED_LOG']);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.strictEqual(__rooms.REST_UNSIGNED_LOG.actionSeq, 1);
        assert.strictEqual(__rooms.REST_UNSIGNED_LOG.stateSnapshot.actionSeq, 1);
        assert.strictEqual(__rooms.REST_UNSIGNED_LOG.stateSnapshot.lastDiceResult, 1);
    } finally {
        if (typeof previousRestoreSecret === 'undefined') delete process.env.RESTORE_AUDIT_SECRET;
        else process.env.RESTORE_AUDIT_SECRET = previousRestoreSecret;
        if (typeof previousMachikoroRestoreSecret === 'undefined') delete process.env.MACHIKORO_RESTORE_AUDIT_SECRET;
        else process.env.MACHIKORO_RESTORE_AUDIT_SECRET = previousMachikoroRestoreSecret;
        delete __rooms.REST_UNSIGNED_LOG;
    }
});

runTest('handleRecreateRoom は正しい reconnectToken を要求し不正なら appError を返す', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST01',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: { players: [], currentPlayerIndex: 1, shopStock: {} },
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0 }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'forged-token',
    };
    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));
        assert.deepStrictEqual(joined, []);
        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: 'INVALID_TOKEN' }]);
        assert.strictEqual(__rooms.REST01, undefined);
    } finally {
        delete __rooms.REST01;
    }
});

runTest('handleRecreateRoom は playerNames 欠損payloadを例外にせず拒否する', () => {
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    try {
        handleRecreateRoom(socket, {
            roomId: 'REST_BAD_NAMES',
            gameStartPayload: {
                playerSettings: [{ type: 'human' }],
                reconnectTokenHashes: ['hash'],
            },
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken: 'token-host',
        });

        assert.deepStrictEqual(joined, []);
        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: '復元データが不完全です' }]);
        assert.strictEqual(__rooms.REST_BAD_NAMES, undefined);
    } finally {
        delete __rooms.REST_BAD_NAMES;
    }
});

runTest('handleRecreateRoom は payload 欠損を例外にせず拒否する', () => {
    const invalidPayloads = [null, undefined, [], 'x'];
    for (const payload of invalidPayloads) {
        const emitted = [];
        const socket = {
            id: 'socket-host',
            emit(name, body) { emitted.push({ name, body }); },
            join() { throw new Error('join should not be called'); },
        };

        handleRecreateRoom(socket, signedRestorePayload(payload));

        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, body: '復元データが不完全です' }]);
    }
});

runTest('validateRestorePayloadLimits は復元payloadの件数とサイズ上限を検証する', () => {
    assert.strictEqual(validateRestorePayloadLimits({ roomId: 'A', actionLog: [] }).ok, true);
    assert.strictEqual(validateRestorePayloadLimits({
        roomId: 'A',
        actionLog: Array.from({ length: RESTORE_PAYLOAD_LIMITS.maxActionLogEntries + 1 }, () => ({ action: 'nextTurn' })),
    }).reason, 'action-log-length');
    assert.strictEqual(validateRestorePayloadLimits({ roomId: 'A', memo: 'x'.repeat(RESTORE_PAYLOAD_LIMITS.maxStringLength + 1) }).reason, 'content-size');
    assert.strictEqual(validateRestorePayloadLimits({
        roomId: 'A',
        stateSnapshot: {
            players: [{ cards: Array.from({ length: RESTORE_PAYLOAD_LIMITS.maxPlayerCardRefs + 1 }, () => '麦畑') }],
        },
    }).reason, 'content-size');
});

runTest('restore audit schema はoptional署名メタデータを検証し未署名auditを許容する', () => {
    const unsigned = buildUnsignedRestoreAuditRecord(' room01 ', { now: 1700000000000, source: 'test' });
    assert.strictEqual(unsigned.roomId, 'ROOM01');
    assert.strictEqual(unsigned.signed, false);
    assert.strictEqual(validateRestoreAuditRecord(null, { roomId: 'ROOM01' }).ok, true);

    const validation = validateRestoreAuditRecord(unsigned, { roomId: 'ROOM01' });
    assert.strictEqual(validation.ok, true);
    assert.strictEqual(validation.record.roomId, 'ROOM01');
    assert.strictEqual(validation.record.algorithm, 'unsigned');

    assert.strictEqual(validateRestoreAuditRecord(Object.assign({}, unsigned, { roomId: 'ROOM02' }), { roomId: 'ROOM01' }).reason, 'room-mismatch');
    assert.strictEqual(validateRestoreAuditRecord(Object.assign({}, unsigned, { signed: true }), { roomId: 'ROOM01' }).reason, 'signed-unsigned');
    assert.strictEqual(validateRestoreAuditRecord(Object.assign({}, unsigned, { canonicalHash: 'bad-hash' }), { roomId: 'ROOM01' }).reason, 'canonical-hash');
});

runTest('handleRecreateRoom は不正な restore audit metadata を拒否する', () => {
    const emitted = [];
    const socket = {
        id: 'socket-host',
        emit(name, body) { emitted.push({ name, body }); },
        join() { throw new Error('join should not be called'); },
    };

    handleRecreateRoom(socket, {
        roomId: 'REST_AUDIT',
        gameStartPayload: { playerNames: ['Alice', 'Bob'] },
        actionLog: [],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken: 'token-host',
        restoreAudit: { schemaVersion: 1, roomId: 'OTHER', signed: false, algorithm: 'unsigned' },
    });

    assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, body: '復元署名メタデータが無効です' }]);
});

runTest('handleRecreateRoom は未署名 client snapshot を拒否する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join() { throw new Error('join should not be called'); },
    };
    const reconnectToken = 'token-host';
    handleRecreateRoom(socket, {
        roomId: 'REST_UNSIGNED_SNAPSHOT',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ actionSeq: 0 }),
        actionLog: [],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    });

    assert.strictEqual(__rooms.REST_UNSIGNED_SNAPSHOT, undefined);
    assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: '復元データが壊れています' }]);
});

runTest('restore action log はsnapshot境界後の未知actionをbatch全体で拒否する', () => {
    const snapshot = { actionSeq: 2 };
    assert.deepStrictEqual(sanitizeRestoreActionLog([
        { action: 'unknownAction', seq: 2 },
        { action: 'nextTurn', data: {}, seq: 3 },
    ], 'ROOM1', snapshot), [
        { action: 'nextTurn', data: {}, seq: 3 },
    ]);
    assert.strictEqual(sanitizeRestoreActionLog([
        { action: 'nextTurn', data: {}, seq: 3 },
        { action: 'unknownAction', seq: 4 },
    ], 'ROOM1', snapshot), null);
    assert.strictEqual(sanitizeRestoreActionLog([
        { action: 'unknownAction', seq: 3 },
    ], 'ROOM1', snapshot), null);
});

runTest('sanitizeRestoreActionLog helpers は snapshot seq と room gate を共有する', () => {
    assert.strictEqual(restoreSnapshotActionSeq({ actionSeq: 3 }), 3);
    assert.strictEqual(restoreSnapshotActionSeq({ actionSeq: -1 }), 0);
    assert.strictEqual(restoreSnapshotActionSeq(null), 0);

    const auditedEntry = { action: 'nextTurn', data: {}, seq: 4, playerIndex: 0, clientActionId: 'client-1' };
    auditedEntry.restoreActionAudit = buildRestoreActionAudit('ROOM1', auditedEntry, 1234567890);
    assert.deepStrictEqual(
        sanitizeRestoreActionLogEntry(auditedEntry, 'ROOM1', 3),
        { entry: { action: 'nextTurn', data: {}, playerIndex: 0, seq: 4, clientActionId: 'client-1', restoreActionAudit: auditedEntry.restoreActionAudit } }
    );
    assert.strictEqual(isVerifiedRestoreActionAudit('ROOM1', sanitizeRestoreActionLogEntry(auditedEntry, 'ROOM1', 3).entry), true);
    assert.deepStrictEqual(sanitizeRestoreActionLogEntry({ action: 'nextTurn', seq: 3 }, 'ROOM1', 3), { skip: true });
    assert.deepStrictEqual(sanitizeRestoreActionLogEntry({ action: 'nextTurn' }, 'ROOM1', 3), { skip: true });
    assert.deepStrictEqual(sanitizeRestoreActionLogEntry({ action: 'nextTurn', roomId: 'OTHER', seq: 4 }, 'ROOM1', 3), { invalid: true });
    assert.deepStrictEqual(sanitizeRestoreActionLogEntry({ action: 'unknownAction', seq: 4 }, 'ROOM1', 3), { invalid: true });
    assert.deepStrictEqual(sanitizeRestoreActionLogEntry({ action: 'unknownAction', seq: 3 }, 'ROOM1', 3), { skip: true });

    const sanitized = sanitizeRestoreActionLog([
        { action: 'nextTurn', data: {}, seq: 2, playerIndex: 0 },
        { action: 'buildCard', data: { cardName: '麦畑' }, seq: 4, playerIndex: 0, clientActionId: 'bad space' },
        { action: 'nextTurn', data: {}, seq: 5, playerIndex: 0, clientActionId: 'ok-5' },
    ], 'ROOM1', { actionSeq: 3 });
    assert.deepStrictEqual(sanitized, [
        { action: 'buildCard', data: { cardName: '麦畑' }, playerIndex: 0, seq: 4 },
        { action: 'nextTurn', data: {}, playerIndex: 0, seq: 5, clientActionId: 'ok-5' },
    ]);
    assert.strictEqual(sanitizeRestoreActionLog([{ action: 'nextTurn', roomId: 'OTHER', seq: 4 }], 'ROOM1', { actionSeq: 3 }), null);
    assert.strictEqual(sanitizeRestoreActionLog([
        { action: 'buildCard', data: { cardName: '麦畑' }, seq: 5, playerIndex: 0 },
        { action: 'nextTurn', data: {}, seq: 4, playerIndex: 0 },
    ], 'ROOM1', { actionSeq: 3 }), null);
    assert.strictEqual(sanitizeRestoreActionLog([
        { action: 'nextTurn', data: {}, seq: 4, playerIndex: 0 },
        { action: 'nextTurn', data: {}, seq: 6, playerIndex: 0 },
    ], 'ROOM1', { actionSeq: 3 }), null);
});

runTest('attachCompactedRestoreSnapshotToAction は compact 済みsnapshotを署名付きでactionへ添付する', () => {
    const room = makeRoom();
    room.gameStartPayload.playerNames = ['A', 'B'];
    room.stateSnapshot = makeSnapshot({ actionSeq: 201 });
    room.actionLog = [];
    const actionEntry = { action: 'nextTurn', data: {}, playerIndex: 0, seq: 201 };

    const attached = attachCompactedRestoreSnapshotToAction('ROOM1', room, actionEntry, 201);

    assert.ok(attached);
    assert.strictEqual(actionEntry.stateSnapshot, room.stateSnapshot);
    assert.ok(actionEntry.restoreAudit && actionEntry.restoreAudit.signed);
    assert.strictEqual(actionEntry.restoreAudit.roomId, 'ROOM1');
    assert.strictEqual(attachCompactedRestoreSnapshotToAction('ROOM1', room, {}, 200), null);
});

runTest('restore action audit は live undoBuild payload と復元canonical dataを同じ署名対象にする', () => {
    const liveEntry = {
        action: 'undoBuild',
        data: { state: makeSnapshot({ actionSeq: 3 }) },
        seq: 4,
        playerIndex: 0,
        clientActionId: 'undo-live-1',
    };
    liveEntry.restoreActionAudit = buildRestoreActionAudit('ROOM1', liveEntry, 1234567890);

    const sanitized = sanitizeRestoreActionLog([liveEntry], 'ROOM1', { actionSeq: 3 }, { requireSignedActionAudit: true });

    assert.deepStrictEqual(sanitized, [{
        action: 'undoBuild',
        data: {},
        playerIndex: 0,
        seq: 4,
        clientActionId: 'undo-live-1',
        restoreActionAudit: liveEntry.restoreActionAudit,
    }]);
});

runTest('restore action audit は actionLog 改ざんを検出する', () => {
    const entry = { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, seq: 1, playerIndex: 0 };
    const signed = Object.assign({}, entry, { restoreActionAudit: buildRestoreActionAudit('ROOM1', entry, 1234567890) });
    assert.strictEqual(isVerifiedRestoreActionAudit('ROOM1', signed), true);
    const tampered = Object.assign({}, signed, { data: { forceDice: 6, tunaDice: [6, 6] } });
    assert.strictEqual(isVerifiedRestoreActionAudit('ROOM1', tampered), false);
    assert.strictEqual(sanitizeRestoreActionLog([tampered], 'ROOM1', null, { requireSignedActionAudit: true }), null);
});

runTest('handleRecreateRoom は過大な復元payloadを早期拒否する', () => {
    const emitted = [];
    const socket = {
        id: 'socket-host',
        emit(name, body) { emitted.push({ name, body }); },
        join() { throw new Error('join should not be called'); },
    };

    handleRecreateRoom(socket, {
        roomId: 'REST_BIG',
        gameStartPayload: { playerNames: ['Alice', 'Bob'] },
        reconnectToken: 'token',
        actionLog: Array.from({ length: RESTORE_PAYLOAD_LIMITS.maxActionLogEntries + 1 }, () => ({ action: 'nextTurn' })),
    });

    assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, body: '復元データが大きすぎます' }]);
    assert.strictEqual(__rooms.REST_BIG, undefined);
});

runTest('handleRecreateRoom は復元payloadでも2〜10人制限を守る', () => {
    const crypto = require('crypto');
    const reconnectToken = 'token-host';
    const tokenHash = crypto.createHash('sha256').update(reconnectToken).digest('hex');

    for (const playerNames of [['Alice'], Array.from({ length: 11 }, (_, index) => `P${index + 1}`)]) {
        const roomId = `REST_COUNT_${playerNames.length}`;
        const emitted = [];
        const joined = [];
        const socket = {
            id: `socket-${playerNames.length}`,
            emit(name, payload) { emitted.push({ name, payload }); },
            join(roomId) { joined.push(roomId); },
        };
        const reconnectTokenHashes = playerNames.map((_, index) => index === 0 ? tokenHash : crypto.createHash('sha256').update(`token-${index}`).digest('hex'));

        try {
            handleRecreateRoom(socket, {
                roomId,
                gameStartPayload: {
                    playerNames,
                    playerSettings: playerNames.map(() => ({ type: 'human' })),
                    reconnectTokenHashes,
                    enabledCards: ['麦畑'],
                    enabledLandmarks: ['駅'],
                    cpuSpeed: 1500,
                    playerOrder: playerNames.map((_, index) => index),
                    hostPlayerIndex: 0,
                },
                stateSnapshot: null,
                actionLog: [],
                acceptedClientActions: [],
                playerIndex: 0,
                playerName: 'Alice',
                reconnectToken,
            });

            assert.deepStrictEqual(joined, []);
            assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: '復元データが不完全です' }]);
            assert.strictEqual(__rooms[roomId], undefined);
        } finally {
            delete __rooms[roomId];
        }
    }
});

runTest('handleRecreateRoom は replay 不能な actionLog を持つ復元を拒否する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST_BROKEN_LOG',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: null,
        actionLog: [{ action: 'rollDice', data: null, playerIndex: 0 }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));
        assert.deepStrictEqual(joined, []);
        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: '復元データが壊れています' }]);
        assert.strictEqual(__rooms.REST_BROKEN_LOG, undefined);
    } finally {
        delete __rooms.REST_BROKEN_LOG;
    }
});

runTest('handleRecreateRoom は既に復元済みのルームなら再作成せず再参加させる', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host-2',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const tokenHash = crypto.createHash('sha256').update(reconnectToken).digest('hex');
    const existingPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes: [tokenHash, crypto.createHash('sha256').update('token-b').digest('hex')],
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
    };
    const stateSnapshot = { players: [{ name: 'Alice' }], currentPlayerIndex: 0, shopStock: {} };
    const actionLog = [{ action: 'rollDice', data: { forceDice: 1 }, playerIndex: 0 }];
    __rooms.REST_EXISTS = {
        players: [{ id: null, index: 0, name: 'Alice', reconnectToken: '', reconnectTokenHash: tokenHash }],
        started: true,
        hostPlayerIndex: 0,
        gameStartPayload: existingPayload,
        stateSnapshot,
        actionLog,
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REST_EXISTS',
            gameStartPayload: existingPayload,
            stateSnapshot: null,
            actionLog: [],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken,
        });

        assert.deepStrictEqual(joined, ['REST_EXISTS']);
        assert.strictEqual(__rooms.REST_EXISTS.players[0].id, 'socket-host-2');
        delete emitted[0].payload.restoreAudit;
        assert.deepStrictEqual(emitted, [{
            name: 'rejoinData',
            payload: {
                gameStartPayload: existingPayload,
                stateSnapshot,
                actionLog,
                acceptedClientActions: [],
                playerIndex: 0,
                hostPlayerIndex: 0,
                hostEpoch: 0,
            },
        }]);
    } finally {
        delete __rooms.REST_EXISTS;
    }
});

runTest('handleRecreateRoom は復元データを canonical snapshot に畳み込んで返す', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const stateSnapshot = makeSnapshot({
        players: [
            { name: 'Alice', coins: 3, cards: [], dormantIndices: [], landmarks: { 駅: false, ショッピングモール: false }, itVentureCoins: 0, hasYakusho: true },
            { name: 'Bob', coins: 3, cards: [], dormantIndices: [], landmarks: { 駅: false, ショッピングモール: false }, itVentureCoins: 0, hasYakusho: true },
        ],
        currentPlayerIndex: 0,
        phase: 'build',
        shopStock: { '麦畑': 5 },
    });
    const actionLog = [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 }];
    const payload = {
        roomId: 'REST02',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot,
        actionLog,
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };
    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));
        assert.deepStrictEqual(joined, ['REST02']);
        assert.notStrictEqual(__rooms.REST02.stateSnapshot, stateSnapshot);
        assert.strictEqual(__rooms.REST02.stateSnapshot.currentPlayerIndex, 1);
        assert.deepStrictEqual(__rooms.REST02.actionLog, []);
        delete emitted[0].payload.restoreAudit;
        assert.deepStrictEqual(emitted, [{
            name: 'rejoinData',
            payload: {
                gameStartPayload: payload.gameStartPayload,
                stateSnapshot: __rooms.REST02.stateSnapshot,
                actionLog: [],
                acceptedClientActions: [],
                playerIndex: 0,
                hostPlayerIndex: 0,
                hostEpoch: 0,
            },
        }]);
    } finally {
        delete __rooms.REST02;
    }
});

runTest('handleRecreateRoom はsnapshotもactionLogもない復元を拒否する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST_EMPTY_REWIND',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: null,
        actionLog: [],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));
        assert.deepStrictEqual(joined, []);
        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: '復元データが壊れています' }]);
        assert.strictEqual(__rooms.REST_EMPTY_REWIND, undefined);
    } finally {
        delete __rooms.REST_EMPTY_REWIND;
    }
});

runTest('handleRecreateRoom は playerIndex なし actionLog の復元を拒否する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST_LEGACY_LOG',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({
            currentPlayerIndex: 0,
            phase: 'build',
            shopStock: { '麦畑': 6 },
        }),
        actionLog: [{ action: 'nextTurn', data: {} }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));
        assert.deepStrictEqual(joined, []);
        assert.deepStrictEqual(emitted, [{ name: APP_ERROR_EVENT, payload: '復元データが壊れています' }]);
        assert.strictEqual(__rooms.REST_LEGACY_LOG, undefined);
    } finally {
        delete __rooms.REST_LEGACY_LOG;
    }
});

runTest('buildRestoredHumanPlayers はCPU席を除外し再接続者だけsocket idを持たせる', () => {
    const payload = {
        playerNames: ['Alice', 'CPU1', 'Bob', 'CPU2'],
        playerSettings: [
            { type: 'human' },
            { type: 'cpu', difficulty: 'normal' },
            { type: 'human' },
            { type: 'cpu', difficulty: 'rl' },
        ],
        reconnectTokenHashes: ['hash-a', '', 'hash-b', ''],
    };

    assert.deepStrictEqual(buildRestoredHumanPlayers(payload, 2, 'socket-bob'), [
        { id: null, index: 0, name: 'Alice', reconnectToken: '', reconnectTokenHash: 'hash-a' },
        { id: 'socket-bob', index: 2, name: 'Bob', reconnectToken: '', reconnectTokenHash: 'hash-b' },
    ]);
});

runTest('handleRecreateRoom は playerSettings 空配列の全員人間ルームを復元できる', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST_EMPTY_SETTINGS',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({
            currentPlayerIndex: 0,
            phase: 'build',
            shopStock: { '麦畑': 6 },
        }),
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));
        assert.deepStrictEqual(joined, ['REST_EMPTY_SETTINGS']);
        assert.strictEqual(__rooms.REST_EMPTY_SETTINGS.stateSnapshot.currentPlayerIndex, 1);
        assert.strictEqual(emitted[0].name, 'rejoinData');
    } finally {
        delete __rooms.REST_EMPTY_SETTINGS;
    }
});

runTest('handleRecreateRoom は client snapshot の valid undoState から undoBuild を復元する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const room = makeRoom();
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex: 0 },
        { action: 'buildCard', data: { cardName: 'カフェ' }, playerIndex: 0 },
    ];
    const builtMirror = createRoomMirror(room);
    const stateSnapshot = serializeMirrorState(builtMirror.game, builtMirror.shopStock, builtMirror.lastUndoState);
    const gameStartPayload = Object.assign({}, room.gameStartPayload, {
        reconnectTokenHashes: [
            crypto.createHash('sha256').update(reconnectToken).digest('hex'),
            crypto.createHash('sha256').update('token-b').digest('hex'),
        ],
    });

    try {
        handleRecreateRoom(socket, signedRestorePayload({
            roomId: 'REST_UNDO',
            gameStartPayload,
            stateSnapshot,
            actionLog: [{ action: 'undoBuild', data: {}, playerIndex: 0, seq: (stateSnapshot.actionSeq || 0) + 1 }],
            playerIndex: 0,
            playerName: 'A',
            reconnectToken,
        }));

        assert.deepStrictEqual(joined, ['REST_UNDO']);
        assert.strictEqual(__rooms.REST_UNDO.stateSnapshot.players[0].coins, builtMirror.lastUndoState.playerCoins[0]);
        assert.strictEqual(__rooms.REST_UNDO.stateSnapshot.players[0].cards.filter(name => name === 'カフェ').length, 0);
        assert.strictEqual(__rooms.REST_UNDO.stateSnapshot.shopStock['カフェ'], builtMirror.lastUndoState.shopStock['カフェ']);
        assert.deepStrictEqual(__rooms.REST_UNDO.actionLog, []);
        assert.strictEqual(emitted[0].name, 'rejoinData');
    } finally {
        delete __rooms.REST_UNDO;
    }
});

runTest('handleRecreateRoom は旧ホスト不在なら再接続者をホストに再選出する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const reconnectToken = 'token-bob';
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes: [
            crypto.createHash('sha256').update('token-alice').digest('hex'),
            crypto.createHash('sha256').update(reconnectToken).digest('hex'),
        ],
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
    };
    __rooms.REHOST01 = {
        started: true,
        hostPlayerIndex: 0,
        players: [
            { id: null, index: 0, name: 'Alice', reconnectTokenHash: gameStartPayload.reconnectTokenHashes[0] },
            { id: null, index: 1, name: 'Bob', reconnectTokenHash: gameStartPayload.reconnectTokenHashes[1] },
        ],
        gameStartPayload,
        stateSnapshot: makeSnapshot(),
        actionLog: [],
    };
    const socket = {
        id: 'socket-alice-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REHOST01',
            gameStartPayload,
            stateSnapshot: null,
            actionLog: [],
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken,
        });

        assert.deepStrictEqual(joined, ['REHOST01']);
        assert.strictEqual(__rooms.REHOST01.hostPlayerIndex, 1);
        assert.strictEqual(__rooms.REHOST01.gameStartPayload.hostPlayerIndex, 1);
        assert.strictEqual(emitted[0].payload.gameStartPayload.hostPlayerIndex, 1);
        assert.strictEqual(emitted[0].payload.hostPlayerIndex, 1);
    } finally {
        delete __rooms.REHOST01;
    }
});

runTest('handleRecreateRoom は空roomのhostless復元を拒否する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 2,
        actionSeq: 4,
    };
    const socket = {
        id: 'socket-bob-hostless',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload({
            roomId: 'HOSTLESS01',
            gameStartPayload,
            stateSnapshot: makeSnapshot({ actionSeq: 4 }),
            actionLog: [],
            restoreMode: 'hostless',
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        }));

        assert.deepStrictEqual(joined, []);
        assert.strictEqual(__rooms.HOSTLESS01, undefined);
        assert.strictEqual(emitted[0].name, 'appError');
        assert.strictEqual(emitted[0].payload, '復元は元のホストのみ実行できます');
    } finally {
        delete __rooms.HOSTLESS01;
    }
});

runTest('handleRecreateRoom は内部承認済みhostless候補だけを暫定roomへ復元する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes: [
            crypto.createHash('sha256').update(tokenAlice).digest('hex'),
            crypto.createHash('sha256').update(tokenBob).digest('hex'),
        ],
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 2,
        actionSeq: 4,
        hostlessRestoreGeneration: 1,
        hostlessRestoreCount: 1,
    };
    const socket = {
        id: 'socket-bob-approved',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        const result = handleRecreateRoom(socket, {
            roomId: 'HOSTLESS_APPROVED',
            gameStartPayload,
            stateSnapshot: makeSnapshot({ actionSeq: 4 }),
            actionLog: [],
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        }, {
            approvedHostless: true,
            candidateCount: 2,
        });

        assert.deepStrictEqual(result, {
            ok: true,
            roomId: 'HOSTLESS_APPROVED',
            provisionalRestore: true,
        });
        assert.deepStrictEqual(joined, ['HOSTLESS_APPROVED']);
        const room = __rooms.HOSTLESS_APPROVED;
        assert.strictEqual(room.hostPlayerIndex, 1);
        assert.strictEqual(room.hostEpoch, 3);
        assert.strictEqual(room.hostlessRestoreGeneration, 2);
        assert.strictEqual(room.hostlessRestoreCount, 2);
        assert.strictEqual(room.hostlessRestoreCandidateCount, 2);
        assert.strictEqual(room.provisionalRestore, true);
        assert.strictEqual(room.gameStartPayload.hostPlayerIndex, 1);
        assert.strictEqual(room.gameStartPayload.hostEpoch, 3);
        assert.strictEqual(room.gameStartPayload.hostlessRestoreGeneration, 2);
        assert.strictEqual(room.gameStartPayload.hostlessRestoreCount, 2);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.strictEqual(emitted[0].payload.provisionalRestore, true);
        assert.strictEqual(emitted[0].payload.hostlessRestoreGeneration, 2);
        assert.strictEqual(emitted[0].payload.hostlessRestoreCount, 2);
        assert.match(hostlessRestoreRoomLogId('HOSTLESS_APPROVED'), /^[a-f0-9]{12}$/);
        assert.notStrictEqual(hostlessRestoreRoomLogId('HOSTLESS_APPROVED'), 'HOSTLESS_APPROVED');
        assert.strictEqual(hostlessRestoreRoomLogId('HOSTLESS_APPROVED'), hostlessRestoreRoomLogId('HOSTLESS_APPROVED'));
    } finally {
        delete __rooms.HOSTLESS_APPROVED;
    }
});

runTest('hostless診断はroom hashと集計値だけを返しraw候補を除外する', () => {
    const diagnostic = hostlessRestoreDiagnostic({
        type: 'terminal',
        roomId: 'HOSTLESS_PRIVATE_ROOM',
        generation: 2,
        stage: 'collecting',
        candidateCount: 3,
        rank: { hostEpoch: 4, actionSeq: 18, secret: 'rank-secret' },
        reason: 'candidate-mismatch',
        canonicalHash: 'canonical-secret',
        payload: { stateSnapshot: { private: true } },
        reconnectToken: 'token-secret',
    });
    assert.deepStrictEqual(Object.keys(diagnostic), [
        'event', 'roomHash', 'generation', 'stage', 'candidateCount', 'rank', 'reason',
    ]);
    assert.match(diagnostic.roomHash, /^[a-f0-9]{12}$/);
    assert.deepStrictEqual(diagnostic.rank, { hostEpoch: 4, actionSeq: 18 });
    assert.strictEqual(JSON.stringify(diagnostic).includes('PRIVATE_ROOM'), false);
    assert.strictEqual(JSON.stringify(diagnostic).includes('secret'), false);
});

runTest('handleRecreateRoom はhostless payloadで復元済みroomを置き換えない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const oldPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 3,
    };
    const newPayload = Object.assign({}, oldPayload, { actionSeq: 8 });
    __rooms.HOSTLESS_REPLACE = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 3,
        players: [
            { id: 'socket-alice-stale', index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
            { id: null, index: 1, name: 'Bob', reconnectTokenHash: reconnectTokenHashes[1] },
        ],
        playerSettings: oldPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: oldPayload,
        stateSnapshot: makeSnapshot({ actionSeq: 3 }),
        actionLog: [],
    };
    const socket = {
        id: 'socket-bob-newer',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload({
            roomId: 'HOSTLESS_REPLACE',
            gameStartPayload: newPayload,
            stateSnapshot: makeSnapshot({ actionSeq: 8 }),
            actionLog: [],
            restoreMode: 'hostless',
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        }));

        assert.deepStrictEqual(joined, ['HOSTLESS_REPLACE']);
        assert.strictEqual(__rooms.HOSTLESS_REPLACE.hostPlayerIndex, 1);
        assert.strictEqual(__rooms.HOSTLESS_REPLACE.hostEpoch, 1);
        assert.strictEqual(__rooms.HOSTLESS_REPLACE.actionSeq, 3);
        assert.strictEqual(__rooms.HOSTLESS_REPLACE.stateSnapshot.actionSeq, 3);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.strictEqual(emitted[0].payload.hostPlayerIndex, 1);
        assert.strictEqual(emitted[0].payload.gameStartPayload.actionSeq, 3);
    } finally {
        delete __rooms.HOSTLESS_REPLACE;
    }
});

runTest('handleRecreateRoom はより新しい hostEpoch の復元payloadで古い復元済みroomを置き換える', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const oldPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
    };
    const newPayload = Object.assign({}, oldPayload, {
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 1,
    });
    __rooms.REPLACE01 = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        players: [
            { id: 'socket-alice-old', index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
        ],
        playerSettings: oldPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: oldPayload,
        stateSnapshot: makeSnapshot(),
        actionLog: [],
    };
    const socket = {
        id: 'socket-bob-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload({
            roomId: 'REPLACE01',
            gameStartPayload: newPayload,
            stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build' }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1 }],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken: tokenAlice,
        }));

        assert.deepStrictEqual(joined, ['REPLACE01']);
        assert.strictEqual(__rooms.REPLACE01.roomId, 'REPLACE01');
        assert.strictEqual(__rooms.REPLACE01.hostPlayerIndex, 0);
        assert.strictEqual(__rooms.REPLACE01.hostEpoch, 1);
        assert.strictEqual(__rooms.REPLACE01.actionSeq, 1);
        assert.strictEqual(emitted[0].payload.hostPlayerIndex, 0);
        assert.strictEqual(emitted[0].payload.hostEpoch, 1);
        assert.strictEqual(emitted[0].payload.gameStartPayload.hostPlayerIndex, 0);
    } finally {
        delete __rooms.REPLACE01;
    }
});

runTest('handleRecreateRoom は signed-looking restore audit metadata で復元rankを上げない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const existingPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 5,
    };
    const incomingPayload = Object.assign({}, existingPayload, {
        hostEpoch: 1,
        actionSeq: 1,
    });
    __rooms.REST_SIGN = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 5,
        players: [
            { id: 'socket-alice-old', index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
        ],
        playerSettings: existingPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: existingPayload,
        stateSnapshot: makeSnapshot({ actionSeq: 5 }),
        actionLog: [],
    };
    const socket = {
        id: 'socket-alice-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REST_SIGN',
            gameStartPayload: incomingPayload,
            stateSnapshot: makeSnapshot({ actionSeq: 1 }),
            actionLog: [],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken: tokenAlice,
            restoreAudit: {
                schemaVersion: 1,
                roomId: 'REST_SIGN',
                signed: true,
                algorithm: 'hmac-sha256',
                keyId: 'test-key',
                signature: 'syntactic-signature-only',
                canonicalHash: 'aaaaaaaaaaaaaaaa',
                payloadHash: 'bbbbbbbbbbbbbbbb',
                createdAt: 999999999999,
            },
        });

        assert.deepStrictEqual(joined, ['REST_SIGN']);
        assert.strictEqual(__rooms.REST_SIGN.actionSeq, 5);
        assert.strictEqual(__rooms.REST_SIGN.hostEpoch, 1);
        assert.strictEqual(emitted.some(event => event.name === 'rejoinData'), true);
    } finally {
        delete __rooms.REST_SIGN;
    }
});

runTest('handleRecreateRoom は切断中ホストがいても非ホストpayloadで復元置換しない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const payload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
    };
    __rooms.REPLACE_NON_HOST = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        players: [
            { id: null, index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
            { id: null, index: 1, name: 'Bob', reconnectTokenHash: reconnectTokenHashes[1] },
        ],
        playerSettings: payload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: payload,
        stateSnapshot: makeSnapshot(),
        actionLog: [],
    };
    const socket = {
        id: 'socket-bob-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REPLACE_NON_HOST',
            gameStartPayload: Object.assign({}, payload, { hostPlayerIndex: 1, hostEpoch: 2, actionSeq: 10 }),
            stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build', actionSeq: 10 }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 10 }],
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        });

        assert.deepStrictEqual(joined, ['REPLACE_NON_HOST']);
        assert.strictEqual(__rooms.REPLACE_NON_HOST.hostPlayerIndex, 1);
        assert.strictEqual(__rooms.REPLACE_NON_HOST.hostEpoch, 1);
        assert.notStrictEqual(__rooms.REPLACE_NON_HOST.actionSeq, 10);
        assert.notStrictEqual(__rooms.REPLACE_NON_HOST.stateSnapshot.actionSeq, 10);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.strictEqual(emitted[0].payload.gameStartPayload, payload);
    } finally {
        delete __rooms.REPLACE_NON_HOST;
    }
});

runTest('handleRecreateRoom は接続中ホストがいる復元済みroomを非ホストpayloadで置き換えない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const oldPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
    };
    const forgedPayload = Object.assign({}, oldPayload, {
        hostPlayerIndex: 1,
        hostEpoch: 999,
        actionSeq: 999,
    });
    __rooms.REPLACE02 = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        players: [
            { id: 'socket-alice-connected', index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
        ],
        playerSettings: oldPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: oldPayload,
        stateSnapshot: makeSnapshot(),
        actionLog: [],
    };
    const socket = {
        id: 'socket-bob-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    __io.sockets.sockets.set('socket-alice-connected', { id: 'socket-alice-connected' });

    try {
        handleRecreateRoom(socket, {
            roomId: 'REPLACE02',
            gameStartPayload: forgedPayload,
            stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build' }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 999 }],
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        });

        assert.deepStrictEqual(joined, ['REPLACE02']);
        assert.strictEqual(__rooms.REPLACE02.hostPlayerIndex, 0);
        assert.strictEqual(__rooms.REPLACE02.hostEpoch, 0);
        assert.strictEqual(__rooms.REPLACE02.actionSeq, 0);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.strictEqual(emitted[0].payload.hostPlayerIndex, 0);
        assert.strictEqual(emitted[0].payload.gameStartPayload.hostPlayerIndex, 0);
    } finally {
        __io.sockets.sockets.delete('socket-alice-connected');
        delete __rooms.REPLACE02;
    }
});

runTest('handleRecreateRoom は既存roomのtokenで復元置換を認証する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const realTokenAlice = 'token-alice-real';
    const forgedTokenAlice = 'token-alice-forged';
    const realReconnectTokenHashes = [
        crypto.createHash('sha256').update(realTokenAlice).digest('hex'),
        crypto.createHash('sha256').update('token-bob').digest('hex'),
    ];
    const oldPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes: realReconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
    };
    const forgedPayload = Object.assign({}, oldPayload, {
        reconnectTokenHashes: [
            crypto.createHash('sha256').update(forgedTokenAlice).digest('hex'),
            realReconnectTokenHashes[1],
        ],
        hostEpoch: 99,
    });
    __rooms.REPLACE_TOKEN = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        players: [
            { id: 'socket-alice-old', index: 0, name: 'Alice', reconnectTokenHash: realReconnectTokenHashes[0] },
        ],
        playerSettings: oldPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: oldPayload,
        stateSnapshot: makeSnapshot(),
        actionLog: [],
    };
    const socket = {
        id: 'socket-alice-forged',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REPLACE_TOKEN',
            gameStartPayload: forgedPayload,
            stateSnapshot: makeSnapshot({ actionSeq: 2 }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 2 }],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken: forgedTokenAlice,
        });

        assert.deepStrictEqual(joined, []);
        assert.strictEqual(__rooms.REPLACE_TOKEN.hostEpoch, 0);
        assert.strictEqual(emitted[0].name, APP_ERROR_EVENT);
        assert.strictEqual(emitted[0].payload, 'INVALID_TOKEN');
    } finally {
        delete __rooms.REPLACE_TOKEN;
    }
});

runTest('handleRecreateRoom はsanitize後に進捗しないactionLogで既存roomを置き換えない', () => {
    const crypto = require('crypto');
    const reconnectToken = 'token-alice';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(reconnectToken).digest('hex'),
        crypto.createHash('sha256').update('token-bob').digest('hex'),
    ];
    const gameStartPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 5,
    };
    __rooms.REPLACE_SANITIZED_STALE = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 1,
        actionSeq: 5,
        players: [
            { id: null, index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
            { id: null, index: 1, name: 'Bob', reconnectTokenHash: reconnectTokenHashes[1] },
        ],
        playerSettings: gameStartPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload,
        stateSnapshot: makeSnapshot({ actionSeq: 5 }),
        actionLog: [],
    };
    const emitted = [];
    const socket = {
        id: 'socket-alice-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join() {},
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REPLACE_SANITIZED_STALE',
            gameStartPayload: Object.assign({}, gameStartPayload),
            stateSnapshot: makeSnapshot({ actionSeq: 5 }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 5 }],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken,
        });

        assert.strictEqual(__rooms.REPLACE_SANITIZED_STALE.players[0].id, 'socket-alice-new');
        assert.strictEqual(__rooms.REPLACE_SANITIZED_STALE.stateSnapshot.actionSeq, 5);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.deepStrictEqual(emitted[0].payload.actionLog, []);
    } finally {
        delete __rooms.REPLACE_SANITIZED_STALE;
    }
});

runTest('handleRecreateRoom は gameStartPayload.actionSeq だけ新しい復元payloadでは置き換えない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update('token-bob').digest('hex'),
    ];
    const oldPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 1,
    };
    const newPayload = Object.assign({}, oldPayload, { actionSeq: 5 });
    __rooms.REPLACE_SEQ = {
        started: true,
        restored: true,
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 1,
        players: [
            { id: 'socket-alice-old', index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
        ],
        playerSettings: oldPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: oldPayload,
        stateSnapshot: makeSnapshot({ actionSeq: 1 }),
        actionLog: [],
    };
    const socket = {
        id: 'socket-alice-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REPLACE_SEQ',
            gameStartPayload: newPayload,
            stateSnapshot: makeSnapshot({ actionSeq: 1 }),
            actionLog: [],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken: tokenAlice,
        });

        assert.deepStrictEqual(joined, ['REPLACE_SEQ']);
        assert.strictEqual(__rooms.REPLACE_SEQ.actionSeq, 1);
        assert.strictEqual(__rooms.REPLACE_SEQ.gameStartPayload.actionSeq, 1);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.strictEqual(emitted[0].payload.gameStartPayload.actionSeq, 1);
    } finally {
        delete __rooms.REPLACE_SEQ;
    }
});

runTest('restorePayloadRank は共通fixtureの最大 actionSeq を復元rankに使う', () => {
    const fixture = makeSeqRankUsesMaxFieldsFixture();

    assert.deepStrictEqual(
        restorePayloadRank(
            Object.assign({}, fixture.gameStartPayload),
            makeSnapshot(fixture.stateSnapshotOverrides),
            fixture.actionLog
        ),
        fixture.expectedRank
    );
});

runTest('restorePayloadRankDetails はrankの内訳とreplay済みaction数を返す', () => {
    const details = restorePayloadRankDetails(
        { hostEpoch: 2, actionSeq: 8 },
        { actionSeq: 10 },
        [{ action: 'nextTurn', seq: 999 }, { action: 'nextTurn', seq: 12 }]
    );

    assert.deepStrictEqual(details, {
        hostEpoch: 2,
        actionSeq: 12,
        gameStartSeq: 8,
        snapshotSeq: 10,
        logSeq: 12,
        replayedActionSeq: 12,
        replayedActionCount: 2,
        source: 'actionLog',
    });
});

runTest('restorePayloadRank は actionLog の巨大seqではなくreplay可能件数でrankする', () => {
    assert.deepStrictEqual(
        restorePayloadRank(
            { hostEpoch: 2, actionSeq: 999999 },
            { actionSeq: 4 },
            [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 999999 }]
        ),
        { hostEpoch: 2, actionSeq: 5 }
    );
});

runTest('restorePayloadRank は未知actionをreplay可能件数に含めない', () => {
    const details = restorePayloadRankDetails(
        { hostEpoch: 1, actionSeq: 20 },
        { actionSeq: 4 },
        [
            { action: 'unknownAction', data: {}, playerIndex: 0, seq: 5 },
            { action: 'nextTurn', data: {}, playerIndex: 0, seq: 6 },
        ]
    );

    assert.strictEqual(details.replayedActionCount, 1);
    assert.strictEqual(details.actionSeq, 5);
});

runTest('restorePayloadRank action allowlist は GAME_ACTION_REGISTRY と同期する', () => {
    const runtime = loadGameRuntime();
    const actions = Object.keys(runtime.GAME_ACTION_REGISTRY || {});
    assert.ok(actions.length > 0);
    for (const action of actions) {
        assert.strictEqual(isRestoreRankAction({ action }), true, action);
    }
    assert.strictEqual(isRestoreRankAction({ action: 'unknownAction' }), false);
});

runTest('handleRecreateRoom はsnapshot以前のactionLogを再適用しない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST_SKIP_OLD_LOG',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build', shopStock: { '麦畑': 5 }, actionSeq: 5 }),
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 5, clientActionId: 'old-compacted-action' }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));

        assert.deepStrictEqual(joined, ['REST_SKIP_OLD_LOG']);
        assert.deepStrictEqual(emitted[0].payload.acceptedClientActions, []);
        assert.strictEqual(emitted[0].payload.stateSnapshot.actionSeq, 5);
        assert.deepStrictEqual(__rooms.REST_SKIP_OLD_LOG.actionLog, []);
    } finally {
        delete __rooms.REST_SKIP_OLD_LOG;
    }
});

runTest('handleRecreateRoom はsnapshot圧縮後のseqなしactionLogを再適用しない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST_SKIP_LEGACY_LOG',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build', shopStock: { '麦畑': 5 }, actionSeq: 5 }),
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, clientActionId: 'legacy-compacted-action' }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));

        assert.deepStrictEqual(joined, ['REST_SKIP_LEGACY_LOG']);
        assert.deepStrictEqual(emitted[0].payload.acceptedClientActions, []);
        assert.strictEqual(emitted[0].payload.stateSnapshot.actionSeq, 5);
        assert.deepStrictEqual(__rooms.REST_SKIP_LEGACY_LOG.actionLog, []);
    } finally {
        delete __rooms.REST_SKIP_LEGACY_LOG;
    }
});

runTest('handleRecreateRoom は別roomId付きactionLogを拒否する', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const reconnectToken = 'token-host';
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    handleRecreateRoom(socket, {
        roomId: 'REST_ROOM_ID_GUARD',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ actionSeq: 0 }),
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 1, roomId: 'OTHER' }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    });

    assert.deepStrictEqual(joined, []);
    assert.strictEqual(__rooms.REST_ROOM_ID_GUARD, undefined);
    assert.strictEqual(emitted[0].name, APP_ERROR_EVENT);
});

runTest('handleRecreateRoom はhuman reconnectTokenHash欠落を拒否しCPU空hashは許容する', () => {
    const crypto = require('crypto');
    const reconnectToken = 'token-host';
    const goodHostHash = crypto.createHash('sha256').update(reconnectToken).digest('hex');
    const badEmitted = [];
    handleRecreateRoom({
        id: 'socket-host-bad',
        emit(name, payload) { badEmitted.push({ name, payload }); },
        join() {},
    }, {
        roomId: 'REST_BAD_HASHES',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [goodHostHash, ''],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ actionSeq: 0 }),
        actionLog: [],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    });
    assert.strictEqual(__rooms.REST_BAD_HASHES, undefined);
    assert.strictEqual(badEmitted[0].name, APP_ERROR_EVENT);

    const goodEmitted = [];
    const joined = [];
    handleRecreateRoom({
        id: 'socket-host-good',
        emit(name, payload) { goodEmitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    }, signedRestorePayload({
        roomId: 'REST_CPU_EMPTY_HASH',
        gameStartPayload: {
            playerNames: ['Alice', 'CPU'],
            playerSettings: [{ type: 'human' }, { type: 'cpu', difficulty: 'normal' }],
            reconnectTokenHashes: [goodHostHash, ''],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ actionSeq: 0 }),
        actionLog: [],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    }));

    try {
        assert.deepStrictEqual(joined, ['REST_CPU_EMPTY_HASH']);
        assert.strictEqual(goodEmitted[0].name, 'rejoinData');
    } finally {
        delete __rooms.REST_CPU_EMPTY_HASH;
    }
});

runTest('handleRecreateRoom はsnapshot圧縮後も受理済みclientActionIdを返す', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const socket = {
        id: 'socket-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };
    const reconnectToken = 'token-host';
    const payload = {
        roomId: 'REST_ACCEPTED_IDS',
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            reconnectTokenHashes: [
                crypto.createHash('sha256').update(reconnectToken).digest('hex'),
                crypto.createHash('sha256').update('token-b').digest('hex'),
            ],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            hostPlayerIndex: 0,
        },
        stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build', shopStock: { '麦畑': 5 }, actionSeq: 4 }),
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 5, clientActionId: 'pending-next-seq' }],
        playerIndex: 0,
        playerName: 'Alice',
        reconnectToken,
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload(payload));

        assert.deepStrictEqual(joined, ['REST_ACCEPTED_IDS']);
        assert.deepStrictEqual(emitted[0].payload.actionLog, []);
        assert.deepStrictEqual(emitted[0].payload.acceptedClientActions, [{ playerIndex: 0, clientActionId: 'pending-next-seq', seq: 5 }]);
        assert.strictEqual(emitted[0].payload.stateSnapshot.actionSeq, 5);
    } finally {
        delete __rooms.REST_ACCEPTED_IDS;
    }
});

runTest('handleRecreateRoom は共通fixtureの最大 actionSeq を復元rankに使う', () => {
    const fixture = makeSeqRankUsesMaxFieldsFixture();
    const emitted = [];
    const joined = [];
    const oldPayload = Object.assign({}, fixture.gameStartPayload, {
        hostEpoch: fixture.expectedRank.hostEpoch,
        actionSeq: fixture.expectedRank.actionSeq - 1,
    });
    __rooms.RESTORE_SEQ_FIXTURE = {
        started: true,
        restored: true,
        hostPlayerIndex: fixture.playerIndex,
        hostEpoch: oldPayload.hostEpoch,
        actionSeq: oldPayload.actionSeq,
        players: [
            {
                id: 'socket-alice-old',
                index: fixture.playerIndex,
                name: fixture.playerName,
                reconnectTokenHash: fixture.gameStartPayload.reconnectTokenHashes[fixture.playerIndex],
            },
        ],
        playerSettings: oldPayload.playerSettings,
        maxPlayers: oldPayload.playerNames.length,
        gameStartPayload: oldPayload,
        stateSnapshot: makeSnapshot({ actionSeq: oldPayload.actionSeq }),
        actionLog: [],
    };
    const socket = {
        id: 'socket-alice-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, signedRestorePayload({
            roomId: 'RESTORE_SEQ_FIXTURE',
            gameStartPayload: Object.assign({}, fixture.gameStartPayload),
            stateSnapshot: makeSnapshot(fixture.stateSnapshotOverrides),
            actionLog: fixture.actionLog,
            playerIndex: fixture.playerIndex,
            playerName: fixture.playerName,
            reconnectToken: fixture.reconnectToken,
        }));

        assert.deepStrictEqual(joined, ['RESTORE_SEQ_FIXTURE']);
        assert.strictEqual(__rooms.RESTORE_SEQ_FIXTURE.hostEpoch, fixture.expectedRank.hostEpoch);
        assert.strictEqual(__rooms.RESTORE_SEQ_FIXTURE.actionSeq, fixture.expectedRank.actionSeq);
        assert.strictEqual(__rooms.RESTORE_SEQ_FIXTURE.stateSnapshot.actionSeq, fixture.expectedRank.actionSeq);
        assert.strictEqual(emitted[0].payload.gameStartPayload.actionSeq, fixture.expectedRank.actionSeq);
    } finally {
        delete __rooms.RESTORE_SEQ_FIXTURE;
    }
});

runTest('handleRecreateRoom は新しい復元payloadが壊れていれば既存roomを残す', () => {
    const crypto = require('crypto');
    const emitted = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const oldPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 1,
        hostEpoch: 0,
        actionSeq: 0,
    };
    const newPayload = Object.assign({}, oldPayload, {
        hostPlayerIndex: 1,
        hostEpoch: 1,
        actionSeq: 1,
    });
    const originalRoom = {
        started: true,
        restored: true,
        hostPlayerIndex: 1,
        hostEpoch: 0,
        actionSeq: 0,
        players: [
            { id: 'socket-bob-old', index: 1, name: 'Bob', reconnectTokenHash: reconnectTokenHashes[1] },
        ],
        playerSettings: oldPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: oldPayload,
        stateSnapshot: makeSnapshot(),
        actionLog: [],
    };
    __rooms.REPLACE_BAD = originalRoom;
    const socket = {
        id: 'socket-bob-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join() { throw new Error('壊れた復元payloadではjoinしない'); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REPLACE_BAD',
            gameStartPayload: newPayload,
            stateSnapshot: makeSnapshot(),
            actionLog: [{ action: 'unknownAction', data: {}, playerIndex: 0, seq: 1 }],
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        });

        assert.strictEqual(__rooms.REPLACE_BAD, originalRoom);
        assert.ok(emitted.some(e => e.name === APP_ERROR_EVENT && e.payload === '復元データが壊れています'));
    } finally {
        delete __rooms.REPLACE_BAD;
    }
});

runTest('handleRecreateRoom は稼働中roomを新しい復元payloadで置き換えない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const payload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
    };
    __rooms.LIVE01 = {
        started: true,
        restored: false,
        hostPlayerIndex: 0,
        hostEpoch: 0,
        actionSeq: 0,
        players: [
            { id: 'socket-alice-live', index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
            { id: null, index: 1, name: 'Bob', reconnectTokenHash: reconnectTokenHashes[1] },
        ],
        playerSettings: payload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: payload,
        stateSnapshot: makeSnapshot(),
        actionLog: [],
    };
    const socket = {
        id: 'socket-bob-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'LIVE01',
            gameStartPayload: Object.assign({}, payload, { hostPlayerIndex: 1, hostEpoch: 10, actionSeq: 10 }),
            stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build', actionSeq: 10 }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 10 }],
            playerIndex: 1,
            playerName: 'Bob',
            reconnectToken: tokenBob,
        });

        assert.deepStrictEqual(joined, ['LIVE01']);
        assert.strictEqual(__rooms.LIVE01.restored, false);
        assert.notStrictEqual(__rooms.LIVE01.gameStartPayload.hostEpoch, 10);
        assert.notStrictEqual(__rooms.LIVE01.stateSnapshot.actionSeq, 10);
        assert.strictEqual(emitted[0].payload.gameStartPayload, __rooms.LIVE01.gameStartPayload);
    } finally {
        delete __rooms.LIVE01;
    }
});

runTest('handleRecreateRoom は同一hostEpochの別ホストpayloadで復元済みroomを置き換えない', () => {
    const crypto = require('crypto');
    const emitted = [];
    const joined = [];
    const tokenAlice = 'token-alice';
    const tokenBob = 'token-bob';
    const reconnectTokenHashes = [
        crypto.createHash('sha256').update(tokenAlice).digest('hex'),
        crypto.createHash('sha256').update(tokenBob).digest('hex'),
    ];
    const existingPayload = {
        playerNames: ['Alice', 'Bob'],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes,
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 1,
        hostEpoch: 2,
        actionSeq: 5,
    };
    __rooms.REST_SAME_EPOCH_HOST = {
        started: true,
        restored: true,
        hostPlayerIndex: 1,
        hostEpoch: 2,
        actionSeq: 5,
        players: [
            { id: null, index: 0, name: 'Alice', reconnectTokenHash: reconnectTokenHashes[0] },
            { id: 'socket-bob-live', index: 1, name: 'Bob', reconnectTokenHash: reconnectTokenHashes[1] },
        ],
        playerSettings: existingPayload.playerSettings,
        maxPlayers: 2,
        gameStartPayload: existingPayload,
        stateSnapshot: makeSnapshot({ actionSeq: 5 }),
        actionLog: [],
    };
    const socket = {
        id: 'socket-alice-new',
        emit(name, payload) { emitted.push({ name, payload }); },
        join(roomId) { joined.push(roomId); },
    };

    try {
        handleRecreateRoom(socket, {
            roomId: 'REST_SAME_EPOCH_HOST',
            gameStartPayload: Object.assign({}, existingPayload, {
                hostPlayerIndex: 0,
                hostEpoch: 2,
                actionSeq: 10,
            }),
            stateSnapshot: makeSnapshot({ currentPlayerIndex: 0, phase: 'build', actionSeq: 10 }),
            actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 10 }],
            playerIndex: 0,
            playerName: 'Alice',
            reconnectToken: tokenAlice,
        });

        assert.deepStrictEqual(joined, ['REST_SAME_EPOCH_HOST']);
        assert.notStrictEqual(__rooms.REST_SAME_EPOCH_HOST.actionSeq, 10);
        assert.notStrictEqual(__rooms.REST_SAME_EPOCH_HOST.stateSnapshot.actionSeq, 10);
        assert.strictEqual(emitted[0].name, 'rejoinData');
        assert.strictEqual(emitted[0].payload.gameStartPayload, __rooms.REST_SAME_EPOCH_HOST.gameStartPayload);
    } finally {
        delete __rooms.REST_SAME_EPOCH_HOST;
    }
});

runTest('nextRoomActionSeq は未compact actionで stateSnapshot.actionSeq を進めない', () => {
    const room = makeRoom();
    room.actionSeq = 10;
    room.gameStartPayload.actionSeq = 10;
    room.stateSnapshot = makeSnapshot({ actionSeq: 8 });

    const seq = nextRoomActionSeq(room);

    assert.strictEqual(seq, 11);
    assert.strictEqual(room.actionSeq, 11);
    assert.strictEqual(room.gameStartPayload.actionSeq, 11);
    assert.strictEqual(room.stateSnapshot.actionSeq, 8);
});

runTest('roomHostChanged helper は hostChanged payload を一箇所で組み立てる', () => {
    const room = { hostPlayerIndex: 2, hostEpoch: 5 };
    assert.deepStrictEqual(roomHostChangedPayload(room), {
        newHostPlayerIndex: 2,
        hostEpoch: 5,
    });

    const emitted = [];
    const fakeIo = {
        to(roomId) {
            return {
                emit(event, payload) { emitted.push({ roomId, event, payload }); },
            };
        },
    };
    emitRoomHostChanged('ROOM01', room, fakeIo);
    assert.deepStrictEqual(emitted, [{
        roomId: 'ROOM01',
        event: 'hostChanged',
        payload: { newHostPlayerIndex: 2, hostEpoch: 5 },
    }]);
});

runTest('getRemainingConnectedPlayers は切断済み・幽霊プレイヤーをホスト候補から除外する', () => {
    const room = {
        players: [
            { id: null, index: 0, name: 'Host' },
            { id: 'socket-stale', index: 1, name: 'Ghost' },
            { id: 'socket-live', index: 2, name: 'Live' },
        ],
    };
    const sockets = new Map([
        ['socket-live', {}],
    ]);

    const remaining = getRemainingConnectedPlayers(room, sockets, 'socket-host');
    assert.deepStrictEqual(remaining.map(p => p.index), [2]);
});

runTest('disconnect lifecycle helpers は待機room削除と開始済みhost移譲を分離する', () => {
    const waitingRoomId = 'WAIT_HELPER';
    __rooms[waitingRoomId] = {
        started: false,
        playerSettings: [{ type: 'human' }],
        players: [{ id: 'socket-wait', index: 0, name: 'Alice' }],
    };
    const waitingIo = { to() { return { emit() {} }; } };
    const waitingResult = removeWaitingRoomSocket(waitingIo, waitingRoomId, __rooms[waitingRoomId], { id: 'socket-wait' });
    assert.deepStrictEqual(waitingResult, { removedRoom: true });
    assert.strictEqual(__rooms[waitingRoomId], undefined);

    const emitted = [];
    const room = {
        started: true,
        hostPlayerIndex: 0,
        hostEpoch: 1,
        players: [
            { id: 'socket-host', index: 0, name: 'Host' },
            { id: 'socket-next', index: 1, name: 'Next' },
        ],
    };
    const io = {
        sockets: { sockets: new Map([['socket-next', {}]]) },
        to(roomId) {
            return {
                emit(name, payload) { emitted.push({ roomId, name, payload }); },
            };
        },
    };

    const result = handleStartedRoomSocketDisconnect(io, 'STARTED_HELPER', room, { id: 'socket-host', playerIndex: 0 });

    assert.deepStrictEqual(result, { ignored: false, hostChanged: true, playerIndex: 0 });
    assert.strictEqual(room.players[0].id, null);
    assert.strictEqual(room.hostPlayerIndex, 1);
    assert.strictEqual(room.hostEpoch, 2);
    assert.deepStrictEqual(emitted, [
        { roomId: 'STARTED_HELPER', name: 'playerDisconnected', payload: { playerIndex: 0, playerName: 'Host' } },
        { roomId: 'STARTED_HELPER', name: 'hostChanged', payload: { newHostPlayerIndex: 1, hostEpoch: 2 } },
    ]);
});

runTest('handleSocketDisconnect は古いsocketの遅延disconnectで再接続済みplayerを消さない', () => {
    __rooms.RACE01 = {
        started: true,
        hostPlayerIndex: 0,
        players: [
            { id: 'socket-new', index: 0, name: 'Alice' },
            { id: 'socket-bob', index: 1, name: 'Bob' },
        ],
    };
    const emitted = [];
    const io = {
        sockets: { sockets: new Map([['socket-new', {}], ['socket-bob', {}]]) },
        to(roomId) {
            return {
                emit(name, payload) {
                    emitted.push({ roomId, name, payload });
                },
            };
        },
    };
    try {
        handleSocketDisconnect(io, { id: 'socket-old', roomId: 'RACE01', playerIndex: 0 });

        assert.strictEqual(__rooms.RACE01.players[0].id, 'socket-new');
        assert.strictEqual(__rooms.RACE01.hostPlayerIndex, 0);
        assert.deepStrictEqual(emitted, []);
    } finally {
        delete __rooms.RACE01;
    }
});

runTest('compactRoomActionLog は長いログを stateSnapshot に圧縮してミラー状態を維持する', () => {
    const room = {
        hostPlayerIndex: 0,
        started: true,
        restored: false,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        gameStartPayload: {
            playerNames: ['A', 'B'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅', 'ショッピングモール'],
        },
        actionLog: [],
        lastUndoState: null,
        stateSnapshot: null,
    };
    for (let i = 0; i < 201; i++) {
        const playerIndex = i % 2;
        room.actionLog.push({ action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] }, playerIndex });
        room.actionLog.push({ action: 'nextTurn', data: {}, playerIndex });
    }

    const before = createRoomMirror(room);
    compactRoomActionLog(room);
    const after = createRoomMirror(room);

    assert.ok(room.stateSnapshot);
    assert.strictEqual(room.actionLog.length, 0);
    assert.strictEqual(room.fullActionLog.length, 402);
    assert.strictEqual(after.game.currentPlayerIndex, before.game.currentPlayerIndex);
    assert.deepStrictEqual(after.game.players.map(p => p.coins), before.game.players.map(p => p.coins));
    assert.strictEqual(after.game.turnCount, before.game.turnCount);
});

runTest('署名なしrejoinはseq201圧縮境界を越えて完全logを再起動復元へ引き継ぐ', () => {
    const crypto = require('crypto');
    const previousRestoreSecret = process.env.RESTORE_AUDIT_SECRET;
    const previousMachikoroRestoreSecret = process.env.MACHIKORO_RESTORE_AUDIT_SECRET;
    const reconnectToken = 'boundary-host-token';
    const room = makeRoom();
    room.roomId = 'BOUNDARY_RESTORE';
    room.players = [{
        id: null,
        index: 0,
        name: 'A',
        reconnectTokenHash: crypto.createHash('sha256').update(reconnectToken).digest('hex'),
    }];
    room.gameStartPayload.reconnectTokenHashes = [
        room.players[0].reconnectTokenHash,
        crypto.createHash('sha256').update('boundary-b').digest('hex'),
    ];
    room.gameStartPayload.actionSeq = 203;
    room.actionLog = [];
    for (let turn = 0; turn < 100; turn++) {
        const playerIndex = turn % 2;
        room.actionLog.push({
            action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] },
            playerIndex, seq: turn * 2 + 1,
        });
        room.actionLog.push({ action: 'nextTurn', data: {}, playerIndex, seq: turn * 2 + 2 });
    }
    room.actionLog.push({
        action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] },
        playerIndex: 0, seq: 201,
    });
    room.actionSeq = 201;

    compactRoomActionLog(room);
    room.actionLog.push({ action: 'nextTurn', data: {}, playerIndex: 0, seq: 202 });
    room.actionLog.push({
        action: 'rollDice', data: { forceDice: 1, tunaDice: [1, 1] },
        playerIndex: 1, seq: 203,
    });
    room.actionSeq = 203;
    const rejoinPayload = buildRejoinDataPayload(room, 0, { restoreAudit: null });
    const storedBeforeDisconnect = rejoinPayload.fullActionLog.slice(0, 200);
    const persistencePlan = OnlinePayload.planRejoinActionLogPersistence(
        rejoinPayload.stateSnapshot,
        rejoinPayload.restoreAudit,
        storedBeforeDisconnect,
        rejoinPayload.actionLog,
        rejoinPayload.fullActionLog
    );
    assert.deepStrictEqual(persistencePlan.actionLog.map(entry => entry.seq),
        Array.from({ length: 203 }, (_, index) => index + 1));

    const emitted = [];
    const socket = {
        id: 'socket-boundary-host',
        emit(name, payload) { emitted.push({ name, payload }); },
        join() {},
    };
    try {
        delete process.env.RESTORE_AUDIT_SECRET;
        delete process.env.MACHIKORO_RESTORE_AUDIT_SECRET;
        handleRecreateRoom(socket, {
            roomId: room.roomId,
            gameStartPayload: room.gameStartPayload,
            stateSnapshot: null,
            actionLog: persistencePlan.actionLog,
            playerIndex: 0,
            playerName: 'A',
            reconnectToken,
        });
        assert.strictEqual(__rooms[room.roomId].stateSnapshot.actionSeq, 203);
        assert.deepStrictEqual(__rooms[room.roomId].fullActionLog.map(entry => entry.seq),
            Array.from({ length: 203 }, (_, index) => index + 1));
        assert.ok(emitted.some(entry => entry.name === 'rejoinData'));
    } finally {
        if (previousRestoreSecret === undefined) delete process.env.RESTORE_AUDIT_SECRET;
        else process.env.RESTORE_AUDIT_SECRET = previousRestoreSecret;
        if (previousMachikoroRestoreSecret === undefined) {
            delete process.env.MACHIKORO_RESTORE_AUDIT_SECRET;
        } else {
            process.env.MACHIKORO_RESTORE_AUDIT_SECRET = previousMachikoroRestoreSecret;
        }
    }
});

runTest('createRoomMirror は7人以上の大施設在庫を人数分にする', () => {
    const room = makeRoom();
    room.gameStartPayload.playerNames = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
    room.gameStartPayload.playerSettings = room.gameStartPayload.playerNames.map(() => ({ type: 'human' }));
    room.gameStartPayload.playerOrder = [0, 1, 2, 3, 4, 5, 6];
    room.gameStartPayload.enabledCards = ['スタジアム'];
    const mirror = createRoomMirror(room);
    assert.strictEqual(mirror.shopStock['スタジアム'], 7);
});

runTest('createRoomMirror は旧playerSettings空配列のaction replayを全員人間として復元する', () => {
    const room = makeRoom();
    room.gameStartPayload.playerSettings = [];
    room.actionLog = [
        { action: 'rollDice', data: { forceDice: 1, tunaDice: null }, playerIndex: 0 },
        { action: 'nextTurn', data: {}, playerIndex: 0 },
    ];

    const mirror = createRoomMirror(room);

    assert.ok(mirror);
    assert.strictEqual(mirror.game.currentPlayerIndex, 1);
});

runTest('createRoomMirror は旧snapshotの任意pendingフィールド欠落を許容する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    delete snapshot.pendingMover;
    delete snapshot.pendingRenovation;
    delete snapshot.pendingIT;
    delete snapshot.pendingTunaDice;
    delete snapshot.turnCount;
    delete snapshot.hadAmusementParkAtRoll;
    room.stateSnapshot = snapshot;

    const mirror = createRoomMirror(room);

    assert.ok(mirror);
    assert.strictEqual(mirror.game.players.length, 2);
});

runTest('createRoomMirror は旧snapshotのdormant/IT/役所フィールド欠落を既定値で復元する', () => {
    const room = makeRoom();
    const snapshot = makeSnapshot();
    for (const playerState of snapshot.players) {
        delete playerState.dormantIndices;
        delete playerState.itVentureCoins;
        delete playerState.hasYakusho;
    }
    room.stateSnapshot = snapshot;

    const mirror = createRoomMirror(room);

    assert.ok(mirror);
    assert.strictEqual(mirror.game.players[0].dormantCards.length, 0);
    assert.strictEqual(mirror.game.players[1].dormantCards.length, 0);
    assert.strictEqual(mirror.game.players[0].itVentureCoins, 0);
    assert.strictEqual(mirror.game.players[1].itVentureCoins, 0);
    assert.strictEqual(mirror.game.players[0].hasYakusho, true);
    assert.strictEqual(mirror.game.players[1].hasYakusho, true);
});

runTest('createRoomMirror は旧snapshot undoStateのplayerItVenture欠落を許容する', () => {
    const room = makeRoom();
    const { GameManager } = makeGame();
    const game = new GameManager(2);
    const snapshot = makeSnapshot({ phase: 'build', builtThisTurn: true });
    snapshot.undoState = makeUndoStateFromMirror(game, { 麦畑: 6 });
    delete snapshot.undoState.playerItVenture;
    room.stateSnapshot = snapshot;

    const mirror = createRoomMirror(room);

    assert.ok(mirror);
    assert.ok(mirror.lastUndoState);
    assert.strictEqual(mirror.lastUndoState.playerItVenture, undefined);
});

runTest('restoreUndoMirror は旧undoStateのplayerItVenture欠落を0として復元する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    const shopStock = { 麦畑: 6 };
    const state = makeUndoStateFromMirror(game, shopStock);
    delete state.playerItVenture;
    delete state.builtThisTurn;
    game.players[0].itVentureCoins = 5;
    game.builtThisTurn = true;

    const ok = restoreUndoMirror(game, shopStock, state, createCardByName);

    assert.strictEqual(ok, true);
    assert.strictEqual(game.players[0].itVentureCoins, 0);
    assert.strictEqual(game.builtThisTurn, false);
});

runTest('createRoomMirror は壊れた snapshot を復元失敗として拒否する', () => {
    const room = {
        hostPlayerIndex: 0,
        started: true,
        restored: true,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        gameStartPayload: {
            playerNames: ['A', 'B'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            cpuSpeed: 1500,
            playerOrder: [0, 1],
            enabledCards: ['麦畑'],
            enabledLandmarks: ['駅'],
        },
        stateSnapshot: {
            players: [{ name: 'A', dormantIndices: 'broken', landmarks: null }],
            shopStock: { 麦畑: 5 },
            currentPlayerIndex: 'bad',
            log: 'bad',
        },
        actionLog: [
            null,
            { action: null, data: {} },
        ],
    };

    const mirror = createRoomMirror(room);

    assert.strictEqual(mirror, null);
});

runTest('createRoomMirror は未知 action を復元失敗として拒否する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'unknownAction', data: {} }];

    const mirror = createRoomMirror(room);

    assert.strictEqual(mirror, null);
});

runTest('createRoomMirror は全actionの不正payload replayを例外にせず拒否する', () => {
    const { GAME_ACTIONS } = loadGameRuntime();
    const invalidPayloads = [null, [], 'x', {}];
    for (const action of Object.values(GAME_ACTIONS)) {
        for (const data of invalidPayloads) {
            const room = makeRoom();
            room.actionLog = [{ action, data, playerIndex: 0 }];
            assert.strictEqual(createRoomMirror(room), null, action + ' should reject ' + JSON.stringify(data));
        }
    }
});

runTest('applyActionToMirror は非object payloadを例外にせず拒否する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    const shopStock = { 麦畑: 6 };
    const invalidPayloads = [null, [], 'x'];
    for (const data of invalidPayloads) {
        assert.strictEqual(applyActionToMirror(game, shopStock, 'rollDice', data, createCardByName), false);
    }
});

runTest('validateGameAction は壊れた actionLog replay を拒否する', () => {
    const room = makeRoom();
    room.actionLog = [{ action: 'rollDice', data: null, playerIndex: 0 }];

    const result = validateGameAction(room, { playerIndex: 0 }, 'rollDice', { forceDice: 1, tunaDice: [1, 1] });

    assert.strictEqual(result.ok, false);
});

runTest('applyActionToMirror は undoBuild で保存済み状態を復元する', () => {
    const { GameManager, createCardByName } = makeGame();
    const game = new GameManager(2);
    const shopStock = { 麦畑: 6 };
    game.phase = 'build';
    const snapshot = makeUndoStateFromMirror(game, shopStock);

    game.currentPlayer().coins = 0;
    game.currentPlayer().cards.push(createCardByName('麦畑'));
    shopStock['麦畑'] = 5;

    applyActionToMirror(game, shopStock, 'undoBuild', { state: snapshot }, createCardByName);

    assert.strictEqual(game.currentPlayer().coins, snapshot.playerCoins[0]);
    assert.strictEqual(game.currentPlayer().countCard('麦畑'), 1);
    assert.strictEqual(shopStock['麦畑'], 6);
});

runTest('restoreUndoMirror は state が null のとき何もしない', () => {
    const { GameManager } = makeGame();
    const game = new GameManager(2);
    const shopStock = { 麦畑: 6 };
    game.currentPlayer().coins = 9;

    restoreUndoMirror(game, shopStock, null, () => null);

    assert.strictEqual(game.currentPlayer().coins, 9);
    assert.strictEqual(shopStock['麦畑'], 6);
});

runTest('buildPlayerList は CPU と待機中プレイヤーを設定に応じて表示する', () => {
    const room = {
        playerSettings: [
            { type: 'human' },
            { type: 'cpu', difficulty: 'normal' },
            { type: 'human' },
        ],
        players: [
            { index: 0, name: 'Alice' },
        ],
    };
    assert.deepStrictEqual(buildPlayerList(room), ['Alice', 'CPU（普）', '待機中...']);
});

runTest('buildPlayerList は rl と expert のCPU表示を区別する', () => {
    const room = {
        playerSettings: [
            { type: 'cpu', difficulty: 'rl' },
            { type: 'cpu', difficulty: 'expert' },
        ],
        players: [],
    };
    assert.deepStrictEqual(buildPlayerList(room), ['CPU（学）', 'CPU（最強）']);
});

runTest('buildPlayerList は設定がないルームで参加者名をそのまま返す', () => {
    const room = {
        playerSettings: [],
        players: [{ name: 'Alice' }, { name: 'Bob' }],
    };
    assert.deepStrictEqual(buildPlayerList(room), ['Alice', 'Bob']);
});

runTest('buildGameStartPayload は開始payloadの名前・順番・version・token hashを組み立てる', () => {
    const io = {
        sockets: {
            sockets: new Map([
                ['s1', { clientVersion: 'v-host', hostlessRestoreVersion: 1 }],
                ['s2', { clientVersion: '', hostlessRestoreVersion: 1 }],
            ]),
        },
    };
    const room = {
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        players: [
            { id: 's1', index: 1, name: 'Alice', reconnectToken: 'token-a' },
            { id: 's2', index: 2, name: 'Bob', reconnectToken: 'token-b' },
        ],
        hostPlayerIndex: 1,
        hostEpoch: 4,
        actionSeq: 8,
        maxPlayers: 3,
        playerSettings: [
            { type: 'cpu', difficulty: 'normal' },
            { type: 'human', difficulty: 'normal' },
            { type: 'human', difficulty: 'normal' },
        ],
        cpuSpeed: 1200,
    };

    assert.strictEqual(countRoomHumanSlots(room), 2);
    assert.deepStrictEqual(buildGameStartPlayerNames(room), ['CPU1（普）', 'Alice', 'Bob']);
    assert.deepStrictEqual(shuffledPlayerOrder(['A', 'B', 'C'], () => 0), [1, 2, 0]);
    assert.deepStrictEqual(roomClientVersions(io, room), ['v-host', 'unknown']);
    assert.deepStrictEqual(roomHostlessRestoreCapabilities(io, room, ['CPU1（普）', 'Alice', 'Bob']), [0, 1, 1]);

    const payload = buildGameStartPayload(io, room, () => 0);
    assert.deepStrictEqual(payload.playerNames, ['CPU1（普）', 'Alice', 'Bob']);
    assert.deepStrictEqual(payload.playerOrder, [1, 2, 0]);
    assert.deepStrictEqual(payload.versions, ['v-host', 'unknown']);
    assert.strictEqual(payload.reconnectTokenHashes[0], '');
    assert.ok(payload.reconnectTokenHashes[1]);
    assert.ok(payload.reconnectTokenHashes[2]);
    assert.strictEqual(payload.hostEpoch, 4);
    assert.strictEqual(payload.actionSeq, 8);
    assert.deepStrictEqual(payload.hostlessRestoreCapabilities, [0, 1, 1]);
    assert.strictEqual(payload.hostlessRestoreGeneration, 0);
    assert.strictEqual(payload.hostlessRestoreCount, 0);
});

runTest('markRoomGameStarted は開始時の復元状態を初期化する', () => {
    const room = {
        started: false,
        gameStartPayload: null,
        stateSnapshot: { actionSeq: 4 },
        actionLog: [{ action: 'rollDice' }],
        lastUndoState: { state: {} },
        canonicalMirror: { stale: true },
        lastTouchedAt: 0,
    };
    const payload = { playerNames: ['Alice', 'CPU1'], actionSeq: 0 };

    markRoomGameStarted(room, payload, 12345);

    assert.strictEqual(room.started, true);
    assert.strictEqual(room.gameStartPayload, payload);
    assert.strictEqual(room.stateSnapshot, null);
    assert.deepStrictEqual(room.actionLog, []);
    assert.strictEqual(room.lastUndoState, null);
    assert.ok(room.canonicalMirror);
    assert.strictEqual(room.canonicalMirror.game.players.length, 2);
    assert.strictEqual(room.canonicalMirrorActionSeq, 0);
    assert.strictEqual(room.canonicalMirrorActionLogLength, 0);
    assert.strictEqual(room.lastTouchedAt, 12345);
});

runTest('checkGameStart は人間枠が揃うと gameStart を送る', () => {
    const roomId = 'ROOM01';
    const emitted = [];
    const io = {
        sockets: {
            sockets: new Map([
                ['s1', { clientVersion: 'v1' }],
            ]),
        },
        to(targetRoomId) {
            return {
                emit(name, payload) {
                    emitted.push({ targetRoomId, name, payload });
                },
            };
        },
    };
    const room = {
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        players: [{ id: 's1', index: 0, name: 'Alice' }],
        hostPlayerIndex: 0,
        maxPlayers: 2,
        playerSettings: [
            { type: 'human' },
            { type: 'cpu', difficulty: 'strong' },
        ],
        cpuSpeed: 1500,
        started: false,
    };
    const realNow = Date.now;
    const realRandom = Math.random;
    Date.now = () => 12345;
    Math.random = () => 0;
    try {
        __rooms[roomId] = room;
        checkGameStart(io, roomId);

        assert.strictEqual(room.started, true);
        assert.strictEqual(room.gameStartPayload.playerNames[0], 'Alice');
        assert.strictEqual(room.gameStartPayload.playerNames[1], 'CPU1（強）');
        assert.deepStrictEqual(room.gameStartPayload.playerOrder, [1, 0]);
        assert.deepStrictEqual(room.gameStartPayload.versions, ['v1']);
        assert.strictEqual(room.lastTouchedAt, 12345);
        assert.deepStrictEqual(emitted, [{
            targetRoomId: roomId,
            name: 'gameStart',
            payload: room.gameStartPayload,
        }]);
    } finally {
        delete __rooms[roomId];
        Math.random = realRandom;
        Date.now = realNow;
    }
});

runTest('checkGameStart は5人CPU混在でRLを維持したpayloadを開始する', () => {
    const roomId = 'ROOM05';
    const emitted = [];
    const io = {
        sockets: {
            sockets: new Map([
                ['s1', { clientVersion: 'v-host' }],
                ['s2', { clientVersion: 'v-guest' }],
            ]),
        },
        to(targetRoomId) {
            return {
                emit(name, payload) {
                    emitted.push({ targetRoomId, name, payload });
                },
            };
        },
    };
    const room = {
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        players: [
            { id: 's1', index: 2, name: 'Host', reconnectToken: 'token-host' },
            { id: 's2', index: 4, name: 'Guest', reconnectToken: 'token-guest' },
        ],
        hostPlayerIndex: 2,
        maxPlayers: 5,
        playerSettings: normalizePlayerSettings([
            { type: 'cpu', difficulty: 'rl' },
            { type: 'cpu', difficulty: 'strong' },
            { type: 'human', difficulty: 'normal' },
            { type: 'cpu', difficulty: 'rl' },
            { type: 'human', difficulty: 'normal' },
        ], 5),
        cpuSpeed: 1500,
        started: false,
    };
    const realRandom = Math.random;
    Math.random = () => 0;
    try {
        __rooms[roomId] = room;
        checkGameStart(io, roomId);

        assert.strictEqual(room.started, true);
        assert.deepStrictEqual(room.gameStartPayload.playerNames, [
            'CPU1（学）',
            'CPU2（強）',
            'Host',
            'CPU3（学）',
            'Guest',
        ]);
        assert.deepStrictEqual(room.gameStartPayload.playerSettings.map(s => s.difficulty), [
            'rl',
            'strong',
            'normal',
            'rl',
            'normal',
        ]);
        assert.deepStrictEqual(room.gameStartPayload.playerOrder, [1, 2, 3, 4, 0]);
        assert.deepStrictEqual(room.gameStartPayload.versions, ['v-host', 'v-guest']);
        assert.strictEqual(room.gameStartPayload.reconnectTokenHashes[0], '');
        assert.ok(room.gameStartPayload.reconnectTokenHashes[2]);
        assert.strictEqual(room.gameStartPayload.reconnectTokenHashes[3], '');
        assert.ok(room.gameStartPayload.reconnectTokenHashes[4]);
        assert.deepStrictEqual(emitted, [{
            targetRoomId: roomId,
            name: 'gameStart',
            payload: room.gameStartPayload,
        }]);
    } finally {
        delete __rooms[roomId];
        Math.random = realRandom;
    }
});

runTest('checkGameStart は人間枠が不足している間は開始しない', () => {
    const roomId = 'ROOM02';
    const emitted = [];
    const io = {
        sockets: { sockets: new Map() },
        to(targetRoomId) {
            return {
                emit(name, payload) {
                    emitted.push({ targetRoomId, name, payload });
                },
            };
        },
    };
    __rooms[roomId] = {
        enabledCards: ['麦畑'],
        enabledLandmarks: ['駅'],
        players: [{ id: 's1', index: 0, name: 'Alice' }],
        hostPlayerIndex: 0,
        maxPlayers: 3,
        playerSettings: [
            { type: 'human' },
            { type: 'human' },
            { type: 'cpu', difficulty: 'normal' },
        ],
        cpuSpeed: 1500,
        started: false,
    };
    try {
        checkGameStart(io, roomId);
        assert.strictEqual(__rooms[roomId].started, false);
        assert.deepStrictEqual(emitted, []);
        assert.strictEqual(__rooms[roomId].gameStartPayload, undefined);
    } finally {
        delete __rooms[roomId];
    }
});


runTest('buildGameStartPayload は明示flag時だけ全human共通schema metadataを加える', () => {
    const capabilities = { actionVersions: [0, 1], snapshotVersions: [0, 1] };
    const io = { sockets: { sockets: new Map() } };
    const room = {
        enabledCards: ['麦畑'], enabledLandmarks: ['駅'],
        players: [
            { id: 's1', index: 0, name: 'Alice', reconnectToken: 'a', gameSchemaCapabilities: capabilities },
            { id: 's2', index: 1, name: 'Bob', reconnectToken: 'b', gameSchemaCapabilities: capabilities },
        ],
        hostPlayerIndex: 0, maxPlayers: 2,
        playerSettings: [{ type: 'human' }, { type: 'human' }], cpuSpeed: 1500,
    };
    const disabled = buildGameStartPayload(io, room, () => 0, { gameSchemaNegotiationEnabled: false });
    const enabled = buildGameStartPayload(io, room, () => 0, { gameSchemaNegotiationEnabled: true });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(disabled, 'gameSchema'), false);
    assert.deepStrictEqual(enabled.gameSchema, { actionVersion: 1, snapshotVersion: 1 });
    room.players[1].gameSchemaCapabilities = null;
    assert.deepStrictEqual(
        buildGameStartPayload(io, room, () => 0, { gameSchemaNegotiationEnabled: true }).gameSchema,
        { actionVersion: 0, snapshotVersion: 0 }
    );
});

runTest('mirror replay shadowはnegotiated v1をmutable mirrorと同じ状態へ進める', () => {
    const runtime = loadGameRuntime();
    const room = {
        gameStartPayload: {
            playerNames: ['Alice', 'Bob'],
            playerSettings: [{ type: 'human' }, { type: 'human' }],
            playerOrder: [0, 1],
            enabledCards: runtime.CARDS.map(card => card.name),
            enabledLandmarks: runtime.Player.landmarkNames(),
        },
        stateSnapshot: null,
        actionLog: [],
    };
    const mirror = createRoomMirror(room);
    mirror.game.phase = runtime.GAME_PHASES.BUILD;
    const source = serializeMirrorState(mirror.game, mirror.shopStock, null, 0);
    const original = JSON.parse(JSON.stringify(source));
    const shadow = transitionMirrorEnvelope({
        selection: { actionVersion: 1, snapshotVersion: 1 },
        snapshot: source,
        action: 'nextTurn',
        data: {},
        actionSeq: 1,
        enabledLandmarks: room.gameStartPayload.enabledLandmarks,
    });
    assert.strictEqual(shadow.ok, true);
    assert.strictEqual(shadow.snapshotEnvelope.schemaVersion, 1);
    assert.strictEqual(applyActionToMirror(
        mirror.game, mirror.shopStock, 'nextTurn', {}, runtime.createCardByName
    ), true);
    assert.deepStrictEqual(
        JSON.parse(JSON.stringify(shadow.snapshot)),
        JSON.parse(JSON.stringify(serializeMirrorState(mirror.game, mirror.shopStock, null, 1)))
    );
    assert.strictEqual(JSON.stringify(source), JSON.stringify(original));
});

if (process.exitCode) {
    throw new Error('serverテストで失敗が発生しました');
}
