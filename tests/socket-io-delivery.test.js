'use strict';

const assert = require('assert');
const SocketIoDelivery = require('../js/socketIoDelivery');
const { runTest } = require('./helpers/test-utils');

runTest('Socket.IO deliveryは既にglobalがあればscriptを追加しない', async () => {
    let appended = 0;
    const result = await SocketIoDelivery.load({
        document: { head: { appendChild() { appended++; } } },
        getIo: () => function io() {},
    });
    assert.strictEqual(result, true);
    assert.strictEqual(appended, 0);
});

runTest('Socket.IO deliveryはdynamic script実行後のglobalを成功条件にする', async () => {
    let io;
    let appendedScript;
    const document = {
        head: {
            appendChild(script) {
                appendedScript = script;
                io = function loadedIo() {};
                script.onload();
            },
        },
        createElement(tagName) {
            assert.strictEqual(tagName, 'script');
            return {};
        },
    };
    const result = await SocketIoDelivery.load({
        document,
        getIo: () => io,
        src: '/socket.io/socket.io.js?recovery=1',
    });
    assert.strictEqual(result, true);
    assert.strictEqual(appendedScript.async, true);
    assert.strictEqual(appendedScript.src, '/socket.io/socket.io.js?recovery=1');
});

runTest('Socket.IO deliveryはload後もglobal未定義またはerrorなら失敗する', async () => {
    for (const event of ['onload', 'onerror']) {
        const result = await SocketIoDelivery.load({
            document: {
                head: { appendChild(script) { script[event](); } },
                createElement() { return {}; },
            },
            getIo: () => undefined,
        });
        assert.strictEqual(result, false, event);
    }
});
