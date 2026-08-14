'use strict';

const LocalSaveRepositorySnapshot = typeof module !== 'undefined' && module.exports
    ? require('./gameSnapshot')
    : globalThis.GameSnapshot;

const LOCAL_SAVE_KEYS = Object.freeze({
    legacy: 'savedGame',
    versioned: 'savedGameV1',
    history: 'savedGameHistoryV1',
});
const MAX_PREVIOUS_SAVES = 2;

/**
 * @typedef {Object} LocalSaveStorage
 * @property {(key: string, fallback?: unknown) => unknown} get
 * @property {(key: string, value: unknown) => boolean} set
 * @property {(key: string) => void} remove
 */

/**
 * Creates a rollback-safe local-save adapter. The legacy key is always authoritative
 * for old clients; the v1 key is an optional shadow that newer clients may prefer.
 * @param {Object} options
 * @param {LocalSaveStorage} options.storage
 * @param {boolean} [options.versionedEnabled]
 * @param {Object} [options.snapshot]
 */
function createLocalSaveRepository(options) {
    if (!options || !options.storage ||
            typeof options.storage.get !== 'function' ||
            typeof options.storage.set !== 'function' ||
            typeof options.storage.remove !== 'function') {
        throw new TypeError('local save storage is required');
    }
    const storage = options.storage;
    const snapshot = options.snapshot || LocalSaveRepositorySnapshot;
    const versionedEnabled = options.versionedEnabled === true;

    function readHistoryEntries() {
        const raw = storage.get(LOCAL_SAVE_KEYS.history, null);
        if (typeof raw !== 'string' || !raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry === 'object' && entry.state)
                .slice(0, MAX_PREVIOUS_SAVES) : [];
        } catch (_) {
            return [];
        }
    }

    function rotateCurrentIntoHistory() {
        const current = decode(LOCAL_SAVE_KEYS.legacy);
        if (!current) return;
        const entries = [{ state: current.state }, ...readHistoryEntries()].slice(0, MAX_PREVIOUS_SAVES);
        storage.set(LOCAL_SAVE_KEYS.history, JSON.stringify(entries));
    }

    function save(state) {
        rotateCurrentIntoHistory();
        const legacyWritten = storage.set(LOCAL_SAVE_KEYS.legacy, JSON.stringify(state)) === true;
        let versionedWritten = false;
        if (legacyWritten && versionedEnabled) {
            const envelope = snapshot.createSnapshotEnvelope(state);
            versionedWritten = storage.set(
                LOCAL_SAVE_KEYS.versioned,
                JSON.stringify(envelope)
            ) === true;
        }
        if (versionedEnabled && !versionedWritten) storage.remove(LOCAL_SAVE_KEYS.versioned);
        return Object.freeze({ legacyWritten, versionedWritten });
    }

    function decode(key) {
        const raw = storage.get(key, null);
        if (typeof raw !== 'string' || raw.length === 0) return null;
        try {
            const decoded = snapshot.readLocalSaveState(JSON.parse(raw));
            return decoded.ok ? decoded : null;
        } catch (error) {
            return null;
        }
    }

    function read(validate, generationIndex = 0) {
        if (Number.isInteger(generationIndex) && generationIndex > 0) {
            const entry = readHistoryEntries()[generationIndex - 1];
            const state = entry && entry.state;
            if (!state || (typeof validate === 'function' && !validate(state))) return failedRead();
            return Object.freeze({ ok: true, state, schemaVersion: 0,
                sourceKey: LOCAL_SAVE_KEYS.history, legacy: true });
        }
        if (!storage.get(LOCAL_SAVE_KEYS.legacy, null)) return failedRead();
        const keys = versionedEnabled
            ? [LOCAL_SAVE_KEYS.versioned, LOCAL_SAVE_KEYS.legacy]
            : [LOCAL_SAVE_KEYS.legacy];
        for (const key of keys) {
            const decoded = decode(key);
            if (!decoded || (typeof validate === 'function' && !validate(decoded.state))) continue;
            return Object.freeze({
                ok: true,
                state: decoded.state,
                schemaVersion: decoded.schemaVersion,
                sourceKey: key,
                legacy: decoded.legacy,
            });
        }
        return failedRead();
    }

    function failedRead() {
        return Object.freeze({
            ok: false,
            state: null,
            schemaVersion: null,
            sourceKey: null,
            legacy: false,
        });
    }

    function remove() {
        storage.remove(LOCAL_SAVE_KEYS.legacy);
        storage.remove(LOCAL_SAVE_KEYS.versioned);
        storage.remove(LOCAL_SAVE_KEYS.history);
    }

    function exists() {
        return !!storage.get(LOCAL_SAVE_KEYS.legacy, null);
    }

    return Object.freeze({ save, read, readHistory: readHistoryEntries, remove, exists });
}

const LocalSaveRepository = Object.freeze({
    keys: LOCAL_SAVE_KEYS,
    create: createLocalSaveRepository,
});

if (typeof module !== 'undefined' && module.exports) module.exports = LocalSaveRepository;
if (typeof window !== 'undefined') window.LocalSaveRepository = LocalSaveRepository;
if (typeof globalThis !== 'undefined') globalThis.LocalSaveRepository = LocalSaveRepository;
