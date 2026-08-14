'use strict';

const AppBackup = (() => {
    const SCHEMA_VERSION = 1;
    const MAX_TOTAL_CHARS = 2 * 1024 * 1024;
    const ALLOWED_KEYS = Object.freeze([
        'savedGame', 'savedGameV1', 'savedGameHistoryV1',
        'gameStats', 'cpuTournamentHistoryV1',
        'selectedCount', 'playerSettings', 'cpuSpeed',
        'tutorialEnabled', 'tutorialLevel',
        'accessibilityFontScale', 'accessibilityReducedMotion',
        'accessibilityHighContrast', 'accessibilityHaptics', 'soundVolume',
        'hapticTurnEnabled', 'hapticWinEnabled',
        'soundDiceEnabled', 'soundCoinEnabled', 'soundBuildEnabled', 'soundWinEnabled',
        'machikoroSetupPresetsV1',
    ]);
    const JSON_KEYS = new Set([
        'savedGame', 'savedGameV1', 'savedGameHistoryV1', 'gameStats',
        'cpuTournamentHistoryV1', 'playerSettings', 'machikoroSetupPresetsV1',
    ]);

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value) &&
            (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    }

    function buildEnvelope(input = {}) {
        const source = isPlainObject(input.data) ? input.data : {};
        const data = {};
        for (const key of ALLOWED_KEYS) {
            const value = source[key];
            if (typeof value === 'string' && value.length <= MAX_TOTAL_CHARS) data[key] = value;
        }
        return Object.freeze({
            schemaVersion: SCHEMA_VERSION,
            app: 'machikoro',
            createdAt: typeof input.createdAt === 'string' ? input.createdAt.slice(0, 40) : '',
            clientVersion: typeof input.clientVersion === 'string' ? input.clientVersion.slice(0, 80) : '',
            data: Object.freeze(data),
        });
    }

    function parseEnvelope(text) {
        if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TOTAL_CHARS) return null;
        let parsed;
        try { parsed = JSON.parse(text); } catch (_) { return null; }
        if (!isPlainObject(parsed) || parsed.schemaVersion !== SCHEMA_VERSION ||
                parsed.app !== 'machikoro' || !isPlainObject(parsed.data)) return null;
        const data = {};
        let total = 0;
        for (const [key, value] of Object.entries(parsed.data)) {
            if (!ALLOWED_KEYS.includes(key) || typeof value !== 'string') return null;
            total += value.length;
            if (total > MAX_TOTAL_CHARS) return null;
            if (JSON_KEYS.has(key)) {
                try { JSON.parse(value); } catch (_) { return null; }
            }
            data[key] = value;
        }
        return buildEnvelope({
            data,
            createdAt: parsed.createdAt,
            clientVersion: parsed.clientVersion,
        });
    }

    function collect(read) {
        const data = {};
        if (typeof read !== 'function') return data;
        for (const key of ALLOWED_KEYS) {
            const value = read(key);
            if (typeof value === 'string') data[key] = value;
        }
        return data;
    }

    function apply(envelope, write) {
        if (!envelope || !isPlainObject(envelope.data) || typeof write !== 'function') return false;
        for (const [key, value] of Object.entries(envelope.data)) {
            if (!ALLOWED_KEYS.includes(key) || typeof value !== 'string' || write(key, value) !== true) {
                return false;
            }
        }
        return true;
    }

    return Object.freeze({ ALLOWED_KEYS, JSON_KEYS, MAX_TOTAL_CHARS, SCHEMA_VERSION,
        apply, buildEnvelope, collect, parseEnvelope });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppBackup;
if (typeof window !== 'undefined') window.AppBackup = AppBackup;
if (typeof globalThis !== 'undefined') globalThis.AppBackup = AppBackup;
