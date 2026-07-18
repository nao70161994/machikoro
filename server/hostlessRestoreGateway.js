'use strict';

const {
    HOSTLESS_RESTORE_SCHEMA_VERSION,
    canonicalCandidateHash,
} = require('./hostlessRestoreCandidate');

const HOSTLESS_RESTORE_CAPABILITY_FIELD = 'hostlessRestoreCapabilities';
const HOSTLESS_RESTORE_GENERATION_FIELD = 'hostlessRestoreGeneration';
const HOSTLESS_RESTORE_COUNT_FIELD = 'hostlessRestoreCount';

function makeHostlessRestoreGateway(options = {}) {
    const {
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
    } = options;

    function failure(reason) {
        return Object.freeze({ ok: false, reason });
    }

    function normalizedCounter(value) {
        return Number.isInteger(value) && value >= 0 ? value : 0;
    }

    function humanPlayerIndices(gameStartPayload) {
        const playerNames = Array.isArray(gameStartPayload?.playerNames) ? gameStartPayload.playerNames : [];
        const settings = Array.isArray(gameStartPayload?.playerSettings) ? gameStartPayload.playerSettings : [];
        if (settings.length === 0) return playerNames.map((_, index) => index);
        return settings
            .map((setting, index) => setting?.type === 'cpu' ? null : index)
            .filter(Number.isInteger);
    }

    function supportsHostlessRestore(gameStartPayload) {
        const playerNames = Array.isArray(gameStartPayload?.playerNames) ? gameStartPayload.playerNames : [];
        const capabilities = gameStartPayload?.[HOSTLESS_RESTORE_CAPABILITY_FIELD];
        if (!Array.isArray(capabilities) || capabilities.length !== playerNames.length) return false;
        return humanPlayerIndices(gameStartPayload)
            .every(index => capabilities[index] === HOSTLESS_RESTORE_SCHEMA_VERSION);
    }

    function canonicalGameStartPayload(gameStartPayload) {
        const fields = [
            'schemaVersion',
            'enabledCards',
            'enabledLandmarks',
            'playerNames',
            'playerSettings',
            'cpuSpeed',
            'playerOrder',
            'hostPlayerIndex',
            'hostEpoch',
            'actionSeq',
            'versions',
            'reconnectTokenHashes',
            HOSTLESS_RESTORE_CAPABILITY_FIELD,
            HOSTLESS_RESTORE_GENERATION_FIELD,
            HOSTLESS_RESTORE_COUNT_FIELD,
        ];
        const canonical = {};
        for (const field of fields) {
            if (gameStartPayload[field] !== undefined) canonical[field] = gameStartPayload[field];
        }
        canonical[HOSTLESS_RESTORE_GENERATION_FIELD] = normalizedCounter(
            gameStartPayload[HOSTLESS_RESTORE_GENERATION_FIELD]
        );
        canonical[HOSTLESS_RESTORE_COUNT_FIELD] = normalizedCounter(
            gameStartPayload[HOSTLESS_RESTORE_COUNT_FIELD]
        );
        return canonical;
    }

    function validateRequest(payload = {}) {
        if (!isPlainObject(payload)) return failure('not-object');
        const sizeValidation = validateRestorePayloadLimits(payload);
        if (!sizeValidation?.ok) return failure('payload-limits');
        const { roomId, gameStartPayload, playerIndex, playerName, reconnectToken, capabilityVersion } = payload;
        if (!isValidRoomId(roomId)) return failure('room-id');
        if (!isPlainObject(gameStartPayload) || !Array.isArray(gameStartPayload.playerNames)) {
            return failure('game-start');
        }
        const playerCount = gameStartPayload.playerNames.length;
        if (!isValidGameStartPayload(gameStartPayload, playerCount)) return failure('game-start');
        if (hasInvalidOnlineRlModelSettings(gameStartPayload.playerSettings)) return failure('player-settings');
        if (capabilityVersion !== HOSTLESS_RESTORE_SCHEMA_VERSION ||
                !supportsHostlessRestore(gameStartPayload)) {
            return failure('unsupported-client');
        }
        if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerCount) {
            return failure('player-index');
        }
        if (gameStartPayload.hostPlayerIndex === playerIndex) return failure('original-host');
        const settings = normalizePlayerSettings(gameStartPayload.playerSettings, playerCount);
        if (settings[playerIndex]?.type === 'cpu') return failure('cpu-player');
        if (!isValidRestoreReconnectTokenHashes(gameStartPayload)) return failure('token-hashes');
        const expectedTokenHash = getExpectedReconnectTokenHash(
            { players: [], gameStartPayload },
            playerIndex,
            playerName
        );
        if (!expectedTokenHash || hashReconnectToken(reconnectToken) !== expectedTokenHash) {
            return failure('invalid-token');
        }
        return Object.freeze({
            ok: true,
            roomId,
            playerIndex,
            generation: normalizedCounter(gameStartPayload[HOSTLESS_RESTORE_GENERATION_FIELD]),
            attemptCount: normalizedCounter(gameStartPayload[HOSTLESS_RESTORE_COUNT_FIELD]),
        });
    }

    function prepareCandidate(socket, payload = {}) {
        if (!isPlainObject(payload)) return failure('not-object');
        const sizeValidation = validateRestorePayloadLimits(payload);
        if (!sizeValidation?.ok) return failure('payload-limits');
        const {
            roomId,
            gameStartPayload: rawGameStartPayload,
            stateSnapshot,
            actionLog,
            playerIndex,
            playerName,
            reconnectToken,
            capabilityVersion,
        } = payload;
        if (!isValidRoomId(roomId)) return failure('room-id');
        if (!isPlainObject(rawGameStartPayload) || !Array.isArray(rawGameStartPayload.playerNames)) {
            return failure('game-start');
        }
        const playerCount = rawGameStartPayload.playerNames.length;
        if (!isValidGameStartPayload(rawGameStartPayload, playerCount)) return failure('game-start');
        if (hasInvalidOnlineRlModelSettings(rawGameStartPayload.playerSettings)) return failure('player-settings');
        if (capabilityVersion !== HOSTLESS_RESTORE_SCHEMA_VERSION ||
                !supportsHostlessRestore(rawGameStartPayload)) {
            return failure('unsupported-client');
        }
        if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerCount) {
            return failure('player-index');
        }
        if (rawGameStartPayload.hostPlayerIndex === playerIndex) return failure('original-host');
        const settings = normalizePlayerSettings(rawGameStartPayload.playerSettings, playerCount);
        if (settings[playerIndex]?.type === 'cpu') return failure('cpu-player');
        const gameStartPayload = canonicalGameStartPayload(Object.assign({}, rawGameStartPayload, {
            playerSettings: settings,
        }));
        if (!isValidRestoreReconnectTokenHashes(gameStartPayload)) return failure('token-hashes');
        const expectedTokenHash = getExpectedReconnectTokenHash(
            { players: [], gameStartPayload },
            playerIndex,
            playerName
        );
        if (!expectedTokenHash || hashReconnectToken(reconnectToken) !== expectedTokenHash) {
            return failure('invalid-token');
        }
        const auditValidation = validateRestoreAuditRecord(payload.restoreAudit, { roomId });
        if (!auditValidation?.ok) return failure('restore-audit');
        const trustedSnapshot = stateSnapshot &&
            isVerifiedClientRestoreSnapshot(roomId, gameStartPayload, stateSnapshot, payload.restoreAudit)
            ? sanitizeClientStateSnapshot(stateSnapshot, playerCount)
            : null;
        const requireSignedActionAudit = !!restoreAuditSecret();
        const sanitizedActionLog = sanitizeRestoreActionLog(
            actionLog,
            roomId,
            trustedSnapshot,
            { requireSignedActionAudit }
        );
        if (!sanitizedActionLog) return failure('action-log');
        if (!trustedSnapshot && sanitizedActionLog.length === 0) return failure('empty-state');

        const rank = restorePayloadRank(gameStartPayload, trustedSnapshot, sanitizedActionLog);
        const replayRoom = {
            roomId,
            playerSettings: settings,
            maxPlayers: playerCount,
            gameStartPayload,
            stateSnapshot: trustedSnapshot,
            actionLog: sanitizedActionLog,
            hostPlayerIndex: gameStartPayload.hostPlayerIndex,
            hostEpoch: rank.hostEpoch,
            actionSeq: rank.actionSeq,
        };
        const mirror = createRoomMirror(replayRoom);
        if (!mirror) return failure('mirror-replay');
        const canonicalSnapshot = serializeMirrorState(
            mirror.game,
            mirror.shopStock,
            mirror.lastUndoState || null,
            rank.actionSeq
        );
        if (!canonicalSnapshot) return failure('canonical-snapshot');
        const generation = normalizedCounter(gameStartPayload[HOSTLESS_RESTORE_GENERATION_FIELD]);
        const attemptCount = normalizedCounter(gameStartPayload[HOSTLESS_RESTORE_COUNT_FIELD]);
        const completed = !!(mirror.game?.checkWinner && mirror.game.checkWinner());
        const canonicalPayload = {
            schemaVersion: HOSTLESS_RESTORE_SCHEMA_VERSION,
            gameStartPayload,
            stateSnapshot: canonicalSnapshot,
            rank,
            generation,
            attemptCount,
            completed,
        };
        const canonicalHash = canonicalCandidateHash(crypto, canonicalPayload);
        if (!canonicalHash) return failure('canonical-hash');
        return Object.freeze({
            ok: true,
            roomId,
            attemptCount,
            candidate: Object.freeze({
                playerIndex,
                playerType: 'human',
                socketId: socket?.id || '',
                capabilityVersion: HOSTLESS_RESTORE_SCHEMA_VERSION,
                generation,
                rank,
                canonicalHash,
                completed,
                payload: Object.freeze({
                    roomId,
                    gameStartPayload,
                    stateSnapshot: canonicalSnapshot,
                    actionLog: Object.freeze([]),
                    playerIndex,
                    playerName,
                    reconnectToken,
                }),
            }),
        });
    }

    return Object.freeze({
        supportsHostlessRestore,
        canonicalGameStartPayload,
        validateRequest,
        prepareCandidate,
    });
}

module.exports = Object.freeze({
    HOSTLESS_RESTORE_CAPABILITY_FIELD,
    HOSTLESS_RESTORE_GENERATION_FIELD,
    HOSTLESS_RESTORE_COUNT_FIELD,
    makeHostlessRestoreGateway,
});
