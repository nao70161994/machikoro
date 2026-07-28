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

console.log('ui watchdog tests passed');
