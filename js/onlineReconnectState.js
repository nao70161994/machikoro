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

const ONLINE_RECONNECT_EVENTS = Object.freeze({
    RECONNECT_REQUESTED: 'reconnect-requested',
    SOCKET_DISCONNECTED: 'socket-disconnected',
    RESTORE_STARTED: 'restore-started',
    REPLAY_STARTED: 'replay-started',
    RESTORE_ACTIVATED: 'restore-activated',
    RETRY_EXHAUSTED: 'retry-exhausted',
    GAME_COMPLETED: 'game-completed',
    RESET: 'reset',
});
/**
 * @typedef {Object} OnlineReconnectFlags
 * @property {boolean} [failed]
 * @property {boolean} [completed]
 * @property {boolean} [replaying]
 * @property {boolean} [restoring]
 * @property {boolean} [rejoining]
 * @property {boolean} [connecting]
 * @property {boolean} [active]
 */

/**
 * @typedef {Object} OnlineReconnectHistoryEntry
 * @property {string} from
 * @property {string} to
 * @property {boolean} valid
 * @property {string} event
 * @property {boolean|null} projectionMatched
 */

/**
 * @typedef {Object} OnlineReconnectController
 * @property {function(): string} getState
 * @property {function(string, Object=): Object} transition
 * @property {function(OnlineReconnectFlags, Object=): Object} reconcile
 * @property {function(string, OnlineReconnectFlags): Object} observe
 * @property {function(): {state: string, invalidTransitionCount: number, projectionMismatchCount: number, lastProjectionMismatch: Object|null, history: Array<OnlineReconnectHistoryEntry>}} snapshot
 */


