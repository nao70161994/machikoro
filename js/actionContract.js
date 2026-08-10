'use strict';

const ACTION_SCHEMA_VERSION = 1;
const ACTION_SCHEMA_LEGACY_VERSION = 0;
const ACTION_CONTRACT_PHASES = Object.freeze({
    ROLL: 'roll',
    SELECT_DICE: 'selectDice',
    REROLL_CONFIRM: 'rerollConfirm',
    HARBOR_CHOICE: 'harborChoice',
    PENDING: 'pending',
    BUILD: 'build',
});
const ACTION_CONTRACT_ACTIONS = Object.freeze({
    ROLL_DICE: 'rollDice',
    SELECT_DICE: 'selectDice',
    REROLL_DICE: 'rerollDice',
    SKIP_REROLL: 'skipReroll',
    RESOLVE_HARBOR: 'resolveHarbor',
    RESOLVE_TV: 'resolveTV',
    RESOLVE_BUSINESS: 'resolveBusiness',
    RESOLVE_CLEANING: 'resolveCleaning',
    RESOLVE_MOVER: 'resolveMover',
    RESOLVE_RENOVATION: 'resolveRenovation',
    RESOLVE_IT: 'resolveIT',
    BUILD_CARD: 'buildCard',
    BUILD_LANDMARK: 'buildLandmark',
    UNDO_BUILD: 'undoBuild',
    NEXT_TURN: 'nextTurn',
});
const ACTION_ACTOR_AUTHORITY = Object.freeze({
    CURRENT_PLAYER_OR_HOST_CPU: 'current-player-or-host-cpu',
});

/** @typedef {Record<string, *>} GameActionData */
/**
 * @typedef {Object} GameActionEnvelope
 * @property {number} [schemaVersion]
 * @property {string} action
 * @property {GameActionData} data
 */
/**
 * @typedef {Object} GameActionReadResult
 * @property {boolean} ok
 * @property {number|null} schemaVersion
 * @property {string|null} action
 * @property {GameActionData|null} data
 * @property {boolean} legacy
 */

function actionEntry(action, phase, payloadKind, canonicalPayloadKeys, ui, phaseOrder = 0, canonicalPayloadVariants = null) {
    const variants = canonicalPayloadVariants || [canonicalPayloadKeys];
    return Object.freeze({
        action,
        phase,
        phaseOrder,
        actorAuthority: ACTION_ACTOR_AUTHORITY.CURRENT_PLAYER_OR_HOST_CPU,
        payloadKind,
        canonicalPayloadKeys: Object.freeze(canonicalPayloadKeys),
        canonicalPayloadVariants: Object.freeze(variants.map(keys => Object.freeze(Array.from(keys)))),
        serverPayload: true,
        serverReplay: true,
        restoreReplay: true,
        clientApply: true,
        ui: Object.freeze(ui),
    });
}

