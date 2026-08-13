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
