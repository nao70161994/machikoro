'use strict';

const assert = require('assert');
const ClientStorage = require('../js/clientStorage');
const { createStorage, runTest } = require('./helpers/test-utils');

runTest('client storage facadeは既存のget/set/remove契約を維持する', () => {
    const values = new Map();
    const calls = [];
    const facade = ClientStorage.createFacade({
        getStorage() {
            return {
                getItem(key) {
                    calls.push(['get', key]);
                    return values.has(key) ? values.get(key) : null;
                },
                setItem(key, value) {
                    calls.push(['set', key, value]);
                    values.set(key, value);
                },
                removeItem(key) {
                    calls.push(['remove', key]);
                    values.delete(key);
                },
            };
        },
    });

    assert.strictEqual(facade.get('missing', 'fallback'), null);
    assert.strictEqual(facade.set('key', 'value'), true);
    assert.strictEqual(facade.get('key'), 'value');
    facade.remove('key');
    assert.strictEqual(facade.get('key'), null);
    assert.ok(facade.storage());
    assert.deepStrictEqual(calls, [
        ['get', 'missing'],
        ['set', 'key', 'value'],
        ['get', 'key'],
        ['remove', 'key'],
        ['get', 'key'],
    ]);
});

runTest('client storage facadeはstorage不在と例外を既存どおり吸収する', () => {
    const missing = ClientStorage.createFacade({ getStorage: () => null });
    assert.strictEqual(missing.get('key', 'fallback'), 'fallback');
    assert.strictEqual(missing.set('key', 'value'), false);
    assert.doesNotThrow(() => missing.remove('key'));
    assert.strictEqual(missing.access(() => 'unexpected', 'fallback'), 'fallback');

    const blocked = ClientStorage.createFacade({
        getStorage() { throw new Error('blocked'); },
    });
    assert.strictEqual(blocked.get('key', 'fallback'), 'fallback');
    assert.strictEqual(blocked.set('key', 'value'), false);
    assert.doesNotThrow(() => blocked.remove('key'));
    assert.strictEqual(blocked.access(() => 'unexpected', 'fallback'), 'fallback');
});

runTest('client storage facadeは複数操作を同じ例外境界で実行しstorageを動的に解決する', () => {
    let active = { first: 'one', second: 'two' };
    const facade = ClientStorage.createFacade({
        getStorage() {
            return {
                getItem(key) { return active[key] ?? null; },
                setItem(key, value) { active[key] = value; },
                removeItem(key) { delete active[key]; },
            };
        },
    });

    assert.strictEqual(facade.get('first'), 'one');
    active = { first: 'changed', second: 'kept' };
    assert.strictEqual(facade.get('first'), 'changed');
    const pair = facade.access(storage => [storage.getItem('first'), storage.getItem('second')], null);
    assert.deepStrictEqual(pair, ['changed', 'kept']);

    const operationError = ClientStorage.createFacade({
        getStorage() {
            return { getItem() { throw new Error('read blocked'); } };
        },
    });
    assert.strictEqual(operationError.get('key', 'fallback'), 'fallback');
    assert.strictEqual(
        facade.access(() => { throw new Error('serialize blocked'); }, 'fallback'),
        'fallback'
    );
});

runTest('client storage facadeはprefix一致keyを副作用なしで列挙する', () => {
    const { localStorage } = createStorage();
    localStorage.setItem('onlineActionLog', 'legacy');
    localStorage.setItem('onlineActionLog:room:A', 'a');
    localStorage.setItem('onlineActionLog:room:B', 'b');
    localStorage.setItem('other', 'value');
    const facade = ClientStorage.createFacade({ getStorage: () => localStorage });

    assert.deepStrictEqual(facade.keysWithPrefix('onlineActionLog:room:'), [
        'onlineActionLog:room:A',
        'onlineActionLog:room:B',
    ]);
    assert.deepStrictEqual(facade.keysWithPrefix(null), []);
    assert.strictEqual(localStorage.length, 4);
});

runTest('client storage facadeは列挙中のstorage例外を空配列へ変換する', () => {
    const facade = ClientStorage.createFacade({
        getStorage() {
            return {
                get length() { throw new Error('blocked'); },
                key() { return null; },
            };
        },
    });

    assert.deepStrictEqual(facade.keysWithPrefix('key:'), []);
});
