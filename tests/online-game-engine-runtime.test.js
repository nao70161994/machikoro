'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OnlineGameEngineRuntime = require('../js/onlineGameEngineRuntime');
const { runTest } = require('./helpers/test-utils');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createHarness(options = {}) {
    const calls = [];
    const shopStock = { enabled: 6 };
    let game = { marker: 'live' };
    let undoState = null;
    let shadowEnabled = options.shadowEnabled === true;
    let authorityEnabled = options.authorityEnabled === true;
    const adapter = {
        hydrate(snapshot) {
            calls.push(['hydrate', snapshot]);
            return clone(snapshot.runtime);
        },
        serialize(runtime) {
            calls.push(['serialize', clone(runtime)]);
            return { runtime: clone(runtime) };
        },
    };
    const clientShadow = {
        equalSnapshots: (left, right) => options.snapshotMismatch !== true &&
            JSON.stringify(left) === JSON.stringify(right),
        prepare(input) {
            calls.push(['prepare', input.action, input.data]);
            return {
                action: input.action,
                shadowSnapshot: input.transition(input.snapshot, input.action, input.data),
            };
        },
        finish(input) {
            calls.push(['finish', input.liveSnapshot, input.authorityEnabled]);
            let adopted = false;
            if (input.authorityEnabled) adopted = input.adoptSnapshot(input.prepared.shadowSnapshot);
            return { authority: adopted ? 'pure-transition' : 'mutable', adopted };
        },
    };
    const runtime = OnlineGameEngineRuntime.createRuntime({
        adoptSnapshot: snapshot => {
            calls.push(['adoptEffect', snapshot]);
            return runtime.adopt(snapshot);
        },
        applyMutableAction: (action, data) => {
            calls.push(['applyMutable', action, data]);
            game = { marker: `mutable:${action}` };
            return options.applyResult !== false;
        },
        assignShopStock: (target, value) => {
            calls.push(['assignStock', value]);
            Object.assign(target, value);
        },
        buildSnapshot: () => ({
            runtime: { game: clone(game), shopStock: clone(shopStock), undoState: clone(undoState) },
        }),
        buildUndoSnapshot: () => ({ marker: 'undo' }),
        createAdapter: () => adapter,
        engine: {
            transitionSnapshot(input) {
                calls.push(['transition', input.action, input.data]);
                const next = input.hydrate(input.snapshot);
                next.game = { marker: `shadow:${input.action}` };
                return input.serialize(next);
            },
        },
        gameRuntime: {
            setGame: value => { game = value; calls.push(['setGame', value]); },
            setUndoState: value => { undoState = value; calls.push(['setUndo', value]); },
        },
        getClientShadow: () => options.noClientShadow ? null : clientShadow,
        isAuthorityEnabled: () => authorityEnabled,
        isShadowEnabled: () => shadowEnabled,
        setDiagnostic: value => calls.push(['diagnostic', value]),
        shopStock,
    });
    return {
        calls,
        get game() { return game; },
        get undoState() { return undoState; },
        runtime,
        setAuthority: value => { authorityEnabled = value; },
        setShadow: value => { shadowEnabled = value; },
        shopStock,
    };
}

runTest('online game engine runtimeはshadow無効時に既存mutable経路とUndo順を維持する', () => {
    const harness = createHarness();
    assert.strictEqual(harness.runtime.applyReplayed('buildCard', { cardName: '麦畑' }), true);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'setUndo', 'applyMutable',
    ]);
    assert.deepStrictEqual(harness.undoState, { marker: 'undo' });
    harness.calls.length = 0;
    assert.strictEqual(harness.runtime.applyReplayed('nextTurn', {}), true);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'applyMutable', 'setUndo',
    ]);
    assert.strictEqual(harness.undoState, null);
});

runTest('online game engine runtimeはshadow transitionとmutable結果を診断へ確定する', () => {
    const harness = createHarness({ shadowEnabled: true });
    assert.strictEqual(harness.runtime.applyReplayed('rollDice', { forceDice: 3 }), true);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'prepare', 'transition', 'hydrate', 'serialize', 'applyMutable',
        'finish', 'diagnostic',
    ]);
    assert.deepStrictEqual(harness.calls.at(-1)[1], {
        authority: 'mutable', adopted: false,
    });
    assert.strictEqual(harness.game.marker, 'mutable:rollDice');
});

runTest('online game engine runtimeはauthority有効時だけdetached snapshotを採用する', () => {
    const harness = createHarness({ authorityEnabled: true, shadowEnabled: true });
    harness.runtime.applyReplayed('nextTurn', {});
    assert.strictEqual(harness.game.marker, 'shadow:nextTurn');
    assert.strictEqual(harness.undoState, null);
    assert.ok(harness.calls.some(call => call[0] === 'adoptEffect'));
    assert.ok(harness.calls.some(call => call[0] === 'assignStock'));
    assert.deepStrictEqual(harness.calls.at(-1)[1], {
        authority: 'pure-transition', adopted: true,
    });
});

runTest('online game engine runtimeは再構築parity不一致を採用しない', () => {
    const harness = createHarness({ snapshotMismatch: true });
    assert.strictEqual(harness.runtime.adopt({
        runtime: { game: { marker: 'candidate' }, shopStock: {}, undoState: null },
    }), false);
    assert.strictEqual(harness.calls.some(call => call[0] === 'setGame'), false);
});

runTest('online game engine runtimeはclient shadow不在をlegacy fallbackとして扱う', () => {
    const harness = createHarness({ noClientShadow: true, shadowEnabled: true });
    assert.strictEqual(harness.runtime.applyReplayed('rollDice', {}), true);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), ['applyMutable']);
});

runTest('online.jsはEngine shadow orchestrationを専用runtimeへ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/online.js'), 'utf8');
    assert.ok(source.includes('OnlineGameEngineRuntime.createRuntime'));
    assert.ok(source.includes('getOnlineGameEngineRuntime().applyReplayed'));
    assert.strictEqual(source.includes('GameEngineClientShadow.prepare({'), false);
    assert.strictEqual(source.includes('GameEngineClientShadow.finish({'), false);
});

runTest('online game engine runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(() => OnlineGameEngineRuntime.createRuntime(), /dependency is required/);
    const harness = createHarness();
    assert.ok(Object.isFrozen(harness.runtime));
    assert.ok(Object.isFrozen(OnlineGameEngineRuntime.BUILD_ACTIONS));
});
