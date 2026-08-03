'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

function makeRestoreAuditGateway(dependencies = {}) {
    const buildSignedRestoreAuditRecord = requireFunction(
        dependencies.buildSignedRestoreAuditRecord,
        'buildSignedRestoreAuditRecord'
    );
    const verifySignedRestoreAuditRecord = requireFunction(
        dependencies.verifySignedRestoreAuditRecord,
        'verifySignedRestoreAuditRecord'
    );
    const buildRestoreSnapshotAuditPayload = requireFunction(
        dependencies.buildRestoreSnapshotAuditPayload,
        'buildRestoreSnapshotAuditPayload'
    );
    const buildRestoreActionAuditPayload = requireFunction(
        dependencies.buildRestoreActionAuditPayload,
        'buildRestoreActionAuditPayload'
    );
    const restoreAuditBuildOptions = requireFunction(
        dependencies.restoreAuditBuildOptions,
        'restoreAuditBuildOptions'
    );
    const restoreAuditVerificationOptions = requireFunction(
        dependencies.restoreAuditVerificationOptions,
        'restoreAuditVerificationOptions'
    );

    function buildRestoreSnapshotAudit(roomId, gameStartPayload, stateSnapshot, now = Date.now()) {
        return buildSignedRestoreAuditRecord(
            roomId,
            buildRestoreSnapshotAuditPayload(gameStartPayload, stateSnapshot),
            restoreAuditBuildOptions(now)
        );
    }

    function isVerifiedClientRestoreSnapshot(roomId, gameStartPayload, stateSnapshot, restoreAudit) {
        if (!stateSnapshot) return true;
        const validation = verifySignedRestoreAuditRecord(
            restoreAudit,
            buildRestoreSnapshotAuditPayload(gameStartPayload, stateSnapshot),
            restoreAuditVerificationOptions(roomId)
        );
        return validation.ok;
    }

    function buildRestoreActionAudit(roomId, actionEntry, now = Date.now()) {
        return buildSignedRestoreAuditRecord(
            roomId,
            buildRestoreActionAuditPayload(actionEntry),
            restoreAuditBuildOptions(now, 'server-action-log')
        );
    }

    function isVerifiedRestoreActionAudit(roomId, actionEntry) {
        const validation = verifySignedRestoreAuditRecord(
            actionEntry && actionEntry.restoreActionAudit,
            buildRestoreActionAuditPayload(actionEntry),
            restoreAuditVerificationOptions(roomId)
        );
        return validation.ok;
    }

    return Object.freeze({
        buildRestoreSnapshotAudit,
        isVerifiedClientRestoreSnapshot,
        buildRestoreActionAudit,
        isVerifiedRestoreActionAudit,
    });
}

module.exports = makeRestoreAuditGateway;
