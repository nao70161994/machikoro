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

const OnlineReconnectState = Object.freeze({
    states: ONLINE_RECONNECT_STATES,
    transitions: ONLINE_RECONNECT_TRANSITIONS,
    isState: isOnlineReconnectState,
    canTransition: canOnlineReconnectTransition,
    derive: deriveOnlineReconnectState,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnlineReconnectState;
}
