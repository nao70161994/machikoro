'use strict';

const ONLINE_RECONNECT_STATES = Object.freeze({
    IDLE: 'idle',
    CONNECTING: 'connecting',
    REJOINING: 'rejoining',
    RESTORING: 'restoring',
    REPLAYING: 'replaying',
    ACTIVE: 'active',
    FAILED: 'failed',
    COMPLETED: 'completed',
});

const ONLINE_RECONNECT_TRANSITIONS = Object.freeze({
    [ONLINE_RECONNECT_STATES.IDLE]: Object.freeze([
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.ACTIVE,
    ]),
    [ONLINE_RECONNECT_STATES.CONNECTING]: Object.freeze([
        ONLINE_RECONNECT_STATES.REJOINING,
        ONLINE_RECONNECT_STATES.FAILED,
        ONLINE_RECONNECT_STATES.IDLE,
    ]),
    [ONLINE_RECONNECT_STATES.REJOINING]: Object.freeze([
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.RESTORING,
        ONLINE_RECONNECT_STATES.REPLAYING,
        ONLINE_RECONNECT_STATES.ACTIVE,
        ONLINE_RECONNECT_STATES.FAILED,
        ONLINE_RECONNECT_STATES.IDLE,
    ]),
    [ONLINE_RECONNECT_STATES.RESTORING]: Object.freeze([
        ONLINE_RECONNECT_STATES.REJOINING,
        ONLINE_RECONNECT_STATES.REPLAYING,
        ONLINE_RECONNECT_STATES.ACTIVE,
        ONLINE_RECONNECT_STATES.FAILED,
    ]),
    [ONLINE_RECONNECT_STATES.REPLAYING]: Object.freeze([
        ONLINE_RECONNECT_STATES.REJOINING,
        ONLINE_RECONNECT_STATES.ACTIVE,
        ONLINE_RECONNECT_STATES.FAILED,
    ]),
    [ONLINE_RECONNECT_STATES.ACTIVE]: Object.freeze([
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.REJOINING,
        ONLINE_RECONNECT_STATES.COMPLETED,
        ONLINE_RECONNECT_STATES.IDLE,
    ]),
    [ONLINE_RECONNECT_STATES.FAILED]: Object.freeze([
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.IDLE,
    ]),
    [ONLINE_RECONNECT_STATES.COMPLETED]: Object.freeze([
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.IDLE,
    ]),
});

function isOnlineReconnectState(state) {
    return Object.values(ONLINE_RECONNECT_STATES).includes(state);
}

function canOnlineReconnectTransition(from, to) {
    if (!isOnlineReconnectState(from) || !isOnlineReconnectState(to)) return false;
    if (from === to) return true;
    return ONLINE_RECONNECT_TRANSITIONS[from].includes(to);
}

function deriveOnlineReconnectState(flags = {}) {
    if (flags.failed) return ONLINE_RECONNECT_STATES.FAILED;
    if (flags.completed) return ONLINE_RECONNECT_STATES.COMPLETED;
    if (flags.replaying) return ONLINE_RECONNECT_STATES.REPLAYING;
    if (flags.restoring) return ONLINE_RECONNECT_STATES.RESTORING;
    if (flags.rejoining) return ONLINE_RECONNECT_STATES.REJOINING;
    if (flags.connecting) return ONLINE_RECONNECT_STATES.CONNECTING;
    if (flags.active) return ONLINE_RECONNECT_STATES.ACTIVE;
    return ONLINE_RECONNECT_STATES.IDLE;
}

function createOnlineReconnectController(options = {}) {
    let state = isOnlineReconnectState(options.initialState)
        ? options.initialState
        : ONLINE_RECONNECT_STATES.IDLE;
    const historyLimit = Number.isSafeInteger(options.historyLimit) && options.historyLimit > 0
        ? options.historyLimit
        : 64;
    const history = [];
    let invalidTransitionCount = 0;

    function remember(from, to, metadata, valid) {
        history.push(Object.freeze({
            from,
            to,
            valid,
            event: typeof metadata?.event === 'string' ? metadata.event : '',
        }));
        if (history.length > historyLimit) history.splice(0, history.length - historyLimit);
    }

    function transition(to, metadata = {}) {
        if (!isOnlineReconnectState(to)) return { ok: false, reason: 'unknown-state', state };
        const from = state;
        const valid = canOnlineReconnectTransition(from, to);
        remember(from, to, metadata, valid);
        if (!valid) {
            invalidTransitionCount++;
            return { ok: false, reason: 'invalid-transition', from, to, state };
        }
        state = to;
        return { ok: true, from, to, state };
    }

    function reconcile(flags, metadata = {}) {
        const target = deriveOnlineReconnectState(flags);
        const from = state;
        if (from === target) return Object.freeze({ state, from, valid: true });
        const valid = canOnlineReconnectTransition(from, target);
        remember(from, target, metadata, valid);
        if (!valid) invalidTransitionCount++;
        state = target;
        return Object.freeze({ state, from, valid });
    }

    function snapshot() {
        return Object.freeze({
            state,
            invalidTransitionCount,
            history: Object.freeze(history.slice()),
        });
    }

    return Object.freeze({
        getState() { return state; },
        transition,
        reconcile,
        snapshot,
    });
}

const OnlineReconnectState = Object.freeze({
    states: ONLINE_RECONNECT_STATES,
    transitions: ONLINE_RECONNECT_TRANSITIONS,
    isState: isOnlineReconnectState,
    canTransition: canOnlineReconnectTransition,
    derive: deriveOnlineReconnectState,
    createController: createOnlineReconnectController,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnlineReconnectState;
}
