'use strict';

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

function actionEntry(action, phase, payloadKind, canonicalPayloadKeys, ui, phaseOrder = 0) {
    return Object.freeze({
        action,
        phase,
        phaseOrder,
        actorAuthority: ACTION_ACTOR_AUTHORITY.CURRENT_PLAYER_OR_HOST_CPU,
        payloadKind,
        canonicalPayloadKeys: Object.freeze(canonicalPayloadKeys),
        serverPayload: true,
        serverReplay: true,
        restoreReplay: true,
        clientApply: true,
        ui: Object.freeze(ui),
    });
}

const ACTION_CONTRACT_ENTRIES = Object.freeze([
    actionEntry('rollDice', 'roll', 'rollDice', ['forceDice', 'tunaDice'], { group: 'roll', targetId: 'btnRoll', targetSource: 'actionButtons', requiresContent: false }),
    actionEntry('selectDice', 'selectDice', 'selectDice', ['useTwo', 'diceCount', 'd1', 'd2', 'tunaDice'], { group: 'selectDice', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['selectDiceCount'] }),
    actionEntry('rerollDice', 'rerollConfirm', 'rerollDice', ['forceDice', 'tunaDice'], { group: 'reroll', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['rerollDice'] }, 0),
    actionEntry('skipReroll', 'rerollConfirm', 'emptyObject', [], { group: 'reroll', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['skipReroll'] }, 1),
    actionEntry('resolveHarbor', 'harborChoice', 'resolveHarbor', ['useBonus'], { group: 'harbor', targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true, childActions: ['resolveHarbor'] }),
    actionEntry('resolveTV', 'pending', 'resolveTV', ['targetIndex'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveTV'] }, 0),
    actionEntry('resolveBusiness', 'pending', 'resolveBusiness', ['myCard', 'targetIndex', 'theirCard'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveBusiness'] }, 1),
    actionEntry('resolveCleaning', 'pending', 'resolveCleaning', ['cardName'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveCleaning'] }, 2),
    actionEntry('resolveMover', 'pending', 'resolveMover', ['cardName', 'targetIndex'], { group: 'pending', targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true, childActions: ['resolveMover'] }, 3),
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
const ACTION_CONTRACT_PHASE_ACTIONS = Object.freeze(Object.fromEntries(
    Object.values(ACTION_CONTRACT_PHASES)
        .filter(phase => phase !== ACTION_CONTRACT_PHASES.PENDING)
        .map(phase => [phase, Object.freeze(ACTION_CONTRACT_ENTRIES
            .filter(entry => entry.phase === phase)
            .sort((left, right) => left.phaseOrder - right.phaseOrder)
            .map(entry => entry.action))])
));

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
    phases: ACTION_CONTRACT_PHASES,
    actions: ACTION_CONTRACT_ACTIONS,
    actorAuthority: ACTION_ACTOR_AUTHORITY,
    entries: ACTION_CONTRACT_ENTRIES,
    byAction: ACTION_CONTRACT_BY_ACTION,
    registry: ACTION_CONTRACT_REGISTRY,
    canonicalPayloadKeys: ACTION_CONTRACT_CANONICAL_PAYLOAD_KEYS,
    phaseActions: ACTION_CONTRACT_PHASE_ACTIONS,
    uiContainers: buildUiContainers(),
    uiChildSelectors: buildUiChildSelectors(),
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameActionContract;
if (typeof window !== 'undefined') window.GameActionContract = GameActionContract;
if (typeof globalThis !== 'undefined') globalThis.GameActionContract = GameActionContract;
