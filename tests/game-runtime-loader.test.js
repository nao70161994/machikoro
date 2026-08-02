'use strict';

const assert = require('assert');
const {
    GAME_RUNTIME_SOURCE_FILES,
    GAME_RUNTIME_EXPORT_NAMES,
    GAME_RUNTIME_EXPORT_SOURCE,
    makeGameRuntimeLoader,
} = require('../server/gameRuntimeLoader');
const { runTest } = require('./helpers/test-utils');

runTest('game runtime loaderはsource順と公開symbolをfrozen契約にする', () => {
    assert.deepStrictEqual(GAME_RUNTIME_SOURCE_FILES, [
        'js/Card.js',
        'js/Player.js',
        'js/actionContract.js',
        'js/GameManager.js',
    ]);
    assert.deepStrictEqual(GAME_RUNTIME_EXPORT_NAMES, [
        'Card',
        'Player',
        'GameManager',
        'CARDS',
        'createCardByName',
        'getInitialCardStock',
        'getShopStockCount',
        'setShopStockCount',
        'decrementShopStock',
        'assignShopStockSnapshot',
        'resolveCardStockName',
        'GAME_PHASES',
        'GAME_ACTIONS',
        'GAME_ACTION_REGISTRY',
        'GAME_PHASE_ACTIONS',
        'CARD_CATEGORIES',
        'LANDMARK_NAMES',
    ]);
    assert.ok(Object.isFrozen(GAME_RUNTIME_SOURCE_FILES));
    assert.ok(Object.isFrozen(GAME_RUNTIME_EXPORT_NAMES));
    for (const name of GAME_RUNTIME_EXPORT_NAMES) {
        assert.ok(GAME_RUNTIME_EXPORT_SOURCE.includes(`this.${name} = ${name};`), name);
    }
});

runTest('game runtime loaderはresolve-read-run順と最後のexport bindingを維持する', () => {
    const calls = [];
    const runtimeConsole = {};
    const context = {};
    const loadGameRuntime = makeGameRuntimeLoader({
        baseDir: '/app',
        runtimeConsole,
        resolveSourcePath(baseDir, file) {
            calls.push(['resolve', baseDir, file]);
            return `${baseDir}/${file}`;
        },
        readSource(filePath) {
            calls.push(['read', filePath]);
            return `source:${filePath}`;
        },
        createContext(candidate) {
            calls.push(['create', candidate]);
            assert.strictEqual(candidate.console, runtimeConsole);
            Object.assign(context, candidate);
        },
        runSource(source, candidate, metadata) {
            calls.push(['run', source, candidate, metadata]);
        },
    });

    const result = loadGameRuntime();
    assert.strictEqual(result.console, runtimeConsole);
    assert.strictEqual(calls[0][0], 'create');
    assert.strictEqual(calls.filter(call => call[0] === 'resolve').length, 4);
    assert.strictEqual(calls.filter(call => call[0] === 'read').length, 4);
    const runs = calls.filter(call => call[0] === 'run');
    assert.strictEqual(runs.length, 5);
    GAME_RUNTIME_SOURCE_FILES.forEach((file, index) => {
        assert.deepStrictEqual(runs[index][3], { filename: file });
        assert.strictEqual(runs[index][1], `source:/app/${file}`);
    });
    assert.strictEqual(runs[4][1], GAME_RUNTIME_EXPORT_SOURCE);
    assert.strictEqual(runs[4][3], undefined);
});

runTest('game runtime loaderは実sourceからserver mirror依存を公開する', () => {
    const runtime = makeGameRuntimeLoader()();
    for (const name of GAME_RUNTIME_EXPORT_NAMES) {
        assert.notStrictEqual(runtime[name], undefined, name);
    }
    assert.strictEqual(typeof runtime.GameManager, 'function');
    assert.strictEqual(typeof runtime.createCardByName, 'function');
    assert.ok(Array.isArray(runtime.CARDS));
});

runTest('game runtime loaderは不正な注入依存をcontext作成前に拒否する', () => {
    assert.throws(
        () => makeGameRuntimeLoader({ readSource: null }),
        /readSource must be a function/
    );
    assert.throws(
        () => makeGameRuntimeLoader({ baseDir: null }),
        /baseDir must be a string/
    );
});
