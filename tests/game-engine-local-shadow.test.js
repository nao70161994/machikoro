'use strict';

const assert = require('assert');
const { runTest } = require('./helpers/test-utils');
const { loadIntegrationRuntime } = require('./helpers/integration-runtime');

function resolvedRoll() {
    return { forceDice: 3, tunaDice: [2, 5] };
}

function symmetricSettings() {
    return [
        { type: 'human', difficulty: 'normal', name: 'Player' },
        { type: 'human', difficulty: 'normal', name: 'Player' },
    ];
}

runTest('local Engine shadow outcomeはclient shadow controllerだけが所有する', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/main.js'), 'utf8');
    assert.strictEqual(source.includes('_lastLocalGameEngineShadowOutcome'), false);
    assert.ok(source.includes('GameEngineClientShadow.createOutcomeController()'));
    assert.ok(source.includes('_localGameEngineShadowOutcomeController.set(outcome)'));
});

runTest('local Engine shadowはproduction未注入時にmutable game identityを維持する', () => {
    const rt = loadIntegrationRuntime();
    const before = rt.__test.startLocalGame();
    assert.strictEqual(rt.__test.runLocalEngineAction('rollDice', resolvedRoll()), true);
    assert.strictEqual(rt.__test.getGame(), before);
    assert.strictEqual(rt.__test.getLocalGameEngineShadowOutcome(), null);
});

runTest('local Engine shadowは未解決乱数payloadをauthority有効時も採用しない', () => {
    const rt = loadIntegrationRuntime();
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED = true;
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED = true;
    const before = rt.__test.startLocalGame();

    assert.strictEqual(rt.__test.runLocalEngineAction(
        'rollDice',
        { forceDice: null, tunaDice: null }
    ), true);
    assert.strictEqual(rt.__test.getGame(), before);
    assert.strictEqual(rt.__test.getLocalGameEngineShadowOutcome(), null);
});

runTest('local Engine shadow authorityは確定action列でlegacy snapshotへ収束する', () => {
    const legacy = loadIntegrationRuntime();
    legacy.__test.startLocalGame(symmetricSettings());
    legacy.__test.runLocalEngineAction('rollDice', resolvedRoll());
    legacy.__test.runLocalEngineAction('nextTurn', {});

    const authoritative = loadIntegrationRuntime();
    authoritative.window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED = true;
    authoritative.window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED = true;
    const initialGame = authoritative.__test.startLocalGame(symmetricSettings());
    authoritative.__test.runLocalEngineAction('rollDice', resolvedRoll());
    authoritative.__test.runLocalEngineAction('nextTurn', {});

    const outcome = authoritative.__test.getLocalGameEngineShadowOutcome();
    assert.strictEqual(outcome.report.status, 'matched');
    assert.strictEqual(outcome.report.action, 'nextTurn');
    assert.strictEqual(outcome.report.reason, '');
    assert.strictEqual(outcome.authority.authority, 'pure-transition');
    assert.strictEqual(outcome.authority.reason, '');
    assert.notStrictEqual(authoritative.__test.getGame(), initialGame);
    assert.strictEqual(
        JSON.stringify(authoritative.__test.getLocalGameEngineSnapshot()),
        JSON.stringify(legacy.__test.getLocalGameEngineSnapshot())
    );
});

runTest('local CPU Engine shadow authorityは確定proposal列でlegacy snapshotへ収束する', () => {
    const legacy = loadIntegrationRuntime();
    legacy.__test.startLocalGame(symmetricSettings());
    legacy.__test.runLocalCpuEngineAction('rollDice', resolvedRoll());
    legacy.__test.runLocalCpuEngineAction('nextTurn', {});

    const authoritative = loadIntegrationRuntime();
    authoritative.window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED = true;
    authoritative.window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED = true;
    authoritative.__test.startLocalGame(symmetricSettings());
    authoritative.__test.runLocalCpuEngineAction('rollDice', resolvedRoll());
    authoritative.__test.runLocalCpuEngineAction('nextTurn', {});

    const outcome = authoritative.__test.getLocalGameEngineShadowOutcome();
    assert.strictEqual(outcome.report.status, 'matched');
    assert.strictEqual(outcome.report.action, 'nextTurn');
    assert.strictEqual(outcome.authority.authority, 'pure-transition');
    assert.strictEqual(
        JSON.stringify(authoritative.__test.getLocalGameEngineSnapshot()),
        JSON.stringify(legacy.__test.getLocalGameEngineSnapshot())
    );
});

