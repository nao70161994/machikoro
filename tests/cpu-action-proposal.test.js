'use strict';

const assert = require('assert');
const GameActionContract = require('../js/actionContract');
const { CPUActionProposal } = require('../js/cpuActionProposal');
const { runTest } = require('./helpers/test-utils');

function validCanonicalData(action, variant) {
    if (action === 'resolveBusiness' && variant.includes('skip')) return { skip: true };
    if (action === 'resolveMover' && variant.includes('cardName')) {
        return { cardName: '麦畑', targetIndex: 1 };
    }
    const data = {
        rollDice: { forceDice: 3, tunaDice: [2, 5] },
        selectDice: { useTwo: true, diceCount: 2, d1: 2, d2: 5, tunaDice: [1, 6] },
        rerollDice: { forceDice: 4, tunaDice: [3, 4] },
        skipReroll: {},
        resolveHarbor: { useBonus: false },
        resolveTV: { targetIndex: 1 },
        resolveBusiness: { myCard: 0, targetIndex: 1, theirCard: 0 },
        resolveCleaning: { cardName: '麦畑' },
        resolveMover: { cardIndex: 0, targetIndex: 1 },
        resolveRenovation: { landmarkName: '駅' },
        resolveIT: { doSave: true },
        buildCard: { cardName: '麦畑' },
        buildLandmark: { name: '駅' },
        undoBuild: {},
        nextTurn: {},
    }[action];
    if (['rollDice', 'rerollDice', 'selectDice'].includes(action)) {
        return Object.fromEntries(Object.entries(data).filter(([key]) => variant.includes(key)));
    }
    return data;
}

runTest('CPU action proposalはAction Contract全actionのcanonical keyを受理する', () => {
    for (const entry of GameActionContract.entries) {
        for (const variant of entry.canonicalPayloadVariants) {
            const data = validCanonicalData(entry.action, variant);
            const proposal = CPUActionProposal.create(entry.action, data);
            const isLegacyDiceVariant = ['rollDice', 'rerollDice', 'selectDice'].includes(entry.action) &&
                variant.length < entry.canonicalPayloadKeys.length;
            if (isLegacyDiceVariant) {
                assert.strictEqual(proposal, null, 'CPU must not generate legacy dice payload');
                assert.strictEqual(
                    GameActionContract.validateCanonicalPayload(entry.action, data, { allowLegacy: true }),
                    true
                );
                continue;
            }
            assert.ok(proposal, entry.action + ' ' + variant.join(','));
            assert.strictEqual(proposal.action, entry.action);
            assert.deepStrictEqual(Object.keys(proposal.data).sort(), Array.from(variant).sort());
        }
    }
});

runTest('CPU action proposalはcanonical key内の不正値をfail closedにする', () => {
    for (const [action, data] of [
        ['rollDice', { forceDice: 0, tunaDice: [1, 2] }],
        ['rollDice', { forceDice: 3, tunaDice: [1, NaN] }],
        ['selectDice', { useTwo: 'true', diceCount: 2, d1: 1, d2: 2, tunaDice: [1, 2] }],
        ['selectDice', { useTwo: false, diceCount: 2, d1: 1, d2: 2, tunaDice: [1, 2] }],
        ['rerollDice', { forceDice: Infinity, tunaDice: [1, 2] }],
        ['resolveHarbor', { useBonus: undefined }],
        ['resolveTV', { targetIndex: NaN }],
        ['resolveBusiness', { myCard: -1, targetIndex: 1, theirCard: 0 }],
        ['resolveBusiness', { skip: false }],
        ['resolveCleaning', { cardName: ' ' }],
        ['resolveMover', { cardIndex: Infinity, targetIndex: 1 }],
        ['resolveMover', { cardName: '', targetIndex: 1 }],
        ['resolveRenovation', { landmarkName: undefined }],
        ['resolveIT', { doSave: 1 }],
        ['buildCard', { cardName: '' }],
        ['buildLandmark', { name: null }],
    ]) {
        assert.strictEqual(CPUActionProposal.create(action, data), null, action);
        assert.strictEqual(GameActionContract.validateCanonicalPayload(action, data), false, action);
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

runTest('CPU action proposalは推測理由を足さず選んだcanonical actionを説明する', () => {
    assert.strictEqual(CPUActionProposal.explanation(
        CPUActionProposal.create('selectDice', { useTwo: true, diceCount: 2, d1: 1, d2: 2, tunaDice: [3, 4] })
    ), 'サイコロを2個振ります');
    assert.strictEqual(CPUActionProposal.explanation(
        CPUActionProposal.create('buildCard', { cardName: 'パン屋' })
    ), 'パン屋を建設します');
    assert.strictEqual(CPUActionProposal.explanation(
        CPUActionProposal.create('nextTurn', {})
    ), '建設せずターンを終了します');
    assert.strictEqual(CPUActionProposal.explanation(null), '');
});
