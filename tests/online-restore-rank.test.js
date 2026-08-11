const assert = require('assert');
global.OnlineRestoreMetadata = require('../js/onlineRestoreMetadata');
const { OnlineRestoreRank } = require('../js/onlineRestoreRank');
const { runTest } = require('./helpers/test-utils');

const ACTIONS = Object.freeze({
    rollDice: Object.freeze({}),
    nextTurn: Object.freeze({}),
});

runTest('online restore rank はserver actionSeqの既存max計算を維持する', () => {
    assert.strictEqual(OnlineRestoreRank.serverActionSeq(
        { actionSeq: 4 },
        { actionSeq: 8 },
        [{ seq: 3 }, { seq: 12 }, { seq: '99' }]
    ), 12);
    assert.strictEqual(OnlineRestoreRank.serverActionSeq(null, null, null), 0);
});

runTest('online restore rank は既知actionだけをsnapshot進捗へ加算する', () => {
    const actionLog = [
        { action: 'rollDice', seq: 1000 },
        { action: 'unknown', seq: 1001 },
        { action: 'nextTurn' },
        null,
    ];

    assert.strictEqual(OnlineRestoreRank.isRankAction(actionLog[0], ACTIONS), true);
    assert.strictEqual(OnlineRestoreRank.isRankAction(actionLog[1], ACTIONS), false);
    assert.strictEqual(OnlineRestoreRank.isRankAction(actionLog[0], null), false);
    assert.strictEqual(OnlineRestoreRank.replaySeq({ actionSeq: 7 }, actionLog, ACTIONS), 9);
});

runTest('online restore rank はhostEpochとreplay可能進捗だけで順位を作る', () => {
    assert.deepStrictEqual(OnlineRestoreRank.build(
        { hostEpoch: 3, actionSeq: 9999 },
        { actionSeq: 5 },
        [{ action: 'rollDice', seq: 100 }],
        ACTIONS
    ), {
        hostEpoch: 3,
        actionSeq: 6,
    });
    assert.deepStrictEqual(OnlineRestoreRank.build(null, null, null, ACTIONS), {
        hostEpoch: 0,
        actionSeq: 0,
    });
});

runTest('online restore rank はmetadataをnonnegative safe integerへ制限する', () => {
    const invalidValues = [-1, Number.MAX_SAFE_INTEGER + 1, Number.MAX_VALUE];
    for (const value of invalidValues) {
        assert.strictEqual(OnlineRestoreRank.serverActionSeq(
            { actionSeq: value },
            { actionSeq: value },
            [{ seq: value }]
        ), 0);
        assert.deepStrictEqual(OnlineRestoreRank.build(
            { hostEpoch: value },
            { actionSeq: value },
            [],
            ACTIONS
        ), { hostEpoch: 0, actionSeq: 0 });
    }
    assert.deepStrictEqual(OnlineRestoreRank.build(
        { hostEpoch: Number.MAX_SAFE_INTEGER },
        { actionSeq: Number.MAX_SAFE_INTEGER },
        [{ action: 'nextTurn' }],
        ACTIONS
    ), {
        hostEpoch: Number.MAX_SAFE_INTEGER,
        actionSeq: Number.MAX_SAFE_INTEGER,
    });
});

runTest('online restore rank はepoch優先・同epoch進捗優先の比較を維持する', () => {
    assert.strictEqual(OnlineRestoreRank.isNewer(
        { hostEpoch: 2, actionSeq: 0 },
        { hostEpoch: 1, actionSeq: 100 },
    ), true);
    assert.strictEqual(OnlineRestoreRank.isNewer(
        { hostEpoch: 2, actionSeq: 11 },
        { hostEpoch: 2, actionSeq: 10 },
    ), true);
    assert.strictEqual(OnlineRestoreRank.isNewer(
        { hostEpoch: 2, actionSeq: 10 },
        { hostEpoch: 2, actionSeq: 10 },
    ), false);
});