runTest('local human build/UndoはEngine shadow authorityでrollback前後を維持する', () => {
    const rt = loadIntegrationRuntime();
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED = true;
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED = true;
    rt.__test.startLocalGame(symmetricSettings());
    const game = rt.__test.startBuildPhase({ coins: 20 });
    const before = JSON.stringify(rt.__test.getLocalGameEngineSnapshot());
    const beforeCount = game.currentPlayer().countCard('麦畑');

    rt.onBuildCard('麦畑');
    rt.__test.elements.confirmOkBtn.onclick();

    let outcome = rt.__test.getLocalGameEngineShadowOutcome();
    assert.strictEqual(outcome.report.status, 'matched');
    assert.strictEqual(outcome.report.action, 'buildCard');
    assert.strictEqual(outcome.authority.authority, 'pure-transition');
    assert.strictEqual(rt.__test.getGame().currentPlayer().countCard('麦畑'), beforeCount + 1);

    rt.doUndo();

    outcome = rt.__test.getLocalGameEngineShadowOutcome();
    assert.strictEqual(outcome.report.status, 'matched');
    assert.strictEqual(outcome.report.action, 'undoBuild');
    assert.strictEqual(outcome.authority.authority, 'pure-transition');
    assert.strictEqual(JSON.stringify(rt.__test.getLocalGameEngineSnapshot()), before);
});

runTest('local human landmark buildはEngine shadow authorityでlegacy結果と一致する', () => {
    const rt = loadIntegrationRuntime();
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED = true;
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED = true;
    rt.__test.startLocalGame(symmetricSettings());
    rt.__test.startBuildPhase({ coins: 20 });

    rt.onBuildLandmark('駅');
    rt.__test.elements.confirmOkBtn.onclick();

    const outcome = rt.__test.getLocalGameEngineShadowOutcome();
    assert.strictEqual(outcome.report.status, 'matched');
    assert.strictEqual(outcome.report.action, 'buildLandmark');
    assert.strictEqual(outcome.authority.authority, 'pure-transition');
    assert.strictEqual(rt.__test.getGame().currentPlayer().landmarks['駅'], true);
});


runTest('local CPU build passes a resolved proposal through Engine shadow authority', () => {
    const rt = loadIntegrationRuntime();
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED = true;
    rt.window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED = true;
    const game = rt.__test.startLocalGame([
        { type: 'human', difficulty: 'normal', name: 'Player' },
        { type: 'cpu', difficulty: 'normal', name: 'CPU' },
    ]);
    const cpuIndex = rt.__test.getCpuPlayers().findIndex(Boolean);
    assert.ok(cpuIndex >= 0);
    game.currentPlayerIndex = cpuIndex;
    rt.__test.startBuildPhase({ coins: 20 });

    assert.strictEqual(rt.__test.runLocalCpuBuildAction(
        'buildLandmark',
        { name: '\u99c5' }
    ), true);

    const outcome = rt.__test.getLocalGameEngineShadowOutcome();
    assert.strictEqual(outcome.report.status, 'matched');
    assert.strictEqual(outcome.report.action, 'buildLandmark');
    assert.strictEqual(outcome.authority.authority, 'pure-transition');
    assert.strictEqual(rt.__test.getGame().currentPlayer().landmarks['\u99c5'], true);
});


function setupPending(rt, game, field, action) {
    game.phase = rt.GAME_PHASES.PENDING;
    game[field] = 1;
    game.pendingActionQueue = [{ action, field }];
}

