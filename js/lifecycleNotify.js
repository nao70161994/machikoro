'use strict';

const LifecycleNotify = (() => {
    const storageKeys = Object.freeze({
        notify: 'machikoroLifecycleNotifyEnabled',
        legacyNotify: 'machikoroLifecycleNotificationsEnabled',
        startSent: 'machikoroLifecycleStartSent',
    });

    function readNotificationValue(accessStorage) {
        return accessStorage(storage => {
            const value = storage.getItem(storageKeys.notify);
            if (value !== null) return value;
            return storage.getItem(storageKeys.legacyNotify);
        }, null);
    }

    function writeNotificationEnabled(accessStorage, enabled) {
        return accessStorage(storage => {
            storage.setItem(storageKeys.notify, enabled ? 'true' : 'false');
            storage.removeItem(storageKeys.legacyNotify);
        });
    }

    function readStartMarker(accessStorage) {
        return accessStorage(storage => storage.getItem(storageKeys.startSent), null);
    }

    function writeStartMarker(accessStorage, signature, timestamp) {
        return accessStorage(storage => {
            storage.setItem(storageKeys.startSent, serializeStartMarker(signature, timestamp));
        });
    }

    function clearStartMarker(accessStorage) {
        return accessStorage(storage => storage.removeItem(storageKeys.startSent));
    }

    function isDisabledValue(value) {
        return ['0', 'false', 'no', 'off', 'disabled'].includes(String(value || '').toLowerCase());
    }

    function cpuCount(cpuPlayers) {
        try {
            return Array.isArray(cpuPlayers) ? cpuPlayers.filter(Boolean).length : 0;
        } catch (_) {
            return 0;
        }
    }

    function playerCount(players, selectedCount) {
        try {
            if (Array.isArray(players)) return players.length;
            return Number(selectedCount) || 0;
        } catch (_) {
            return 0;
        }
    }

    function gameMode(isOnline) {
        return isOnline ? 'online' : 'local';
    }

    function appVersion(value) {
        return value ? value : '';
    }

    function lifecycleState(sessionId = '', startSent = false, finishSent = false) {
        return Object.freeze({
            sessionId,
            startSent: !!startSent,
            finishSent: !!finishSent,
        });
    }

    function ensureSessionState(state, sessionId) {
        if (state.sessionId) return state;
        return lifecycleState(sessionId, state.startSent, state.finishSent);
    }

    function lifecycleTransition(status, state, shouldSend, shouldRememberStart = false) {
        return Object.freeze({
            status,
            state,
            shouldSend,
            shouldRememberStart,
        });
    }

    function startTransition(state, recentlySent, sessionId) {
        if (state.startSent) {
            return lifecycleTransition('already-sent', state, false);
        }
        if (recentlySent) {
            return lifecycleTransition(
                'suppressed',
                lifecycleState(state.sessionId, true, state.finishSent),
                false
            );
        }
        return lifecycleTransition(
            'send',
            lifecycleState(sessionId, true, false),
            true,
            true
        );
    }

    function finishTransition(state) {
        if (state.finishSent) {
            return lifecycleTransition('already-sent', state, false);
        }
        return lifecycleTransition(
            'send',
            lifecycleState(state.sessionId, state.startSent, true),
            true
        );
    }

    function resetLifecycleState() {
        return lifecycleState();
    }

    function createController(initialState = lifecycleState()) {
        let state = lifecycleState(
            initialState && initialState.sessionId,
            initialState && initialState.startSent,
            initialState && initialState.finishSent
        );

        function snapshot() {
            return state;
        }

        function ensureSession(sessionId) {
            state = ensureSessionState(state, sessionId);
            return state;
        }

        function start(recentlySent, sessionId) {
            const transition = startTransition(state, recentlySent, sessionId);
            state = transition.state;
            return transition;
        }

        function finish() {
            const transition = finishTransition(state);
            state = transition.state;
            return transition;
        }

        function reset() {
            state = resetLifecycleState();
            return state;
        }

        return Object.freeze({ snapshot, ensureSession, start, finish, reset });
    }

    function startSignature(mode, playerCount, cpuCount) {
        return [mode, playerCount, cpuCount].join('|');
    }

    function notificationState(key, legacyKey, value) {
        return Object.freeze({
            key,
            legacyKey,
            value,
            enabled: !isDisabledValue(value),
            defaultEnabled: value === null,
        });
    }

    function createSessionId(now, randomValue) {
        const random = Number(randomValue).toString(36).slice(2, 10);
        return Number(now).toString(36) + '-' + random;
    }

    function isRecentStart(raw, signature, now, suppressMs) {
        try {
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            return !!(parsed &&
                parsed.signature === signature &&
                now - Number(parsed.timestamp || 0) < suppressMs);
        } catch (_) {
            return false;
        }
    }

    function serializeStartMarker(signature, timestamp) {
        return JSON.stringify({ signature, timestamp }).slice(0, 300);
    }

    function finishPayloadExtras(turn, winnerCpuDifficulty) {
        return Object.freeze({
            turn,
            winnerKind: winnerCpuDifficulty ? 'cpu' : 'human',
            winnerCpuDifficulty,
        });
    }

    function winnerCpuDifficulty(players, cpuPlayers, winner) {
        try {
            if (!Array.isArray(players) || !Array.isArray(cpuPlayers)) return '';
            const index = players.indexOf(winner);
            const cpu = index >= 0 ? cpuPlayers[index] : null;
            return cpu && cpu.difficulty ? String(cpu.difficulty) : '';
        } catch (_) {
            return '';
        }
    }

    function buildPayload(options) {
        const payload = {
            event: options.event,
            mode: options.mode,
            playerCount: options.playerCount,
            cpuCount: options.cpuCount,
            sessionId: options.sessionId,
            appVersion: options.appVersion,
        };
        if (options.turn !== undefined) payload.turn = options.turn;
        if (options.winnerKind) payload.winnerKind = options.winnerKind;
        if (options.winnerCpuDifficulty) payload.winnerCpuDifficulty = options.winnerCpuDifficulty;
        return payload;
    }

    return Object.freeze({
        storageKeys,
        readNotificationValue,
        writeNotificationEnabled,
        readStartMarker,
        writeStartMarker,
        clearStartMarker,
        isDisabledValue,
        cpuCount,
        playerCount,
        gameMode,
        appVersion,
        lifecycleState,
        ensureSessionState,
        startTransition,
        finishTransition,
        resetLifecycleState,
        createController,
        startSignature,
        notificationState,
        createSessionId,
        isRecentStart,
        serializeStartMarker,
        finishPayloadExtras,
        winnerCpuDifficulty,
        buildPayload,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LifecycleNotify;
if (typeof window !== 'undefined') window.LifecycleNotify = LifecycleNotify;
if (typeof globalThis !== 'undefined') globalThis.LifecycleNotify = LifecycleNotify;
