'use strict';

const assert = require('assert');
const makeHostlessRestoreDiagnostics = require('../server/hostlessRestoreDiagnostics');
const { runTest } = require('./helpers/test-utils');

function makeDiagnostics() {
    const calls = [];
    const diagnostics = makeHostlessRestoreDiagnostics({
        hashRoomId(roomId) {
            calls.push(roomId);
            return '0123456789abcdef';
        },
    });
    return { calls, diagnostics };
}

runTest('hostless restore diagnostics hash room ids and expose only aggregate fields', () => {
    const { calls, diagnostics } = makeDiagnostics();
    const event = {
        type: 'candidate-approved',
        roomId: 'SECRET_ROOM',
        generation: 3,
        stage: 'confirmation',
        candidateCount: 2,
        rank: { hostEpoch: 4, actionSeq: 9, extra: 'hidden' },
        reason: 'approved',
        rawCandidate: { token: 'hidden' },
    };

    const result = diagnostics.hostlessRestoreDiagnostic(event);

    assert.deepStrictEqual(calls, ['SECRET_ROOM']);
    assert.deepStrictEqual(result, {
        event: 'candidate-approved',
        roomHash: '0123456789ab',
        generation: 3,
        stage: 'confirmation',
        candidateCount: 2,
        rank: { hostEpoch: 4, actionSeq: 9 },
        reason: 'approved',
    });
    assert.strictEqual(Object.isFrozen(result), true);
    assert.strictEqual(JSON.stringify(result).includes('SECRET_ROOM'), false);
    assert.strictEqual(JSON.stringify(result).includes('hidden'), false);
});

runTest('hostless restore diagnostics preserve fallback and integer normalization', () => {
    const { calls, diagnostics } = makeDiagnostics();

    assert.strictEqual(diagnostics.hostlessRestoreRoomLogId(''), '-');
    assert.strictEqual(diagnostics.hostlessRestoreRoomLogId(null), '-');
    assert.deepStrictEqual(calls, []);
    assert.deepStrictEqual(diagnostics.hostlessRestoreDiagnostic({
        rank: { hostEpoch: 1.5, actionSeq: '9' },
        generation: -1.5,
        candidateCount: '2',
    }), {
        event: 'unknown',
        roomHash: '-',
        generation: 0,
        stage: '',
        candidateCount: 0,
        rank: { hostEpoch: 0, actionSeq: 0 },
        reason: '',
    });
});

runTest('hostless restore diagnostics require an injected room hash function', () => {
    assert.throws(
        () => makeHostlessRestoreDiagnostics(),
        /hashRoomId must be a function/
    );
});
