'use strict';

const assert = require('assert');
const UiCpuTournament = require('../js/uiCpuTournament');
const { runTest } = require('./helpers/test-utils');

runTest('CPU大会結果UIはランキングと集計条件を表示し文字列をescapeする', () => {
    const html = UiCpuTournament.buildRankingsHtml({
        completedGames: 2,
        requestedGames: 2,
        averageTurns: 11.5,
        exhaustedGames: 0,
        rankings: [{
            label: '<CPU最強>', wins: 2, appearances: 2, winRate: 100,
            averageTurns: 11.5, favoriteCard: { name: '森林&牧場', count: 3 },
        }],
    });
    assert.ok(html.includes('&lt;CPU最強&gt;'));
    assert.ok(html.includes('森林&amp;牧場（3枚）'));
    assert.ok(html.includes('平均決着ターン'));
    assert.ok(html.includes('初期カードを除く最多所持カード'));
});

runTest('CPU大会UIは分析・履歴比較・リプレイを安全に表示する', () => {
    const view = {
        completedGames: 1, requestedGames: 1, playerCount: 2, averageTurns: 9,
        exhaustedGames: 0,
        rankings: [{ difficulty: 'strong', label: '<強>', wins: 1, appearances: 1,
            winRate: 100, averageTurns: 9, favoriteCard: { name: '森林', count: 1 } }],
        games: [{ index: 0, seed: 7, difficulties: ['strong', 'weak'], winner: 0,
            turns: 9, exhausted: false, finalState: [] }],
    };
    const html = UiCpuTournament.buildRankingsHtml(view);
    assert.ok(html.includes('CPU分析レポート'));
    assert.ok(html.includes('席順別の勝率'));
    assert.ok(html.includes('replayCpuTournamentGame'));
    assert.ok(html.includes('&lt;強&gt;'));
    const history = UiCpuTournament.buildHistoryHtml([
        { ...view, createdAt: 1000 }, { ...view, createdAt: 500,
            rankings: [{ ...view.rankings[0], winRate: 80 }] },
    ]);
    assert.ok(history.includes('前回比+20pt'));
    assert.ok(history.includes('exportCpuTournamentJson'));
    const replay = UiCpuTournament.buildReplayHtml({
        seed: 7, winner: 0, turns: 9, difficulties: ['strong', 'weak'],
        trace: [{ turn: 0, playerIndex: 0, difficulty: 'strong',
            players: [{ coins: 3, cards: 2, landmarks: 0 }] }],
    });
    assert.ok(replay.includes('seed 7'));
    assert.ok(replay.includes('3コイン'));
});

runTest('CPU大会結果UIは実行状態に応じて操作とstatusを同期する', () => {
    const elements = {
        startButton: {}, cancelButton: {}, gamesSelect: {}, playerCountSelect: {},
        status: {}, results: { innerHTML: '' },
    };
    UiCpuTournament.applyState(elements, {
        status: 'running', error: '', summary: {
            completedGames: 3, requestedGames: 10, averageTurns: 9,
            exhaustedGames: 0, rankings: [],
        },
    });
    assert.strictEqual(elements.startButton.disabled, true);
    assert.strictEqual(elements.cancelButton.disabled, false);
    assert.strictEqual(elements.status.textContent, '3/10試合を完了しました');
    UiCpuTournament.applyState(elements, {
        status: 'cancelled', error: '', summary: {
            completedGames: 3, requestedGames: 10, averageTurns: 9,
            exhaustedGames: 0, rankings: [],
        },
    });
    assert.strictEqual(elements.startButton.disabled, false);
    assert.strictEqual(elements.status.textContent, '3試合で中止しました');
});
