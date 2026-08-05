const assert = require('assert');
const { CPUBuildProposalCollector } = require('../js/cpuBuildProposalCollector');
const { runTest } = require('./helpers/test-utils');

runTest('CPU build proposal collector は最初のcanonical actionだけを保持する', () => {
    const calls = [];
    const first = { action: 'buildCard', data: { cardName: 'first' } };
    const second = { action: 'buildLandmark', data: { name: 'second' } };
    const collector = CPUBuildProposalCollector.create({
        createCardBuildAction(card) { calls.push(['card', card]); return first; },
        createLandmarkBuildAction(name) { calls.push(['landmark', name]); return second; },
    });
    const card = { name: 'first' };

    assert.strictEqual(collector.selectCard(card), true);
    assert.strictEqual(collector.selectLandmark('second'), true);
    assert.strictEqual(collector.selectedAction(), first);
    assert.deepStrictEqual(calls, [['card', card], ['landmark', 'second']]);
    assert.ok(Object.isFrozen(collector));
});

runTest('CPU build proposal collector は不正候補を無視して次の合法候補を採用する', () => {
    const accepted = { action: 'buildLandmark', data: { name: 'station' } };
    const collector = CPUBuildProposalCollector.create({
        createCardBuildAction: () => null,
        createLandmarkBuildAction: () => accepted,
    });

    assert.strictEqual(collector.selectCard(null), false);
    assert.strictEqual(collector.selectedAction(), null);
    assert.strictEqual(collector.selectLandmark('station'), true);
    assert.strictEqual(collector.selectedAction(), accepted);
});

runTest('CPU build proposal collector はadapter欠落をfail-closedで扱う', () => {
    const collector = CPUBuildProposalCollector.create();
    assert.strictEqual(collector.selectCard({ name: 'x' }), false);
    assert.strictEqual(collector.selectLandmark('x'), false);
    assert.strictEqual(collector.selectedAction(), null);
});
