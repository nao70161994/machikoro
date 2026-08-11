const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { makeGameRuntimeLoader } = require('./server/gameRuntimeLoader');
const { startRoomGc } = require('./server/roomGcRuntime');
const { registerServerProcessHandlers, startHttpServer } = require('./server/processRuntime');
const { registerSocketConnectionRuntime } = require('./server/socketConnectionRuntime');
const {
    socketRequestBaseOrigin,
    socketAllowedOrigins,
    isSocketOriginAllowed,
    makeSocketAllowRequest,
} = require('./server/socketOriginPolicy');
const loadGameRuntime = makeGameRuntimeLoader({
    baseDir: __dirname,
    runtimeConsole: console,
});
const { postNtfyNotification } = require('./server/ntfyNotifier');
const makeReportDelivery = require('./server/reportDelivery');
const registerReportingHttpRoutes = require('./server/reportingHttpRoutes');
const { makeClientErrorReporting } = require('./server/clientErrorReporting');
const makeClientErrorGateway = require('./server/clientErrorGateway');
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
    makeReportAdmission,
} = require('./server/reportThrottle');
const {
    resolveTrustProxySetting,
    clientReportRateKey,
    resolveNtfyTopic,
    isClientErrorTestEnabled,
    createClientErrorTestPayload,
    clientErrorHealthSnapshot,
    gameLifecycleDedupeKey,
} = require('./server/reportingPolicy');
const { makeGameLifecycleReporting } = require('./server/gameLifecycleReporting');
const makeGameLifecycleGateway = require('./server/gameLifecycleGateway');
const { makeSocketPayloadValidation, makeSocketPayloadGateway } = require('./server/socketPayload');
const {
    MAX_ACTION_LOG_LENGTH,
    ROOM_LIFECYCLE_LIMITS,
    RESTORE_PAYLOAD_LIMITS,
    SOCKET_IO_MAX_HTTP_BUFFER_SIZE,
    SOCKET_PAYLOAD_LIMITS,
    REJOIN_ADMISSION_LIMITS,
    CLIENT_ERROR_LIMITS,
    GAME_LIFECYCLE_LIMITS,
} = require('./server/runtimeLimits');
const { registerLobbySocketHandlers } = require('./server/lobbySocketHandlers');
const { registerRejoinSocketHandler } = require('./server/rejoinSocketHandler');
const { makeRejoinAdmission } = require('./server/rejoinAdmission');
const { registerActionSocketHandler } = require('./server/actionSocketHandler');
const {
    makeRecreateAttemptAdmission,
    registerRecreateSocketHandler,
} = require('./server/recreateSocketHandler');
const { selectRestoreSource, decideExistingRoomRestore } = require('./server/restoreGateway');
const makeRestoreAdmission = require('./server/restoreAdmission');
const makeRestoreReplayAdmission = require('./server/restoreReplayAdmission');
const makeRestorePreparation = require('./server/restorePreparation');
const makeRestoredRoom = require('./server/restoredRoom');
const makeRestoredRoomRuntime = require('./server/restoredRoomRuntime');
const makeExistingRoomRestoreRuntime = require('./server/existingRoomRestoreRuntime');
const makeNewRoomRestoreRuntime = require('./server/newRoomRestoreRuntime');
const makeRecreateRoomRuntime = require('./server/recreateRoomRuntime');
const {
    existingRoomRejoinEffectAuthorityEnabled,
    executeExistingRoomRejoin,
} = require('./server/existingRoomRejoin');
const GameSchemaWire = require('./js/gameSchemaWire');
const GameSchemaRecreateWire = require('./js/gameSchemaRecreateWire');
const OnlineReconnectState = require('./js/onlineReconnectState');
const makeGameSettings = require('./server/gameSettings');
const RLModelCatalog = require('./js/rlModelCatalog');
const makeGameStartPayload = require('./server/gameStartPayload');
const makeGameStartLifecycle = require('./server/gameStartLifecycle');
const makeGameStartCoordinator = require('./server/gameStartCoordinator');
const makeActionValidationGateway = require('./server/actionValidationGateway');
const {
    sanitizeName,
    isValidRoomId,
    generateRoomId: generateUniqueRoomId,
} = require('./server/roomValidation');
const {
    PUBLIC_ROOT_FILES,
    PUBLIC_STATIC_DIRS,
    resolveBuildHash,
    injectServiceWorkerBuildHash,
    injectIndexBuildHash,
    isPublicRootFile,
    makeStaticAssetHandlers,
    registerStaticMetadataRoutes,
    registerStaticContentRoutes,
} = require('./server/staticAssets');
const {
    findAcceptedClientAction,
    rememberAcceptedClientAction,
    acceptedClientActionRefs,
    makeRoomActionSequence,
} = require('./server/actionAcceptance');
const makeRejoinPayload = require('./server/rejoinPayload');
const makeRestoreAuditPayload = require('./server/restoreAuditPayload');
const makeRestoreAuditGateway = require('./server/restoreAuditGateway');
const {
    generateReconnectToken,
    hashReconnectToken,
    getExpectedReconnectTokenHash,
    resolveRejoinPlayer,
    isValidRestoreReconnectTokenHashes,
} = require('./server/reconnectIdentity')({ crypto });
const {
    HOSTLESS_RESTORE_GENERATION_FIELD,
    HOSTLESS_RESTORE_COUNT_FIELD,
    makeHostlessRestoreGateway,
} = require('./server/hostlessRestoreGateway');
const { HOSTLESS_RESTORE_LIMITS } = require('./server/hostlessRestoreCandidate');
const { createHostlessRestoreCoordinator } = require('./server/hostlessRestoreCoordinator');
const {
    createHostlessRestoreRuntime,
    hostlessRestoreEnabled,
} = require('./server/hostlessRestoreRuntime');
const makeHostlessRestoreDiagnostics = require('./server/hostlessRestoreDiagnostics');
const makeHostlessRestoreApproval = require('./server/hostlessRestoreApproval');
const {
    hostlessRestoreRoomLogId,
    hostlessRestoreDiagnostic,
} = makeHostlessRestoreDiagnostics({
    hashRoomId: roomId => crypto.createHash('sha256').update(roomId).digest('hex'),
});
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
const rejoinAdmission = makeRejoinAdmission({ limits: REJOIN_ADMISSION_LIMITS });

