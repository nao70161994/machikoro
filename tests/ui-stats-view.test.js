'use strict';

const assert = require('assert');
const UiStatsView = require('../js/uiStatsView');
const { runTest } = require('./helpers/test-utils');

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function makeStats() {
    const empty = () => ({
        totalGames: 0,
        wins: 0,
        totalTurns: 0,
        cardStats: {},
        landmarkStats: {},
    });
    return { all: empty(), local: empty(), online: empty(), players: {}, cpuTypes: {} };
}

runTest('stats viewはmode/player bucketを入力非変更で選ぶ', () => {
    const stats = makeStats();
    stats.local.totalGames = 2;
    stats.players.Alice = { ...stats.local, totalGames: 3 };
    const before = JSON.stringify(stats);

    assert.strictEqual(UiStatsView.statsBucket(stats, 'local', '').totalGames, 2);
    assert.strictEqual(UiStatsView.statsBucket(stats, 'all', 'Alice').totalGames, 3);
    assert.strictEqual(UiStatsView.statsBucket(stats, 'all', 'missing').totalGames, 0);
    assert.strictEqual(JSON.stringify(stats), before);
});

runTest('stats viewはfilter名とランキング名をescapeして既存HTMLを生成する', () => {
    const stats = makeStats();
    const unsafe = '<img src=x onerror=alert(1)>';
    stats.players[unsafe] = {
        totalGames: 3,
        wins: 2,
        totalTurns: 12,
        cardStats: { [unsafe]: { winWith: 2, loseWith: 1 } },
        landmarkStats: { [unsafe]: { winWith: 2, loseWith: 1 } },
    };

    const html = UiStatsView.buildStatsHtml(stats, 'all', unsafe, escapeHtml);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;の成績'));
    assert.ok(html.includes('67%'));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
    assert.ok(html.includes('data-action="clearStats"'));
});

runTest('stats viewは空bucketのonline案内とfilter選択状態を純粋生成する', () => {
    const stats = makeStats();
    stats.cpuTypes['CPU（強）'] = makeStats().all;
    const html = UiStatsView.buildStatsHtml(stats, 'online', '', escapeHtml);

    assert.ok(html.includes('stats-filter-btn active'));
    assert.ok(html.includes('data-stats-mode="online"'));
    assert.ok(html.includes('オンライン対戦を完了すると記録されます。'));
    assert.ok(html.includes('CPU（強）'));
});

runTest('stats viewはescape関数未注入をfail-fastに拒否する', () => {
    assert.throws(() => UiStatsView.buildStatsHtml(makeStats(), 'all', ''), /escapeHtml/);
});

if (process.exitCode) {
    throw new Error('ui stats viewテストで失敗が発生しました');
}
