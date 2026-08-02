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
