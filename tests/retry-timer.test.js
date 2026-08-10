'use strict';

const assert = require('assert');
const RetryTimer = require('../js/retryTimer');
const { runTest } = require('./helpers/test-utils');

runTest('retry timerは遅い既存予約を早いdeadlineへ差し替える', () => {
    let now = 1000;
    let nextHandle = 0;
    const callbacks = new Map();
    const cleared = [];
    let runs = 0;
    const timer = RetryTimer.create({
        now: () => now,
        setTimeout(callback, delay) {
            const handle = ++nextHandle;
            callbacks.set(handle, { callback, delay });
            return handle;
        },
        clearTimeout(handle) { cleared.push(handle); },
        run() { runs++; },
    });

    assert.strictEqual(timer.schedule(5000), true);
    assert.strictEqual(timer.schedule(6000), false);
    now = 1100;
    assert.strictEqual(timer.schedule(1000), true);
    assert.deepStrictEqual(cleared, [1]);
    assert.strictEqual(callbacks.get(2).delay, 1000);
    callbacks.get(1).callback();
    assert.strictEqual(runs, 0);
    callbacks.get(2).callback();
    assert.strictEqual(runs, 1);
    assert.deepStrictEqual(timer.snapshot(), { scheduled: false, dueAt: 0 });
});

runTest('retry timerは必須effect欠落を初期化時に拒否する', () => {
    assert.throws(() => RetryTimer.create(), /now is required/);
});
