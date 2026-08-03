const assert = require('assert');
const UiWatchdog = require('../js/uiWatchdog');

const kinds = {
    MODAL_UI_LOCKED: 'modal-ui-locked',
    HUMAN_TURN_UI_LOCKED: 'human-turn-ui-locked',
    PENDING_UI_LOCKED: 'pending-ui-locked',
    STALE_MODAL_UI_LOCKED: 'stale-modal-ui-locked',
    POST_BUILD_UI_BLOCKED: 'post-build-ui-blocked',
    PENDING_WITHOUT_ACTION: 'pending-without-action',
    CPU_TURN_STALLED: 'cpu-turn-stalled',
    ONLINE_ACTION_IN_FLIGHT_STALLED: 'online-action-in-flight-stalled',
};
const base = {
    phase: 'build',
    builtThisTurn: false,
    isMyTurn: true,
    isCpuTurn: false,
    onlineBlocked: false,
    confirmOpen: false,
    staleConfirmOpen: false,
    activeBlockingModalOpen: false,
    hasExpectedPendingActions: false,
    stalePendingOpen: false,
    skipDisabled: false,
    gameInert: false,
    gameScreenHidden: false,
    noUsablePrimaryAction: false,
    noUsablePendingAction: false,
    pendingOpenWithoutContent: false,
    onlineActionInFlight: false,
    onlineActionTimedOut: false,
    cpuStepScheduled: false,
    modalIssue: null,
    pendingIssue: null,
    humanIssue: null,
};
const classify = overrides => UiWatchdog.classifyFreezeFacts(Object.assign({}, base, overrides), kinds);

const freezeSnapshotInput = {
    phase: 'build', builtThisTurn: true, currentPlayerIndex: 1, myPlayerIndex: 1,
    isOnlineGame: true, isCpuTurn: false, onlineActionInFlight: true,
    cpuStepScheduled: false, allowedActions: ['nextTurn'],
    pendingFields: {}, ui: {
        btnSkip: { disabled: true }, gameScreen: { inert: true }, pendingMenu: { htmlLength: 0 },
    },
};
const freezeFacts = UiWatchdog.buildFreezeFacts(freezeSnapshotInput, {
    confirmOpen: false, staleConfirmOpen: true, activeBlockingModalOpen: false,
    hasUsablePrimaryAction: false, hasUsablePendingAction: false,
    onlineActionTimedOut: true,
    interactabilityIssues: [
        { freezeKind: kinds.HUMAN_TURN_UI_LOCKED, reason: 'disabled' },
    ],
    modalFreezeKind: kinds.MODAL_UI_LOCKED,
    pendingFreezeKind: kinds.PENDING_UI_LOCKED,
    humanFreezeKind: kinds.HUMAN_TURN_UI_LOCKED,
});
assert.strictEqual(freezeFacts.isMyTurn, true);
assert.strictEqual(freezeFacts.onlineBlocked, true);
assert.strictEqual(freezeFacts.skipDisabled, true);
assert.strictEqual(freezeFacts.gameInert, true);
assert.strictEqual(freezeFacts.noUsablePrimaryAction, false);
assert.strictEqual(freezeFacts.onlineActionTimedOut, true);
assert.strictEqual(freezeFacts.humanIssue.reason, 'disabled');
assert.strictEqual(Object.prototype.hasOwnProperty.call(freezeSnapshotInput, 'onlineBlocked'), false);

assert.strictEqual(classify({}), '');
assert.strictEqual(classify({ modalIssue: { freezeKind: 'modal-ui-locked', reason: 'parent-inert' } }), 'modal-ui-locked:parent-inert');
assert.strictEqual(classify({ stalePendingOpen: true }), 'stale-modal-ui-locked');
assert.strictEqual(classify({ confirmOpen: true }), '');
assert.strictEqual(classify({ builtThisTurn: true, skipDisabled: true }), 'post-build-ui-blocked');
assert.strictEqual(classify({ pendingIssue: {} }), 'pending-ui-locked');
assert.strictEqual(classify({ noUsablePrimaryAction: true }), 'human-turn-ui-locked');
assert.strictEqual(classify({ pendingOpenWithoutContent: true }), 'pending-without-action');
assert.strictEqual(classify({ isMyTurn: false, isCpuTurn: true }), 'cpu-turn-stalled');
assert.strictEqual(classify({ onlineActionInFlight: true }), '');
assert.strictEqual(classify({ onlineActionInFlight: true, onlineActionTimedOut: true }), 'online-action-in-flight-stalled');

