'use strict';

const assert = require('assert');
const SavedGameValidation = require('../js/savedGameValidation');
const { runTest } = require('./helpers/test-utils');

function makeValidator() {
    return SavedGameValidation.createValidator({
        isKnownCardName: name => ['麦畑', 'パン屋', 'スタジアム'].includes(name),
        isKnownLandmarkName: name => ['駅', 'ショッピングモール'].includes(name),
        isMajorCardName: name => name === 'スタジアム',
        cardNameById: { wheat_field: '麦畑', bakery: 'パン屋' },
    });
}

function makeState(overrides = {}) {
    return Object.assign({
        players: [
            { name: 'P1', coins: 3, cards: ['麦畑'], dormantIndices: [], landmarks: { 駅: false } },
            { name: 'P2', coins: 3, cards: [], dormantIndices: [], landmarks: {} },
        ],
        currentPlayerIndex: 0,
        phase: 'build',
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingActions: [],
        shopStock: { wheat_field: 4, パン屋: 0 },
        enabledCardsList: ['麦畑'],
        enabledLandmarksList: ['駅', 'ショッピングモール'],
    }, overrides);
}

runTest('saved game validatorは旧card IDと現在名を同じ在庫名へ解決する', () => {
    const validator = makeValidator();
    assert.strictEqual(validator.savedShopStockNameFromKey('wheat_field'), '麦畑');
    assert.strictEqual(validator.savedShopStockNameFromKey('パン屋'), 'パン屋');
    assert.strictEqual(validator.savedShopStockNameFromKey('unknown'), null);
});

runTest('saved game validatorは現行保存shapeと旧CPU設定を保持する', () => {
    const validator = makeValidator();
    const state = makeState();
    assert.strictEqual(validator.isValidSavedGameState(state), true);
    assert.deepStrictEqual(SavedGameValidation.normalizeCpuSettings({
        players: state.players,
        cpuSettings: ['strong'],
    }), [
        { difficulty: 'strong' },
        { difficulty: 'normal' },
    ]);
    assert.deepStrictEqual(SavedGameValidation.normalizeCpuSettings({
        players: state.players,
        cpuSettings: [{ difficulty: 'rl', modelId: 'legacy-model' }, null],
    }), [
        { difficulty: 'rl', rlModelId: 'legacy-model' },
        null,
    ]);
});

runTest('saved game validatorは既存の不正保存境界をfail closedにする', () => {
    const validator = makeValidator();
    const cases = [
        null,
        makeState({ currentPlayerIndex: 2 }),
        makeState({ phase: 'unknown' }),
        makeState({ pendingBusiness: 1, pendingActions: [] }),
        makeState({ pendingBusiness: 1, pendingActions: [{ field: 'pendingBusiness', action: 'resolveTV' }] }),
        makeState({ phase: 'build', pendingIT: true }),
        makeState({ pendingTunaDice: [0, 7] }),
        makeState({ enabledCardsList: ['unknown'] }),
        makeState({ shopStock: { パン屋: 1 }, enabledCardsList: ['麦畑'] }),
        makeState({ players: [
            { name: 'P1', coins: 3.5, cards: [], dormantIndices: [], landmarks: {} },
            { name: 'P2', coins: 3, cards: [], dormantIndices: [], landmarks: {} },
        ] }),
        makeState({ players: [
            { name: 'P1', coins: 3, cards: ['麦畑'], dormantIndices: [0, 0], landmarks: {} },
            { name: 'P2', coins: 3, cards: [], dormantIndices: [], landmarks: {} },
        ] }),
        makeState({ players: [
            { name: 'P1', coins: 3, cards: ['スタジアム'], dormantIndices: [0], landmarks: {} },
            { name: 'P2', coins: 3, cards: [], dormantIndices: [], landmarks: {} },
        ] }),
    ];
    for (const value of cases) assert.strictEqual(validator.isValidSavedGameState(value), false);
});

runTest('saved game validatorはpending件数をserver snapshotと同じ50件へ制限する', () => {
    const validator = makeValidator();
    const pendingTV = Array.from({ length: 50 }, () => ({
        field: 'pendingTV',
        action: 'resolveTV',
    }));
    assert.strictEqual(SavedGameValidation.maxPendingCount, 50);
    assert.strictEqual(validator.isValidSavedGameState(makeState({
        phase: 'pending',
        pendingTV: 50,
        pendingActions: pendingTV,
    })), true);
    for (const state of [
        makeState({ phase: 'pending', pendingTV: 51, pendingActions: undefined }),
        makeState({ phase: 'pending', pendingTV: 26, pendingBusiness: 25, pendingActions: undefined }),
        makeState({ phase: 'pending', pendingTV: 51, pendingActions: pendingTV.concat(pendingTV[0]) }),
        makeState({ phase: 'build', pendingTV: 1, pendingActions: [{ field: 'pendingTV', action: 'resolveTV' }] }),
    ]) {
        assert.strictEqual(validator.isValidSavedGameState(state), false);
    }
});

runTest('saved game validatorはpending phaseをIT単独か通常pendingのどちらかに限定する', () => {
    const validator = makeValidator();
    const legacyNumericPending = makeState({ phase: 'pending', pendingTV: 1 });
    delete legacyNumericPending.pendingActions;
    const mixedPending = makeState({ phase: 'pending', pendingIT: true, pendingTV: 1 });
    delete mixedPending.pendingActions;
    assert.strictEqual(validator.isValidSavedGameState(makeState({
        phase: 'pending',
        pendingIT: true,
    })), true);
    assert.strictEqual(validator.isValidSavedGameState(legacyNumericPending), true);
    assert.strictEqual(validator.isValidSavedGameState(makeState({
        phase: 'pending',
    })), false);
    assert.strictEqual(validator.isValidSavedGameState(mixedPending), false);
});

runTest('saved game validatorは復元logを構造化entryの直近30件へ正規化する', () => {
    const log = Array.from({ length: 31 }, (_, index) => ({
        type: 'system',
        message: `log-${index}`,
    }));
    log.splice(10, 0, null, { type: 'system' }, { message: 'missing type' });
    const normalized = SavedGameValidation.normalizeSavedLog(log);
    assert.strictEqual(SavedGameValidation.maxLogEntries, 30);
    assert.strictEqual(normalized.length, 30);
    assert.deepStrictEqual(normalized[0], { type: 'system', message: 'log-1' });
    assert.deepStrictEqual(normalized.at(-1), { type: 'system', message: 'log-30' });
    assert.deepStrictEqual(SavedGameValidation.normalizeSavedLog(null), []);
});

runTest('saved game validatorは依存未注入時に未知cardとlandmarkを拒否する', () => {
    const validator = SavedGameValidation.createValidator();
    assert.strictEqual(validator.isValidSavedGameState(makeState()), false);
});
