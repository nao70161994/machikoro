'use strict';
const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const UiMarketTarget = require('../js/uiMarketTarget');
const UiWatchdog = require('../js/uiWatchdog');

runTest('市場DOMの切替は端末表示だけで解決し旧契約とfallbackを維持する', () => {
    const documentRef = { documentElement: { dataset: { design: 'cardboard' } }, getElementById: id => id === 'cardboardMarket' ? {} : null };
    const contract = Object.freeze({ targetId: 'buildMenu', group: 'build', requiresContent: true });
    assert.strictEqual(UiMarketTarget.id(documentRef), 'cardboardMarket');
    assert.deepStrictEqual(UiMarketTarget.adaptSpec(contract, documentRef), { ...contract, targetId: 'cardboardMarket' });
    assert.strictEqual(contract.targetId, 'buildMenu');
    assert.strictEqual(UiMarketTarget.adaptSpec(null, documentRef), null);
    const dice = Object.freeze({ targetId: 'diceChoose' });
    assert.strictEqual(UiMarketTarget.adaptSpec(dice, documentRef), dice);
    for (const design of ['classic', 'sunset', 'plaza']) {
        documentRef.documentElement.dataset.design = design;
        assert.strictEqual(UiMarketTarget.id(documentRef), 'buildMenu');
    }
    documentRef.documentElement.dataset.design = 'cardboard';
    documentRef.getElementById = () => null;
    assert.strictEqual(UiMarketTarget.id(documentRef), 'buildMenu');
    assert.strictEqual(UiMarketTarget.id(null), 'buildMenu');
});

runTest('診断snapshotの論理buildMenu keyから表示中市場を参照し復旧先を一致させる', () => {
    const state = { id: 'cardboardMarket', htmlLength: 80, disabled: false };
    const snapshot = { ui: { buildMenu: state } };
    assert.strictEqual(UiMarketTarget.fromSnapshot(snapshot), 'cardboardMarket');
    assert.strictEqual(UiWatchdog.snapshotStateById(snapshot, 'cardboardMarket'), state);
    assert.strictEqual(UiWatchdog.snapshotStateById(snapshot, 'buildMenu'), state);
    assert.strictEqual(UiMarketTarget.fromSnapshot({ ui: { buildMenu: { id: 'buildMenu' } } }), 'buildMenu');
    assert.strictEqual(UiMarketTarget.fromSnapshot(null), 'buildMenu');
});
