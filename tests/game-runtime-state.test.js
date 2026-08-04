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
    assert.strictEqual(controller.write('unknown', 1), false);
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
