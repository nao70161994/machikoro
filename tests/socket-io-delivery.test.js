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

function stalledLoader() {
    const fs = require('fs');
    const vm = require('vm');
    const timers = new Map();
    let timerId = 0;
    const context = {
        module: { exports: {} },
        setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/socketIoDelivery'), 'utf8'), context);
    return { loader: context.module.exports, timers };
}

runTest('Socket.IO停滞は期限で終了しlistener/scriptを片付けて再試行できる', async () => {
    const { loader, timers } = stalledLoader();
    const scripts = [];
    const document = {
        head: { appendChild(script) { scripts.push(script); } },
        createElement() { return { remove() { this.removed = true; } }; },
    };
    const first = loader.load({ document });
    const duplicate = loader.load({ document });
    assert.strictEqual(first, duplicate);
    assert.strictEqual(scripts.length, 1);
    const deadline = [...timers.values()][0];
    assert.strictEqual(deadline.delay, 8000);
    const lateLoad = scripts[0].onload;
    deadline.fn();
    assert.strictEqual(await first, false);
    assert.strictEqual(scripts[0].removed, true);
    assert.strictEqual(scripts[0].onload, null);
    assert.strictEqual(scripts[0].onerror, null);
    assert.strictEqual(timers.size, 0);
    const retry = loader.load({ document, getIo: () => undefined });
    assert.strictEqual(scripts.length, 2);
    lateLoad();
    assert.strictEqual(timers.size, 1, 'expired request must not clear the retry deadline');
    scripts[1].onerror();
    assert.strictEqual(await retry, false);
    assert.strictEqual(timers.size, 0);
});

runTest('Socket.IO成功は期限を解除し追加要求をglobalから解決する', async () => {
    const { loader, timers } = stalledLoader();
    let script;
    let io;
    const document = {
        head: { appendChild(value) { script = value; } },
        createElement() { return {}; },
    };
    const result = loader.load({ document, getIo: () => io });
    io = function ioClient() {};
    script.onload();
    assert.strictEqual(await result, true);
    assert.strictEqual(timers.size, 0);
    assert.strictEqual(await loader.load({ document, getIo: () => io }), true);
});

runTest('HTMLはSocket.IOを同期scriptで待たずゲーム本体の前に非同期loaderを開始する', () => {
    const html = require('fs').readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');
    assert.ok(!/<script\b[^>]*src=["']\/socket\.io\/socket\.io\.js/.test(html));
    const start = html.indexOf('SocketIoDelivery.load({ document,');
    assert.ok(start > html.indexOf('src="js/socketIoDelivery.js"'));
    assert.ok(start < html.indexOf('src="js/Card.js"'));
});