assert.strictEqual(UiWatchdog.isFreezeClassificationCandidate(null), false);
assert.strictEqual(UiWatchdog.isFreezeClassificationCandidate({ phase: '' }), false);
assert.strictEqual(UiWatchdog.isFreezeClassificationCandidate({ phase: 'build', hasWinner: true }), false);
assert.strictEqual(UiWatchdog.isFreezeClassificationCandidate({ phase: 'build', hasWinner: false }), true);
const classificationSnapshot = {
    phase: 'build',
    currentPlayerIndex: 0,
    myPlayerIndex: 0,
    isOnlineGame: true,
    isCpuTurn: false,
    onlineActionInFlight: true,
    allowedActions: ['nextTurn'],
    ui: {},
};
const classificationBefore = JSON.stringify(classificationSnapshot);
assert.strictEqual(UiWatchdog.classifySnapshot(classificationSnapshot, {
    onlineActionTimedOut: true,
    hasUsablePrimaryAction: true,
}, kinds), kinds.ONLINE_ACTION_IN_FLIGHT_STALLED);
assert.strictEqual(JSON.stringify(classificationSnapshot), classificationBefore);
assert.strictEqual(UiWatchdog.classifySnapshot({
    ...classificationSnapshot,
    hasWinner: true,
}, { onlineActionTimedOut: true }, kinds), '');

assert.strictEqual(UiWatchdog.hasPendingWork({ pendingFields: { pendingIT: true } }), true);
assert.strictEqual(UiWatchdog.hasPendingWork({ pendingFields: {} }), false);
assert.strictEqual(UiWatchdog.stateKey({
    phase: 'build',
    turnCount: 3,
    currentPlayerIndex: 1,
    builtThisTurn: true,
    pendingFields: { pendingTV: 2, pendingIT: true },
    onlineActionInFlight: true,
}), 'build|3|1|built|2|0|0|0|0|1|1');

const compactElement = UiWatchdog.compactElementSnapshotForStorage({
    id: 'btnRoll',
    display: 'block',
    disabled: 0,
    hidden: 1,
    ariaHidden: '',
    htmlLength: 12,
    ignored: 'large-field',
});
assert.deepStrictEqual(compactElement, {
    id: 'btnRoll',
    display: 'block',
    computedDisplay: '',
    visibility: '',
    computedVisibility: '',
    pointerEvents: '',
    computedPointerEvents: '',
    disabled: false,
    hidden: true,
    inert: false,
    ancestorBlocked: false,
    ariaHidden: null,
    htmlLength: 12,
    totalInteractiveChildren: 0,
    usableInteractiveChildren: 0,
});

const freezePayload = {
    freezeKind: 'human-turn-ui-locked',
    stagnantMs: 5000,
    interactabilityIssues: [{ reason: 'disabled', extra: true }],
    recovery: { attempted: 1, success: 0 },
    snapshot: {
        reason: 'watchdog',
        phase: 'build',
        allowedActions: ['rollDice'],
        visibleModals: [],
        ui: { btnRoll: { id: 'btnRoll', disabled: true } },
        actionButtons: { enabled: ['btnRoll'], buttons: { btnRoll: { id: 'btnRoll', disabled: true } } },
        verbose: 'x'.repeat(8000),
    },
};
const compactPayload = UiWatchdog.compactFreezePayloadForStorage(
    freezePayload,
    issue => ({ reason: issue.reason })
);
assert.deepStrictEqual(compactPayload.interactabilityIssues, [{ reason: 'disabled' }]);
assert.strictEqual(compactPayload.snapshot.ui.btnRoll.disabled, true);
assert.strictEqual(compactPayload.snapshot.actionButtons.buttons.btnRoll.id, 'btnRoll');
assert.strictEqual(Object.prototype.hasOwnProperty.call(compactPayload.snapshot, 'verbose'), false);

const smallPayload = { freezeKind: 'small', snapshot: { phase: 'roll' } };
assert.strictEqual(UiWatchdog.freezePayloadStorageJson(smallPayload), JSON.stringify(smallPayload));
const storedCompact = JSON.parse(UiWatchdog.freezePayloadStorageJson(freezePayload, issue => issue));
assert.strictEqual(storedCompact.snapshot.reason, 'watchdog');
assert.strictEqual(Object.prototype.hasOwnProperty.call(storedCompact.snapshot, 'verbose'), false);

