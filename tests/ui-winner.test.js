'use strict';

const assert = require('assert');
const UiWinner = require('../js/uiWinner');
const { runTest } = require('./helpers/test-utils');

runTest('夕暮れのPC勝利画面は育てた街を専用の広いイラスト列で見せる', () => {
    const fs = require('fs');
    const path = require('path');
    const styles = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8')
        .replaceAll('html:is([data-design="sunset"], [data-design="plaza"])', 'html[data-design="sunset"]');
    assert.ok(styles.includes('@media (min-width: 768px) {\n    html[data-design="sunset"] .winner-screen .sunset-town'));
    assert.ok(styles.includes('grid-template-columns: repeat(auto-fit, 160px);'));
    assert.ok(styles.includes('html[data-design="sunset"] .winner-screen .town-building .sunset-facility-art {\n        height: 80px;'));
    assert.ok(styles.includes('max-width: 760px;'));
});

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
    assert(html.includes('class="winner-review-grid winner-final-grid"'));
    assert(html.includes('<span>収入ログ</span><strong>2</strong>'));
    assert(html.includes('この端末で観測した直近ログ'));
    assert(html.includes('最大300件。古い対局から再開すると以前の記録は含まれません。'));
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
    assert(html.includes('対戦開始からの収支・建設ログの集計です。'));
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

runTest('ui winnerは勝敗と最終コインを分けた共有テキストとコピー導線を生成する', () => {
    const players = [
        { name: 'Alice', coins: 18 },
        { name: 'Bob', coins: 24 },
    ];
    assert.strictEqual(UiWinner.buildShareText({
        winner: players[1],
        players,
        turnCount: 11,
    }), '🏙️ ダイスシティ 対戦結果\n🏆 Bobの勝利\n11ターン\n最終コイン（多い順）\n🏆 Bob 24コイン\nAlice 18コイン');
    const html = UiWinner.buildWinnerScreenHtml({
        winner: players[1], players, turnCount: 11, escapeHtml,
        logEntries: [], logTypes: {},
    });
    assert.ok(html.includes('data-ui-action="shareGameResult"'));
    assert.ok(html.includes('data-ui-action="shareGameResultImage"'));
    assert.ok(html.includes('結果を共有'));
    assert.strictEqual(UiWinner.buildShareText({ players }), '');
});

runTest('ui winnerは公式10種類市場の正確な終了サマリーを表示する', () => {
    const players = [{ name: 'Alice', coins: 20 }, { name: 'Bob', coins: 12 }];
    const html = UiWinner.buildWinnerScreenHtml({
        winner: players[0], players, turnCount: 9, escapeHtml,
        logEntries: [], logTypes: {},
        marketSupply: {
            mode: 'ten-type', deck: ['パン屋', 'カフェ'], refillSequence: 4,
            revealedCardCount: 16, totalsComplete: true,
        },
    });
    assert.ok(html.includes('市場の振り返り'));
    assert.ok(html.includes('補充回数'));
    assert.ok(html.includes('<strong>4</strong>'));
    assert.ok(html.includes('公開したカード'));
    assert.ok(html.includes('<strong>16</strong>'));
    assert.ok(html.includes('最終山札'));
    assert.ok(html.includes('<strong>2</strong>'));
    assert.ok(html.includes('class="winner-market-heading-icon"'));
    assert.ok(html.includes('icons/interface-ui.svg#market'));
    assert.ok(html.includes('class="winner-market-heading-emoji"'));
    assert.strictEqual(UiWinner.buildMarketReview({ mode: 'standard' }, escapeHtml), '');
});

