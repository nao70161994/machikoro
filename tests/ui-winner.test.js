'use strict';

const assert = require('assert');
const UiWinner = require('../js/uiWinner');
const { runTest } = require('./helpers/test-utils');

runTest('winner reviewは正確な最終盤面と観測範囲を明示したlogを分ける', () => {
    const logTypes = { GAIN: 'gain', LOSE: 'lose', BUILD: 'build', SPECIAL: 'special', DICE: 'dice' };
    const html = UiWinner.buildGameReview([
        { type: 'gain', message: '+1' }, { type: 'gain', message: '+2' },
        { type: 'build', message: 'build' }, { type: 'special', message: 'special' },
    ], logTypes, [
        { coins: 12, cards: [{}, {}], landmarks: { station: true, mall: false } },
        { coins: 3, cards: [{}], landmarks: { station: true } },
    ], value => String(value));
    assert(html.includes('対戦の振り返り'));
    assert(html.includes('<span>最終所持施設</span><strong>3</strong>'));
    assert(html.includes('<span>建設済みランドマーク</span><strong>2</strong>'));
    assert(html.includes('<span>収入ログ</span><strong>2</strong>'));
    assert(html.includes('この端末で観測した直近ログ'));
    assert(html.includes('最大300件。古い保存から再開した場合、以前の記録を含まないことがあります。'));
    assert(html.includes('<span>最終コイン差</span><strong>9</strong>'));
});

runTest('winner reviewは保存済みの完全な構造化集計を直近logより優先する', () => {
    const logTypes = { GAIN: 'gain', LOSE: 'lose', BUILD: 'build', SPECIAL: 'special', DICE: 'dice' };
    const html = UiWinner.buildGameReview(
        [{ type: 'gain', message: '+1' }],
        logTypes,
        [{ coins: 12, cards: [], landmarks: {} }, { coins: 3, cards: [], landmarks: {} }],
        value => String(value),
        { complete: true, counts: { gain: 21, lose: 8, build: 14, special: 5, dice: 33 } }
    );
    assert(html.includes('対戦全体のイベント'));
    assert(html.includes('保存・再接続を含む対戦開始から'));
    assert(html.includes('<span>収入ログ</span><strong>21</strong>'));
    assert.strictEqual(html.includes('最大300件'), false);
});

runTest('winner reviewは収支欠落legacyを全対戦総額として表示しない', () => {
    const logTypes = { GAIN: 'gain', LOSE: 'lose', BUILD: 'build', SPECIAL: 'special', DICE: 'dice' };
    const html = UiWinner.buildGameReview([], logTypes, [], value => String(value), {
        complete: true,
        totalsComplete: false,
        counts: { gain: 21, lose: 8, build: 14, special: 5, dice: 33 },
        totals: { gain: 0, lose: 0 },
    });

    assert(html.includes('対戦全体のイベント'));
    assert(html.includes('<span>収入ログ</span><strong>21</strong>'));
    assert.strictEqual(html.includes('収入総額'), false);
    assert.strictEqual(html.includes('支払い総額'), false);
});

runTest('winner reviewは完全な収支だけを全対戦総額として表示する', () => {
    const logTypes = { GAIN: 'gain', LOSE: 'lose', BUILD: 'build', SPECIAL: 'special', DICE: 'dice' };
    const html = UiWinner.buildGameReview([], logTypes, [], value => String(value), {
        complete: true,
        totalsComplete: true,
        counts: {},
        totals: { gain: 42, lose: 11 },
    });

    assert(html.includes('<span>収入総額</span><strong>42</strong>'));
    assert(html.includes('<span>支払い総額</span><strong>11</strong>'));
});
function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

runTest('ui winnerはscore順・winner強調・escape契約を維持する', () => {
    const winner = { name: '<Alice>', coins: 12 };
    const leader = { name: 'Bob & Co', coins: 20 };
    const players = [winner, leader];
    const html = UiWinner.buildWinnerStatsRows(players, winner, escapeHtml);
    assert.strictEqual(html,
        '<div class="winner-stats-row " role="listitem" aria-label="プレイヤー、Bob &amp; Co、20コイン"><span>Bob &amp; Co</span><span>🪙 20</span></div>' +
        '<div class="winner-stats-row highlight" role="listitem" aria-label="勝者、&lt;Alice&gt;、12コイン"><span>🏆 &lt;Alice&gt;</span><span>🪙 12</span></div>'
    );
    assert.deepStrictEqual(players, [winner, leader]);
});

