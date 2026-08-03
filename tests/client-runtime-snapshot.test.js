const assert = require('assert');
const ClientRuntimeSnapshot = require('../js/clientRuntimeSnapshot');

const references = {
    health: { token: 4, stepScheduled: true },
    actions: ['nextTurn'],
    active: { id: 'btnSkip' },
    modals: ['confirmModal'],
    overlays: { noticeToast: { display: 'block' } },
    buttons: { buttons: {}, enabled: ['btnSkip'] },
    pending: { pendingIT: true },
    ui: { btnSkip: { disabled: false } },
};
const snapshot = ClientRuntimeSnapshot.build({
    reason: 'watchdog',
    timestamp: '2026-08-03T00:00:00.000Z',
    game: {
        phase: 'build', hasWinner: false, builtThisTurn: true,
        turnCount: 0, currentPlayerIndex: 0, pendingFields: references.pending,
    },
    cpu: { isCpuTurn: true, stepScheduled: true, schedulerHealth: references.health },
    online: {
        isOnlineGame: false, isRoomHost: false, myPlayerIndex: 0,
        actionInFlight: false, actionInFlightAt: 0,
        isReconnecting: false, socketConnected: false,
    },
    allowedActions: references.actions,
    dom: {
        activeElement: references.active,
        bodyClassName: 'active',
        visibleModals: references.modals,
        overlays: references.overlays,
        actionButtons: references.buttons,
        ui: references.ui,
    },
});
assert.deepStrictEqual(snapshot, {
    reason: 'watchdog', timestamp: '2026-08-03T00:00:00.000Z', phase: 'build',
    hasWinner: false, builtThisTurn: true, turnCount: 0, currentPlayerIndex: 0,
    isCpuTurn: true, cpuStepScheduled: true, cpuSchedulerHealth: references.health,
    isOnlineGame: false, isRoomHost: false, myPlayerIndex: 0,
    onlineActionInFlight: false, onlineActionInFlightAt: 0,
    isReconnectingOnline: false, socketConnected: false,
    allowedActions: references.actions, activeElement: references.active,
    bodyClassName: 'active', visibleModals: references.modals,
    overlays: references.overlays, actionButtons: references.buttons,
    pendingFields: references.pending, ui: references.ui,
});
assert.deepStrictEqual(ClientRuntimeSnapshot.build(), {
    reason: '', timestamp: '', phase: '', hasWinner: false, builtThisTurn: false,
    turnCount: null, currentPlayerIndex: null, isCpuTurn: false,
    cpuStepScheduled: false, cpuSchedulerHealth: null, isOnlineGame: null,
    isRoomHost: null, myPlayerIndex: null, onlineActionInFlight: null,
    onlineActionInFlightAt: null, isReconnectingOnline: null, socketConnected: null,
    allowedActions: [], activeElement: null, bodyClassName: '', visibleModals: [],
    overlays: {}, actionButtons: { buttons: {}, enabled: [] }, pendingFields: null, ui: {},
});

console.log('client-runtime-snapshot.test.js passed');
