'use strict';

const LifecycleRuntime = (() => {
    function create(options = {}) {
        const policy = options.policy;
        if (!policy || typeof policy.createController !== 'function') {
            throw new TypeError('lifecycle policy is required');
        }
        if (typeof options.storageAccess !== 'function') throw new TypeError('storageAccess is required');
        if (typeof options.gameSnapshot !== 'function') throw new TypeError('gameSnapshot is required');
        if (typeof options.onlineSnapshot !== 'function') throw new TypeError('onlineSnapshot is required');
        if (typeof options.setupSnapshot !== 'function') throw new TypeError('setupSnapshot is required');
        if (typeof options.sendTransport !== 'function') throw new TypeError('sendTransport is required');
        const checkpoint = typeof options.checkpoint === 'function' ? options.checkpoint : () => {};
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        const random = typeof options.random === 'function' ? options.random : () => Math.random();
        const getFetch = typeof options.getFetch === 'function' ? options.getFetch : () => null;
        const getAppVersion = typeof options.getAppVersion === 'function' ? options.getAppVersion : () => '';
        const endpoint = options.endpoint || '/api/game-lifecycle';
        const suppressMs = Number(options.startSuppressMs) || 60 * 1000;
        const controller = policy.createController();

        function readNotificationValue() {
            return policy.readNotificationValue(options.storageAccess);
        }

        function isNotificationEnabled() {
            return !policy.isDisabledValue(readNotificationValue());
        }

        function setNotificationEnabled(enabled) {
            policy.writeNotificationEnabled(options.storageAccess, enabled);
            return isNotificationEnabled();
        }

        function notificationState() {
            return policy.notificationState(
                policy.storageKeys.notify,
                policy.storageKeys.legacyNotify,
                readNotificationValue()
            );
        }

        function gameFacts() {
            let gameState = {};
            let onlineState = {};
            let setupState = {};
            try { gameState = options.gameSnapshot() || {}; } catch (_) {}
            try { onlineState = options.onlineSnapshot() || {}; } catch (_) {}
            try { setupState = options.setupSnapshot() || {}; } catch (_) {}
            const game = gameState.game || null;
            return Object.freeze({
                appVersion: policy.appVersion(getAppVersion()),
                cpuCount: policy.cpuCount(gameState.cpuPlayers),
                cpuPlayers: Array.isArray(gameState.cpuPlayers) ? gameState.cpuPlayers : [],
                game,
                mode: policy.gameMode(onlineState.isOnlineGame),
                playerCount: policy.playerCount(game && game.players, setupState.selectedCount),
            });
        }

        function createSessionId() {
            return policy.createSessionId(now(), random());
        }

        function startSignature() {
            const facts = gameFacts();
            return policy.startSignature(facts.mode, facts.playerCount, facts.cpuCount);
        }

        function buildPayload(event, extra = {}) {
            const facts = gameFacts();
            const state = controller.snapshot();
            const session = controller.ensureSession(state.sessionId || createSessionId());
            return policy.buildPayload({
                event,
                mode: facts.mode,
                playerCount: facts.playerCount,
                cpuCount: facts.cpuCount,
                sessionId: session.sessionId,
                appVersion: facts.appVersion,
                turn: extra.turn,
                winnerKind: extra.winnerKind,
                winnerCpuDifficulty: extra.winnerCpuDifficulty,
            });
        }

        function send(event, extra = {}) {
            return options.sendTransport({
                enabled: isNotificationEnabled(),
                fetchImpl: getFetch(),
                endpoint,
                event,
                buildPayload: () => buildPayload(event, extra),
                checkpoint,
            });
        }

        function notifyStart() {
            const state = controller.snapshot();
            if (state.startSent) return false;
            const signature = startSignature();
            const timestamp = now();
            const recentlySent = policy.isRecentStart(
                policy.readStartMarker(options.storageAccess),
                signature,
                timestamp,
                suppressMs
            );
            const transition = controller.start(
                recentlySent,
                recentlySent ? state.sessionId : createSessionId()
            );
            if (transition.status === 'suppressed') {
                checkpoint('game-lifecycle-start-suppressed', { signature });
                return false;
            }
            if (!transition.shouldSend) return false;
            if (transition.shouldRememberStart) {
                policy.writeStartMarker(options.storageAccess, signature, timestamp);
            }
            return send('play-start');
        }

        function notifyFinish(winner) {
            const transition = controller.finish();
            if (!transition.shouldSend) return false;
            const facts = gameFacts();
            const difficulty = policy.winnerCpuDifficulty(
                facts.game && facts.game.players,
                facts.cpuPlayers,
                winner
            );
            return send('play-finish', policy.finishPayloadExtras(
                facts.game && facts.game.turnCount || 0,
                difficulty
            ));
        }

        function reset(reason = 'game-restart') {
            controller.reset();
            policy.clearStartMarker(options.storageAccess);
            checkpoint(reason, { lifecycle: 'reset' });
        }

        return Object.freeze({
            buildPayload,
            isNotificationEnabled,
            notificationState,
            notifyFinish,
            notifyStart,
            reset,
            send,
            setNotificationEnabled,
        });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LifecycleRuntime;
if (typeof window !== 'undefined') window.LifecycleRuntime = LifecycleRuntime;
if (typeof globalThis !== 'undefined') globalThis.LifecycleRuntime = LifecycleRuntime;