const ONLINE_RECONNECT_TRANSITIONS = Object.freeze({
    [ONLINE_RECONNECT_STATES.IDLE]: Object.freeze([
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.ACTIVE,
        ONLINE_RECONNECT_STATES.REJOINING,
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
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.REJOINING,
        ONLINE_RECONNECT_STATES.REPLAYING,
        ONLINE_RECONNECT_STATES.ACTIVE,
        ONLINE_RECONNECT_STATES.FAILED,
        ONLINE_RECONNECT_STATES.IDLE,
    ]),
    [ONLINE_RECONNECT_STATES.REPLAYING]: Object.freeze([
        ONLINE_RECONNECT_STATES.CONNECTING,
        ONLINE_RECONNECT_STATES.REJOINING,
        ONLINE_RECONNECT_STATES.ACTIVE,
        ONLINE_RECONNECT_STATES.FAILED,
        ONLINE_RECONNECT_STATES.IDLE,
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

function isOnlineReconnectEvent(event) {
    return Object.values(ONLINE_RECONNECT_EVENTS).includes(event);
}

function canOnlineReconnectTransition(from, to) {
    if (!isOnlineReconnectState(from) || !isOnlineReconnectState(to)) return false;
    if (from === to) return true;
    return ONLINE_RECONNECT_TRANSITIONS[from].includes(to);
}

function onlineReconnectEventTarget(event, context = {}) {
    switch (event) {
        case ONLINE_RECONNECT_EVENTS.RECONNECT_REQUESTED:
            return context.socketConnected === true
                ? ONLINE_RECONNECT_STATES.REJOINING
                : ONLINE_RECONNECT_STATES.CONNECTING;
        case ONLINE_RECONNECT_EVENTS.SOCKET_DISCONNECTED:
            return ONLINE_RECONNECT_STATES.CONNECTING;
        case ONLINE_RECONNECT_EVENTS.RESTORE_STARTED:
            return ONLINE_RECONNECT_STATES.RESTORING;
        case ONLINE_RECONNECT_EVENTS.REPLAY_STARTED:
            return ONLINE_RECONNECT_STATES.REPLAYING;
        case ONLINE_RECONNECT_EVENTS.RESTORE_ACTIVATED:
            return ONLINE_RECONNECT_STATES.ACTIVE;
        case ONLINE_RECONNECT_EVENTS.RETRY_EXHAUSTED:
            return ONLINE_RECONNECT_STATES.FAILED;
        case ONLINE_RECONNECT_EVENTS.GAME_COMPLETED:
            return ONLINE_RECONNECT_STATES.COMPLETED;
        case ONLINE_RECONNECT_EVENTS.RESET:
            return ONLINE_RECONNECT_STATES.IDLE;
        default:
            return null;
    }
}

/**
 * Pure event reducer for a future authority cutover. It does not run effects or mutate a controller.
 * @param {string} state
 * @param {string} event
 * @param {{socketConnected?: boolean}} [context]
 * @returns {Object}
 */
function reduceOnlineReconnectEvent(state, event, context = {}) {
    if (!isOnlineReconnectState(state)) {
        return Object.freeze({ ok: false, reason: 'unknown-state', state });
    }
    if (!isOnlineReconnectEvent(event)) {
        return Object.freeze({ ok: false, reason: 'unknown-event', state });
    }
    const target = onlineReconnectEventTarget(event, context);
    if (!canOnlineReconnectTransition(state, target)) {
        return Object.freeze({
            ok: false,
            reason: 'invalid-transition',
            state,
            event,
            target,
        });
    }
    return Object.freeze({ ok: true, state: target, from: state, event });
}

/**
 * Projects existing runtime booleans without claiming timer or callback authority.
 * @param {OnlineReconnectFlags} [flags]
 * @returns {string}
 */
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

/**
 * Compares the state implied by a lifecycle event with the legacy boolean projection.
 * This is diagnostic-only and does not authorize a transition or run effects.
 * @param {string} event
 * @param {OnlineReconnectFlags} [flags]
 * @returns {Object}
 */
function compareOnlineReconnectEventProjection(event, flags = {}) {
    if (!isOnlineReconnectEvent(event)) {
        return Object.freeze({
            ok: false,
            reason: 'unknown-event',
            projectedState: deriveOnlineReconnectState(flags),
        });
    }
    const projectedState = deriveOnlineReconnectState(flags);
    const eventState = onlineReconnectEventTarget(event, {
        socketConnected: flags.rejoining === true,
    });
    return Object.freeze({
        ok: true,
        event,
        eventState,
        projectedState,
        matched: eventState === projectedState,
    });
}

/**
 * Creates a bounded diagnostic shadow controller.
 * @param {{initialState?: string, historyLimit?: number}} [options]
 * @returns {OnlineReconnectController}
 */
function createOnlineReconnectController(options = {}) {
    let state = isOnlineReconnectState(options.initialState)
        ? options.initialState
        : ONLINE_RECONNECT_STATES.IDLE;
    const historyLimit = Number.isSafeInteger(options.historyLimit) && options.historyLimit > 0
        ? options.historyLimit
        : 64;
    const history = [];
    let invalidTransitionCount = 0;
    let projectionMismatchCount = 0;
    let lastProjectionMismatch = null;

    function remember(from, to, metadata, valid) {
        history.push(Object.freeze({
            from,
            to,
            valid,
            event: typeof metadata?.event === 'string' ? metadata.event : '',
            projectionMatched: typeof metadata?.projectionMatched === 'boolean'
                ? metadata.projectionMatched
                : null,
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

    /**
     * @param {OnlineReconnectFlags} flags
     * @param {Object} [metadata]
     */
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

    /**
     * @param {string} event
     * @param {OnlineReconnectFlags} flags
     */
    function observe(event, flags) {
        if (!isOnlineReconnectEvent(event)) {
            return Object.freeze({ ok: false, reason: 'unknown-event', state });
        }
        const comparison = compareOnlineReconnectEventProjection(event, flags);
        const target = comparison.projectedState;
        const from = state;
        if (!comparison.matched) {
            projectionMismatchCount++;
            lastProjectionMismatch = Object.freeze({
                event,
                eventState: comparison.eventState,
                projectedState: comparison.projectedState,
            });
        }
        const metadata = { event, projectionMatched: comparison.matched };
        if (from === target) {
            remember(from, target, metadata, true);
            return Object.freeze({
                ok: true,
                event,
                state,
                from,
                valid: true,
                projectionMatched: comparison.matched,
            });
        }
        const observed = reconcile(flags, metadata);
        return Object.freeze({
            ok: true,
            event,
            state: observed.state,
            from: observed.from,
            valid: observed.valid,
            projectionMatched: comparison.matched,
        });
    }

    function snapshot() {
        return Object.freeze({
            state,
            invalidTransitionCount,
            projectionMismatchCount,
            lastProjectionMismatch,
            history: Object.freeze(history.slice()),
        });
    }

    return Object.freeze({
        getState() { return state; },
        transition,
        reconcile,
        observe,
        snapshot,
    });
}

const OnlineReconnectState = Object.freeze({
    states: ONLINE_RECONNECT_STATES,
    events: ONLINE_RECONNECT_EVENTS,
    transitions: ONLINE_RECONNECT_TRANSITIONS,
    isState: isOnlineReconnectState,
    isEvent: isOnlineReconnectEvent,
    canTransition: canOnlineReconnectTransition,
    eventTarget: onlineReconnectEventTarget,
    reduceEvent: reduceOnlineReconnectEvent,
    derive: deriveOnlineReconnectState,
    compareEventProjection: compareOnlineReconnectEventProjection,
    createController: createOnlineReconnectController,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnlineReconnectState;
}