const app = express();
app.set('trust proxy', resolveTrustProxySetting(process.env));
const server = http.createServer(app);
const io = new Server(server, {
    allowRequest: makeSocketAllowRequest(process.env),
    maxHttpBufferSize: SOCKET_IO_MAX_HTTP_BUFFER_SIZE,
});
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
    originalPlayerIndexForGamePosition,
    canSocketSubmitCurrentAction,
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
    maxFullActionLogLength: RESTORE_PAYLOAD_LIMITS.maxActionLogEntries,
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
    maxHostlessRestoreAttempts: HOSTLESS_RESTORE_LIMITS.maxAttempts,
});
const {
    buildRestoredRoom,
    buildRestoredMirrorStatePlan,
    applyRestoredMirrorStatePlan,
    executeRestoredRoomMirrorPreparation,
    planRestoredRoomCompletion,
    executeRestoredRoomCompletion,
    planRestoredRoomMetadata,
    applyRestoredRoomMetadata,
    planRestoredRoomActivation,
    executeRestoredRoomActivation,
    activationEffectAuthorityEnabled: restoredRoomActivationEffectAuthorityEnabled,
    executeRestoredRoomDelivery,
    deliveryEffectAuthorityEnabled: restoredRoomDeliveryEffectAuthorityEnabled,
    activationDecisions: restoredRoomActivationDecisions,
} = makeRestoredRoom({
    sanitizeStateSnapshot: sanitizeClientStateSnapshot,
    serializeMirrorState,
    hostlessRestoreRoomLogId,
});
const RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED =
    restoredRoomActivationEffectAuthorityEnabled(process.env);
const RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED =
    restoredRoomDeliveryEffectAuthorityEnabled(process.env);