const oversizedPayload = {
    freezeKind: 'oversized',
    stagnantMs: 9000,
    recovery: { attempted: true, success: false },
    snapshot: {
        reason: 'removed-by-minimal-fallback',
        phase: 'build',
        allowedActions: Array.from({ length: 2000 }, (_, index) => 'action-' + index),
    },
};
assert.strictEqual(JSON.parse(UiWatchdog.freezePayloadStorageJson(oversizedPayload)).snapshot.reason, undefined);

assert.deepStrictEqual(UiWatchdog.compactIssueForTrace({
    kind: 'disabled',
    action: 'nextTurn',
    target: 'btnSkip',
    extra: 'drop',
}), {
    kind: 'disabled',
    action: 'nextTurn',
    actionTarget: '',
    target: 'btnSkip',
    phase: '',
    reason: '',
    freezeKind: '',
});
assert.strictEqual(UiWatchdog.compactIssueForTrace(null), null);

const compactTrace = UiWatchdog.compactSnapshotForTrace({
    phase: 'build',
    builtThisTurn: 1,
    allowedActions: ['nextTurn'],
    visibleModals: ['confirmModal'],
    ui: { btnSkip: { id: 'btnSkip', disabled: true } },
    ignored: 'drop',
});
assert.strictEqual(compactTrace.phase, 'build');
assert.strictEqual(compactTrace.builtThisTurn, true);
assert.deepStrictEqual(compactTrace.allowedActions, ['nextTurn']);
assert.deepStrictEqual(compactTrace.visibleModals, ['confirmModal']);
assert.strictEqual(compactTrace.btnSkip.id, 'btnSkip');
assert.strictEqual(compactTrace.btnSkip.disabled, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(compactTrace, 'ignored'), false);

const causeCases = [
    [null, null, 'unknown'],
    [{ reason: 'stale-modal' }, null, 'modal-close-lock-leftover'],
    [{ target: 'body' }, null, 'modal-close-lock-leftover'],
    [{ target: 'gameScreen', reason: 'parent-inert' }, null, 'screen-lock-leftover'],
    [{ reason: 'pointer-events-none' }, null, 'inline-style-leftover'],
    [{ reason: 'hidden-mismatch' }, null, 'render-container-hidden'],
    [{ reason: 'child-not-clickable' }, null, 'allowed-actions-render-state-mismatch'],
    [{ action: 'nextTurn' }, { phase: 'build' }, 'build-after-action-display-sync'],
    [{}, null, 'allowed-actions-render-state-mismatch'],
];
for (const [issue, snapshot, expected] of causeCases) {
    assert.strictEqual(UiWatchdog.classifyInteractabilityCause(issue, snapshot), expected);
}
assert.strictEqual(UiWatchdog.normalizeFreezeKind('modal-ui-locked:parent-inert'), 'modal-ui-locked');
assert.strictEqual(UiWatchdog.normalizeFreezeKind(null), '');

{
    const snapshot = {
        phase: 'build',
        isOnlineGame: false,
        isCpuTurn: false,
        allowedActions: ['nextTurn'],
    };
    const humanIssue = { freezeKind: kinds.HUMAN_TURN_UI_LOCKED, reason: 'disabled' };
    const modalIssue = { freezeKind: kinds.MODAL_UI_LOCKED, reason: 'parent-inert' };
    const plan = UiWatchdog.renderInteractabilitySyncPlan(snapshot, {
        activeBlockingModal: false,
        humanFreezeKind: kinds.HUMAN_TURN_UI_LOCKED,
        issues: [humanIssue, modalIssue],
    });
    assert.deepStrictEqual(plan, { eligible: true, shouldSync: true, issues: [humanIssue] });
    assert.strictEqual(Object.isFrozen(plan), true);
    assert.strictEqual(Object.isFrozen(plan.issues), true);
    assert.strictEqual(UiWatchdog.renderInteractabilitySyncPlan(
        Object.assign({}, snapshot, { isCpuTurn: true }),
        { humanFreezeKind: kinds.HUMAN_TURN_UI_LOCKED, issues: [humanIssue] }
    ).eligible, false);
    assert.strictEqual(UiWatchdog.renderInteractabilitySyncPlan(
        Object.assign({}, snapshot, {
            isOnlineGame: true, currentPlayerIndex: 0, myPlayerIndex: 0, onlineActionInFlight: true,
        }),
        { humanFreezeKind: kinds.HUMAN_TURN_UI_LOCKED, issues: [humanIssue] }
    ).eligible, false);
    assert.strictEqual(UiWatchdog.renderInteractabilitySyncPlan(snapshot, {
        activeBlockingModal: true,
        humanFreezeKind: kinds.HUMAN_TURN_UI_LOCKED,
        issues: [humanIssue],
    }).eligible, false);
    assert.deepStrictEqual(UiWatchdog.renderInteractabilitySyncPlan(snapshot, {
        humanFreezeKind: kinds.HUMAN_TURN_UI_LOCKED,
        issues: [modalIssue],
    }), { eligible: true, shouldSync: false, issues: [] });
    assert.strictEqual(UiWatchdog.renderInteractabilitySyncPlan(
        Object.assign({}, snapshot, { phase: 'pending', allowedActions: ['resolveTV'] }),
        {
            activeBlockingModal: true,
            humanFreezeKind: kinds.HUMAN_TURN_UI_LOCKED,
            issues: [humanIssue],
        }
    ).shouldSync, true);
}

