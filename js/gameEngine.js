'use strict';

const GameActionContractApi = typeof module !== 'undefined' && module.exports
    ? require('./actionContract')
    : globalThis.GameActionContract;
const GameSnapshotApi = typeof module !== 'undefined' && module.exports
    ? require('./gameSnapshot')
    : globalThis.GameSnapshot;
const GameSchemaCodecApi = typeof module !== 'undefined' && module.exports
    ? require('./gameSchemaCodec')
    : globalThis.GameSchemaCodec;

/**
 * @typedef {Object} GameEngineMutableContext
 * @property {Object} game Mutable GameManager-compatible runtime.
 * @property {string} action Canonical action name from the Action Contract.
 * @property {Record<string, *>} data Already-canonicalized action payload.
 * @property {Record<string, number>} [shopStock] Mutable inventory owned by the caller.
 * @property {function(string): (Object|null)} [createCardByName] Caller-owned card factory.
 * @property {function(Record<string, number>, Object): void} [decrementShopStock] Caller-owned inventory mutation.
 * @property {function(*): (boolean|void)} [restoreUndoState] Caller-owned undo restore policy.
 */

/**
 * @typedef {Object} GameEngineTransitionRuntime
 * @property {Object} game Detached mutable GameManager-compatible runtime.
 * @property {Record<string, number>} [shopStock] Detached caller-owned inventory.
 * @property {function(string): (Object|null)} [createCardByName]
 * @property {function(Record<string, number>, Object): void} [decrementShopStock]
 * @property {function(*): (boolean|void)} [restoreUndoState]
 * @property {*} [undoState] Caller-owned detached undo snapshot.
 */

/**
 * @typedef {Object} GameEngineTransitionRequest
 * @property {Object} snapshot Detached input snapshot.
 * @property {string} action Canonical action name.
 * @property {Record<string, *>} data Canonical action payload.
 * @property {function(Object): GameEngineTransitionRuntime} hydrate Caller-owned compatibility policy.
 * @property {function(GameEngineTransitionRuntime): Object} serialize Caller-owned output policy.
 */

/**
 * @typedef {Object} GameEngineEnvelopeTransitionRequest
 * @property {Object} snapshotEnvelope Legacy or versioned Snapshot envelope.
 * @property {Object} actionEnvelope Legacy or versioned Action envelope.
 * @property {Object} [selection] Negotiated independent Action/Snapshot versions.
 * @property {function(Object): GameEngineTransitionRuntime} hydrate
 * @property {function(GameEngineTransitionRuntime): Object} serialize
 */
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
    INVALID_ACTION_SCHEMA: 'invalid-action-schema',
    INVALID_SNAPSHOT_SCHEMA: 'invalid-snapshot-schema',
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
 * @param {GameEngineMutableContext} context
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
 * @param {GameEngineTransitionRequest} request
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

/**
 * Reads legacy/current envelopes; an optional negotiated selection fixes both input and output versions.
 * This remains a shadow-only migration seam; it is not used by live transport.
 *
 * @param {GameEngineEnvelopeTransitionRequest} request
 * @returns {Object}
 */
function transitionEnvelope(request) {
    if (!request || !GameActionContractApi || !GameSnapshotApi) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.INVALID_INPUT, snapshotEnvelope: null });
    }
    const selected = request.selection != null;
    if (selected && !GameSchemaCodecApi) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.INVALID_INPUT, snapshotEnvelope: null });
    }
    const snapshotRead = selected
        ? GameSchemaCodecApi.decodeSnapshot(request.selection, request.snapshotEnvelope)
        : GameSnapshotApi.readSnapshotEnvelope(request.snapshotEnvelope);
    if (!snapshotRead.ok) {
        return Object.freeze({
            ok: false,
            reason: GAME_ENGINE_TRANSITION_FAILURES.INVALID_SNAPSHOT_SCHEMA,
            snapshotEnvelope: null,
        });
    }
    const actionRead = selected
        ? GameSchemaCodecApi.decodeAction(request.selection, request.actionEnvelope)
        : GameActionContractApi.readActionEnvelope(request.actionEnvelope);
    if (!actionRead.ok) {
        return Object.freeze({
            ok: false,
            reason: GAME_ENGINE_TRANSITION_FAILURES.INVALID_ACTION_SCHEMA,
            snapshotEnvelope: null,
        });
    }
    const snapshot = selected ? snapshotRead.value : snapshotRead.snapshot;
    const action = selected ? actionRead.value.action : actionRead.action;
    const data = selected ? actionRead.value.data : actionRead.data;
    const transition = transitionSnapshot(Object.assign({}, request, { snapshot, action, data }));
    if (!transition.ok) {
        return Object.freeze({ ok: false, reason: transition.reason, snapshotEnvelope: null });
    }
    const encodedSnapshot = selected
        ? GameSchemaCodecApi.encodeSnapshot(request.selection, transition.snapshot)
        : { ok: true, value: GameSnapshotApi.createSnapshotEnvelope(transition.snapshot) };
    if (!encodedSnapshot.ok) {
        return Object.freeze({ ok: false, reason: GAME_ENGINE_TRANSITION_FAILURES.SERIALIZE_FAILED, snapshotEnvelope: null });
    }
    return Object.freeze({ ok: true, reason: '', snapshotEnvelope: encodedSnapshot.value });
}

const GameEngine = Object.freeze({
    handledActions: GAME_ENGINE_HANDLED_ACTIONS,
    transitionFailureReasons: GAME_ENGINE_TRANSITION_FAILURES,
    transitionSnapshot,
    transitionEnvelope,
    applyMutableAction,
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameEngine;
if (typeof window !== 'undefined') window.GameEngine = GameEngine;
if (typeof globalThis !== 'undefined') globalThis.GameEngine = GameEngine;