runTest('ui winnerは順位付きの共有テキストとコピー導線を生成する', () => {
    const players = [
        { name: 'Alice', coins: 18 },
        { name: 'Bob', coins: 24 },
    ];
    assert.strictEqual(UiWinner.buildShareText({
        winner: players[1],
        players,
        turnCount: 11,
    }), '🏙️ ダイスシティ 対戦結果\n🏆 Bobの勝利\n11ターン\n1位 Bob 24コイン\n2位 Alice 18コイン');
    const html = UiWinner.buildWinnerScreenHtml({
        winner: players[1], players, turnCount: 11, escapeHtml,
        logEntries: [], logTypes: {},
    });
    assert.ok(html.includes('data-ui-action="shareGameResult"'));
    assert.ok(html.includes('data-ui-action="shareGameResultImage"'));
    assert.ok(html.includes('結果を共有'));
    assert.strictEqual(UiWinner.buildShareText({ players }), '');
});

runTest('ui winnerは結果画像用modelを順位順に固定してCanvasへ描画する', () => {
    const players = [{ name: 'Alice', coins: 12 }, { name: 'Bob', coins: 20 }];
    const model = UiWinner.buildResultCardModel({ winner: players[1], players, turnCount: 9 });
    assert.strictEqual(model.winnerName, 'Bob');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(model.standings)), [
        { rank: 1, name: 'Bob', coins: 20 },
        { rank: 2, name: 'Alice', coins: 12 },
    ]);
    const calls = [];
    const context = {
        fillRect: (...args) => calls.push(['fillRect', ...args]),
        fillText: (...args) => calls.push(['fillText', ...args]),
        createLinearGradient() { return { addColorStop() {} }; },
        textAlign: 'left', fillStyle: '', font: '',
    };
    const canvas = { getContext: () => context };
    assert.strictEqual(UiWinner.drawResultCard(canvas, model), true);
    assert.deepStrictEqual([canvas.width, canvas.height], [1200, 630]);
    assert.ok(calls.some(call => call[0] === 'fillText' && String(call[1]).includes('Bob')));
});

runTest('ui winnerは10人同点のstable順と危険な名前のlist labelを維持する', () => {
    const players = Array.from({ length: 10 }, (_, index) => ({
        name: index === 4 ? '悪"<&\'' : `P${index + 1}`,
        coins: 7,
    }));
    const winner = players[4];
    const html = UiWinner.buildWinnerStatsRows(players, winner, escapeHtml);

    assert.strictEqual((html.match(/role="listitem"/g) || []).length, 10);
    assert.ok(html.includes(
        'aria-label="勝者、悪&quot;&lt;&amp;&#39;、7コイン"' +
        '><span>🏆 悪&quot;&lt;&amp;&#39;</span><span>🪙 7</span>'
    ));
    for (let index = 0; index < players.length - 1; index++) {
        assert.ok(
            html.indexOf(escapeHtml(players[index].name)) <
                html.indexOf(escapeHtml(players[index + 1].name)),
            `同点時の表示順 ${index + 1} → ${index + 2}`
        );
    }
    assert.deepStrictEqual(players.map(player => player.name), [
        'P1', 'P2', 'P3', 'P4', '悪"<&\'', 'P6', 'P7', 'P8', 'P9', 'P10',
    ]);
});

runTest('ui winnerは2連勝以上だけstreakを表示する', () => {
    const winner = { name: '<Alice>' };
    assert.strictEqual(UiWinner.buildWinStreakHtml(winner, 1, escapeHtml), '');
    assert.strictEqual(
        UiWinner.buildWinStreakHtml(winner, 2, escapeHtml),
        '<div class="win-streak">🔥 &lt;Alice&gt; 2連勝中！</div>'
    );
});