assert.strictEqual(UiWatchdog.classListText(null), '');
assert.strictEqual(UiWatchdog.classListText({ className: 'game active' }), 'game active');
assert.strictEqual(UiWatchdog.classListText({ classList: { value: 'modal-open' } }), 'modal-open');

assert.strictEqual(UiWatchdog.isElementUsablyEnabled({ display: 'block' }), true);
for (const blocked of [
    { disabled: true },
    { hidden: true },
    { inert: true },
    { ancestorBlocked: true },
    { computedDisplay: 'none' },
    { computedVisibility: 'hidden' },
    { computedPointerEvents: 'none' },
]) {
    assert.strictEqual(UiWatchdog.isElementUsablyEnabled(blocked), false);
}

const lockReasonCases = [
    [null, 'missing-handler'],
    [{ ancestorBlocked: true }, 'ancestor-blocked'],
    [{ display: 'none' }, 'parent-display-none'],
    [{ inert: true }, 'parent-inert'],
    [{ pointerEvents: 'none' }, 'pointer-events-none'],
    [{ hidden: true }, 'hidden-mismatch'],
    [{ disabled: true }, 'disabled-mismatch'],
    [{ totalInteractiveChildren: 2, usableInteractiveChildren: 0 }, 'child-not-clickable'],
    [{}, 'not-clickable'],
];
for (const [state, expected] of lockReasonCases) {
    assert.strictEqual(UiWatchdog.lockReasonForElement(state), expected);
}

const snapshotLookup = {
    ui: { shared: { owner: 'ui' }, uiOnly: { owner: 'ui' } },
    actionButtons: { buttons: { shared: { owner: 'button' }, buttonOnly: { owner: 'button' } } },
};
assert.strictEqual(UiWatchdog.snapshotStateById(snapshotLookup, 'shared').owner, 'ui');
assert.strictEqual(UiWatchdog.snapshotStateById(snapshotLookup, 'shared', 'actionButtons').owner, 'button');
assert.strictEqual(UiWatchdog.snapshotStateById(snapshotLookup, 'buttonOnly').owner, 'button');
assert.strictEqual(UiWatchdog.snapshotStateById(null, 'missing'), undefined);

const contentSpec = { requiresContent: true, modalId: 'pendingModal' };
const usableContentState = {
    display: 'block',
    htmlLength: 20,
    totalInteractiveChildren: 1,
    usableInteractiveChildren: 1,
};
assert.strictEqual(UiWatchdog.isActionContainerStateUsable(contentSpec, usableContentState, {
    hasExpectedChildSpec: true,
    actionChildState: { total: 1, usable: 1 },
    modalState: { display: 'flex' },
}), true);
assert.strictEqual(UiWatchdog.isActionContainerStateUsable(null, usableContentState), false);
assert.strictEqual(UiWatchdog.isActionContainerStateUsable(contentSpec, Object.assign({}, usableContentState, { htmlLength: 0 })), false);
assert.strictEqual(UiWatchdog.isActionContainerStateUsable(contentSpec, usableContentState, {
    hasExpectedChildSpec: true,
    actionChildState: { total: 1, usable: 0 },
}), false);
assert.strictEqual(UiWatchdog.isActionContainerStateUsable(contentSpec, usableContentState, {
    modalState: { display: 'none' },
}), false);
assert.strictEqual(UiWatchdog.shouldIgnoreInactiveActionContainerIssue(contentSpec, false, 'not-clickable'), true);
assert.strictEqual(UiWatchdog.shouldIgnoreInactiveActionContainerIssue(contentSpec, true, 'not-clickable'), false);
assert.strictEqual(UiWatchdog.shouldIgnoreInactiveActionContainerIssue({ requiresContent: false }, false, 'not-clickable'), false);
assert.strictEqual(UiWatchdog.shouldIgnoreInactiveActionContainerIssue(contentSpec, false, 'parent-inert'), false);

