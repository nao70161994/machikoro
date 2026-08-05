'use strict';

const OnlineReconnectRuntime = (() => {
    function create(dependencies = {}) {
        const requiredFunctions = [
            'getLegacyReconnecting', 'getObservationFlags', 'getStatusText',
            'setLegacyReconnecting', 'setStatusText',
        ];
        for (const name of requiredFunctions) {
            if (typeof dependencies[name] !== 'function') {
                throw new TypeError(`online reconnect runtime dependency is required: ${name}`);
            }
        }
        if (!dependencies.statePolicy || !dependencies.retryPolicy) {
            throw new TypeError('online reconnect runtime policies are required');
        }
        const controller = dependencies.statePolicy.createController();
        const completion = dependencies.statePolicy.createCompletionController();
        const attempts = dependencies.retryPolicy.createRejoinAttemptController();
        const timer = dependencies.retryPolicy.createRejoinTimerController({
            setTimer: dependencies.setTimer,
            clearTimer: dependencies.clearTimer,
            now: dependencies.now,
        });

        function observationFlags() {
            return Object.assign({}, dependencies.getObservationFlags(), {
                failed: attempts.isExhausted(),
                completed: completion.isCompleted(),
            });
        }

        function rawSnapshot() {
            return controller.snapshot();
        }

        function authoritySelection(enabled) {
            return dependencies.statePolicy.selectAuthorityState(rawSnapshot(), {
                eventAuthorityEnabled: enabled === true,
            });
        }

        function effectSelection(legacyValue, enabled) {
            return dependencies.statePolicy.selectEffectAuthority(
                rawSnapshot(),
                legacyValue === true,
                { effectAuthorityEnabled: enabled === true }
            );
        }

        function applyEffectAuthority(legacyValue, enabled) {
            const selection = effectSelection(legacyValue, enabled);
            if (selection.reconnecting !== dependencies.getLegacyReconnecting()) {
                dependencies.setLegacyReconnecting(selection.reconnecting);
            }
            return selection;
        }

        function observe(event, options = {}) {
            const observation = controller.observe(event, observationFlags());
            applyEffectAuthority(
                dependencies.getLegacyReconnecting(),
                options.effectAuthorityEnabled === true
            );
            return observation;
        }

        function reconcile(metadata = {}) {
            return controller.reconcile(observationFlags(), metadata);
        }

        function getState(eventAuthorityEnabled) {
            reconcile({ event: 'runtime-observation' });
            return authoritySelection(eventAuthorityEnabled).state;
        }

        function inputBlocked(eventAuthorityEnabled) {
            if (eventAuthorityEnabled !== true) return dependencies.getLegacyReconnecting();
            getState(true);
            const selection = authoritySelection(true);
            return selection.source === 'event'
                ? dependencies.statePolicy.blocksInput(selection.state)
                : dependencies.getLegacyReconnecting();
        }

        function applyStatus(event, legacyMessage, enabled) {
            const selection = dependencies.statePolicy.selectStatusEffectAuthority(
                rawSnapshot(),
                event,
                legacyMessage,
                { statusEffectAuthorityEnabled: enabled === true }
            );
            dependencies.setStatusText(selection.message);
            return selection;
        }

        function applyLifecycleStatus(event, enabled) {
            if (enabled !== true) return null;
            return applyStatus(event, dependencies.getStatusText(), true);
        }

        function timerSelection(effectEnabled, timerEnabled) {
            const effect = effectSelection(dependencies.getLegacyReconnecting(), effectEnabled);
            const active = timerEnabled === true && effect.source === 'event';
            return Object.freeze({
                source: active ? 'event' : (timerEnabled === true ? 'legacy-fallback' : 'legacy'),
                ready: effect.ready,
                fallbackReason: effect.fallbackReason,
                pending: timer.hasPending(),
                deadline: timer.getDeadline(),
            });
        }

        function callbackSelection(effectEnabled, timerEnabled, callbackEnabled) {
            const selectedTimer = timerSelection(effectEnabled, timerEnabled);
            const active = callbackEnabled === true && selectedTimer.source === 'event';
            return Object.freeze({
                source: active ? 'event' : (callbackEnabled === true ? 'legacy-fallback' : 'legacy'),
                ready: selectedTimer.ready,
                fallbackReason: selectedTimer.fallbackReason,
            });
        }

        function cleanupSelection(legacyValue, enabled) {
            return dependencies.statePolicy.selectCleanupAuthority(
                rawSnapshot(),
                legacyValue === true,
                { cleanupAuthorityEnabled: enabled === true }
            );
        }

        return Object.freeze({
            attempts,
            completion,
            timer,
            rawSnapshot,
            observationFlags,
            observe,
            reconcile,
            getState,
            inputBlocked,
            authoritySelection,
            effectSelection,
            applyEffectAuthority,
            applyStatus,
            applyLifecycleStatus,
            timerSelection,
            callbackSelection,
            cleanupSelection,
        });
    }

    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineReconnectRuntime;
if (typeof window !== 'undefined') Object.assign(window, { OnlineReconnectRuntime });
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { OnlineReconnectRuntime });
