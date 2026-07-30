const assert = require('assert');
const { ClientReporting } = require('../js/clientReporting');
const { runTest } = require('./helpers/test-utils');

runTest('client reporting はError風入力を既存payload形式へ正規化する', () => {
    const report = ClientReporting.buildReport({
        source: 'window-error',
        error: { message: 'x'.repeat(20) },
        filename: '/index.html',
        line: 12,
        column: 4,
    }, {
        phase: 'roll',
        roomId: 'ROOM',
    }, {
        messageLimit: 10,
        stack: 'stack-value',
        timestamp: '2026-07-15T00:00:00.000Z',
    });

    assert.deepStrictEqual(report, {
        phase: 'roll',
        roomId: 'ROOM',
        source: 'window-error',
        message: 'xxxxxxxxxx...',
        stack: 'stack-value',
        filename: '/index.html',
        line: 12,
        column: 4,
        timestamp: '2026-07-15T00:00:00.000Z',
    });
    assert.strictEqual(ClientReporting.reportKey(report), 'window-error|xxxxxxxxxx...|/index.html|12|4|roll|ROOM');
});

runTest('client reporting はErrorとError風objectのmessage/stackを同じ規則で読む', () => {
    const error = new Error('boom');
    assert.strictEqual(ClientReporting.errorMessage(error), 'boom');
    assert.ok(ClientReporting.errorStack(error).includes('boom'));
    assert.strictEqual(ClientReporting.errorMessage({ message: 'object boom' }), 'object boom');
    assert.strictEqual(ClientReporting.errorStack({ stack: 'object stack' }), 'object stack');
    assert.strictEqual(ClientReporting.isErrorLike({ stack: 'object stack' }), true);
    assert.strictEqual(ClientReporting.isErrorLike('plain'), false);
});

runTest('client reporting は文字列上限の既存ellipsis契約を維持する', () => {
    assert.strictEqual(ClientReporting.truncateField('abcdef', 4), 'abcd...');
    assert.strictEqual(ClientReporting.truncateField('abcd', 4), 'abcd');
    assert.strictEqual(ClientReporting.truncateField(null, 4), '');
});


runTest('client reporting は長いfreeze summaryを診断keyを保って圧縮する', () => {
    const stack = 'FREEZE_SUMMARY ' + JSON.stringify({
        schemaVersion: 2,
        freezeKind: 'cpu-turn-stalled',
        recoveryStatus: 'recovery=success',
        stagnantMs: 198131,
        phase: 'build',
        allowedActions: ['buildCard', 'nextTurn'],
        interactabilityIssues: Array.from({ length: 10 }, (_, index) => ({ index, detail: 'x'.repeat(80) })),
        actionChildren: Array.from({ length: 12 }, (_, index) => ({ action: 'action-' + index, detail: 'y'.repeat(80) })),
        gameScreen: { detail: 'z'.repeat(800) },
        extra: 'ignored'.repeat(500),
    });
    const compacted = ClientReporting.compactFreezeSummaryStack(stack, { limit: 700, schemaVersion: 2 });
    const summary = JSON.parse(compacted.slice('FREEZE_SUMMARY '.length));

    assert.ok(compacted.startsWith('FREEZE_SUMMARY '));
    assert.strictEqual(summary.schemaVersion, 2);
    assert.strictEqual(summary.freezeKind, 'cpu-turn-stalled');
    assert.strictEqual(summary.phase, 'build');
    assert.deepStrictEqual(summary.allowedActions, ['buildCard', 'nextTurn']);
    assert.strictEqual(summary.compacted, true);
    assert.ok((summary.interactabilityIssues || []).length <= 4);
    assert.ok((summary.actionChildren || []).length <= 8);
    assert.strictEqual(Object.hasOwn(summary, 'extra'), false);
});

runTest('client reporting は壊れたfreeze summaryと通常stackの既存上限を維持する', () => {
    const malformed = ClientReporting.stackForReport({ stack: 'FREEZE_SUMMARY {' + 'x'.repeat(30) }, { limit: 20, schemaVersion: 2 });
    const regular = ClientReporting.stackForReport({ error: { stack: 's'.repeat(30) } }, { limit: 20 });

    assert.strictEqual(malformed, 'FREEZE_SUMMARY {xxxx...');
    assert.strictEqual(regular, 's'.repeat(20) + '...');
    assert.strictEqual(ClientReporting.stackForReport({ stack: 'FREEZE_SUMMARY {}' }, { limit: 100 }), 'FREEZE_SUMMARY {}');
});