assert.strictEqual(UiWatchdog.isHumanTurnSnapshot(null), false);
assert.strictEqual(UiWatchdog.isHumanTurnSnapshot({ phase: 'build', isCpuTurn: true }), false);
assert.strictEqual(UiWatchdog.isHumanTurnSnapshot({ phase: 'build', isOnlineGame: false }), true);
assert.strictEqual(UiWatchdog.isHumanTurnSnapshot({
    phase: 'build',
    isOnlineGame: true,
    currentPlayerIndex: 2,
    myPlayerIndex: 2,
}), true);
assert.strictEqual(UiWatchdog.isHumanTurnSnapshot({
    phase: 'build',
    isOnlineGame: true,
    currentPlayerIndex: 1,
    myPlayerIndex: 2,
}), false);
assert.deepStrictEqual(UiWatchdog.expectedPendingActions({
    allowedActions: ['rollDice', 'resolveTV', 'resolveIT', 'nextTurn'],
}), ['resolveTV', 'resolveIT']);
assert.deepStrictEqual(UiWatchdog.expectedPendingActions({ allowedActions: 'resolveTV' }), []);
assert.deepStrictEqual(UiWatchdog.expectedPrimaryActions({
    allowedActions: ['buildCard', 'rollDice', 'resolveHarbor', 'nextTurn'],
}), ['rollDice', 'resolveHarbor', 'nextTurn']);
assert.deepStrictEqual(UiWatchdog.expectedPrimaryActions({ allowedActions: null }), []);

const activeRecoverySnapshot = {
    phase: 'build',
    currentPlayerIndex: 0,
    turnCount: 2,
    allowedActions: ['nextTurn'],
};
assert.strictEqual(UiWatchdog.isActiveGameScreenRecoverySnapshot(activeRecoverySnapshot), true);
assert.strictEqual(UiWatchdog.isActiveGameScreenRecoverySnapshot(Object.assign({}, activeRecoverySnapshot, { phase: 'finished' })), false);
assert.strictEqual(UiWatchdog.isActiveGameScreenRecoverySnapshot(Object.assign({}, activeRecoverySnapshot, { currentPlayerIndex: -1 })), false);
assert.strictEqual(UiWatchdog.isActiveGameScreenRecoverySnapshot(Object.assign({}, activeRecoverySnapshot, { allowedActions: [] })), false);
assert.strictEqual(UiWatchdog.shouldRestoreGameScreenDisplay(activeRecoverySnapshot), true);
assert.strictEqual(UiWatchdog.shouldRestoreGameScreenDisplay(Object.assign({}, activeRecoverySnapshot, {
    phase: 'pending',
    allowedActions: ['resolveIT'],
})), true);
assert.strictEqual(UiWatchdog.shouldRestoreGameScreenDisplay(Object.assign({}, activeRecoverySnapshot, {
    allowedActions: ['buildCard'],
})), false);

const postBuildSnapshot = Object.assign({}, activeRecoverySnapshot, {
    builtThisTurn: true,
    isCpuTurn: false,
    isOnlineGame: false,
    pendingFields: {},
});
assert.strictEqual(UiWatchdog.isPostBuildNextTurnSnapshot(postBuildSnapshot), true);
assert.strictEqual(UiWatchdog.isPostBuildNextTurnSnapshot(postBuildSnapshot, true), false);
assert.strictEqual(UiWatchdog.isPostBuildNextTurnSnapshot(Object.assign({}, postBuildSnapshot, {
    pendingFields: { pendingRenovation: 1 },
})), false);
assert.strictEqual(UiWatchdog.isPostBuildNextTurnSnapshot(Object.assign({}, postBuildSnapshot, {
    isOnlineGame: true,
    onlineActionInFlight: true,
})), false);

