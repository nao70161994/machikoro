'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const GameRuntimeState = require('../js/gameRuntimeState');
const { runTest } = require('./helpers/test-utils');

runTest('game runtime stateはlive参照をfrozen envelopeへ投影する', () => {
    const game = { phase: 'build' };
    const cpuPlayers = [{ difficulty: 'normal' }];
    const undoState = { phase: 'build' };
    const controller = GameRuntimeState.createController({
        game,
        cpuPlayers,
        prevCoins: [3, 4],
        undoState,
    });
    const snapshot = controller.snapshot();
    assert.ok(Object.isFrozen(snapshot));
    assert.strictEqual(snapshot.game, game);
    assert.strictEqual(snapshot.cpuPlayers, cpuPlayers);
    assert.strictEqual(snapshot.undoState, undoState);
    assert.deepStrictEqual(snapshot.prevCoins, [3, 4]);
});

runTest('game runtime stateはnamed updateとhydrate順の単一ownerになる', () => {
    const controller = GameRuntimeState.createController();
    const game = { phase: 'roll' };
    const cpuPlayers = [null, { difficulty: 'strong' }];
    controller.setGame(game);
    controller.setCpuPlayers(cpuPlayers);
    controller.setPreviousCoins([1, 2]);
    controller.setUndoState({ marker: 'before-build' });
    const hydrated = { game: { phase: 'pending' }, undoState: { marker: 'restored' } };
    const snapshot = controller.installHydrated(hydrated);

    assert.strictEqual(snapshot.game, hydrated.game);
    assert.strictEqual(snapshot.undoState, hydrated.undoState);
    assert.strictEqual(snapshot.cpuPlayers, cpuPlayers);
    assert.deepStrictEqual(snapshot.prevCoins, [1, 2]);
    assert.strictEqual(controller.read('unknown'), undefined);
    assert.strictEqual(controller.write, undefined);
});

runTest('game runtime compatibility globalsは既存値を保持して双方向投影する', () => {
    const existingGame = { phase: 'build' };
    const existingCpuPlayers = [null];
    const root = {
        game: existingGame,
        cpuPlayers: existingCpuPlayers,
        prevCoins: [3],
        undoState: null,
    };
    const controller = GameRuntimeState.createController(root);
    assert.strictEqual(controller.bindGlobals(root), true);
    assert.strictEqual(root.game, existingGame);
    assert.strictEqual(root.cpuPlayers, existingCpuPlayers);
    root.undoState = { marker: true };
    controller.setPreviousCoins([5]);
    assert.deepStrictEqual(controller.read('undoState'), { marker: true });
    assert.deepStrictEqual(root.prevCoins, [5]);
    assert.strictEqual(Object.keys(root).includes('game'), false);
});

runTest('game runtime compatibility globalsは製品向けread-only投影を選べる', () => {
    const game = { phase: 'roll' };
    const root = {};
    const controller = GameRuntimeState.createController({ game });
    assert.strictEqual(controller.bindGlobals(root, { writable: false }), true);
    assert.strictEqual(root.game, game);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'game').set, undefined);
    assert.throws(() => { root.game = { phase: 'build' }; }, TypeError);
    const replacement = { phase: 'pending' };
    controller.setGame(replacement);
    assert.strictEqual(root.game, replacement);
});

runTest('app shellはlive gameをruntime snapshot境界から読む', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'appShell.js'), 'utf8');
    assert.ok(source.includes('GameRuntimeState.runtime.snapshot()'));
    for (const pattern of ['typeof game', 'typeof cpuPlayers', 'typeof undoState']) {
        assert.strictEqual(source.includes(pattern), false, pattern);
    }
});

runTest('storageはlive gameをruntime snapshot境界から読む', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
    assert.ok(source.includes('GameRuntimeState.runtime.snapshot()'));
    for (const pattern of [
        'hasGame: !!game',
        'serializeLocalSaveState(game,',
        'cpuSettings: cpuPlayers.map(',
        'if (!undoState)',
        'game.currentPlayerIndex !== myPlayerIndex',
    ]) {
        assert.strictEqual(source.includes(pattern), false, pattern);
    }
});

runTest('mainはlive gameとCPU・Undoをruntime snapshot境界から読む', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    assert.ok(source.includes('GameRuntimeState.runtime.snapshot()'));
    for (const pattern of [
        'if (!game ||',
        'game.currentPlayer()',
        'cpuPlayers[game.',
        'serializeGameState(game,',
        'serializeUndoState(game,',
        'GameManager.nextPendingActionFor(game)',
        'CPUPendingResolution.applyPendingAction(game,',
        '() => game.',
    ]) {
        assert.strictEqual(source.includes(pattern), false, pattern);
    }
});

runTest('onlineはlive gameとCPU・Undoをruntime snapshot境界から読む', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'online.js'), 'utf8');
    const compositionSource = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'onlineComposition.js'),
        'utf8'
    );
    assert.ok(source.includes('onlineComposition.snapshotGame()'));
    assert.ok(compositionSource.includes('gameState.snapshot()'));
    for (const pattern of [
        'hasGame: !!game,',
        '\n        game,',
        '\n        cpuPlayers,',
        'if (!game) return null',
        'serializeGameState(game,',
        'serializeUndoState(game,',
        'game && game.addLog',
        'if (!state || !game)',
    ]) {
        assert.strictEqual(source.includes(pattern), false, pattern);
    }
});

runTest('uiはlive gameとCPU・Undoをruntime snapshot境界から読む', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');
    assert.ok(source.includes('GameRuntimeState.runtime.snapshot()'));
    for (const pattern of [
        'typeof cpuPlayers',
        'const cur = game.log',
        'const renderPlan = !game',
        'recordGameStats(winner, game,',
        'if (!game) return new Set()',
        'if (!undoState || !game',
        'GameManager.nextPendingActionFor(game)',
        'game.players.map((player, index)',
    ]) {
        assert.strictEqual(source.includes(pattern), false, pattern);
    }
});

runTest('live game production writersはnamed runtime operationだけを使う', () => {
    const assignment = new RegExp(
        String.raw`^\s*(${GameRuntimeState.fields.join('|')})\s*=`,
        'm'
    );
    for (const file of ['main.js', 'online.js', 'storage.js', 'ui.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
        assert.strictEqual(assignment.test(source), false, file);
    }
});
