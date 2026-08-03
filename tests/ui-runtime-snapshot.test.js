const assert = require('assert');
const UiRuntimeSnapshot = require('../js/uiRuntimeSnapshot');
const { runTest } = require('./helpers/test-utils');

runTest('UI runtime snapshotはflow診断shapeを入力非破壊で投影する', () => {
    const game = {
        phase: 'pending', builtThisTurn: true, turnCount: 7, currentPlayerIndex: 2,
        pendingTV: 1, pendingBusiness: 0, pendingCleaning: 2,
        pendingMover: 0, pendingRenovation: 1, pendingIT: true,
    };
    const pendingActions = [{ action: 'resolveTV', field: 'pendingTV', count: 1, extra: 'drop' }];
    const ui = { gameScreen: { display: 'block' } };
    const result = UiRuntimeSnapshot.build({
        reason: 'render', timestamp: '2026-08-03T00:00:00.000Z', game,
        isCpuTurn: true, online: { isOnlineGame: false, myPlayerIndex: 0 },
        pendingActions, ui,
    });

    assert.deepStrictEqual(result, {
        reason: 'render', timestamp: '2026-08-03T00:00:00.000Z', phase: 'pending',
        builtThisTurn: true, turnCount: 7, currentPlayerIndex: 2, isCpuTurn: true,
        isOnlineGame: false, myPlayerIndex: 0,
        pendingFields: {
            pendingTV: 1, pendingBusiness: 0, pendingCleaning: 2,
            pendingMover: 0, pendingRenovation: 1, pendingIT: true,
        },
        pendingActions: [{ action: 'resolveTV', field: 'pendingTV', count: 1 }],
        ui: { gameScreen: { display: 'block' } },
    });
    assert.deepStrictEqual(pendingActions, [{ action: 'resolveTV', field: 'pendingTV', count: 1, extra: 'drop' }]);
    result.ui.changed = true;
    assert.strictEqual(ui.changed, undefined);
});

runTest('UI runtime snapshotはgameなしと不正pendingを既存fallbackへ正規化する', () => {
    assert.deepStrictEqual(UiRuntimeSnapshot.build({ pendingActions: null }), {
        reason: '', timestamp: '', phase: null, builtThisTurn: false,
        turnCount: null, currentPlayerIndex: null, isCpuTurn: false,
        isOnlineGame: null, myPlayerIndex: null, pendingFields: null,
        pendingActions: [], ui: {},
    });
});
