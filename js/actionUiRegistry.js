'use strict';

const ACTION_UI_GAME_CONTRACT = typeof GameActionContract !== 'undefined'
    ? GameActionContract
    : require('./actionContract');
const ACTION_UI_CHILD_SELECTOR_REGISTRY = ACTION_UI_GAME_CONTRACT.uiChildSelectors;
const ACTION_UI_CONTAINER_REGISTRY = ACTION_UI_GAME_CONTRACT.uiContainers;

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