runTest('ui winnerは結果画像用modelを順位順に固定してCanvasへ描画する', () => {
    const players = [{ name: 'Alice', coins: 12 }, { name: 'Bob', coins: 20 }];
    const model = UiWinner.buildResultCardModel({ winner: players[1], players, turnCount: 9 });
    assert.strictEqual(model.winnerName, 'Bob');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(model.standings)), [
        { isWinner: true, name: 'Bob', coins: 20 },
        { isWinner: false, name: 'Alice', coins: 12 },
    ]);
    const calls = [];
    const context = {
        fillRect: (...args) => calls.push(['fillRect', ...args]),
        fillText: (...args) => calls.push(['fillText', ...args]),
        createLinearGradient() { return { addColorStop() {} }; },
        beginPath: () => calls.push(['beginPath']),
        arc: (...args) => calls.push(['arc', ...args]),
        moveTo: (...args) => calls.push(['moveTo', ...args]),
        lineTo: (...args) => calls.push(['lineTo', ...args]),
        ellipse: (...args) => calls.push(['ellipse', ...args]),
        quadraticCurveTo: (...args) => calls.push(['quadraticCurveTo', ...args]),
        closePath: () => calls.push(['closePath']),
        fill: () => calls.push(['fill']),
        stroke: () => calls.push(['stroke']),
        roundRect: (...args) => calls.push(['roundRect', ...args]),
        rect: (...args) => calls.push(['rect', ...args]),
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        measureText: value => ({ width: String(value).length * 22 }),
        textAlign: 'left', fillStyle: '', font: '',
    };
    const canvas = { getContext: () => context };
    assert.strictEqual(UiWinner.drawResultCard(canvas, model), true);
    assert.deepStrictEqual([canvas.width, canvas.height], [1200, 630]);
    assert.ok(calls.some(call => call[0] === 'fillText' && String(call[1]).includes('Bob')));
    assert.ok(calls.some(call => call[0] === 'fillText' && String(call[1]).includes('DICE CITY')));
    assert.ok(calls.some(call => call[0] === 'roundRect' && call[1] === 70 && call[2] === 53),
        'the share card repeats the title brand mark container');
    assert.ok(calls.some(call => call[0] === 'roundRect' && call[1] === 94 && call[2] === 54),
        'a die sits above the illustrated city in the share card mark');
    assert.ok(calls.some(call => call[0] === 'fillText' && String(call[1]).includes('最終コイン')));
    assert.ok(!calls.some(call => call[0] === 'fillText' && call[1] === '順位'),
        'the city illustration does not carry a detached standings heading');
    assert.ok(calls.some(call => call[0] === 'fillText' && String(call[1]).includes('20 コイン')));
    assert.ok(calls.some(call => call[0] === 'arc'), 'the result card draws its own medal and city sun');
    assert.ok(calls.filter(call => call[0] === 'ellipse').length >= 4, 'the city skyline has shaped building shadows');
    assert.ok(calls.filter(call => call[0] === 'lineTo').length >= 80, 'the city artwork draws framed facades and distinct rooflines');
    assert.ok(calls.some(call => call[0] === 'roundRect'), 'the result card uses finished score panels');
    assert.ok(!calls.some(call => call[0] === 'fillText' && /🏆/.test(String(call[1]))), 'the share image does not depend on emoji fonts');
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
    assert.ok(human.includes('<div class="winner-title"><span class="winner-title-name">Alice</span><span class="winner-title-outcome">の勝利！</span></div>'));
    assert.ok(human.includes('<svg class="winner-trophy-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">'));
    assert.ok(!human.includes('<div class="winner-emoji">'));
    assert.ok(human.includes('<span class="winner-sub-turn">'));
    assert.ok(human.includes('<span class="winner-sub-type">👤 人間プレイヤーが勝ちました</span><span class="winner-sub-turn">9ターン</span>'));
    assert.ok(human.includes('<div class="winner-stats" role="list" aria-label="最終コイン">'));
    assert.ok(human.includes('id="winnerRestartButton"'));
    assert.ok(human.includes('id="winnerRematchButton"'));
    assert.ok(human.includes('data-ui-action="rematchLocalGame">同じ設定でもう一度</button>'));
    assert.ok(human.includes('data-ui-action="restartGame">タイトルへ戻る</button>'));
    assert.ok(human.endsWith('<div class="ad">ad</div></div>'));
    const cpu = UiWinner.buildWinnerScreenHtml({
        winner, players: [winner], isCpuWinner: true, turnCount: 10, winStreak: 2, escapeHtml,
    });
    assert.ok(cpu.includes('<span class="winner-sub-type">🤖 CPUプレイヤーが勝ちました</span><span class="winner-sub-turn">10ターン</span>'));
    assert.ok(!cpu.includes('winnerRematchButton'));
    assert.ok(cpu.includes('2連勝中！'));
});