runTest('online restore rank は元host bundle再提示のauthority順をpureに固定する', () => {
    const reasons = OnlineRestoreRank.localHostRestoreOfferReasons;
    const originalBundle = { gameStartPayload: { hostPlayerIndex: 0 } };
    const otherBundle = { gameStartPayload: { hostPlayerIndex: 1 } };
    const cases = [
        {
            name: 'bundleなし', bundle: null, original: 0, serverHost: 0,
            localRank: { hostEpoch: 3, actionSeq: 9 },
            serverRank: { hostEpoch: 2, actionSeq: 8 },
            expected: { offer: false, bundle: null, reason: reasons.NOT_ORIGINAL_HOST_BUNDLE },
        },
        {
            name: '別host bundle', bundle: otherBundle, original: 0, serverHost: 0,
            localRank: { hostEpoch: 3, actionSeq: 9 },
            serverRank: { hostEpoch: 2, actionSeq: 8 },
            expected: { offer: false, bundle: null, reason: reasons.NOT_ORIGINAL_HOST_BUNDLE },
        },
        {
            name: 'server現host優先', bundle: originalBundle, original: 0, serverHost: 1,
            localRank: { hostEpoch: 2, actionSeq: 99 },
            serverRank: { hostEpoch: 2, actionSeq: 8 },
            expected: { offer: false, bundle: null, reason: reasons.SERVER_HOST_AUTHORITY },
        },
        {
            name: '同rank', bundle: originalBundle, original: 0, serverHost: 0,
            localRank: { hostEpoch: 2, actionSeq: 8 },
            serverRank: { hostEpoch: 2, actionSeq: 8 },
            expected: { offer: false, bundle: null, reason: reasons.NOT_NEWER },
        },
        {
            name: '現hostかつ新しい進捗', bundle: originalBundle, original: 0, serverHost: 0,
            localRank: { hostEpoch: 2, actionSeq: 9 },
            serverRank: { hostEpoch: 2, actionSeq: 8 },
            expected: { offer: true, bundle: originalBundle, reason: reasons.OFFER_NEWER_BUNDLE },
        },
        {
            name: '新epochでhost移譲を上回る', bundle: originalBundle, original: 0, serverHost: 1,
            localRank: { hostEpoch: 3, actionSeq: 1 },
            serverRank: { hostEpoch: 2, actionSeq: 99 },
            expected: { offer: true, bundle: originalBundle, reason: reasons.OFFER_NEWER_BUNDLE },
        },
    ];
    for (const testCase of cases) {
        const plan = OnlineRestoreRank.planLocalHostRestoreOffer(
            testCase.bundle,
            testCase.original,
            testCase.serverHost,
            testCase.localRank,
            testCase.serverRank
        );
        assert.deepStrictEqual(plan, testCase.expected, testCase.name);
        assert.strictEqual(Object.isFrozen(plan), true, testCase.name);
    }
});

runTest('online restore rank local host offer authorityは完全一致時だけpure planを選ぶ', () => {
    const bundle = { gameStartPayload: { hostPlayerIndex: 0 } };
    const localRank = { hostEpoch: 2, actionSeq: 9 };
    const serverRank = { hostEpoch: 2, actionSeq: 8 };
    const legacy = Object.freeze({
        offer: true,
        bundle,
        reason: 'offer-newer-bundle',
    });
    const disabled = OnlineRestoreRank.selectLocalHostRestoreOfferPlan(
        bundle, 0, 0, localRank, serverRank, legacy
    );
    assert.strictEqual(disabled.source, 'legacy');
    assert.strictEqual(disabled.plan, legacy);
    const enabled = OnlineRestoreRank.selectLocalHostRestoreOfferPlan(
        bundle, 0, 0, localRank, serverRank, legacy, { authorityEnabled: true }
    );
    assert.strictEqual(enabled.source, 'pure-plan');
    assert.strictEqual(enabled.matched, true);
    assert.strictEqual(enabled.plan.bundle, bundle);
    const mismatch = Object.freeze({ offer: false, bundle: null, reason: 'not-newer' });
    const fallback = OnlineRestoreRank.selectLocalHostRestoreOfferPlan(
        bundle, 0, 0, localRank, serverRank, mismatch, { authorityEnabled: true }
    );
    assert.strictEqual(fallback.source, 'legacy-fallback');
    assert.strictEqual(fallback.matched, false);
    assert.strictEqual(fallback.plan, mismatch);
    assert.strictEqual(fallback.fallbackReason, 'local-host-restore-offer-plan-mismatch');
});
