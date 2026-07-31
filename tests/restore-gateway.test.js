'use strict';

const assert = require('assert');
const {
    selectRestoreSource,
    decideExistingRoomRestore,
} = require('../server/restoreGateway');
const { runTest } = require('./helpers/test-utils');

runTest('restore gatewayはcanonical recordをclient bundleより優先する', () => {
    const client = {
        gameStartPayload: { source: 'client' },
        stateSnapshot: { source: 'client' },
        actionLog: [{ source: 'client' }],
    };
    const canonical = {
        gameStartPayload: { source: 'canonical' },
        stateSnapshot: { source: 'canonical' },
        actionLog: [{ source: 'canonical' }],
    };
    const selected = selectRestoreSource(client, canonical);
    assert.strictEqual(selected.canonicalRecord, canonical);
    assert.strictEqual(selected.gameStartPayload, canonical.gameStartPayload);
    assert.strictEqual(selected.stateSnapshot, canonical.stateSnapshot);
    assert.strictEqual(selected.actionLog, canonical.actionLog);
});

runTest('restore gatewayはcanonical欠落fieldを既存規則で補う', () => {
    const clientStart = { source: 'client' };
    const selected = selectRestoreSource({
        gameStartPayload: clientStart,
        stateSnapshot: { source: 'client' },
        actionLog: [{ source: 'client' }],
    }, {
        gameStartPayload: null,
        stateSnapshot: null,
        actionLog: 'malformed',
    });
    assert.strictEqual(selected.gameStartPayload, clientStart);
    assert.strictEqual(selected.stateSnapshot, null);
    assert.deepStrictEqual(selected.actionLog, []);
});

runTest('restore gatewayはhostless承認時にcanonical recordをauthorityにしない', () => {
    const client = {
        gameStartPayload: { source: 'client' },
        stateSnapshot: { source: 'client' },
        actionLog: [{ source: 'client' }],
    };
    const selected = selectRestoreSource(client, {
        gameStartPayload: { source: 'canonical' },
        stateSnapshot: { source: 'canonical' },
        actionLog: [{ source: 'canonical' }],
    }, { approvedHostless: true });
    assert.strictEqual(selected.canonicalRecord, null);
    assert.strictEqual(selected.gameStartPayload, client.gameStartPayload);
    assert.strictEqual(selected.stateSnapshot, client.stateSnapshot);
    assert.strictEqual(selected.actionLog, client.actionLog);
});

runTest('restore gatewayは既存roomのreplace/reject/rejoin優先順位を固定する', () => {
    const fixtures = [
        [{ incomingCanReplace: true, existingHostRestoreAuthenticated: true, incomingRestoreNewer: true }, 'replace', ''],
        [{ incomingCanReplace: false, existingHostRestoreAuthenticated: true, incomingRestoreNewer: true }, 'reject', 'corrupt-newer-restore'],
        [{ incomingCanReplace: false, existingHostRestoreAuthenticated: false, incomingRestoreNewer: true }, 'rejoin', ''],
        [{ incomingCanReplace: false, existingHostRestoreAuthenticated: true, incomingRestoreNewer: false }, 'rejoin', ''],
    ];
    for (const [input, action, reason] of fixtures) {
        assert.deepStrictEqual(decideExistingRoomRestore(input), { action, reason });
    }
});
