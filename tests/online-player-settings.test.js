const assert = require('assert');
const OnlinePlayerSettings = require('../js/onlinePlayerSettings');
const { runTest } = require('./helpers/test-utils');

runTest('online player settingsは人数分を入力非破壊で正規化する', () => {
    const source = [{ type: 'cpu', difficulty: 'strong', extra: true }];
    const settings = OnlinePlayerSettings.normalizeSettings(source, 3);
    assert.deepStrictEqual(settings, [
        { type: 'cpu', difficulty: 'strong' },
        { type: 'human', difficulty: 'normal' },
        { type: 'human', difficulty: 'normal' },
    ]);
    assert.deepStrictEqual(source, [{ type: 'cpu', difficulty: 'strong', extra: true }]);
    assert.ok(Object.isFrozen(settings));
});

runTest('online player settings HTMLは既存option・label・RL説明を維持する', () => {
    const html = OnlinePlayerSettings.buildSettingsHtml([
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
    ], 5);
    assert.ok(html.includes('aria-label="プレイヤー1の種類"'));
    assert.ok(html.includes('data-ui-change="onlinePlayerType"'));
    assert.ok(html.includes('value="human" selected'));
    assert.ok(html.includes('value="rl" selected'));
    assert.ok(html.includes('脅威度上位3人'));
    assert.ok(!html.includes('onChangeOnlinePlayerType('));
});

runTest('online player settings create freezeはRL modelを一度だけ固定し入力を変えない', () => {
    const source = [
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'kept' },
    ];
    const calls = [];
    const frozen = OnlinePlayerSettings.freezeForCreate(source, 3, playerCount => {
        calls.push(playerCount);
        return { id: 'selected' };
    });
    assert.deepStrictEqual(frozen, [
        source[0],
        { type: 'cpu', difficulty: 'rl', rlModelId: 'selected' },
        { type: 'cpu', difficulty: 'rl', rlModelId: 'kept' },
    ]);
    assert.deepStrictEqual(calls, [3]);
    assert.strictEqual(source[1].rlModelId, undefined);
    assert.strictEqual(frozen[0], source[0]);
});

runTest('online player settingsはsnapshot・相手difficulty・RL判定を固定する', () => {
    const source = [null, { type: 'cpu', difficulty: 'rl' }, { type: 'cpu' }];
    assert.deepStrictEqual(OnlinePlayerSettings.snapshot(source, 3), [
        { type: 'human', difficulty: 'normal' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu', difficulty: 'normal' },
    ]);
    assert.deepStrictEqual(OnlinePlayerSettings.opponentDifficulties(source), ['human', 'rl', 'normal']);
    assert.strictEqual(OnlinePlayerSettings.hasRlCpu(source, 1), false);
    assert.strictEqual(OnlinePlayerSettings.hasRlCpu(source, 2), true);
    assert.ok(OnlinePlayerSettings.rlSettingNote(2).includes('2人用の複数モデル'));
});
