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
