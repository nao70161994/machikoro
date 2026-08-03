'use strict';

const assert = require('assert');
const { PendingActionQueue } = require('../js/pendingActionQueue');
const { runTest } = require('./helpers/test-utils');

const ACTIONS = Object.freeze({
    RESOLVE_TV: 'resolveTV',
    RESOLVE_BUSINESS: 'resolveBusiness',
    RESOLVE_CLEANING: 'resolveCleaning',
    RESOLVE_MOVER: 'resolveMover',
    RESOLVE_RENOVATION: 'resolveRenovation',
});
const contract = PendingActionQueue.createContract(ACTIONS);

runTest('pending action contractはfield/action対応をfrozenで保持する', () => {
    assert.ok(Object.isFrozen(contract));
    assert.ok(Object.isFrozen(contract.specs));
    assert.deepStrictEqual(contract.specs.map(spec => [spec.field, spec.action]), [
        ['pendingTV', 'resolveTV'],
        ['pendingBusiness', 'resolveBusiness'],
        ['pendingCleaning', 'resolveCleaning'],
        ['pendingMover', 'resolveMover'],
        ['pendingRenovation', 'resolveRenovation'],
    ]);
    assert.strictEqual(contract.byField.pendingMover, contract.byAction.resolveMover);
});

runTest('normalizeは一致するqueueを入力非変更で正規化する', () => {
    const game = {
        pendingTV: 2,
        pendingBusiness: 1,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingActionQueue: [
            { field: 'pendingTV' },
            { action: 'resolveBusiness' },
            { action: 'resolveTV', field: 'pendingTV' },
        ],
    };
    const before = JSON.stringify(game);
    assert.deepStrictEqual(PendingActionQueue.normalize(game, contract), [
        { action: 'resolveTV', field: 'pendingTV', count: 1 },
        { action: 'resolveBusiness', field: 'pendingBusiness', count: 1 },
        { action: 'resolveTV', field: 'pendingTV', count: 1 },
    ]);
    assert.strictEqual(JSON.stringify(game), before);
});

runTest('normalizeはfield/action不一致またはfield count差を採用しない', () => {
    const mismatch = {
        pendingTV: 1,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingActionQueue: [{ field: 'pendingTV', action: 'resolveBusiness' }],
    };
    assert.deepStrictEqual(PendingActionQueue.normalize(mismatch, contract), []);
    mismatch.pendingActionQueue = [{ field: 'pendingTV' }, { field: 'pendingTV' }];
    assert.deepStrictEqual(PendingActionQueue.normalize(mismatch, contract), []);
});

runTest('ensureは壊れたqueueを既存field順で再構築する', () => {
    const game = {
        pendingTV: 1,
        pendingBusiness: 0,
        pendingCleaning: 2,
        pendingMover: 0,
        pendingRenovation: 1,
        pendingActionQueue: [{ action: 'unknown', field: 'unknown' }],
    };
    const expected = [
        { action: 'resolveTV', field: 'pendingTV' },
        { action: 'resolveCleaning', field: 'pendingCleaning' },
        { action: 'resolveCleaning', field: 'pendingCleaning' },
        { action: 'resolveRenovation', field: 'pendingRenovation' },
    ];
    assert.deepStrictEqual(PendingActionQueue.ensure(game, contract), expected);
    assert.deepStrictEqual(game.pendingActionQueue, expected);
});

runTest('groupは連続entryだけをまとめて順序を保持する', () => {
    assert.deepStrictEqual(PendingActionQueue.group([
        { action: 'resolveTV', field: 'pendingTV' },
        { action: 'resolveTV', field: 'pendingTV' },
        { action: 'resolveMover', field: 'pendingMover' },
        { action: 'resolveTV', field: 'pendingTV' },
    ]), [
        { action: 'resolveTV', field: 'pendingTV', count: 2 },
        { action: 'resolveMover', field: 'pendingMover', count: 1 },
        { action: 'resolveTV', field: 'pendingTV', count: 1 },
    ]);
});
