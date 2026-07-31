'use strict';

const OnlineStorageClientStorageApi = typeof module !== 'undefined' && module.exports
    ? require('./clientStorage')
    : globalThis.ClientStorage;
const onlineStorageClientStorageFacade = OnlineStorageClientStorageApi.createFacade();

function maxRestoreActionSeq(gameStart, snapshot, actionLog, pendingAction) {
    const logSeq = Array.isArray(actionLog)
        ? actionLog.reduce((max, entry) => Number.isInteger(entry && entry.seq) ? Math.max(max, entry.seq) : max, 0)
        : 0;
    return Math.max(
        Number.isInteger(gameStart && gameStart.actionSeq) ? gameStart.actionSeq : 0,
        Number.isInteger(snapshot && snapshot.actionSeq) ? snapshot.actionSeq : 0,
        logSeq,
        Number.isInteger(pendingAction && pendingAction.seq) ? pendingAction.seq : 0
    );
}

function createOnlineStorageFacade(options = {}) {
    const storage = options.storage || onlineStorageClientStorageFacade.storage();
    const getCurrentRoomId = typeof options.getCurrentRoomId === 'function' ? options.getCurrentRoomId : () => '';
    const sessionKey = options.sessionKey || 'onlineSession';
    const storageKeys = options.storageKeys || Object.freeze({});
    const roomIndexKey = options.roomIndexKey || 'onlineRestoreRoomIndex';
    const roomIndexSchemaVersion = options.roomIndexSchemaVersion || 1;
    const roomKeySeparator = options.roomKeySeparator || ':room:';
    const restoreActionSeq = typeof options.maxRestoreActionSeq === 'function'
        ? options.maxRestoreActionSeq
        : maxRestoreActionSeq;
    const storageMissing = Symbol('onlineStorageMissing');

    function currentRoomId(roomId) {
        return typeof roomId === 'undefined' ? getCurrentRoomId() : roomId;
    }

    function normalizeRoomId(roomId) {
        return typeof roomId === 'string' ? roomId.trim().toUpperCase() : '';
    }

    function roomStorageKey(key, roomId = getCurrentRoomId()) {
        if (typeof key !== 'string' || key === '') return key;
        if (key.includes(roomKeySeparator)) return key;
        const normalizedRoomId = normalizeRoomId(roomId);
        if (!normalizedRoomId) return key;
        return `${key}${roomKeySeparator}${normalizedRoomId}`;
    }

    function roomStorageKeys(key, roomId = getCurrentRoomId()) {
        const scopedKey = roomStorageKey(key, roomId);
        return scopedKey === key ? [key] : [key, scopedKey];
    }

    function readStorageJson(key, fallback = null) {
        if (!storage) return fallback;
        try {
            const raw = storage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeStorageJson(key, value) {
        if (!storage) return;
        storage.setItem(key, JSON.stringify(value));
    }

    function removeStorageItem(key) {
        if (!storage) return;
        storage.removeItem(key);
    }

    function readRoomStorageJson(key, fallback = null, roomId = getCurrentRoomId()) {
        const scopedKey = roomStorageKey(key, roomId);
        if (scopedKey !== key) {
            const scopedValue = readStorageJson(scopedKey, storageMissing);
            if (scopedValue !== storageMissing) return scopedValue;
        }
        return readStorageJson(key, fallback);
    }

    function writeRoomStorageJson(key, value, roomId = getCurrentRoomId()) {
        const scopedKey = roomStorageKey(key, roomId);
        if (scopedKey !== key) writeStorageJson(scopedKey, value);
        refreshRestoreRoomIndex(roomId);
    }

    function removeRoomStorageItem(key, roomId = getCurrentRoomId()) {
        const scopedKey = roomStorageKey(key, roomId);
        if (scopedKey !== key) removeStorageItem(scopedKey);
        refreshRestoreRoomIndex(roomId);
    }

    function writeRestoreStorageJson(key, value, roomId = getCurrentRoomId()) {
        for (const storageKey of roomStorageKeys(key, roomId)) {
            writeStorageJson(storageKey, value);
        }
        refreshRestoreRoomIndex(roomId);
    }

    function removeRestoreStorageItem(key, roomId = getCurrentRoomId()) {
        for (const storageKey of roomStorageKeys(key, roomId)) {
            removeStorageItem(storageKey);
        }
        refreshRestoreRoomIndex(roomId);
    }

    function writeSessionStorageJson(value, roomId = getCurrentRoomId()) {
        writeStorageJson(sessionKey, value);
        const scopedKey = roomStorageKey(sessionKey, roomId);
        if (scopedKey !== sessionKey) writeStorageJson(scopedKey, value);
        refreshRestoreRoomIndex(roomId);
    }

    function removeSessionStorageItem(roomId = getCurrentRoomId()) {
        removeStorageItem(sessionKey);
        const scopedKey = roomStorageKey(sessionKey, roomId);
        if (scopedKey !== sessionKey) removeStorageItem(scopedKey);
        refreshRestoreRoomIndex(roomId);
    }

    function normalizeRestoreRoomIndexEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const roomId = normalizeRoomId(entry.roomId);
        if (!roomId) return null;
        return {
            schemaVersion: roomIndexSchemaVersion,
            roomId,
            updatedAt: Number.isInteger(entry.updatedAt) ? entry.updatedAt : 0,
            playerName: typeof entry.playerName === 'string' ? entry.playerName : '',
            playerIndex: Number.isInteger(entry.playerIndex) ? entry.playerIndex : null,
            actionSeq: Number.isInteger(entry.actionSeq) ? entry.actionSeq : 0,
            hasGameStart: entry.hasGameStart === true,
            hasActionLog: entry.hasActionLog === true,
            hasStateSnapshot: entry.hasStateSnapshot === true,
            hasPendingAction: entry.hasPendingAction === true,
            hasRestoreAudit: entry.hasRestoreAudit === true,
        };
    }

    function readRestoreRoomIndex() {
        const raw = readStorageJson(roomIndexKey, []);
        const entries = Array.isArray(raw) ? raw : [];
        const byRoom = new Map();
        for (const entry of entries) {
            const normalized = normalizeRestoreRoomIndexEntry(entry);
            if (!normalized) continue;
            const previous = byRoom.get(normalized.roomId);
            if (!previous || normalized.updatedAt >= previous.updatedAt) byRoom.set(normalized.roomId, normalized);
        }
        return Array.from(byRoom.values()).sort((a, b) => b.updatedAt - a.updatedAt || a.roomId.localeCompare(b.roomId));
    }

    function writeRestoreRoomIndex(entries) {
        const normalizedEntries = (Array.isArray(entries) ? entries : [])
            .map(normalizeRestoreRoomIndexEntry)
            .filter(Boolean)
            .sort((a, b) => b.updatedAt - a.updatedAt || a.roomId.localeCompare(b.roomId));
        writeStorageJson(roomIndexKey, normalizedEntries);
    }

    function readScopedStorageJson(key, roomId, fallback = null) {
        const scopedKey = roomStorageKey(key, roomId);
        if (scopedKey === key) return fallback;
        return readStorageJson(scopedKey, fallback);
    }

    function buildRestoreRoomIndexEntry(roomId, now = Date.now()) {
        const normalizedRoomId = normalizeRoomId(roomId);
        if (!normalizedRoomId) return null;
        const session = readScopedStorageJson(sessionKey, normalizedRoomId, null);
        const gameStart = readScopedStorageJson(storageKeys.gameStart, normalizedRoomId, null);
        const actionLog = readScopedStorageJson(storageKeys.actionLog, normalizedRoomId, null);
        const stateSnapshot = readScopedStorageJson(storageKeys.stateSnapshot, normalizedRoomId, null);
        const pendingAction = readScopedStorageJson(storageKeys.pendingAction, normalizedRoomId, null);
        const restoreAudit = readScopedStorageJson(storageKeys.restoreAudit, normalizedRoomId, null);
        const hasGameStart = !!gameStart;
        const hasActionLog = Array.isArray(actionLog);
        const hasStateSnapshot = !!stateSnapshot;
        const hasPendingAction = !!pendingAction;
        const hasRestoreAudit = !!restoreAudit;
        if (!session && !hasGameStart && !hasActionLog && !hasStateSnapshot && !hasPendingAction && !hasRestoreAudit) return null;
        return {
            schemaVersion: roomIndexSchemaVersion,
            roomId: normalizedRoomId,
            updatedAt: Number.isInteger(now) ? now : Date.now(),
            playerName: typeof session?.playerName === 'string' ? session.playerName : '',
            playerIndex: Number.isInteger(session?.playerIndex) ? session.playerIndex : null,
            actionSeq: restoreActionSeq(gameStart, stateSnapshot, actionLog, pendingAction),
            hasGameStart,
            hasActionLog,
            hasStateSnapshot,
            hasPendingAction,
            hasRestoreAudit,
        };
    }

    function refreshRestoreRoomIndex(roomId = getCurrentRoomId(), now = Date.now()) {
        const normalizedRoomId = normalizeRoomId(roomId);
        if (!normalizedRoomId) return [];
        const entries = readRestoreRoomIndex().filter(entry => entry.roomId !== normalizedRoomId);
        const entry = buildRestoreRoomIndexEntry(normalizedRoomId, now);
        if (entry) entries.unshift(entry);
        writeRestoreRoomIndex(entries);
        return readRestoreRoomIndex();
    }

    function removeRestoreRoomIndexEntry(roomId = getCurrentRoomId()) {
        const normalizedRoomId = normalizeRoomId(roomId);
        if (!normalizedRoomId) return readRestoreRoomIndex();
        const entries = readRestoreRoomIndex().filter(entry => entry.roomId !== normalizedRoomId);
        writeRestoreRoomIndex(entries);
        return entries;
    }

    function pruneRestoreRoomIndex() {
        const entries = readRestoreRoomIndex().filter(entry => buildRestoreRoomIndexEntry(entry.roomId));
        writeRestoreRoomIndex(entries);
        return entries;
    }

    return {
        normalizeRoomId,
        roomStorageKey,
        roomStorageKeys,
        readStorageJson,
        writeStorageJson,
        removeStorageItem,
        readRoomStorageJson,
        writeRoomStorageJson,
        removeRoomStorageItem,
        writeRestoreStorageJson,
        removeRestoreStorageItem,
        writeSessionStorageJson,
        removeSessionStorageItem,
        normalizeRestoreRoomIndexEntry,
        readRestoreRoomIndex,
        writeRestoreRoomIndex,
        readScopedStorageJson,
        buildRestoreRoomIndexEntry,
        refreshRestoreRoomIndex,
        removeRestoreRoomIndexEntry,
        pruneRestoreRoomIndex,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createOnlineStorageFacade, maxRestoreActionSeq };
}
if (typeof window !== 'undefined') {
    window.createOnlineStorageFacade = createOnlineStorageFacade;
}
if (typeof globalThis !== 'undefined') {
    globalThis.createOnlineStorageFacade = createOnlineStorageFacade;
}
