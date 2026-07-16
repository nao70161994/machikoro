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
assert.strictEqual(classify({ onlineActionInFlight: true }), 'online-action-in-flight-stalled');

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

console.log('ui watchdog tests passed');
