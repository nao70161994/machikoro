'use strict';

const assert = require('assert');
const GameSetupState = require('../js/gameSetupState');
const { runTest } = require('./helpers/test-utils');

runTest('game setup stateは既存初期値をdetached snapshotへ投影する', () => {
    const controller = GameSetupState.createController();
    assert.deepStrictEqual(controller.snapshot(), {
        selectedCount: 2,
        playerSettings: [],
        cpuSpeed: 1500,
    });
    assert.ok(Object.isFrozen(controller.snapshot()));
    assert.ok(Object.isFrozen(controller.snapshot().playerSettings));
});

runTest('game setup stateは設定配列の互換in-place更新と置換を保持する', () => {
    const controller = GameSetupState.createController();
    controller.read('playerSettings').push({ type: 'human' });
    assert.deepStrictEqual(controller.snapshot().playerSettings, [{ type: 'human' }]);
    const replacement = [{ type: 'cpu', difficulty: 'strong' }];
    assert.strictEqual(controller.write('playerSettings', replacement), true);
    replacement.push({ type: 'human' });
    assert.deepStrictEqual(controller.snapshot().playerSettings, [{ type: 'cpu', difficulty: 'strong' }]);
});

runTest('game setup stateはnamed operationで設定全体と個別playerを更新する', () => {
    const controller = GameSetupState.createController();
    controller.setSelectedCount(4);
    controller.setCpuSpeed(600);
    controller.setPlayerSettings([{ type: 'human', name: 'Alice' }]);
    controller.setPlayerSetting(1, { type: 'cpu', difficulty: 'strong', name: 'CPU 2' });
    controller.setPlayerName(0, 'Alicia');
    assert.deepStrictEqual(controller.snapshot(), {
        selectedCount: 4,
        playerSettings: [
            { type: 'human', name: 'Alicia' },
            { type: 'cpu', difficulty: 'strong', name: 'CPU 2' },
        ],
        cpuSpeed: 600,
    });

    const replacement = [{ type: 'cpu', difficulty: 'normal', name: 'CPU 1' }];
    controller.replace({ selectedCount: 3, playerSettings: replacement });
    replacement.push({ type: 'human', name: 'Bob' });
    assert.deepStrictEqual(controller.snapshot(), {
        selectedCount: 3,
        playerSettings: [{ type: 'cpu', difficulty: 'normal', name: 'CPU 1' }],
        cpuSpeed: 600,
    });
});

runTest('game setup production writersはnamed runtime operationだけを使う', () => {
    const fs = require('fs');
    const path = require('path');
    const fields = GameSetupState.fields.join('|');
    const directAssignment = new RegExp(String.raw`^\s*(${fields})\s*=`, 'm');
    const indexedAssignment = /^\s*playerSettings\s*\[[^\]]+\](?:\.[A-Za-z_$][\w$]*)?\s*=/m;
    for (const file of ['main.js', 'online.js', 'storage.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
        assert.strictEqual(directAssignment.test(source), false, file);
        assert.strictEqual(indexedAssignment.test(source), false, file);
    }
});

runTest('game setup compatibility globalsは単一controllerへ双方向投影する', () => {
    const controller = GameSetupState.createController();
    const root = {};
    assert.strictEqual(controller.bindGlobals(root), true);
    root.selectedCount = 4;
    root.cpuSpeed = 600;
    root.playerSettings = [{ type: 'human' }];
    root.playerSettings[0] = { type: 'cpu', difficulty: 'normal' };

    assert.deepStrictEqual(controller.snapshot(), {
        selectedCount: 4,
        playerSettings: [{ type: 'cpu', difficulty: 'normal' }],
        cpuSpeed: 600,
    });
    assert.strictEqual(Object.keys(root).includes('selectedCount'), false);
});

runTest('game setup compatibility globalsは製品向けread-only投影を選べる', () => {
    const controller = GameSetupState.createController({
        selectedCount: 3,
        playerSettings: [{ type: 'human' }],
        cpuSpeed: 900,
    });
    const root = {};
    assert.strictEqual(controller.bindGlobals(root, { writable: false }), true);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'selectedCount').set, undefined);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'playerSettings').set, undefined);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'cpuSpeed').set, undefined);
    controller.setSelectedCount(4);
    assert.strictEqual(root.selectedCount, 4);
});
