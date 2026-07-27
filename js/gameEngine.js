'use strict';

// Transitional shared execution boundary. GameManager remains mutable today; callers
// inject persistence/inventory adapters so this table can move behind a pure
// snapshot -> action -> snapshot API without duplicating action semantics again.
const GAME_ACTION_HANDLERS = Object.freeze({
    rollDice(context, data) {
        context.game.rollDice(data.forceDice, data.tunaDice);
        return true;
    },
    selectDice(context, data) {
        context.game.selectDiceCount(data.useTwo, data.d1, data.d2, data.tunaDice);
        return true;
    },
    skipReroll(context) {
        context.game.skipReroll();
        return true;
    },
    rerollDice(context, data) {
        context.game.rerollDice(data.forceDice, data.tunaDice);
        return true;
    },
    resolveHarbor(context, data) {
        return context.game.resolveHarbor(data.useBonus) !== false;
    },
    resolveTV(context, data) {
        return context.game.resolveTV(data.targetIndex) !== false;
    },
    resolveBusiness(context, data) {
        return context.game.resolveBusiness(data.myCard, data.targetIndex, data.theirCard) !== false;
    },
    resolveCleaning(context, data) {
        return context.game.resolveCleaning(data.cardName) !== false;
    },
    resolveMover(context, data) {
        return context.game.resolveMover(data.cardIndex ?? data.cardName, data.targetIndex) !== false;
    },
    resolveRenovation(context, data) {
        return context.game.resolveRenovation(data.landmarkName) !== false;
    },
    resolveIT(context, data) {
        return context.game.resolveIT(data.doSave) !== false;
    },
    buildCard(context, data) {
        if (typeof context.createCardByName !== 'function' ||
                typeof context.decrementShopStock !== 'function') return false;
        const card = context.createCardByName(data.cardName);
        if (!card || !context.game.buildCard(card)) return false;
        context.decrementShopStock(context.shopStock, card);
        return true;
    },
    buildLandmark(context, data) {
        return context.game.buildLandmark(data.name) !== false;
    },
    undoBuild(context, data) {
        if (typeof context.restoreUndoState !== 'function') return false;
        return context.restoreUndoState(data.state) !== false;
    },
    nextTurn(context) {
        return context.game.nextTurn() !== false;
    },
});

const GAME_ENGINE_HANDLED_ACTIONS = Object.freeze(Object.keys(GAME_ACTION_HANDLERS));
const GAME_ENGINE_TRANSITION_FAILURES = Object.freeze({
    INVALID_INPUT: 'invalid-input',
    INVALID_ADAPTER: 'invalid-adapter',
    HYDRATE_FAILED: 'hydrate-failed',
    ACTION_REJECTED: 'action-rejected',
    ACTION_FAILED: 'action-failed',
    SERIALIZE_FAILED: 'serialize-failed',
});

function cloneStateValue(value, seen = new WeakMap(), active = new WeakSet()) {
    if (value === null || typeof value !== 'object') return value;
    if (active.has(value)) throw new TypeError('cyclic state is not supported');
    if (seen.has(value)) return seen.get(value);
    const clone = Array.isArray(value) ? [] : {};
    seen.set(value, clone);
    active.add(value);
    for (const key of Object.keys(value)) {
        Object.defineProperty(clone, key, {
            value: cloneStateValue(value[key], seen, active),
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    active.delete(value);
    return clone;
}

/**
 * Applies one already-canonicalized action to the current mutable GameManager.
 * Validation and actor authority remain adapter responsibilities.
 *
 * @param {Object} context
 * @returns {boolean} whether the action was handled successfully
 */
function applyMutableAction(context) {
    if (!context || !context.game || !context.data ||
            typeof context.data !== 'object' || Array.isArray(context.data)) return false;
    const handler = GAME_ACTION_HANDLERS[context.action];
    if (!handler) return false;
    return handler(context, context.data);
}

/**
 * Runs the mutable engine against detached state and returns a detached snapshot.
 * This is the pure caller-facing seam used for shadow parity before live migration.
 *
 * @param {Object} request
 * @returns {{ok: boolean, reason: string, snapshot: Object|null}}
 */
function transitionSnapshot(request) {
    if (!request || !request.snapshot || typeof request.snapshot !== 'object' ||
            Array.isArray(request.snapshot) || !request.data ||
            typeof request.data !== 'object' || Array.isArray(request.data)) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.INVALID_INPUT, snapshot: null });
    }
    if (typeof request.hydrate !== 'function' || typeof request.serialize !== 'function') {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.INVALID_ADAPTER, snapshot: null });
    }

    let detachedSnapshot;
    let actionData;
    try {
        detachedSnapshot = cloneStateValue(request.snapshot);
        actionData = cloneStateValue(request.data);
    } catch (_) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.INVALID_INPUT, snapshot: null });
    }

    let runtime;
    try {
        runtime = request.hydrate(detachedSnapshot);
    } catch (_) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.HYDRATE_FAILED, snapshot: null });
    }
    if (!runtime || !runtime.game) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.HYDRATE_FAILED, snapshot: null });
    }

    let applied;
    try {
        applied = applyMutableAction(Object.assign({}, runtime, {
            action: request.action,
            data: actionData,
        }));
    } catch (_) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.ACTION_FAILED, snapshot: null });
    }
    if (!applied) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.ACTION_REJECTED, snapshot: null });
    }

    try {
        const snapshot = request.serialize(runtime);
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
            return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.SERIALIZE_FAILED, snapshot: null });
        }
        return Object.freeze({ ok: true, reason: '', snapshot: cloneStateValue(snapshot) });
    } catch (_) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.SERIALIZE_FAILED, snapshot: null });
    }
}

const GameEngine = Object.freeze({
    handledActions: GAME_ENGINE_HANDLED_ACTIONS,
    transitionFailureReasons: GAME_ENGINE_TRANSITION_FAILURES,
    transitionSnapshot,
    applyMutableAction,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameEngine;
if (typeof window !== 'undefined') window.GameEngine = GameEngine;
if (typeof globalThis !== 'undefined') globalThis.GameEngine = GameEngine;
