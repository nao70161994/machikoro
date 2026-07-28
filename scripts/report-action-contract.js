'use strict';

function buildActionContractReport({
    gameActions,
    registry,
    canonicalPayloadKeys,
    payloadValidators,
    uiRegistry,
    actionContract = null,
}) {
    const uiRows = typeof uiRegistry?.snapshot === 'function' ? uiRegistry.snapshot() : [];
    const uiByAction = new Map();
    const duplicateUiActions = new Set();
    for (const row of uiRows) {
        for (const action of row.actions || []) {
            if (uiByAction.has(action)) duplicateUiActions.add(action);
            else uiByAction.set(action, row);
        }
    }

    const actions = Object.values(gameActions || {}).map(action => {
        const metadata = registry && registry[action] || null;
        const ui = uiByAction.get(action) || null;
        const child = uiRegistry?.childSelectors && uiRegistry.childSelectors[action] || null;
        return {
            action,
            phase: metadata && metadata.phase || '',
            payloadKind: metadata && metadata.payloadKind || '',
            actorAuthority: actionContract && actionContract.byAction[action] && actionContract.byAction[action].actorAuthority || '',
            canonicalPayloadKeys: Array.from(canonicalPayloadKeys && canonicalPayloadKeys[action] || []),
            canonicalPayloadVariants: Array.from(
                actionContract?.byAction?.[action]?.canonicalPayloadVariants || [],
                keys => Array.from(keys)
            ),
            serverValidator: typeof (payloadValidators && payloadValidators[action]) === 'function',
            serverReplay: !!(metadata && metadata.serverReplay),
            restoreReplay: !!(actionContract && actionContract.byAction[action] && actionContract.byAction[action].restoreReplay),
            clientApply: !!(metadata && metadata.clientApply),
            uiTarget: ui && ui.targetId || '',
            uiChildActions: Array.from(child && child.actions || []),
        };
    });

    const issues = [];
    const actionSet = new Set(actions.map(row => row.action));
    for (const row of actions) {
        const metadata = registry && registry[row.action];
        const ui = uiByAction.get(row.action);
        if (!metadata) issues.push({ action: row.action, kind: 'missing-registry' });
        if (!Object.prototype.hasOwnProperty.call(canonicalPayloadKeys || {}, row.action)) {
            issues.push({ action: row.action, kind: 'missing-canonical-payload' });
        }
        if (!row.serverValidator) issues.push({ action: row.action, kind: 'missing-server-validator' });
        if (!row.serverReplay) issues.push({ action: row.action, kind: 'missing-server-replay' });
        if (!row.clientApply) issues.push({ action: row.action, kind: 'missing-client-apply' });
        if (actionContract && !row.actorAuthority) issues.push({ action: row.action, kind: 'missing-actor-authority' });
        if (actionContract && !row.restoreReplay) issues.push({ action: row.action, kind: 'missing-restore-replay' });
        if (!ui) issues.push({ action: row.action, kind: 'missing-ui-target' });
        else if (metadata && ui.phase !== metadata.phase) {
            issues.push({ action: row.action, kind: 'ui-phase-mismatch' });
        }
        if (duplicateUiActions.has(row.action)) issues.push({ action: row.action, kind: 'duplicate-ui-target' });
        if (actionContract) {
            if (row.canonicalPayloadVariants.length === 0) {
                issues.push({ action: row.action, kind: 'missing-canonical-payload-variants' });
            } else {
                const canonicalSignature = JSON.stringify(row.canonicalPayloadKeys);
                const variantSignatures = row.canonicalPayloadVariants.map(keys => JSON.stringify(keys));
                if (!variantSignatures.includes(canonicalSignature)) {
                    issues.push({ action: row.action, kind: 'canonical-payload-default-variant-mismatch' });
                }
                if (new Set(variantSignatures).size !== variantSignatures.length) {
                    issues.push({ action: row.action, kind: 'duplicate-canonical-payload-variant' });
                }
            }
        }
    }

    for (const action of Object.keys(registry || {})) {
        if (!actionSet.has(action)) issues.push({ action, kind: 'unknown-registry-action' });
    }
    for (const action of Object.keys(canonicalPayloadKeys || {})) {
        if (!actionSet.has(action)) issues.push({ action, kind: 'unknown-canonical-action' });
    }
    for (const action of Object.keys(payloadValidators || {})) {
        if (!actionSet.has(action)) issues.push({ action, kind: 'unknown-validator-action' });
    }
    for (const action of uiByAction.keys()) {
        if (!actionSet.has(action)) issues.push({ action, kind: 'unknown-ui-action' });
    }

    return { actions, issues };
}

function currentActionContractReport() {
    const server = require('../server');
    const runtime = server.loadGameRuntime();
    const { ActionUiRegistry } = require('../js/actionUiRegistry');
    const actionContract = require('../js/actionContract');
    return buildActionContractReport({
        gameActions: runtime.GAME_ACTIONS,
        registry: runtime.GAME_ACTION_REGISTRY,
        canonicalPayloadKeys: server.CANONICAL_ACTION_PAYLOAD_KEYS,
        payloadValidators: server.ACTION_PAYLOAD_VALIDATORS,
        uiRegistry: ActionUiRegistry,
        actionContract,
    });
}

if (require.main === module) {
    const report = currentActionContractReport();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.issues.length > 0) process.exitCode = 1;
}

module.exports = {
    buildActionContractReport,
    currentActionContractReport,
};