runTest('local Engine shadow authorityは全決定論action群でlegacy snapshotへ収束する', () => {
    const cases = [
        {
            action: 'selectDice',
            data: { useTwo: true, d1: 2, d2: 5, tunaDice: [1, 6] },
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.SELECT_DICE;
                game.currentPlayer().landmarks['駅'] = true;
            },
        },
        {
            action: 'rerollDice',
            data: { forceDice: 4, tunaDice: [2, 3] },
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.REROLL_CONFIRM;
                game.currentPlayer().landmarks['電波塔'] = true;
                game.lastDice1 = 1;
                game.lastDiceResult = 1;
                game.pendingTunaDice = [2, 3];
            },
        },
        {
            action: 'skipReroll',
            data: {},
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.REROLL_CONFIRM;
                game.lastDice1 = 3;
                game.lastDiceResult = 3;
                game.pendingTunaDice = [2, 4];
            },
        },
        {
            action: 'resolveHarbor',
            data: { useBonus: true },
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.HARBOR_CHOICE;
                game.currentPlayer().landmarks['港'] = true;
                game.lastDice1 = 5;
                game.lastDice2 = 5;
                game.lastDiceResult = 10;
                game.pendingTunaDice = [1, 6];
            },
        },
        {
            action: 'resolveTV',
            data: { targetIndex: 1 },
            setup(rt, game) {
                setupPending(rt, game, 'pendingTV', 'resolveTV');
                game.players[1].coins = 8;
            },
        },
        {
            action: 'resolveBusiness',
            data: { myCard: '麦畑', targetIndex: 1, theirCard: '森林' },
            setup(rt, game) {
                setupPending(rt, game, 'pendingBusiness', 'resolveBusiness');
                game.players[1].cards.push(rt.createCardByName('森林'));
            },
        },
        {
            action: 'resolveCleaning',
            data: { cardName: 'カフェ' },
            setup(rt, game) {
                setupPending(rt, game, 'pendingCleaning', 'resolveCleaning');
                game.players[1].cards.push(rt.createCardByName('カフェ'));
            },
        },
        {
            action: 'resolveMover',
            data: { cardName: '麦畑', targetIndex: 1 },
            setup(rt, game) {
                setupPending(rt, game, 'pendingMover', 'resolveMover');
            },
        },
        {
            action: 'resolveRenovation',
            data: { landmarkName: '駅' },
            setup(rt, game) {
                setupPending(rt, game, 'pendingRenovation', 'resolveRenovation');
                game.currentPlayer().landmarks['駅'] = true;
            },
        },
        {
            action: 'resolveIT',
            data: { doSave: true },
            setup(rt, game) {
                game.phase = rt.GAME_PHASES.PENDING;
                game.pendingIT = true;
                game.currentPlayer().coins = 3;
            },
        },
    ];

    for (const fixture of cases) {
        const legacy = loadIntegrationRuntime();
        const legacyGame = legacy.__test.startLocalGame(symmetricSettings());
        fixture.setup(legacy, legacyGame);
        assert.strictEqual(
            legacy.__test.runLocalEngineAction(fixture.action, fixture.data),
            true,
            fixture.action + ' legacy'
        );

        const authoritative = loadIntegrationRuntime();
        authoritative.window.MACHIKORO_LOCAL_GAME_ENGINE_SHADOW_ENABLED = true;
        authoritative.window.MACHIKORO_LOCAL_GAME_ENGINE_AUTHORITY_ENABLED = true;
        const authoritativeGame = authoritative.__test.startLocalGame(symmetricSettings());
        fixture.setup(authoritative, authoritativeGame);
        assert.strictEqual(
            authoritative.__test.runLocalEngineAction(fixture.action, fixture.data),
            true,
            fixture.action + ' authority'
        );

        const outcome = authoritative.__test.getLocalGameEngineShadowOutcome();
        assert.strictEqual(outcome.report.status, 'matched', fixture.action);
        assert.strictEqual(outcome.report.action, fixture.action);
        assert.strictEqual(outcome.authority.authority, 'pure-transition', fixture.action);
        assert.strictEqual(
            JSON.stringify(authoritative.__test.getLocalGameEngineSnapshot()),
            JSON.stringify(legacy.__test.getLocalGameEngineSnapshot()),
            fixture.action
        );
    }
});
