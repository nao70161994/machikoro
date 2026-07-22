'use strict';

const ACTION_UI_CHILD_SELECTOR_REGISTRY = Object.freeze({
    selectDice: Object.freeze({ actions: Object.freeze(['selectDiceCount']), selector: 'button[data-action="selectDiceCount"], [role="button"][data-action="selectDiceCount"], [data-action="selectDiceCount"]' }),
    rerollDice: Object.freeze({ actions: Object.freeze(['rerollDice']), selector: 'button[data-action="rerollDice"], [role="button"][data-action="rerollDice"], [data-action="rerollDice"]' }),
    skipReroll: Object.freeze({ actions: Object.freeze(['skipReroll']), selector: 'button[data-action="skipReroll"], [role="button"][data-action="skipReroll"], [data-action="skipReroll"]' }),
    resolveHarbor: Object.freeze({ actions: Object.freeze(['resolveHarbor']), selector: 'button[data-action="resolveHarbor"], [role="button"][data-action="resolveHarbor"], [data-action="resolveHarbor"]' }),
    resolveTV: Object.freeze({ actions: Object.freeze(['resolveTV']), selector: 'button[data-action="resolveTV"], [role="button"][data-action="resolveTV"], [data-action="resolveTV"]' }),
    resolveBusiness: Object.freeze({ actions: Object.freeze(['resolveBusiness']), selector: 'button[data-action="resolveBusiness"], [role="button"][data-action="resolveBusiness"], [data-action="resolveBusiness"]' }),
    resolveCleaning: Object.freeze({ actions: Object.freeze(['resolveCleaning']), selector: 'button[data-action="resolveCleaning"], [role="button"][data-action="resolveCleaning"], [data-action="resolveCleaning"]' }),
    resolveMover: Object.freeze({ actions: Object.freeze(['resolveMover']), selector: 'button[data-action="resolveMover"], [role="button"][data-action="resolveMover"], [data-action="resolveMover"]' }),
    resolveRenovation: Object.freeze({ actions: Object.freeze(['resolveRenovation']), selector: 'button[data-action="resolveRenovation"], [role="button"][data-action="resolveRenovation"], [data-action="resolveRenovation"]' }),
    resolveIT: Object.freeze({ actions: Object.freeze(['resolveIT']), selector: 'button[data-action="resolveIT"], [role="button"][data-action="resolveIT"], [data-action="resolveIT"]' }),
    buildCard: Object.freeze({ actions: Object.freeze(['buildCard']), selector: 'button[data-action="buildCard"], [role="button"][data-action="buildCard"], [data-action="buildCard"]' }),
    buildLandmark: Object.freeze({ actions: Object.freeze(['buildLandmark']), selector: 'button[data-action="buildLandmark"], [role="button"][data-action="buildLandmark"], [data-action="buildLandmark"]' }),
    undoBuild: Object.freeze({ actions: Object.freeze(['undoBuild']), selector: 'button[data-action="undoBuild"], [role="button"][data-action="undoBuild"], [data-action="undoBuild"]' }),
});

const ACTION_UI_CONTAINER_REGISTRY = Object.freeze([
    Object.freeze({ phase: 'roll', actions: Object.freeze(['rollDice']), targetId: 'btnRoll', targetSource: 'actionButtons', requiresContent: false }),
    Object.freeze({ phase: 'selectDice', actions: Object.freeze(['selectDice']), targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true }),
    Object.freeze({ phase: 'rerollConfirm', actions: Object.freeze(['rerollDice', 'skipReroll']), targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true }),
    Object.freeze({ phase: 'harborChoice', actions: Object.freeze(['resolveHarbor']), targetId: 'diceChoose', targetSource: 'actionButtons', requiresContent: true }),
    Object.freeze({ phase: 'pending', actions: Object.freeze(['resolveTV', 'resolveBusiness', 'resolveCleaning', 'resolveMover', 'resolveRenovation', 'resolveIT']), targetId: 'pendingMenu', modalId: 'pendingModal', requiresContent: true, allowPendingItOutsidePhase: true }),
    Object.freeze({ phase: 'build', actions: Object.freeze(['buildCard', 'buildLandmark', 'undoBuild']), targetId: 'buildMenu', requiresContent: true }),
    Object.freeze({ phase: 'build', actions: Object.freeze(['nextTurn']), targetId: 'btnSkip', targetSource: 'actionButtons', requiresContent: false }),
]);

function containerSpecForAction(snapshot, action) {
    const phase = String(snapshot && snapshot.phase || '');
    const exact = ACTION_UI_CONTAINER_REGISTRY.find(spec =>
        (!spec.phase || spec.phase === phase) && spec.actions.includes(action)
    );
    if (exact) return exact;
    const pendingFields = snapshot && snapshot.pendingFields || {};
    return ACTION_UI_CONTAINER_REGISTRY.find(spec =>
        spec.allowPendingItOutsidePhase && action === 'resolveIT' && !!pendingFields.pendingIT && spec.actions.includes(action)
    ) || null;
}

function missingContainerEntries(snapshot) {
    const allowed = Array.isArray(snapshot && snapshot.allowedActions) ? snapshot.allowedActions : [];
    return allowed
        .filter(action => !containerSpecForAction(snapshot, action))
        .map(action => ({ action, phase: String(snapshot && snapshot.phase || '') }));
}

function registrySnapshot() {
    return ACTION_UI_CONTAINER_REGISTRY.map(spec => ({
        phase: spec.phase || '',
        actions: Array.from(spec.actions || []),
        targetId: spec.targetId || '',
        modalId: spec.modalId || '',
        targetSource: spec.targetSource || '',
        requiresContent: !!spec.requiresContent,
        allowPendingItOutsidePhase: !!spec.allowPendingItOutsidePhase,
    }));
}

const ActionUiRegistry = Object.freeze({
    containers: ACTION_UI_CONTAINER_REGISTRY,
    childSelectors: ACTION_UI_CHILD_SELECTOR_REGISTRY,
    containerSpecForAction,
    missingContainerEntries,
    snapshot: registrySnapshot,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ActionUiRegistry };
}
