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


runTest('online player settingsはRL loader状態を既存優先順でpureに解決する', () => {
    assert.deepStrictEqual(OnlinePlayerSettings.rlModelLoadState({ usesRl: false }), {
        status: 'unused', ready: 0, total: 0, errors: [],
    });
    assert.deepStrictEqual(OnlinePlayerSettings.rlModelLoadState({ usesRl: true, loaderAvailable: false }), {
        status: 'failed', ready: 0, total: 0, errors: ['RL model loader is not available'],
    });
    assert.deepStrictEqual(OnlinePlayerSettings.rlModelLoadState({ usesRl: true, loaderAvailable: true }), {
        status: 'idle', ready: 0, total: 1, errors: [],
    });
    const ready = { status: 'ready', ready: 2, total: 2, errors: [] };
    const calls = [];
    assert.strictEqual(OnlinePlayerSettings.rlModelLoadState({
        usesRl: true,
        loaderAvailable: true,
        playerCount: 4,
        eligibleLoadState: count => { calls.push(count); return ready; },
    }), ready);
    assert.deepStrictEqual(calls, [4]);
});

runTest('online player settingsはRL状態とpendingからロビー表示だけを純粋計算する', () => {
    assert.strictEqual(OnlinePlayerSettings.rlModelStatusMessage({ status: 'unused' }), '');
    assert.strictEqual(OnlinePlayerSettings.rlModelStatusMessage({ status: 'ready' }), '深層学習AIモデルの準備が完了しました。');
    assert.strictEqual(OnlinePlayerSettings.rlModelStatusMessage({ status: 'loading' }), '深層学習AIモデルを読み込んでいます。');
    assert.strictEqual(OnlinePlayerSettings.rlModelStatusMessage({ status: 'failed' }), '深層学習AIモデルを読み込めませんでした。再試行してください。');
    assert.deepStrictEqual(OnlinePlayerSettings.createButtonView({ status: 'loading' }, false), { disabled: true, textContent: 'モデル読み込み中' });
    assert.deepStrictEqual(OnlinePlayerSettings.createButtonView({ status: 'failed' }, false), { disabled: false, textContent: 'モデルを再試行' });
    assert.deepStrictEqual(OnlinePlayerSettings.createButtonView({ status: 'ready' }, true), { disabled: true, textContent: '作成中' });
    assert.deepStrictEqual(OnlinePlayerSettings.joinButtonView(true), { disabled: true, textContent: '参加中' });
    assert.deepStrictEqual(OnlinePlayerSettings.joinButtonView(false), { disabled: false, textContent: '参加する' });
});