assert.strictEqual(UiWatchdog.isExplicitModalOpen({ display: 'flex' }), true);
assert.strictEqual(UiWatchdog.isExplicitModalOpen({ computedDisplay: 'block' }), true);
assert.strictEqual(UiWatchdog.isExplicitModalOpen({ display: 'none' }), false);
assert.strictEqual(UiWatchdog.isExplicitModalOpen({ display: 'flex', hidden: true }), false);
assert.strictEqual(UiWatchdog.isExplicitModalOpen({ display: 'flex', computedVisibility: 'hidden' }), false);

assert.strictEqual(UiWatchdog.isStaleConfirmModalSnapshot(postBuildSnapshot, {
    confirmOpen: true,
    awaitingChoice: false,
}), true);
assert.strictEqual(UiWatchdog.isStaleConfirmModalSnapshot(postBuildSnapshot, {
    confirmOpen: true,
    awaitingChoice: true,
}), false);
assert.strictEqual(UiWatchdog.isStaleConfirmModalSnapshot({
    phase: 'roll',
    allowedActions: ['rollDice'],
}, { confirmOpen: true }), true);
assert.strictEqual(UiWatchdog.isStaleConfirmModalSnapshot(postBuildSnapshot, { confirmOpen: false }), false);

assert.strictEqual(UiWatchdog.isStalePendingModalSnapshot({
    allowedActions: ['resolveIT'],
    ui: { pendingMenu: { htmlLength: 10 } },
}, true), false);
assert.strictEqual(UiWatchdog.isStalePendingModalSnapshot({
    allowedActions: [],
    ui: { pendingMenu: { htmlLength: 10 } },
}, true), true);
assert.strictEqual(UiWatchdog.isStalePendingModalSnapshot({
    allowedActions: ['resolveIT'],
    ui: { pendingMenu: { htmlLength: 0 } },
}, true), true);
assert.strictEqual(UiWatchdog.isStalePendingModalSnapshot({}, false), false);
assert.strictEqual(UiWatchdog.isOnlineUiBlockedSnapshot({ isOnlineGame: false, socketConnected: false }), false);
assert.strictEqual(UiWatchdog.isOnlineUiBlockedSnapshot({ isOnlineGame: true, onlineActionInFlight: true }), true);
assert.strictEqual(UiWatchdog.isOnlineUiBlockedSnapshot({ isOnlineGame: true, isReconnectingOnline: true }), true);
assert.strictEqual(UiWatchdog.isOnlineUiBlockedSnapshot({ isOnlineGame: true, socketConnected: false }), true);
assert.strictEqual(UiWatchdog.isOnlineUiBlockedSnapshot({ isOnlineGame: true, socketConnected: true }), false);

{
    const payload = {
        freezeKind: 'cpu-turn-stalled',
        stagnantMs: 5000,
        recovery: { attempted: true, success: false },
        snapshot: {
            phase: 'build',
            currentPlayerIndex: 1,
            myPlayerIndex: -1,
            isOnlineGame: false,
            cpuStepScheduled: false,
            cpuSchedulerHealth: { blockedReason: '' },
            onlineActionInFlight: false,
            isReconnectingOnline: false,
            socketConnected: null,
            allowedActions: ['nextTurn'],
            visibleModals: [],
            bodyClassName: '',
            ui: {
                gameScreen: { display: 'block', hidden: false, inert: false, ariaHidden: null, pointerEvents: 'auto' },
                confirmModal: { display: 'none', hidden: false, inert: false, ancestorBlocked: false, pointerEvents: 'auto' },
                pendingMenu: { display: '', hidden: false, inert: false, ancestorBlocked: false, pointerEvents: 'auto', htmlLength: 0 },
                pendingModal: { display: 'none', hidden: false, inert: false, pointerEvents: 'none' },
            },
        },
    };
    const before = JSON.stringify(payload);
    const stack = UiWatchdog.buildFreezeReportStack(payload, {
        schemaVersion: 2,
        confirmAwaitingChoice: false,
        expectedPrimaryActions: ['nextTurn'],
        interactabilityIssues: [{ reason: 'missing' }],
        actionChildren: [{ action: 'nextTurn' }],
    });
    const report = JSON.parse(stack.replace(/^FREEZE_SUMMARY /, ''));

    assert.strictEqual(report.schemaVersion, 2);
    assert.strictEqual(report.freezeKind, 'cpu-turn-stalled');
    assert.strictEqual(report.recoveryStatus, 'recovery=failed');
    assert.strictEqual(report.phase, 'build');
    assert.deepStrictEqual(report.expectedPrimaryActions, ['nextTurn']);
    assert.deepStrictEqual(report.interactabilityIssues, [{ reason: 'missing' }]);
    assert.deepStrictEqual(report.actionChildren, [{ action: 'nextTurn' }]);
    assert.strictEqual(report.confirmModal.awaitingChoice, false);
    assert.deepStrictEqual(report.recovery, { attempted: true, success: false });
    assert.strictEqual(JSON.stringify(payload), before);
}

