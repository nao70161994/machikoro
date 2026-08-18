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

runTest('game setup stateは標準設定との差分だけを表示用labelへ投影する', () => {
    assert.deepStrictEqual(GameSetupState.standardDifferenceLabels({
        selectedCount: 2,
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        cpuSpeed: 1500,
        enabledCards: ['麦畑', 'パン屋'],
        allCards: ['麦畑', 'パン屋'],
        enabledLandmarks: ['駅', '港'],
        allLandmarks: ['駅', '港'],
        marketRule: 'standard',
    }), []);

    assert.deepStrictEqual(GameSetupState.standardDifferenceLabels({
        selectedCount: 4,
        playerSettings: [
            { type: 'human' },
            { type: 'cpu', difficulty: 'strong' },
            { type: 'cpu', difficulty: 'strong' },
            { type: 'cpu', difficulty: 'rl' },
        ],
        cpuSpeed: 500,
        cpuSpeedLabel: '高速（0.5秒）',
        enabledCards: ['麦畑'],
        allCards: ['麦畑', 'パン屋'],
        enabledLandmarks: ['駅'],
        allLandmarks: ['駅', '港'],
        marketRule: 'ten-type',
    }), [
        '人数 4人',
        'CPU（強）2人',
        'CPU（深層学習）1人',
        'CPU速度 高速（0.5秒）',
        '施設 1/2種',
        '未使用ランドマーク 港',
        '公式10種類市場',
    ]);
});

runTest('game setup stateは設定配列の入出力をdetached read-only値にする', () => {
    const sourceSetting = { type: 'human', name: 'Alice' };
    const controller = GameSetupState.createController({ playerSettings: [sourceSetting] });
    sourceSetting.name = 'outside';

    const projection = controller.read('playerSettings');
    assert.ok(Object.isFrozen(projection));
    assert.ok(Object.isFrozen(projection[0]));
    assert.throws(() => projection.push({ type: 'cpu' }), TypeError);
    assert.throws(() => { projection[0].name = 'mutated'; }, TypeError);
    assert.deepStrictEqual(controller.snapshot().playerSettings, [{ type: 'human', name: 'Alice' }]);

    const replacementSetting = { type: 'cpu', difficulty: 'strong' };
    const replacement = [replacementSetting];
    assert.strictEqual(controller.write('playerSettings', replacement), true);
    replacementSetting.difficulty = 'weak';
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

runTest('game setup production readersは互換globalではなくruntime snapshotを使う', () => {
    const fs = require('fs');
    const path = require('path');
    const sources = Object.fromEntries(['main.js', 'storage.js', 'ui.js', 'appShell.js'].map(file => [
        file,
        fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'),
    ]));
    const forbidden = [
        ['main.js', /(?<![.\w$])selectedCount\s*\+\s*delta/],
        ['main.js', /normalizeSettings\(playerSettings/],
        ['main.js', /snapshot\(playerSettings/],
        ['main.js', /queueCPUStep\(token,\s*cpuSpeed/],
        ['storage.js', /\n\s*selectedCount,\n\s*playerSettings,/],
        ['storage.js', /textContent\s*=\s*selectedCount/],
        ['ui.js', /typeof playerSettings/],
        ['appShell.js', /playerCount\(null,\s*selectedCount\)/],
    ];
    for (const [file, pattern] of forbidden) {
        assert.strictEqual(pattern.test(sources[file]), false, file + ': ' + pattern);
    }
    for (const file of Object.keys(sources)) {
        assert.ok(sources[file].includes('GameSetupState.runtime.snapshot()'), file);
    }
});

runTest('game setup compatibility globalsは単一controllerへ双方向投影する', () => {
    const controller = GameSetupState.createController();
    const root = {};
    assert.strictEqual(controller.bindGlobals(root), true);
    root.selectedCount = 4;
    root.cpuSpeed = 600;
    root.playerSettings = [{ type: 'human' }];
    assert.throws(() => { root.playerSettings[0] = { type: 'cpu', difficulty: 'normal' }; }, TypeError);
    controller.setPlayerSetting(0, { type: 'cpu', difficulty: 'normal' });

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
