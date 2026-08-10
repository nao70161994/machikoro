const assert = require('assert');
const LocalPlayerSettings = require('../js/localPlayerSettings');
const { runTest } = require('./helpers/test-utils');

runTest('local player settingsは名前と設定を入力非破壊で正規化する', () => {
    const source = [{ type: 'cpu', difficulty: 'strong', name: '  Bot  ' }];
    const settings = LocalPlayerSettings.normalizeSettings(source, 2);
    assert.deepStrictEqual(settings, [
        { type: 'cpu', difficulty: 'strong', name: 'Bot' },
        { type: 'human', difficulty: 'normal', name: 'プレイヤー2' },
    ]);
    assert.deepStrictEqual(source, [{ type: 'cpu', difficulty: 'strong', name: '  Bot  ' }]);
    assert.ok(Object.isFrozen(settings));
    settings[0].name = 'changed';
    assert.strictEqual(source[0].name, '  Bot  ');
});

runTest('local player settings HTMLは既存option・label・escape契約を維持する', () => {
    const html = LocalPlayerSettings.buildSettingsHtml([
        { type: 'human', difficulty: 'normal', name: '"<&' },
        { type: 'cpu', difficulty: 'rl', name: 'CPU' },
    ], 2);
    assert.ok(html.includes('aria-label="プレイヤー1の種類"'));
    assert.ok(html.includes('aria-label="プレイヤー1の名前"'));
    assert.ok(html.includes('value="human" selected'));
    assert.ok(html.includes('value="&quot;&lt;&amp;"'));
    assert.ok(html.includes('placeholder="プレイヤー1"'));
    assert.ok(html.includes('value="rl" selected'));
    assert.ok(html.includes('AI（深層学習）として統計を記録'));
    assert.ok(html.includes('2人用の複数モデル'));
    assert.ok(!html.includes('value=""<&"'));
});

runTest('local player settingsの人間名inputは各playerを識別するaccessible nameを持つ', () => {
    const html = LocalPlayerSettings.buildSettingsHtml([
        { type: 'human', difficulty: 'normal', name: 'Alice' },
        { type: 'human', difficulty: 'normal', name: 'Bob' },
    ], 2);

    assert.ok(html.includes('aria-label="プレイヤー1の名前"'));
    assert.ok(html.includes('aria-label="プレイヤー2の名前"'));
    assert.strictEqual((html.match(/data-ui-input="localPlayerName"/g) || []).length, 2);
});

runTest('local player settingsはCPU表示・相手設定・速度・RL判定を固定する', () => {
    const settings = [
        { type: 'human', difficulty: 'expert' },
        { type: 'cpu', difficulty: 'rl' },
        { type: 'cpu' },
    ];
    assert.deepStrictEqual(LocalPlayerSettings.opponentDifficulties(settings), ['human', 'rl', 'normal']);
    assert.strictEqual(LocalPlayerSettings.cpuLabel('expert'), 'CPU（最強）');
    assert.strictEqual(LocalPlayerSettings.formatCpuSpeedLabel('100'), '超高速');
    assert.strictEqual(LocalPlayerSettings.formatCpuSpeedLabel('1500'), '1.5秒');
    assert.strictEqual(LocalPlayerSettings.hasRlCpu(settings, 1), false);
    assert.strictEqual(LocalPlayerSettings.hasRlCpu(settings, 2), true);
    assert.ok(LocalPlayerSettings.rlSettingNote(5).includes('脅威度上位3人'));
});

runTest('local player settings snapshotは既存defaultを補い入力を共有しない', () => {
    const source = [{ type: 'cpu', difficulty: 'weak', name: 'A' }, null];
    const snapshot = LocalPlayerSettings.snapshot(source, 2);
    assert.deepStrictEqual(snapshot, [
        { type: 'cpu', difficulty: 'weak', name: 'A' },
        { type: 'human', difficulty: 'normal', name: 'プレイヤー2' },
    ]);
    snapshot[0].name = 'changed';
    assert.strictEqual(source[0].name, 'A');
});


runTest('local player settingsはRL状態と開始pendingから表示だけを純粋計算する', () => {
    assert.strictEqual(LocalPlayerSettings.rlModelStatusMessage({ status: 'unused' }), '');
    assert.strictEqual(LocalPlayerSettings.rlModelStatusMessage({ status: 'ready' }), '深層学習AIモデルの準備が完了しました。');
    assert.strictEqual(LocalPlayerSettings.rlModelStatusMessage({ status: 'loading' }), '深層学習AIモデルを読み込んでいます。');
    assert.strictEqual(LocalPlayerSettings.rlModelStatusMessage({ status: 'failed' }), '深層学習AIモデルを読み込めませんでした。再試行してください。');
    assert.deepStrictEqual(LocalPlayerSettings.startButtonView({ status: 'loading' }, false), { disabled: true, textContent: 'モデル読み込み中' });
    assert.deepStrictEqual(LocalPlayerSettings.startButtonView({ status: 'failed' }, false), { disabled: false, textContent: 'モデルを再試行' });
    assert.deepStrictEqual(LocalPlayerSettings.startButtonView({ status: 'ready' }, false), { disabled: false, textContent: 'ゲーム開始' });
    assert.deepStrictEqual(LocalPlayerSettings.startButtonView({ status: 'failed' }, true), { disabled: true, textContent: 'モデル読み込み中' });
});