runTest('sunset結果画面はプレイヤー種別とコインを専用アイコンで表示する', () => {
    const winner = { name: 'Alice', coins: 30 };
    const cpu = { name: 'Bot', coins: 18 };
    const html = UiWinner.buildWinnerScreenHtml({
        designTheme: 'sunset', winner, players: [winner, cpu], isCpuWinner: false,
        isCpuPlayer: index => index === 1,
        renderCoinMark: () => '<svg class="card-coin-mark" aria-hidden="true"></svg>',
        turnCount: 8, escapeHtml,
    });
    assert.ok(html.includes('<span class="winner-sub-type"><svg class="winner-kind-icon is-human"'));
    assert.ok(html.includes('class="winner-kind-icon is-cpu"'));
    assert.ok(html.includes('class="winner-award-icon"'));
    assert.strictEqual((html.match(/class="card-coin-mark"/g) || []).length, 2);
    assert.ok(!html.includes('👤') && !html.includes('🤖') && !html.includes('🪙'));
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

runTest('所持コイン最下位でもランドマークを完成させた勝者を共有結果で強調する', () => {
    const winner = { name: 'Winner', coins: 0 };
    const players = [{ name: 'Rich', coins: 30 }, winner];
    const text = UiWinner.buildShareText({ winner, players, turnCount: 1 });
    assert.ok(text.includes('🏆 Winnerの勝利'));
    assert.ok(text.includes('最終コイン（多い順）'));
    assert.ok(!text.includes('1位') && !text.includes('2位'));
    const model = UiWinner.buildResultCardModel({ winner, players, turnCount: 1 });
    assert.strictEqual(model.standings[0].isWinner, false);
    assert.strictEqual(model.standings[1].isWinner, true);
    const labels = [];
    const context = {
        fillRect() {}, fillText(text) { labels.push(text); },
        createLinearGradient() { return { addColorStop() {} }; },
        beginPath() {}, arc() {}, ellipse() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
        fill() {}, stroke() {}, roundRect() {}, rect() {}, save() {}, restore() {},
        measureText(value) { return { width: String(value).length * 20 }; },
        textAlign: 'left', fillStyle: '', font: '',
    };
    const canvas = { getContext: () => context };
    UiWinner.drawResultCard(canvas, model);
    assert.ok(labels.includes('Winner の勝利'));
    assert.ok(labels.includes('0 コイン'));
    assert.ok(!labels.some(text => text.includes('🏆')));
    assert.ok(!labels.some(text => text === '1位' || text === '2位'));
});

runTest('新版の結果画面は次の操作を詳細集計より先に置き、従来版の順序を保つ', () => {
    const winner = { name: 'Alice', coins: 0, cards: [], landmarks: {} };
    const options = { winner, players: [winner], turnCount: 1, escapeHtml, canRematch: true };
    const classic = UiWinner.buildWinnerScreenHtml(options);
    const sunset = UiWinner.buildWinnerScreenHtml({ ...options, compactReview: true });
    assert.ok(classic.indexOf('winner-review') < classic.indexOf('winnerRematchButton'));
    assert.ok(!classic.includes('<details'));
    assert.ok(classic.includes('<div class="winner-share-actions">'));
    assert.ok(classic.indexOf('shareGameResult">結果を共有') < classic.indexOf('shareGameResultImage">画像を保存・共有'));
    assert.ok(classic.indexOf('winnerRestartButton') > classic.indexOf('winner-share-actions'));
    assert.ok(sunset.indexOf('winnerRestartButton') < sunset.indexOf('<details'));
    assert.ok(sunset.includes('<summary>対戦の詳しい記録</summary>'));
    assert.ok(!sunset.includes('<details open'));
});

runTest('結果の詳細記録は夕景テーマ・狭幅・広幅で操作の後へ畳む', () => {
    assert.strictEqual(UiWinner.shouldCompactReview('sunset', 900), true);
    assert.strictEqual(UiWinner.shouldCompactReview('classic', 480), true);
    assert.strictEqual(UiWinner.shouldCompactReview('classic', 320), true);
    assert.strictEqual(UiWinner.shouldCompactReview('classic', 481), false);
    assert.strictEqual(UiWinner.shouldCompactReview('classic', 759), false);
    assert.strictEqual(UiWinner.shouldCompactReview('classic', 760), true);
    assert.strictEqual(UiWinner.shouldCompactReview('classic', 1024), true);
});
