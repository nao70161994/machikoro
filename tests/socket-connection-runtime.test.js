'use strict';

const assert = require('assert');
const {
    SOCKET_HANDLER_FAMILIES,
    registerSocketConnectionRuntime,
} = require('../server/socketConnectionRuntime');
const { runTest } = require('./helpers/test-utils');

function makeOptions(calls) {
    const options = {
        io: {
            on(event, handler) {
                calls.push(['on', event, handler]);
            },
        },
        logger: {
            log(...args) {
                calls.push(['log', ...args]);
            },
        },
    };
    for (const family of SOCKET_HANDLER_FAMILIES) {
        options[family] = socket => calls.push(['register', family, socket]);
    }
    return options;
}

runTest('socket connection runtimeはconnection eventとhandler family順を固定する', () => {
    const calls = [];
    const options = makeOptions(calls);
    const handler = registerSocketConnectionRuntime(options);
    assert.deepStrictEqual(calls, [['on', 'connection', handler]]);

    const socket = { id: 'socket-1' };
    handler(socket);
    assert.deepStrictEqual(calls.slice(1), [
        ['log', '接続:', 'socket-1'],
        ...SOCKET_HANDLER_FAMILIES.map(family => ['register', family, socket]),
    ]);
    assert.ok(Object.isFrozen(SOCKET_HANDLER_FAMILIES));
});

runTest('socket connection runtimeは依存不正をio登録前に拒否する', () => {
    const cases = [
        ['io', null, /io\.on/],
        ['logger', null, /logger\.log/],
        ['action', null, /action/],
    ];
    for (const [key, value, pattern] of cases) {
        const calls = [];
        const options = makeOptions(calls);
        options[key] = value;
        assert.throws(() => registerSocketConnectionRuntime(options), pattern);
        assert.deepStrictEqual(calls, []);
    }
});
