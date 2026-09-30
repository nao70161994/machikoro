'use strict';

const OnlineDiagnosticState = (() => {

    function createController(initialState = {}) {
        const state = Object.assign(Object.create(null), initialState);
        const keys = Object.freeze(Object.keys(state));
        const knownKeys = new Set(keys);
        const projection = {};

        function assertKnownKey(key) {
            if (!knownKeys.has(key)) {
                throw new Error(`Unknown online diagnostic key: ${key}`);
            }
        }

        keys.forEach(key => {
            Object.defineProperty(projection, key, {
                enumerable: true,
                get() {
                    return state[key];
                },
                set(value) {
                    state[key] = value;
                },
            });
        });

        return Object.freeze({
            keys,
            projection: Object.freeze(projection),
            read(key) {
                assertKnownKey(key);
                return state[key];
            },
            write(key, value) {
                assertKnownKey(key);
                state[key] = value;
                return value;
            },
            snapshot() {
                return Object.freeze(Object.assign({}, state));
            },
        });
    }

    function createOnlineDiagnosticController() {
        return createController({
            onlineGameEngineShadowOutcome: Object.freeze({
                report: null,
                authority: Object.freeze({ authority: 'mutable', reason: 'disabled' }),
            }),
            onlineReconnectCleanupEffectSelection: Object.freeze({
                source: 'none',
                ready: false,
                fallbackReason: '',
            }),
            onlineReconnectRequestPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            onlineReconnectRequestEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlineRestoreAbortPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            onlineRestoreAbortEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlineActionTimeoutPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            onlineActionTimeoutEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            incomingGameActionPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            acceptedGameActionPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            incomingGameActionDecodeEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            acceptedGameActionDecodeEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            incomingGameActionApplyEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            acceptedGameActionApplyEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            incomingGameActionGapEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            acceptedGameActionGapEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            incomingGameActionNoGameEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            acceptedGameActionNoGameEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            incomingGameActionCommitEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            acceptedGameActionCommitEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlineSocketConnectPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                fallbackReason: '',
            }),
            onlineSocketConnectEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlineSocketDisconnectPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                fallbackReason: '',
            }),
            onlineSocketDisconnectEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlineHostChangedPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                fallbackReason: '',
            }),
            onlineHostChangedEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            pendingReconciliationPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            rejoinActionLogPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            localHostRestoreOfferPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                matched: true,
                fallbackReason: '',
            }),
            onlineRejoinPersistencePlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                fallbackReason: '',
            }),
            onlineRejoinPersistenceEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlinePendingResendPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                fallbackReason: '',
            }),
            onlinePendingResendEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlineRestoreReplayPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                fallbackReason: '',
            }),
            onlineRestoreReplayEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
            onlineRestoreActivationPlanSelection: Object.freeze({
                plan: null,
                source: 'none',
                fallbackReason: '',
            }),
            onlineRestoreActivationEffectSelection: Object.freeze({
                source: 'none',
                fallbackReason: '',
            }),
        });
    }

    return Object.freeze({ createController, createOnlineDiagnosticController });
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnlineDiagnosticState;
}
