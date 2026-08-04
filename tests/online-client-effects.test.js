'use strict';

const assert = require('assert');
const OnlineClientEffects = require('../js/onlineClientEffects');
const { runTest } = require('./helpers/test-utils');

runTest('online client effectsは必須effectと呼び出し順を固定する', () => {
    const calls = [];
    const runtime = OnlineClientEffects.create({
        invalidateCpuSchedule: reason => calls.push(['invalidate', reason]),
        render: () => calls.push(['render']),
        scheduleCpu: () => calls.push(['schedule']),
        showNotice: message => calls.push(['notice', message]),
        updateResumeButton: () => calls.push(['resume']),
    });

    runtime.invalidateCpuSchedule('rejoin');
    runtime.render();
    runtime.scheduleCpu();
    runtime.showNotice('message');
    runtime.updateResumeButton();

    assert.deepStrictEqual(calls, [
        ['invalidate', 'rejoin'],
        ['render'],
        ['schedule'],
        ['notice', 'message'],
        ['resume'],
    ]);
    assert.strictEqual(runtime.resetUiLocks('reason'), false);
    assert.strictEqual(runtime.notifyLifecycleStart(), false);
    assert.strictEqual(runtime.supportsResetUiLocks(), false);
});

runTest('online client effectsは任意effectの有無を明示する', () => {
    const calls = [];
    const required = {
        invalidateCpuSchedule() {},
        render() {},
        scheduleCpu() {},
        showNotice() {},
        updateResumeButton() {},
    };
    const runtime = OnlineClientEffects.create({
        ...required,
        resetUiLocks: reason => calls.push(['reset', reason]),
        notifyLifecycleStart: () => calls.push(['notify']),
    });

    assert.strictEqual(runtime.supportsResetUiLocks(), true);
    assert.strictEqual(runtime.resetUiLocks('start'), true);
    assert.strictEqual(runtime.notifyLifecycleStart(), true);
    assert.deepStrictEqual(calls, [['reset', 'start'], ['notify']]);
});

runTest('online client effects resolverは遅延ロードされたbrowser globalを解決する', () => {
    const effects = {};
    const calls = [];
    const runtime = OnlineClientEffects.createFromResolver(name => effects[name]);
    assert.strictEqual(runtime.supportsResetUiLocks(), false);
    assert.strictEqual(runtime.resetUiLocks('before'), false);
    assert.throws(() => runtime.render(), /render effect is unavailable/);

    effects.render = () => calls.push('render');
    effects.resetUiLocks = reason => calls.push(reason);
    runtime.render();
    assert.strictEqual(runtime.supportsResetUiLocks(), true);
    assert.strictEqual(runtime.resetUiLocks('after'), true);
    assert.deepStrictEqual(calls, ['render', 'after']);
});

runTest('online client effectsは不正な依存を初期化時に拒否する', () => {
    assert.throws(() => OnlineClientEffects.create({}), /invalidateCpuSchedule effect is required/);
    assert.throws(() => OnlineClientEffects.createFromResolver(null), /resolveEffect is required/);
});
