'use strict';

const assert = require('assert');
const { gameSchemaShadowEnabled, makeGameSchemaShadow } = require('../server/gameSchemaShadow');
const { runTest } = require('./helpers/test-utils');

runTest('game schema shadow flagは明示的な有効値だけを受理する', () => {
    assert.strictEqual(gameSchemaShadowEnabled({}), false);
    assert.strictEqual(gameSchemaShadowEnabled({ GAME_SCHEMA_SHADOW_ENABLED: '1' }), true);
    assert.strictEqual(gameSchemaShadowEnabled({ GAME_SCHEMA_SHADOW_ENABLED: 'TRUE' }), true);
    assert.strictEqual(gameSchemaShadowEnabled({ GAME_SCHEMA_SHADOW_ENABLED: 'off' }), false);
});

runTest('game schema shadowは既定OFFとselection欠落でadapterを呼ばない', () => {
    let calls = 0;
    const dependencies = {
        serializeMirrorState() { calls++; return {}; },
        transitionMirrorEnvelope() { calls++; return { ok: true, snapshot: {} }; },
        stableStateHash() { calls++; return 'hash'; },
    };
    const disabled = makeGameSchemaShadow(Object.assign({ enabled: false }, dependencies));
    assert.strictEqual(disabled.prepare({}, {}, { action: 'nextTurn', data: {}, seq: 1 }), null);
    const enabled = makeGameSchemaShadow(Object.assign({ enabled: true }, dependencies));
    assert.strictEqual(enabled.prepare({ gameStartPayload: {} }, {}, { action: 'nextTurn', data: {}, seq: 1 }), null);
    assert.strictEqual(calls, 0);
});

runTest('game schema shadowはliveとshadowの一致をhashで判定する', () => {
    const selection = { actionVersion: 1, snapshotVersion: 1 };
    const mirror = { game: { value: 1 }, shopStock: {}, lastUndoState: null };
    const shadow = makeGameSchemaShadow({
        enabled: true,
        serializeMirrorState(game, _stock, _undo, actionSeq) { return { value: game.value, actionSeq }; },
        transitionMirrorEnvelope(request) {
            assert.strictEqual(request.selection, selection);
            assert.deepStrictEqual(request.snapshot, { value: 1, actionSeq: 6 });
            return { ok: true, snapshot: { value: 2, actionSeq: 7 } };
        },
        stableStateHash(value) { return JSON.stringify(value); },
    });
    const room = { gameStartPayload: { gameSchema: selection, enabledLandmarks: ['駅'] } };
    const actionEntry = { action: 'nextTurn', data: {}, seq: 7 };
    const transition = shadow.prepare(room, mirror, actionEntry);
    mirror.game.value = 2;
    const report = shadow.compare(mirror, actionEntry, transition);
    assert.strictEqual(report.status, 'matched');
    assert.strictEqual(report.action, 'nextTurn');
    assert.strictEqual(report.actionSeq, 7);
    assert.strictEqual(report.shadowHash, report.liveHash);
});

runTest('game schema shadowは不一致と例外をaction失敗にせずreport化する', () => {
    const actionEntry = { action: 'buildCard', data: { cardName: '麦畑' }, seq: 2 };
    const mismatch = makeGameSchemaShadow({
        enabled: true,
        serializeMirrorState() { return { value: 'live' }; },
        transitionMirrorEnvelope() { return { ok: true, snapshot: { value: 'shadow' } }; },
        stableStateHash(value) { return value.value; },
    });
    const prepared = mismatch.prepare({ gameStartPayload: { gameSchema: { actionVersion: 1, snapshotVersion: 1 } } }, { game: {}, shopStock: {} }, actionEntry);
    assert.strictEqual(mismatch.compare({ game: {}, shopStock: {} }, actionEntry, prepared).status, 'mismatch');

    const throwing = makeGameSchemaShadow({
        enabled: true,
        serializeMirrorState() { return {}; },
        transitionMirrorEnvelope() { throw new Error('shadow only'); },
        stableStateHash() { return 'unused'; },
    });
    const failed = throwing.prepare({ gameStartPayload: { gameSchema: { actionVersion: 1, snapshotVersion: 1 } } }, { game: {}, shopStock: {} }, actionEntry);
    const report = throwing.compare({ game: {}, shopStock: {} }, actionEntry, failed);
    assert.strictEqual(report.status, 'transition-error');
    assert.strictEqual(report.reason, 'shadow-transition-threw');
});