const { activateRestoredRoom } = makeRestoredRoomRuntime({
    planActivation: planRestoredRoomActivation,
    executeActivation: executeRestoredRoomActivation,
    activationDecisions: restoredRoomActivationDecisions,
    activationEffectAuthorityEnabled: RESTORED_ROOM_ACTIVATION_EFFECT_AUTHORITY_ENABLED,
    executeDelivery: executeRestoredRoomDelivery,
    deliveryEffectAuthorityEnabled: RESTORED_ROOM_DELIVERY_EFFECT_AUTHORITY_ENABLED,
    planCompletion: planRestoredRoomCompletion,
    executeCompletion: executeRestoredRoomCompletion,
});
const EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED =
    existingRoomRejoinEffectAuthorityEnabled(process.env);
const rooms = Object.create(null);
const {
    createCanonicalStateStoreFromEnv,
    buildCanonicalStateRecord,
    validateCanonicalStateRecord,
} = require('./server/canonicalStateStore');
const makeCanonicalStateRepository = require('./server/canonicalStateRepository');
const { makeCanonicalMirrorRuntime } = require('./server/canonicalMirrorRuntime');
const {
    validateRestoreAuditRecord,
    buildUnsignedRestoreAuditRecord,
    buildSignedRestoreAuditRecord,
    verifySignedRestoreAuditRecord,
} = require('./server/restoreAudit');
const { restoreAuditKeyringConfig } = require('./server/restoreAuditKeyring');
const makeRestoreAuditRuntime = require('./server/restoreAuditRuntime');
const makeRestoreSnapshotAttachment = require('./server/restoreSnapshotAttachment');
const makeRoomSocketRuntime = require('./server/roomSocketRuntime');
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
    isVerifiedRestoreActionAudit: (roomId, actionEntry) =>
        restoreAuditGateway.isVerifiedRestoreActionAudit(roomId, actionEntry),
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
    isActiveRoomSocket,
    isRoomHostConnected: isRoomHostConnectedForSockets,
    validateSocketCanEnterRoom,
    validateCreateRoomLifecycle,
    getRemainingConnectedPlayers: getRemainingConnectedRoomPlayers,
    setRoomHostPlayerIndex,
    roomHostChangedPayload: buildRoomHostChangedPayload,
} = require('./server/roomLifecycle')({
    limits: ROOM_LIFECYCLE_LIMITS,
    defaultRooms: rooms,
    isRoomConnected(room) {
        return Array.isArray(room.players) && room.players.some(player =>
            player && player.id && io.sockets.sockets.has(player.id)
        );
    },
});
const recreateAttemptAdmission = makeRecreateAttemptAdmission({
    windowMs: ROOM_LIFECYCLE_LIMITS.createRoomIpRateLimitWindowMs,
    max: ROOM_LIFECYCLE_LIMITS.createRoomIpRateLimitMax,
    maxBuckets: ROOM_LIFECYCLE_LIMITS.createRoomIpRateLimitMaxBuckets,
});
const {
    buildPlayerList: buildRoomPlayerList,
    countRoomHumanSlots: countRoomHumanSlotsForRoom,
    buildGameStartPlayerNames: buildGameStartPlayerNamesForRoom,
    shuffledPlayerOrder: shuffledRoomPlayerOrder,
    roomClientVersions: roomClientVersionsForSockets,
    roomReconnectTokenHashes: roomReconnectTokenHashesForRoom,
    roomHostlessRestoreCapabilities: roomHostlessRestoreCapabilitiesForSockets,
} = require('./server/roomProjection')({
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
const roomActionSequence = makeRoomActionSequence(restorePayloadRank);
const nextRoomActionSeq = room => {
    const actionSeq = roomActionSequence.planNext(room);
    roomActionSequence.commit(room, actionSeq);
    return actionSeq;
};
const {
    stableStateHash,
    canonicalMirrorStateHash,
    roomCanonicalMirrorMarker,
} = require('./server/canonicalMirrorMetadata')({
    serializeMirrorState,
    restorePayloadRank,
});
const {
    resetRoomCanonicalMirror,
    getRoomCanonicalMirror,
    markRoomCanonicalMirrorCurrent,
    applyAcceptedActionToRoomCanonicalMirror,
} = makeCanonicalMirrorRuntime({
    roomCanonicalMirrorMarker,
    canonicalMirrorStateHash,
    createRoomMirror,
    makeUndoStateFromMirror,
    applyActionToMirror,
    createCardByName: gameRuntime.createCardByName,
    now: Date.now,
    warn: (...args) => console.warn(...args),
});
const { validateGameAction } = makeActionValidationGateway({
    getRoomCanonicalMirror,
    canSocketSubmitCurrentAction,
    getAllowedActions,
    makeServerDiceActionData,
    validateActionPayloadForState,
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
const {
    validateSocketPayloadLimits,
    validateRestorePayloadLimits,
} = makeSocketPayloadValidation({
    isPlainObject,
    byteLength: value => Buffer.byteLength(value, 'utf8'),
    socketLimits: SOCKET_PAYLOAD_LIMITS,
    restoreLimits: RESTORE_PAYLOAD_LIMITS,
});


const clientErrorRateBuckets = new Map();
const clientErrorDedupeCache = new Map();
const gameLifecycleRateBuckets = new Map();
const gameLifecycleDedupeCache = new Map();
const canonicalStateStore = createCanonicalStateStoreFromEnv(process.env);
const {
    persistRoomCanonicalState,
    loadRoomCanonicalStateRecord,
} = makeCanonicalStateRepository({
    buildRecord: buildCanonicalStateRecord,
    validateRecord: validateCanonicalStateRecord,
    defaultStore: canonicalStateStore,
    now: Date.now,
    warn: (...args) => console.warn(...args),
});
const { markRoomGameStarted } = makeGameStartLifecycle({
    resetRoomCanonicalMirror,
    persistRoomCanonicalState,
});
const {
    restoreAuditConfig,
    restoreAuditSecret,
    restoreAuditBuildOptions,
    restoreAuditVerificationOptions,
} = makeRestoreAuditRuntime({
    getConfig: () => restoreAuditKeyringConfig(process.env),
    crypto,
});

const {
    truncateText,
    scrubClientErrorText,
    normalizeClientErrorNumber,
    normalizeClientErrorPlayerIndex,
    normalizeClientErrorPayload,
    clientErrorDedupeKey,
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
    hashClientErrorText: text => crypto.createHash('sha256').update(text).digest('hex'),
});
const {
    lifecycleEventTitle,
    normalizeGameLifecyclePayload,
    formatNtfyGameLifecycleMessage,
} = makeGameLifecycleReporting({
    truncateText,
});
const {
    notifyClientError,
    notifyGameLifecycle,
} = makeReportDelivery({
    postNotification: postNtfyNotification,
    resolveTopic: resolveNtfyTopic,
    classifyClientError: classifyClientErrorReport,
    formatClientError: formatNtfyClientErrorMessage,
    redactClientRoomId: redactedClientErrorRoomId,
    lifecycleTitle: lifecycleEventTitle,
    formatLifecycle: formatNtfyGameLifecycleMessage,
    defaultEnv: process.env,
    getDefaultFetch: () => global.fetch,
    warn: (...args) => console.warn(...args),
});

const {
    pruneRateBuckets: pruneClientErrorRateBuckets,
    isRateLimited: isClientErrorRateLimited,
    isDuplicate: isDuplicateClientError,
    rememberDuplicate: rememberDuplicateClientError,
} = makeReportAdmission({
    limits: CLIENT_ERROR_LIMITS,
    rateBuckets: clientErrorRateBuckets,
    dedupeCache: clientErrorDedupeCache,
    dedupeKey: clientErrorDedupeKey,
});
const {
    isRateLimited: isGameLifecycleRateLimited,
    isDuplicate: isDuplicateGameLifecycle,
    rememberDuplicate: rememberDuplicateGameLifecycle,
} = makeReportAdmission({
    limits: GAME_LIFECYCLE_LIMITS,
    rateBuckets: gameLifecycleRateBuckets,
    dedupeCache: gameLifecycleDedupeCache,
    dedupeKey: gameLifecycleDedupeKey,
});

const IS_MAIN_MODULE = /** @type {{main?: unknown}} */ (require).main === module;
const BUILD_HASH = IS_MAIN_MODULE ? resolveBuildHash() : (process.env.BUILD_HASH || 'test');
if (IS_MAIN_MODULE) {
    console.log(`Build hash: ${BUILD_HASH}`);
}

const {
    handleClientErrorRequest,
    buildClientErrorTestPayload,
    handleClientErrorTestRequest,
    handleClientErrorHealthRequest,
} = makeClientErrorGateway({
    authorizeRequest: authorizeClientErrorRequest,
    reportRateKey: clientReportRateKey,
    isRateLimited: isClientErrorRateLimited,
    normalizePayload: normalizeClientErrorPayload,
    isDuplicate: isDuplicateClientError,
    rememberDuplicate: rememberDuplicateClientError,
    notify: notifyClientError,
    isTestEnabled: isClientErrorTestEnabled,
    createTestPayload: createClientErrorTestPayload,
    healthSnapshot: clientErrorHealthSnapshot,
    defaultEnv: process.env,
    defaultBuildHash: BUILD_HASH,
    defaultRateBuckets: clientErrorRateBuckets,
    defaultDedupeCache: clientErrorDedupeCache,
    warn: (...args) => console.warn(...args),
});

const {
    handleGameLifecycleRequest,
} = makeGameLifecycleGateway({
    authorizeRequest: authorizeClientErrorRequest,
    reportRateKey: clientReportRateKey,
    isRateLimited: isGameLifecycleRateLimited,
    normalizePayload: normalizeGameLifecyclePayload,
    isDuplicate: isDuplicateGameLifecycle,
    rememberDuplicate: rememberDuplicateGameLifecycle,
    notify: notifyGameLifecycle,
    defaultEnv: process.env,
    defaultRateBuckets: gameLifecycleRateBuckets,
    defaultDedupeCache: gameLifecycleDedupeCache,
});

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
registerStaticMetadataRoutes({
    app,
    assetLinks: ASSET_LINKS,
    serviceWorkerContent: swContent,
    buildHash: BUILD_HASH,
});


registerReportingHttpRoutes({
    app,
    json: express.json,
    clientErrorJsonLimit: CLIENT_ERROR_LIMITS.maxJsonBytes,
    handleClientErrorRequest,
    handleClientErrorTestRequest,
    handleClientErrorHealthRequest,
    handleGameLifecycleRequest,
    warn: (...args) => console.warn(...args),
});


const {
    sendIndexWithBuildHash,
    sendPublicRootFile,
} = makeStaticAssetHandlers({
    indexContent,
    rootDirectory: __dirname,
    isPublicRootFile,
});

registerStaticContentRoutes({
    app,
    staticMiddleware: express.static,
    rootDirectory: __dirname,
    pathModule: path,
    rootFiles: PUBLIC_ROOT_FILES,
    staticDirs: PUBLIC_STATIC_DIRS,
    sendIndex: sendIndexWithBuildHash,
    sendRootFile: sendPublicRootFile,
});

// ===== Room lifecycle =====
const APP_ERROR_EVENT = 'appError';
const {
    emitAppError,
    requirePlainSocketPayload,
} = makeSocketPayloadGateway({
    validateSocketPayloadLimits,
    appErrorEvent: APP_ERROR_EVENT,
    invalidMessage: '無効なリクエストです',
});

const {
    roomHostChangedPayload,
    emitRoomHostChanged,
    detachExistingPlayerSocket,
    detachRoomSockets,
    isRoomHostConnected,
} = makeRoomSocketRuntime({
    defaultIo: io,
    emitAppError,
    buildRoomHostChangedPayload,
    isRoomHostConnectedForSockets,
});

function cpuDifficultyLabel(difficulty) {
    return makeGameSettings.cpuDifficultyLabel(difficulty);
}

const ALLOWED_CPU_DIFFICULTIES = new Set(['weak', 'normal', 'strong', 'expert', 'rl']);
const ALLOWED_RL_MODEL_IDS = new Set(RLModelCatalog.modelIds);

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

const {
    buildRestoreSnapshotAuditPayload,
    buildRestoreActionAuditPayload,
} = makeRestoreAuditPayload({
    normalizePlayerSettings,
    canonicalizeActionData,
    normalizeClientActionId,
});

const restoreAuditGateway = makeRestoreAuditGateway({
    buildSignedRestoreAuditRecord,
    verifySignedRestoreAuditRecord,
    buildRestoreSnapshotAuditPayload,
    buildRestoreActionAuditPayload,
    restoreAuditBuildOptions,
    restoreAuditVerificationOptions,
});

const {
    buildRestoreSnapshotAudit,
    isVerifiedClientRestoreSnapshot,
    buildRestoreActionAudit,
    isVerifiedRestoreActionAudit,
} = restoreAuditGateway;

function hasOwnRoom(roomId) {
    return isValidRoomId(roomId) && Object.prototype.hasOwnProperty.call(rooms, roomId);
}

function generateRoomId(existingRooms = rooms) {
    return generateUniqueRoomId(existingRooms);
}

const { buildWireRejoinDataPayload } = makeRejoinPayload({
    acceptedClientActionRefs,
    buildRestoreSnapshotAudit,
    encodeSnapshotField: GameSchemaWire.encodeSnapshotField,
    maxFullActionLogLength: RESTORE_PAYLOAD_LIMITS.maxActionLogEntries,
});

function buildRejoinDataPayload(room, playerIndex, overrides = {}) {
    return buildWireRejoinDataPayload(
        room,
        playerIndex,
        overrides,
        GAME_SCHEMA_SNAPSHOT_WIRE_ENABLED
    );
}

const { attachCompactedRestoreSnapshotToAction } = makeRestoreSnapshotAttachment({
    maxActionLogLength: MAX_ACTION_LOG_LENGTH,
    buildRestoreSnapshotAudit,
});

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

function logHostlessRestoreCoordinatorEvent(event) {
    console.log('[hostless-restore]', JSON.stringify(hostlessRestoreDiagnostic(event)));
}


const { approve: approveHostlessRestoreCandidate } = makeHostlessRestoreApproval({
    hasRoom: hasOwnRoom,
    recreateRoom: handleRecreateRoom,
    roomForId: roomId => rooms[roomId],
});

hostlessRestoreRuntime = createHostlessRestoreRuntime({
    io,
    coordinator: hostlessRestoreCoordinator,
    gateway: hostlessRestoreGateway,
    hasRoom: hasOwnRoom,
    approveCandidate: approveHostlessRestoreCandidate,
    enabled: hostlessRestoreEnabled(process.env),
    validateControlPayload: validateSocketPayloadLimits,
    startRateKeyForSocket: createRoomRateKeyForSocket,
    canStartForRateKey: canCreateRoomForRateKey,
    markStartForRateKey: markCreateRoomForRateKey,
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
startRoomGc({ cleanupExpiredRooms, rooms });

registerSocketConnectionRuntime({
    io,
    logger: console,
    hostlessRestore(socket) {
        hostlessRestoreRuntime.registerSocket(socket);
    },
    lobby(socket) {
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
    },
    action(socket) {
        registerActionSocketHandler(socket, {
            requirePlainSocketPayload,
            rooms,
            isActiveRoomSocket,
            emitAppError,
            normalizeClientActionId,
            findAcceptedClientAction,
            validateGameAction,
            canonicalizeActionData,
            planNextRoomActionSeq: roomActionSequence.planNext,
            commitRoomActionSeq: roomActionSequence.commit,
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
            resetRoomCanonicalMirror,
            rememberAcceptedClientAction,
            compactRoomActionLog,
            attachCompactedRestoreSnapshotToAction,
            markRoomCanonicalMirrorCurrent,
            persistRoomCanonicalState,
        });
    },
    rejoin(socket) {
        registerRejoinSocketHandler(socket, {
            requirePlainSocketPayload,
            isValidRoomId,
            validateSocketCanEnterRoom,
            emitAppError,
            rooms,
            getExpectedReconnectTokenHash,
            hashReconnectToken,
            detachExistingPlayerSocket,
            resolveRejoinPlayer,
            buildRejoinDataPayload,
            isRoomHostConnected,
            setRoomHostPlayerIndex,
            emitRoomHostChanged,
            persistRoomCanonicalState,
            resolveClientGameSchemaCapabilities: value => resolveClientGameSchemaCapabilities(value, GAME_SCHEMA_NEGOTIATION_ENABLED),
            supportsSelectedGameSchema: (capabilities, selected) => supportsSelectedGameSchemaForRuntime(
                capabilities, selected, GAME_SCHEMA_NEGOTIATION_ENABLED
            ),
            admitRejoin: (targetSocket, roomId, playerIndex) =>
                rejoinAdmission.admit(targetSocket, roomId, playerIndex),
            io,
        });
    },
    recreate(socket) {
        // サーバー再起動後にホストがルームを復元する
        registerRecreateSocketHandler(socket, {
            validateRawPayload(payload) {
                const raw = payload && payload.schemaVersion === 1 &&
                    payload.recreateRoom && typeof payload.recreateRoom === 'object'
                    ? payload.recreateRoom
                    : payload;
                return validateRestorePayloadLimits(raw).ok;
            },
            decodePayload: payload => GameSchemaRecreateWire.decode(
                GAME_SCHEMA_RECREATE_WIRE_ENABLED,
                payload
            ),
            isAttemptRateLimited: (targetSocket, requestedAt) =>
                recreateAttemptAdmission.isRateLimited(
                    createRoomRateKeyForSocket(targetSocket),
                    requestedAt
                ),
            emitAppError,
            handleRecreateRoom,
            hostRestored: roomId => hostlessRestoreRuntime.hostRestored(roomId),
        });
    },
    disconnect(socket) {
        disconnectSocketHandler.registerSocket(socket);
    },
});

const {
    planRestoreAdmission,
    planRestoreGameStartAdmission,
    planRestoreIdentityAdmission,
    planExistingRoomRestoreAdmission,
} = makeRestoreAdmission({
    isPlainObject,
    validateRestorePayloadLimits,
    isValidRoomId,
    hasOwnRoom,
    loadRoomCanonicalStateRecord,
    selectRestoreSource,
    validateRestoreAuditRecord,
    isVerifiedClientRestoreSnapshot,
    isValidGameStartPayload,
    hasInvalidOnlineRlModelSettings,
    normalizePlayerSettings,
    getExpectedReconnectTokenHash,
    hashReconnectToken,
    isValidRestoreReconnectTokenHashes,
    buildRestoredHumanPlayers,
    sanitizeRestoreActionLog,
    restoreAuditSecret,
    canReplaceRestoredRoom,
    isIncomingRestoreNewer,
    decideExistingRoomRestore,
});

const { planRestoreReplayAdmission } = makeRestoreReplayAdmission({
    sanitizeRestoreActionLog,
    restoreAuditSecret,
    restorePayloadRank,
});
const existingRoomRestoreRuntime = makeExistingRoomRestoreRuntime({
    planAdmission: planExistingRoomRestoreAdmission,
    emitAppError,
    effectAuthorityEnabled: EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED,
    executeRejoin: executeExistingRoomRejoin,
    detachExisting(input) {
        detachExistingPlayerSocket(input.room, input.roomId, input.playerIndex, input.socket.id);
    },
    resolvePlayer(input) {
        return resolveRejoinPlayer(
            input.room,
            input.playerIndex,
            input.playerName,
            input.reconnectToken,
            input.socket.id
        );
    },
    joinSocket(input) {
        input.socket.join(input.roomId);
    },
    isHostConnected(input) {
        return isRoomHostConnected(input.room);
    },
    setHostPlayer(input) {
        setRoomHostPlayerIndex(input.room, input.playerIndex);
    },
    emitHostChanged(input) {
        emitRoomHostChanged(input.roomId, input.room);
    },
    persistHostReselected(input) {
        persistRoomCanonicalState(input.roomId, input.room, 'host-reselected');
    },
    logHostReselected(input) {
        console.log(`ホスト再選出: ${input.roomId} → プレイヤー${input.room.hostPlayerIndex}`);
    },
    touchRoom(input) {
        input.room.lastTouchedAt = Date.now();
    },
    emitRejoinData(input) {
        input.socket.emit('rejoinData', buildRejoinDataPayload(input.room, input.playerIndex));
    },
    broadcastPlayerRejoined(input) {
        io.to(input.roomId).emit('playerRejoined', {
            playerIndex: input.playerIndex,
            playerName: input.playerName,
        });
    },
});

const { prepareRestoredRoom } = makeRestorePreparation({
    planGameStartAdmission: planRestoreGameStartAdmission,
    planIdentityAdmission: planRestoreIdentityAdmission,
    planReplayAdmission: planRestoreReplayAdmission,
    planRoomMetadata: planRestoredRoomMetadata,
    applyRoomMetadata: applyRestoredRoomMetadata,
    buildRoom: buildRestoredRoom,
    prepareMirror: executeRestoredRoomMirrorPreparation,
    rememberAcceptedAction: rememberAcceptedClientAction,
    createMirror: createRoomMirror,
    buildMirrorStatePlan: buildRestoredMirrorStatePlan,
    applyMirrorStatePlan: applyRestoredMirrorStatePlan,
    now: Date.now,
    hostlessRestoreGenerationField: HOSTLESS_RESTORE_GENERATION_FIELD,
    hostlessRestoreCountField: HOSTLESS_RESTORE_COUNT_FIELD,
});

const newRoomRestoreRuntime = makeNewRoomRestoreRuntime({
    prepareRoom: prepareRestoredRoom,
    activateRoom: activateRestoredRoom,
    emitAppError,
    roomExists: hasOwnRoom,
    detachExisting(context) {
        detachRoomSockets(context.roomId, rooms[context.roomId], 'ROOM_REPLACED');
    },
    deleteExisting(context) {
        delete rooms[context.roomId];
    },
    installRoom(context) {
        rooms[context.roomId] = context.restoredRoom;
    },
    persistRoom(context) {
        persistRoomCanonicalState(
            context.roomId,
            context.restoredRoom,
            'server-restart-restore'
        );
    },
    joinSocket(context) {
        context.socket.join(context.roomId);
    },
    emitRejoinData(context) {
        context.socket.emit(
            'rejoinData',
            buildRejoinDataPayload(context.restoredRoom, context.playerIndex, {
                gameStartPayload: context.gameStartPayload,
                stateSnapshot: context.restoredRoom.stateSnapshot,
                actionLog: context.restoredRoom.actionLog,
                hostPlayerIndex: context.playerIndex,
            })
        );
    },
    log(message) {
        console.log(message);
    },
});

const recreateRoomRuntime = makeRecreateRoomRuntime({
    planAdmission: planRestoreAdmission,
    emitAppError,
    hasRoom: hasOwnRoom,
    roomForId: roomId => rooms[roomId],
    validateCreateRoomLifecycle,
    rooms,
    markCreateRoomForSocket,
    createRoomRateKeyForSocket,
    markCreateRoomForRateKey,
    now: Date.now,
    existingRoomRuntime: existingRoomRestoreRuntime,
    newRoomRuntime: newRoomRestoreRuntime,
});

function handleRecreateRoom(socket, payload = {}, options = {}) {
    return recreateRoomRuntime.handle(socket, payload, options);
}

// ===== Snapshot limits and restore payload guards =====
function getRemainingConnectedPlayers(room, sockets, disconnectedSocketId) {
    return getRemainingConnectedRoomPlayers(room, sockets, disconnectedSocketId);
}

function rollServerDie() {
    return crypto.randomInt(1, 7);
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
    return roomHostlessRestoreCapabilitiesForSockets(
        ioInstance.sockets.sockets,
        room,
        playerNames
    );
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
const { checkGameStart } = makeGameStartCoordinator({
    rooms,
    countRoomHumanSlots,
    buildGameStartPayload,
    markRoomGameStarted,
    logGameStarted: (roomId, payload) => console.log(
        `ゲーム開始: ${roomId} プレイヤー: ${payload.playerNames.join(', ')}`
    ),
});




registerServerProcessHandlers({ processTarget: process, logger: console });

const PORT = /** @type {number} */ (process.env.PORT || 3000);
if (IS_MAIN_MODULE) {
    startHttpServer({ server, port: PORT, host: '0.0.0.0', logger: console });
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
    SOCKET_IO_MAX_HTTP_BUFFER_SIZE,
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
    socketRequestBaseOrigin,
    socketAllowedOrigins,
    isSocketOriginAllowed,
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
    rememberDuplicateClientError,
    rememberDuplicateGameLifecycle,
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
    handleClientErrorHealthRequest,
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
    resolveRejoinPlayer,
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