{
    const stack = UiWatchdog.buildFreezeReportStack({ snapshot: {} });
    const report = JSON.parse(stack.replace(/^FREEZE_SUMMARY /, ''));

    assert.strictEqual(report.schemaVersion, 1);
    assert.strictEqual(report.recoveryStatus, 'recovery=none');
    assert.strictEqual(report.gameScreen, null);
    assert.strictEqual(report.confirmModal, null);
    assert.deepStrictEqual(report.expectedPrimaryActions, []);
    assert.deepStrictEqual(report.interactabilityIssues, []);
    assert.deepStrictEqual(report.actionChildren, []);
    assert.strictEqual(report.recovery, null);
}

{
    const entries = [
        { event: 'first', timestamp: 't1', details: { attempt: 1 }, snapshot: { phase: 'roll', allowedActions: ['rollDice'] } },
        { event: 'second', timestamp: 't2', snapshot: { phase: 'build', allowedActions: ['nextTurn'] } },
        null,
    ];
    const before = JSON.stringify(entries);
    const compact = UiWatchdog.compactRecentCheckpoints(entries, 2);

    assert.deepStrictEqual(compact, [
        { event: 'second', timestamp: 't2', details: {}, phase: 'build', allowedActions: ['nextTurn'] },
        { event: '', timestamp: '', details: {}, phase: '', allowedActions: [] },
    ]);
    assert.strictEqual(JSON.stringify(entries), before);
    assert.deepStrictEqual(UiWatchdog.compactRecentCheckpoints(null), []);
    assert.deepStrictEqual(UiWatchdog.compactRecentCheckpoints(entries, 0), []);
}

{
    const snapshot = {
        phase: 'build',
        turnCount: 4,
        currentPlayerIndex: 1,
        pendingFields: {},
    };
    assert.strictEqual(
        UiWatchdog.issueDedupeSignature(snapshot, []),
        UiWatchdog.stateKey(snapshot)
    );
    assert.strictEqual(UiWatchdog.issueDedupeSignature(snapshot, [
        { freezeKind: 'pending-ui-locked', kind: 'hidden', phase: 'pending', action: 'resolveTV', target: 'pendingMenu', reason: 'display-none' },
        { freezeKind: '', kind: 'ignored' },
        { freezeKind: 'human-turn-ui-locked', kind: 'disabled', action: 'nextTurn', target: 'btnSkip' },
    ]), [
        'human-turn-ui-locked:disabled::nextTurn:btnSkip:',
        'pending-ui-locked:hidden:pending:resolveTV:pendingMenu:display-none',
    ].join('|'));
}


{
    const snapshot = {
        phase: 'build',
        isOnlineGame: false,
        isCpuTurn: false,
        allowedActions: ['nextTurn'],
        bodyClassName: 'modal-open',
        ui: { gameScreen: { inert: true } },
    };
    const observations = {
        activeModals: [],
        missingRegistryEntries: [{ action: 'unregistered', phase: 'build' }],
        expectedContainers: [{
            action: 'nextTurn',
            spec: { targetId: 'btnSkip' },
            state: { id: 'btnSkip', disabled: true },
            usable: false,
            reason: 'disabled-mismatch',
            ignore: false,
        }],
    };
    const before = JSON.stringify({ snapshot, observations });
    assert.deepStrictEqual(UiWatchdog.buildInteractabilityIssues(snapshot, observations, kinds), [
        {
            kind: 'allowed-action-missing-container-registry',
            action: 'unregistered',
            target: '',
            actionTarget: 'unregistered',
            phase: 'build',
            reason: 'missing-registry',
            freezeKind: kinds.HUMAN_TURN_UI_LOCKED,
        },
        {
            kind: 'allowed-action-container-not-clickable',
            action: 'nextTurn',
            target: 'btnSkip',
            actionTarget: 'nextTurn',
            phase: 'build',
            reason: 'disabled-mismatch',
            freezeKind: kinds.HUMAN_TURN_UI_LOCKED,
        },
        {
            kind: 'orphan-game-screen-lock',
            target: 'gameScreen',
            reason: 'parent-inert',
            freezeKind: kinds.HUMAN_TURN_UI_LOCKED,
        },
        {
            kind: 'stale-modal-body-lock',
            target: 'body',
            reason: 'stale-modal',
            freezeKind: kinds.HUMAN_TURN_UI_LOCKED,
        },
    ]);
    assert.strictEqual(JSON.stringify({ snapshot, observations }), before);
}

