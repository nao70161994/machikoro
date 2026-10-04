'use strict';

const assert = require('assert');
const AppBackup = require('../js/appBackup');
const { runTest } = require('./helpers/test-utils');

runTest('backupは許可済みlocal keyだけを書き出しonline資格情報を除外する', () => {
    const source = {
        savedGame: '{"players":[]}',
        selectedCount: '4',
        gameStats: '{}',
        onlineSession: '{"reconnectToken":"SECRET"}',
        machikoroOnlineSession_ROOM: 'TOKEN',
    };
    const data = AppBackup.collect(key => source[key] ?? null);
    const envelope = AppBackup.buildEnvelope({ data, createdAt: '2026-08-14', clientVersion: 'v1' });
    const text = JSON.stringify(envelope);
    assert.strictEqual(envelope.data.selectedCount, '4');
    assert.strictEqual(Object.hasOwn(envelope.data, 'onlineSession'), false);
    assert.ok(!text.includes('SECRET'));
    assert.ok(!text.includes('TOKEN'));
});

runTest('backup importは未知key・壊れたJSON・巨大入力をfail closedにする', () => {
    const valid = JSON.stringify(AppBackup.buildEnvelope({ data: { selectedCount: '2', gameStats: '{}' } }));
    assert.deepStrictEqual(AppBackup.parseEnvelope(valid).data, { selectedCount: '2', gameStats: '{}' });
    assert.strictEqual(AppBackup.parseEnvelope('{'), null);
    assert.strictEqual(AppBackup.parseEnvelope(JSON.stringify({ schemaVersion: 1, app: 'machikoro', data: { unknown: 'x' } })), null);
    assert.strictEqual(AppBackup.parseEnvelope(JSON.stringify({ schemaVersion: 1, app: 'machikoro', data: { gameStats: '{' } })), null);
});

runTest('backup exportは実際のJSON全体の容量と復元可能性を確認する', () => {
    const first = JSON.stringify({ padding: 'x'.repeat(1100000) });
    const second = JSON.stringify([{ padding: 'x'.repeat(1100000) }]);
    assert.strictEqual(AppBackup.serializeEnvelope({ data: {
        savedGame: first, savedGameHistoryV1: second,
    } }), null);
    assert.strictEqual(AppBackup.serializeEnvelope({ data: {
        selectedCount: '"'.repeat(AppBackup.MAX_TOTAL_CHARS / 2),
    } }), null);
    assert.strictEqual(AppBackup.serializeEnvelope({ data: {
        gameStats: '{}', savedGame: 'x'.repeat(AppBackup.MAX_TOTAL_CHARS + 1),
    } }), null);
    assert.strictEqual(AppBackup.serializeEnvelope({ data: { gameStats: '{' } }), null);
    const data = { selectedCount: '4', gameStats: '{"games":2}' };
    const text = AppBackup.serializeEnvelope({ data, createdAt: '2026-10-04' });
    assert.deepStrictEqual(AppBackup.parseEnvelope(text).data, data);
});
