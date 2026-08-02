'use strict';

const assert = require('assert');
const makeCanonicalStateRepository = require('../server/canonicalStateRepository');
const { runTest } = require('./helpers/test-utils');

function makeRepository(overrides = {}) {
    const calls = [];
    const defaultStore = {
        save(record) {
            calls.push(['save', record]);
            return { ok: true };
        },
        load(roomId) {
            calls.push(['load', roomId]);
            return {
                schemaVersion: 1,
                roomId,
            };
        },
    };
    const dependencies = {
        defaultStore,
        now() {
            calls.push(['now']);
            return 1700000000000;
        },
        buildRecord(roomId, room, options) {
            calls.push(['build', roomId, room, options]);
            return { schemaVersion: 1, roomId };
        },
        validateRecord(record) {
            calls.push(['validate', record]);
            return { ok: !!record && record.schemaVersion === 1 };
        },
        warn(...args) {
            calls.push(['warn', ...args]);
        },
    };
    Object.assign(dependencies, overrides);
    return {
        calls,
        defaultStore,
        repository: makeCanonicalStateRepository(dependencies),
    };
}

runTest('canonical repository persists the injected record through the default store', () => {
    const { calls, repository } = makeRepository();
    const room = { actionSeq: 2 };

    assert.deepStrictEqual(
        repository.persistRoomCanonicalState('ROOM01', room, 'action'),
        { ok: true }
    );
    assert.deepStrictEqual(calls, [
        ['now'],
        ['build', 'ROOM01', room, {
            reason: 'action',
            now: 1700000000000,
        }],
        ['save', { schemaVersion: 1, roomId: 'ROOM01' }],
    ]);
});

runTest('canonical repository preserves skipped and invalid-record save results', () => {
    const { repository } = makeRepository({
        buildRecord() {
            return null;
        },
    });

    assert.deepStrictEqual(
        repository.persistRoomCanonicalState('ROOM01', {}, 'test', 10, {}),
        { ok: true, skipped: true }
    );
    assert.deepStrictEqual(
        repository.persistRoomCanonicalState(
            'ROOM01',
            {},
            'test',
            10,
            { save() { throw new Error('must not run'); } }
        ),
        { ok: false, reason: 'invalid-record' }
    );
});

runTest('canonical repository isolates save exceptions with the existing result', () => {
    const { calls, repository } = makeRepository();
    const result = repository.persistRoomCanonicalState(
        'ROOM01',
        {},
        'test',
        10,
        { save() { throw new Error('disk down'); } }
    );

    assert.deepStrictEqual(result, { ok: false, reason: 'save-failed' });
    assert.deepStrictEqual(
        calls.find(call => call[0] === 'warn'),
        ['warn', '[canonical-state-store] save failed:', 'disk down']
    );
});

runTest('canonical repository validates loaded records and room ownership', () => {
    const { repository } = makeRepository();

    assert.deepStrictEqual(repository.loadRoomCanonicalStateRecord('ROOM01'), {
        schemaVersion: 1,
        roomId: 'ROOM01',
    });
    assert.strictEqual(
        repository.loadRoomCanonicalStateRecord('ROOM01', {
            load() {
                return { schemaVersion: 1, roomId: 'OTHER' };
            },
        }),
        null
    );
    assert.strictEqual(
        repository.loadRoomCanonicalStateRecord('ROOM01', {
            load() {
                return { schemaVersion: 2, roomId: 'ROOM01' };
            },
        }),
        null
    );
});

runTest('canonical repository isolates load exceptions and missing adapters', () => {
    const { calls, repository } = makeRepository();

    assert.strictEqual(
        repository.loadRoomCanonicalStateRecord('ROOM01', {}),
        null
    );
    assert.strictEqual(
        repository.loadRoomCanonicalStateRecord('ROOM01', {
            load() {
                throw new Error('read down');
            },
        }),
        null
    );
    assert.deepStrictEqual(
        calls.find(call => call[0] === 'warn'),
        ['warn', '[canonical-state-store] load failed:', 'read down']
    );
});

runTest('canonical repository requires schema functions', () => {
    assert.throws(
        () => makeCanonicalStateRepository(),
        /buildRecord must be a function/
    );
    assert.throws(
        () => makeCanonicalStateRepository({ buildRecord() {} }),
        /validateRecord must be a function/
    );
});
