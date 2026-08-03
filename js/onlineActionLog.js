'use strict';

const ONLINE_ACTION_LOG_EFFECTS = Object.freeze({
    PATCH_GAME_START: 'patch-game-start',
    BUILD_COMPACTION_SNAPSHOT: 'build-compaction-snapshot',
    WRITE_STATE_SNAPSHOT: 'write-state-snapshot',
    REMOVE_RESTORE_AUDIT: 'remove-restore-audit',
    WRITE_RESTORE_AUDIT: 'write-restore-audit',
    WRITE_ACTION_LOG: 'write-action-log',
});

function buildActionLogEntry(action, data, seq, options = {}) {
    const entry = { action, data };
    if (Number.isInteger(options.playerIndex)) entry.playerIndex = options.playerIndex;
    if (typeof options.clientActionId === 'string') entry.clientActionId = options.clientActionId;
    if (options.restoreActionAudit && typeof options.restoreActionAudit === 'object') {
        entry.restoreActionAudit = options.restoreActionAudit;
    }
    entry.seq = seq;
    return entry;
}

function planOnlineActionLogAppend(input = {}) {
    const sourceLog = Array.isArray(input.log) ? input.log : [];
    const options = input.options && typeof input.options === 'object' ? input.options : {};
    const seq = input.seq;
    const hasExplicitSeq = input.hasExplicitSeq === true;
    const entry = buildActionLogEntry(input.action, input.data, seq, options);
    let finalLog = sourceLog.concat(entry);
    const serverSnapshotSeq = Number.isInteger(options.stateSnapshot?.actionSeq)
        ? options.stateSnapshot.actionSeq
        : null;
    const adoptServerSnapshot = !!options.stateSnapshot &&
        !!options.restoreAudit &&
        Number.isInteger(serverSnapshotSeq);
    if (adoptServerSnapshot) {
        finalLog = finalLog.filter(item =>
            !Number.isInteger(item && item.seq) || item.seq > serverSnapshotSeq
        );
    }
    return Object.freeze({
        seq,
        entry,
        finalLog: Object.freeze(finalLog),
        compactRequested: sourceLog.length >= input.actionLogLimit && input.hasGame === true,
        patchBeforeCompaction: hasExplicitSeq && options.alreadyApplied === true ? seq : null,
        patchAfterCompaction: hasExplicitSeq && options.alreadyApplied !== true ? seq : null,
        adoptServerSnapshot,
        serverSnapshot: adoptServerSnapshot ? options.stateSnapshot : null,
        restoreAudit: adoptServerSnapshot ? options.restoreAudit : null,
        serverSnapshotActionSeq: adoptServerSnapshot ? Math.max(seq, serverSnapshotSeq) : null,
    });
}

function requiredHandlersFor(plan) {
    const required = ['writeActionLog'];
    if (Number.isInteger(plan.patchBeforeCompaction) ||
        Number.isInteger(plan.patchAfterCompaction) ||
        Number.isInteger(plan.serverSnapshotActionSeq)) {
        required.push('patchGameStart');
    }
    if (plan.compactRequested) {
        required.push('buildCompactionSnapshot', 'writeStateSnapshot', 'removeRestoreAudit');
    }
    if (plan.adoptServerSnapshot) {
        if (!required.includes('writeStateSnapshot')) required.push('writeStateSnapshot');
        required.push('writeRestoreAudit');
    }
    return required;
}

function executeOnlineActionLogAppend(plan, handlers = {}) {
    if (!plan || !Array.isArray(plan.finalLog)) {
        throw new TypeError('online action log plan is required');
    }
    for (const name of requiredHandlersFor(plan)) {
        if (typeof handlers[name] !== 'function') {
            throw new TypeError(`online action log handler is required: ${name}`);
        }
    }
    const effects = [];
    if (Number.isInteger(plan.patchBeforeCompaction)) {
        handlers.patchGameStart(plan.patchBeforeCompaction);
        effects.push(ONLINE_ACTION_LOG_EFFECTS.PATCH_GAME_START);
    }
    if (plan.compactRequested) {
        const snapshot = handlers.buildCompactionSnapshot();
        effects.push(ONLINE_ACTION_LOG_EFFECTS.BUILD_COMPACTION_SNAPSHOT);
        if (snapshot) {
            handlers.writeStateSnapshot(snapshot);
            effects.push(ONLINE_ACTION_LOG_EFFECTS.WRITE_STATE_SNAPSHOT);
            handlers.removeRestoreAudit();
            effects.push(ONLINE_ACTION_LOG_EFFECTS.REMOVE_RESTORE_AUDIT);
        }
    }
    if (Number.isInteger(plan.patchAfterCompaction)) {
        handlers.patchGameStart(plan.patchAfterCompaction);
        effects.push(ONLINE_ACTION_LOG_EFFECTS.PATCH_GAME_START);
    }
    if (plan.adoptServerSnapshot) {
        handlers.writeStateSnapshot(plan.serverSnapshot);
        effects.push(ONLINE_ACTION_LOG_EFFECTS.WRITE_STATE_SNAPSHOT);
        handlers.writeRestoreAudit(plan.restoreAudit);
        effects.push(ONLINE_ACTION_LOG_EFFECTS.WRITE_RESTORE_AUDIT);
        handlers.patchGameStart(plan.serverSnapshotActionSeq);
        effects.push(ONLINE_ACTION_LOG_EFFECTS.PATCH_GAME_START);
    }
    handlers.writeActionLog(plan.finalLog);
    effects.push(ONLINE_ACTION_LOG_EFFECTS.WRITE_ACTION_LOG);
    return Object.freeze({
        seq: plan.seq,
        entry: plan.entry,
        log: plan.finalLog,
        effects: Object.freeze(effects),
    });
}

const OnlineActionLog = Object.freeze({
    effects: ONLINE_ACTION_LOG_EFFECTS,
    buildEntry: buildActionLogEntry,
    planAppend: planOnlineActionLogAppend,
    executeAppend: executeOnlineActionLogAppend,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineActionLog };
}
if (typeof window !== 'undefined') window.OnlineActionLog = OnlineActionLog;
if (typeof globalThis !== 'undefined') globalThis.OnlineActionLog = OnlineActionLog;
