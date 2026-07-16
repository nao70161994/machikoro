const assert = require('assert');
const makeCanonicalMirrorMetadata = require('../server/canonicalMirrorMetadata');
const { runTest } = require('./helpers/test-utils');

function makeMetadata() {
    return makeCanonicalMirrorMetadata({
        serializeMirrorState: (game, shopStock, undoState, actionSeq) => ({ game, shopStock, undoState, actionSeq }),
        restorePayloadRank: (_start, snapshot, actionLog) => ({
            actionSeq: (snapshot?.actionSeq || 0) + (Array.isArray(actionLog) ? actionLog.length : 0),
        }),
    });
}

runTest('canonical mirror metadata はobject key順に依存しないstable hashを返す', () => {
    const metadata = makeMetadata();

    assert.strictEqual(metadata.stableHashStringify({ b: 2, a: [1, { d: 4, c: 3 }] }), '{"a":[1,{"c":3,"d":4}],"b":2}');
    assert.strictEqual(metadata.stableStateHash({ b: 2, a: 1 }), metadata.stableStateHash({ a: 1, b: 2 }));
    assert.match(metadata.stableStateHash({ a: 1 }), /^[a-f0-9]{16}$/);
});

runTest('canonical mirror metadata はserialize済みmirror全体をhash対象にする', () => {
    const metadata = makeMetadata();
    const mirror = { game: { phase: 'build' }, shopStock: { 麦畑: 5 }, lastUndoState: { phase: 'roll' } };

    assert.strictEqual(metadata.canonicalMirrorStateHash(null), null);
    assert.strictEqual(
        metadata.canonicalMirrorStateHash(mirror),
        metadata.stableStateHash({
            game: mirror.game,
            shopStock: mirror.shopStock,
            undoState: mirror.lastUndoState,
            actionSeq: 0,
        })
    );
});

runTest('canonical mirror metadata はrestore rankとlog長からmarkerを作る', () => {
    const metadata = makeMetadata();
    const room = { gameStartPayload: {}, stateSnapshot: { actionSeq: 4 }, actionLog: [{}, {}] };

    assert.deepStrictEqual(metadata.roomCanonicalMirrorMarker(room), { actionSeq: 6, actionLogLength: 2 });
    assert.deepStrictEqual(metadata.roomCanonicalMirrorMarker({ gameStartPayload: {}, stateSnapshot: null, actionLog: null }), {
        actionSeq: 0,
        actionLogLength: 0,
    });
});
