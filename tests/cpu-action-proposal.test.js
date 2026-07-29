'use strict';

const assert = require('assert');
const GameActionContract = require('../js/actionContract');
const { CPUActionProposal } = require('../js/cpuActionProposal');
const { runTest } = require('./helpers/test-utils');

runTest('CPU action proposalはAction Contract全actionのcanonical keyを受理する', () => {
    for (const entry of GameActionContract.entries) {
        for (const variant of entry.canonicalPayloadVariants) {
            const data = Object.fromEntries(variant.map(key => [key, undefined]));
            const proposal = CPUActionProposal.create(entry.action, data);
            assert.ok(proposal, entry.action + ' ' + variant.join(','));
            assert.strictEqual(proposal.action, entry.action);
            assert.deepStrictEqual(Object.keys(proposal.data).sort(), Array.from(variant).sort());
        }
    }
});

runTest('CPU action proposalは入力を変更せずdetached frozen値を返す', () => {
    const data = { forceDice: 4, tunaDice: [2, 5] };
    const proposal = CPUActionProposal.create('rollDice', data);

    assert.deepStrictEqual(proposal, {
        action: 'rollDice',
        data: { forceDice: 4, tunaDice: [2, 5] },
    });
    assert.notStrictEqual(proposal.data, data);
    assert.notStrictEqual(proposal.data.tunaDice, data.tunaDice);
    assert.ok(Object.isFrozen(proposal));
    assert.ok(Object.isFrozen(proposal.data));
    assert.ok(Object.isFrozen(proposal.data.tunaDice));
    assert.deepStrictEqual(data, { forceDice: 4, tunaDice: [2, 5] });
});

runTest('CPU action proposalは未知actionとpayload key driftをfail closedにする', () => {
    assert.strictEqual(CPUActionProposal.create('unknown', {}), null);
    assert.strictEqual(CPUActionProposal.create('nextTurn', { extra: true }), null);
    assert.strictEqual(CPUActionProposal.create('resolveTV', {}), null);
    assert.strictEqual(CPUActionProposal.create('resolveTV', null), null);
    const cyclic = [];
    cyclic.push(cyclic);
    assert.strictEqual(CPUActionProposal.create('rollDice', { forceDice: 1, tunaDice: cyclic }), null);
    assert.ok(CPUActionProposal.create('resolveMover', { cardIndex: 0, targetIndex: 1 }));
    assert.ok(CPUActionProposal.create('resolveMover', { cardName: '麦畑', targetIndex: 1 }));
});
