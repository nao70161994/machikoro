'use strict';

const assert = require('assert');
const UiWinner = require('../js/uiWinner');
const { runTest } = require('./helpers/test-utils');

function escapeHtml(value) {
    return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

runTest('ui winnerはscore順・winner強調・escape契約を維持する', () => {
    const winner = { name: '<Alice>', coins: 12 };
    const leader = { name: 'Bob & Co', coins: 20 };
    const players = [winner, leader];
    const html = UiWinner.buildWinnerStatsRows(players, winner, escapeHtml);
    assert.strictEqual(html,
        '<div class="winner-stats-row "><span>Bob &amp; Co</span><span>🪙 20</span></div>' +
        '<div class="winner-stats-row highlight"><span>🏆 &lt;Alice&gt;</span><span>🪙 12</span></div>'
    );
    assert.deepStrictEqual(players, [winner, leader]);
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
        resultAdSlot: '<div class="ad">ad</div>', escapeHtml,
    });
    assert.ok(human.includes('<div class="winner-title">Aliceの勝利！</div>'));
    assert.ok(human.includes('👤 人間プレイヤーが勝ちました　9ターン'));
    assert.ok(human.endsWith('<div class="ad">ad</div></div>'));
    const cpu = UiWinner.buildWinnerScreenHtml({
        winner, players: [winner], isCpuWinner: true, turnCount: 10, winStreak: 2, escapeHtml,
    });
    assert.ok(cpu.includes('🤖 CPUプレイヤーが勝ちました　10ターン'));
    assert.ok(cpu.includes('2連勝中！'));
});

runTest('ui winnerは不正inputを空HTMLへfail closedにする', () => {
    assert.strictEqual(UiWinner.buildWinnerScreenHtml(), '');
    assert.strictEqual(UiWinner.buildWinnerStatsRows(null, null, escapeHtml), '');
});