runTest('ui winnerはhuman/CPU文言・turn・広告slotを既存HTMLへ合成する', () => {
    const winner = { name: 'Alice', coins: 30 };
    const human = UiWinner.buildWinnerScreenHtml({
        winner, players: [winner], isCpuWinner: false, turnCount: 9, winStreak: 1,
        canRematch: true, resultAdSlot: '<div class="ad">ad</div>', escapeHtml,
    });
    assert.ok(human.includes('<div class="winner-title">Aliceの勝利！</div>'));
    assert.ok(human.includes('👤 人間プレイヤーが勝ちました　9ターン'));
    assert.ok(human.includes('<div class="winner-stats" role="list" aria-label="最終コイン">'));
    assert.ok(human.includes('id="winnerRestartButton"'));
    assert.ok(human.includes('id="winnerRematchButton"'));
    assert.ok(human.includes('data-ui-action="rematchLocalGame">同じ設定でもう一度</button>'));
    assert.ok(human.includes('data-ui-action="restartGame">タイトルへ戻る</button>'));
    assert.ok(human.endsWith('<div class="ad">ad</div></div>'));
    const cpu = UiWinner.buildWinnerScreenHtml({
        winner, players: [winner], isCpuWinner: true, turnCount: 10, winStreak: 2, escapeHtml,
    });
    assert.ok(cpu.includes('🤖 CPUプレイヤーが勝ちました　10ターン'));
    assert.ok(!cpu.includes('winnerRematchButton'));
    assert.ok(cpu.includes('2連勝中！'));
});

runTest('ui winnerは勝者・種別・turnを読み上げ用statusへ整形する', () => {
    const winner = { name: 'Alice' };
    assert.strictEqual(
        UiWinner.buildWinnerStatusText({
            winner, isCpuWinner: false, turnCount: 9,
        }),
        'ゲーム終了。Aliceの勝利。人間プレイヤー、9ターン。'
    );
    assert.strictEqual(
        UiWinner.buildWinnerStatusText({
            winner, isCpuWinner: true, turnCount: 10,
        }),
        'ゲーム終了。Aliceの勝利。CPUプレイヤー、10ターン。'
    );
    assert.strictEqual(UiWinner.buildWinnerStatusText(), '');
});

runTest('ui winnerは不正inputを空HTMLへfail closedにする', () => {
    assert.strictEqual(UiWinner.buildWinnerScreenHtml(), '');
    assert.strictEqual(UiWinner.buildWinnerStatsRows(null, null, escapeHtml), '');
});

runTest('ui winner game originは終了後もonline由来を安定して保持する', () => {
    const controller = UiWinner.createGameOriginController();
    assert.strictEqual(controller.wasOnline(), false);
    controller.record(true);
    assert.strictEqual(controller.wasOnline(), true);
    controller.reset();
    assert.strictEqual(controller.wasOnline(), false);
});

runTest('ui winner streak controllerは同一勝者を加算し別勝者でresetする', () => {
    const controller = UiWinner.createStreakController({
        winStreak: 2,
        lastWinnerName: 'Alice',
    });
    const continued = controller.recordWinner('Alice');
    assert.deepStrictEqual(continued, { winStreak: 3, lastWinnerName: 'Alice' });
    assert.ok(Object.isFrozen(continued));
    assert.deepStrictEqual(controller.recordWinner('Bob'), {
        winStreak: 1,
        lastWinnerName: 'Bob',
    });
});

runTest('ui winner streak compatibility globalsは既存値を保持してcontrollerへ投影する', () => {
    const root = { winStreak: 4, lastWinnerName: 'Alice' };
    const controller = UiWinner.createStreakController(root);
    assert.strictEqual(controller.bindGlobals(root), true);
    assert.strictEqual(root.winStreak, 4);
    assert.strictEqual(root.lastWinnerName, 'Alice');
    root.winStreak = 5;
    controller.replace({ lastWinnerName: 'Bob' });
    assert.deepStrictEqual(controller.snapshot(), { winStreak: 5, lastWinnerName: 'Bob' });
    assert.strictEqual(Object.keys(root).includes('winStreak'), false);
});

runTest('ui winner streak compatibility globalsは製品向けread-only投影を選べる', () => {
    const root = {};
    const controller = UiWinner.createStreakController({
        winStreak: 2,
        lastWinnerName: 'Alice',
    });
    assert.strictEqual(controller.bindGlobals(root, { writable: false }), true);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'winStreak').set, undefined);
    assert.strictEqual(Object.getOwnPropertyDescriptor(root, 'lastWinnerName').set, undefined);
    assert.throws(() => { root.winStreak = 9; }, TypeError);
    controller.recordWinner('Alice');
    assert.deepStrictEqual(
        { winStreak: root.winStreak, lastWinnerName: root.lastWinnerName },
        { winStreak: 3, lastWinnerName: 'Alice' }
    );
});