{
    const snapshot = {
        phase: 'build',
        isOnlineGame: false,
        isCpuTurn: false,
        allowedActions: ['nextTurn'],
        ui: {},
    };
    const observations = {
        activeModals: [
            { id: 'confirmModal', state: { inert: true, pointerEvents: 'none' } },
            { id: 'rulesModal', state: { computedPointerEvents: 'none' } },
        ],
        expectedContainers: [{ action: 'nextTurn', usable: false }],
    };
    assert.deepStrictEqual(UiWatchdog.buildInteractabilityIssues(snapshot, observations, kinds), [
        {
            kind: 'nested-blocking-modal-policy-violation',
            reason: 'nested-blocking-modal',
            target: 'confirmModal,rulesModal',
            freezeKind: kinds.MODAL_UI_LOCKED,
        },
        { kind: 'visible-modal-inert', reason: 'parent-inert', target: 'confirmModal', freezeKind: kinds.MODAL_UI_LOCKED },
        { kind: 'visible-modal-pointer-events-none', reason: 'pointer-events-none', target: 'confirmModal', freezeKind: kinds.MODAL_UI_LOCKED },
        { kind: 'visible-modal-pointer-events-none', reason: 'pointer-events-none', target: 'rulesModal', freezeKind: kinds.MODAL_UI_LOCKED },
    ]);
}

assert.deepStrictEqual(UiWatchdog.buildInteractabilityIssues(null, {}, kinds), []);
assert.deepStrictEqual(UiWatchdog.buildInteractabilityIssues({
    phase: 'build',
    isOnlineGame: true,
    currentPlayerIndex: 0,
    myPlayerIndex: 1,
}, {
    missingRegistryEntries: [{ action: 'nextTurn', phase: 'build' }],
}, kinds), []);


{
    const snapshot = {
        phase: 'build',
        isOnlineGame: false,
        isCpuTurn: false,
        allowedActions: ['buildCard', 'nextTurn'],
    };
    const entries = [
        { action: 'buildCard', spec: { targetId: 'buildMenu' }, usable: false },
        { action: 'nextTurn', spec: { targetId: 'btnSkip' }, usable: false },
        { action: 'undoBuild', spec: { targetId: 'buildMenu' }, usable: true },
    ];
    const issues = [{ kind: 'allowed-action-container-not-clickable', action: 'nextTurn' }];
    const before = JSON.stringify({ snapshot, entries, issues });
    assert.strictEqual(UiWatchdog.canRecoverActionContainers(snapshot, false), true);
    assert.deepStrictEqual(
        UiWatchdog.actionContainerRecoveryPlan(snapshot, { entries, issues }),
        [entries[1]]
    );
    assert.deepStrictEqual(
        UiWatchdog.actionContainerRecoveryPlan(snapshot, { entries, issues: [] }),
        [entries[0], entries[1]]
    );
    assert.strictEqual(JSON.stringify({ snapshot, entries, issues }), before);
}

assert.strictEqual(UiWatchdog.canRecoverActionContainers({
    phase: 'build', isCpuTurn: true,
}, false), false);
assert.strictEqual(UiWatchdog.canRecoverActionContainers({
    phase: 'build', isOnlineGame: true, currentPlayerIndex: 0, myPlayerIndex: 0,
    onlineActionInFlight: true,
}, false), false);
assert.strictEqual(UiWatchdog.canRecoverActionContainers({
    phase: 'build', isOnlineGame: false, isCpuTurn: false, allowedActions: ['nextTurn'],
}, true), false);
assert.strictEqual(UiWatchdog.canRecoverActionContainers({
    phase: 'pending', isOnlineGame: false, isCpuTurn: false, allowedActions: ['resolveTV'],
}, true), true);
assert.deepStrictEqual(UiWatchdog.actionContainerRecoveryPlan(null, { entries: [{}] }), []);

console.log('ui watchdog tests passed');