const ACTION_CONTRACT_ENTRIES = Object.freeze([
    actionEntry('rollDice', 'roll', 'rollDice', ['forceDice', 'tunaDice'], { group: 'roll', targetId: 'btnRoll', targetSource: 'actionButtons', requiresContent: false }, 0, [['forceDice', 'tunaDice'], ['forceDice']]),
    actionEntry('selectDice', 'selectDice', 'selectDice', ['useTwo', 'diceCount', 'd1', 'd2', 'tunaDice'], { group: 'selectDice', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['selectDiceCount'] }, 0, [
        ['useTwo', 'diceCount', 'd1', 'd2', 'tunaDice'],
        ['useTwo', 'diceCount', 'd1', 'd2'],
        ['useTwo', 'd1', 'd2', 'tunaDice'],
        ['useTwo', 'd1', 'd2'],
    ]),
    actionEntry('rerollDice', 'rerollConfirm', 'rerollDice', ['forceDice', 'tunaDice'], { group: 'reroll', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['rerollDice'] }, 0, [['forceDice', 'tunaDice'], ['forceDice']]),
    actionEntry('skipReroll', 'rerollConfirm', 'emptyObject', [], { group: 'reroll', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['skipReroll'] }, 1),
    actionEntry('resolveHarbor', 'harborChoice', 'resolveHarbor', ['useBonus'], { group: 'harbor', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['resolveHarbor'] }),
    actionEntry('resolveTV', 'pending', 'resolveTV', ['targetIndex'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveTV'] }, 0),
    actionEntry('resolveBusiness', 'pending', 'resolveBusiness', ['myCard', 'targetIndex', 'theirCard'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveBusiness', 'skipBusiness'] }, 1, [['myCard', 'targetIndex', 'theirCard'], ['skip']]),
    actionEntry('resolveCleaning', 'pending', 'resolveCleaning', ['cardName'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveCleaning'] }, 2),
    actionEntry('resolveMover', 'pending', 'resolveMover', ['cardName', 'targetIndex'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveMover'] }, 3, [['cardName', 'targetIndex'], ['cardIndex', 'targetIndex']]),
    actionEntry('resolveRenovation', 'pending', 'resolveRenovation', ['landmarkName'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveRenovation'] }, 4),
    actionEntry('resolveIT', 'pending', 'resolveIT', ['doSave'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveIT'] }, 5),
    actionEntry('buildCard', 'build', 'buildCard', ['cardName'], { group: 'build', targetId: 'buildMenu', requiresContent: true, childActions: ['buildCard'] }, 0),
    actionEntry('buildLandmark', 'build', 'buildLandmark', ['name'], { group: 'build', targetId: 'buildMenu', requiresContent: true, childActions: ['buildLandmark'] }, 1),
    actionEntry('undoBuild', 'build', 'undoBuild', [], { group: 'build', targetId: 'buildMenu', requiresContent: true, childActions: ['undoBuild'] }, 3),
    actionEntry('nextTurn', 'build', 'emptyObject', [], { group: 'build-next', targetId: 'btnSkip', targetSource: 'actionButtons', requiresContent: false }, 2),
]);

const ACTION_CONTRACT_BY_ACTION = Object.freeze(Object.fromEntries(
    ACTION_CONTRACT_ENTRIES.map(entry => [entry.action, entry])
));
const ACTION_CONTRACT_REGISTRY = Object.freeze(Object.fromEntries(
    ACTION_CONTRACT_ENTRIES.map(entry => [entry.action, Object.freeze({
        action: entry.action,
        phase: entry.phase,
        payloadKind: entry.payloadKind,
        serverPayload: entry.serverPayload,
        serverReplay: entry.serverReplay,
        clientApply: entry.clientApply,
    })])
));
const ACTION_CONTRACT_CANONICAL_PAYLOAD_KEYS = Object.freeze(Object.fromEntries(
    ACTION_CONTRACT_ENTRIES.map(entry => [entry.action, entry.canonicalPayloadKeys])
));
const ACTION_CONTRACT_CANONICAL_PAYLOAD_VARIANTS = Object.freeze(Object.fromEntries(
    ACTION_CONTRACT_ENTRIES.map(entry => [entry.action, entry.canonicalPayloadVariants])
));

function isPlainActionData(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyActionString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isActionIndex(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function isDieValue(value) {
    return Number.isInteger(value) && value >= 1 && value <= 6;
}

function isTunaDice(value) {
    return value == null || (
        Array.isArray(value) && value.length === 2 && value.every(isDieValue)
    );
}

function hasCanonicalPayloadShape(action, data) {
    if (!isPlainActionData(data)) return false;
    const variants = ACTION_CONTRACT_CANONICAL_PAYLOAD_VARIANTS[action];
    if (!Array.isArray(variants)) return false;
    const keys = Object.keys(data).sort();
    return variants.some(variant => variant.length === keys.length &&
        Array.from(variant).sort().every((key, index) => key === keys[index]));
}

const ACTION_CONTRACT_PAYLOAD_VALUE_VALIDATORS = Object.freeze({
    rollDice: (data, options = {}) =>
        (Object.prototype.hasOwnProperty.call(data, 'tunaDice') || options.allowLegacy === true) &&
        (data.forceDice == null || isDieValue(data.forceDice)) && isTunaDice(data.tunaDice),
    selectDice: (data, options = {}) => {
        const hasDiceCount = Object.prototype.hasOwnProperty.call(data, 'diceCount') &&
            data.diceCount !== undefined;
        const hasTunaDice = Object.prototype.hasOwnProperty.call(data, 'tunaDice');
        if ((!hasDiceCount || !hasTunaDice) && options.allowLegacy !== true) return false;
        const diceCount = hasDiceCount ? data.diceCount : (data.useTwo ? 2 : 1);
        if (typeof data.useTwo !== 'boolean' ||
                (diceCount !== 1 && diceCount !== 2) ||
                data.useTwo !== (diceCount === 2) || !isDieValue(data.d1) ||
                !isTunaDice(data.tunaDice)) return false;
        return diceCount === 2
            ? isDieValue(data.d2)
            : data.d2 == null || data.d2 === 0 || isDieValue(data.d2);
    },
    rerollDice: (data, options = {}) =>
        (Object.prototype.hasOwnProperty.call(data, 'tunaDice') || options.allowLegacy === true) &&
        isDieValue(data.forceDice) && isTunaDice(data.tunaDice),
    skipReroll: () => true,
    resolveHarbor: data => typeof data.useBonus === 'boolean',
    resolveTV: data => isActionIndex(data.targetIndex),
    resolveBusiness: (data, options = {}) => data.skip === true || (
        isActionIndex(data.targetIndex) && (
            (isActionIndex(data.myCard) && isActionIndex(data.theirCard)) ||
            (options.allowLegacy === true &&
                isNonEmptyActionString(data.myCard) &&
                isNonEmptyActionString(data.theirCard))
        )
    ),
    resolveCleaning: data => isNonEmptyActionString(data.cardName),
    resolveMover: data => isActionIndex(data.targetIndex) && (
        isActionIndex(data.cardIndex) || isNonEmptyActionString(data.cardName)
    ),
    resolveRenovation: data => isNonEmptyActionString(data.landmarkName),
    resolveIT: data => typeof data.doSave === 'boolean',
    buildCard: data => isNonEmptyActionString(data.cardName),
    buildLandmark: data => isNonEmptyActionString(data.name),
    undoBuild: () => true,
    nextTurn: () => true,
});

function validateCanonicalPayload(action, data, options = {}) {
    if (!hasCanonicalPayloadShape(action, data)) return false;
    const validator = ACTION_CONTRACT_PAYLOAD_VALUE_VALIDATORS[action];
    return typeof validator === 'function' && validator(data, options) === true;
}

const ACTION_CONTRACT_PHASE_ACTIONS = Object.freeze(Object.fromEntries(
    Object.values(ACTION_CONTRACT_PHASES)
        .filter(phase => phase !== ACTION_CONTRACT_PHASES.PENDING)
        .map(phase => [phase, Object.freeze(ACTION_CONTRACT_ENTRIES
            .filter(entry => entry.phase === phase)
            .sort((left, right) => left.phaseOrder - right.phaseOrder)
            .map(entry => entry.action))])
));

/**
 * @param {*} value
 * @returns {number|null}
 */
function actionSchemaVersionOf(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!Object.prototype.hasOwnProperty.call(value, 'schemaVersion')) {
        return ACTION_SCHEMA_LEGACY_VERSION;
    }
    return Number.isInteger(value.schemaVersion) ? value.schemaVersion : null;
}

/**
 * @param {string} action
 * @param {GameActionData} [data]
 * @returns {GameActionEnvelope|null}
 */
function createActionEnvelope(action, data = {}) {
    if (!ACTION_CONTRACT_BY_ACTION[action] || !data ||
            typeof data !== 'object' || Array.isArray(data)) return null;
    return { schemaVersion: ACTION_SCHEMA_VERSION, action, data };
}

/**
 * @param {*} value
 * @returns {GameActionReadResult}
 */
function readActionEnvelope(value) {
    const schemaVersion = actionSchemaVersionOf(value);
    const supportedVersion = schemaVersion === ACTION_SCHEMA_LEGACY_VERSION ||
        schemaVersion === ACTION_SCHEMA_VERSION;
    if (!supportedVersion || !value || !ACTION_CONTRACT_BY_ACTION[value.action] ||
            !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
        return { ok: false, schemaVersion, action: null, data: null, legacy: false };
    }
    return {
        ok: true,
        schemaVersion,
        action: value.action,
        data: value.data,
        legacy: schemaVersion === ACTION_SCHEMA_LEGACY_VERSION,
    };
}

function buildUiContainers() {
    const groups = new Map();
    for (const entry of ACTION_CONTRACT_ENTRIES) {
        const group = entry.ui.group;
        if (!groups.has(group)) {
            groups.set(group, {
                phase: entry.phase,
                actions: [],
                targetId: entry.ui.targetId,
                modalId: entry.ui.modalId || '',
                targetSource: entry.ui.targetSource || '',
                requiresContent: !!entry.ui.requiresContent,
                allowPendingItOutsidePhase: !!entry.ui.allowPendingItOutsidePhase,
            });
        }
        groups.get(group).actions.push(entry.action);
    }
    return Object.freeze(Array.from(groups.values()).map(group => Object.freeze({
        ...group,
        actions: Object.freeze(group.actions),
    })));
}

function buildUiChildSelectors() {
    return Object.freeze(Object.fromEntries(ACTION_CONTRACT_ENTRIES
        .filter(entry => Array.isArray(entry.ui.childActions) && entry.ui.childActions.length > 0)
        .map(entry => {
            const actions = Object.freeze(Array.from(entry.ui.childActions));
            const selector = actions.map(action =>
                'button[data-action="' + action + '"], [role="button"][data-action="' + action + '"], [data-action="' + action + '"]'
            ).join(', ');
            return [entry.action, Object.freeze({ actions, selector })];
        })));
}

const GameActionContract = Object.freeze({
    schemaVersion: ACTION_SCHEMA_VERSION,
    legacySchemaVersion: ACTION_SCHEMA_LEGACY_VERSION,
    actionSchemaVersionOf,
    createActionEnvelope,
    readActionEnvelope,
    phases: ACTION_CONTRACT_PHASES,
    actions: ACTION_CONTRACT_ACTIONS,
    actorAuthority: ACTION_ACTOR_AUTHORITY,
    entries: ACTION_CONTRACT_ENTRIES,
    byAction: ACTION_CONTRACT_BY_ACTION,
    registry: ACTION_CONTRACT_REGISTRY,
    canonicalPayloadKeys: ACTION_CONTRACT_CANONICAL_PAYLOAD_KEYS,
    canonicalPayloadVariants: ACTION_CONTRACT_CANONICAL_PAYLOAD_VARIANTS,
    payloadValueValidators: ACTION_CONTRACT_PAYLOAD_VALUE_VALIDATORS,
    hasCanonicalPayloadShape,
    validateCanonicalPayload,
    phaseActions: ACTION_CONTRACT_PHASE_ACTIONS,
    uiContainers: buildUiContainers(),
    uiChildSelectors: buildUiChildSelectors(),
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameActionContract;
if (typeof window !== 'undefined') window.GameActionContract = GameActionContract;
if (typeof globalThis !== 'undefined') globalThis.GameActionContract = GameActionContract;
