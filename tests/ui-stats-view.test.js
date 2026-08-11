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
    assert.ok(html.includes('role="list" aria-label="カード勝率ランキング"'));
    assert.ok(html.includes('role="list" aria-label="ランドマーク建設時勝率"'));
    assert.ok(html.includes('role="listitem" aria-label="第1位、&lt;img src=x onerror=alert(1)&gt;、勝率67%、3戦"'));
    assert.ok(html.includes('role="listitem" aria-label="第1項目、&lt;img src=x onerror=alert(1)&gt;、勝率67%、3戦"'));
    assert.strictEqual((html.match(/class="stats-bar-wrap" aria-hidden="true"/g) || []).length, 2);
    assert.ok(html.includes('data-action="clearStats"'));
});

runTest('stats viewは順位・visible値を保ったlistをpureに生成する', () => {
    const bucket = makeStats().all;
    bucket.cardStats = {
        パン屋: { winWith: 3, loseWith: 1 },
        麦畑: { winWith: 1, loseWith: 3 },
        牧場: { winWith: 1, loseWith: 1 },
    };
    bucket.landmarkStats = {
        駅: { winWith: 2, loseWith: 2 },
        港: { winWith: 1, loseWith: 3 },
    };

    const cards = UiStatsView.buildCardRowsHtml(bucket, escapeHtml);
    assert.ok(cards.includes('aria-label="第1位、パン屋、勝率75%、4戦"'));
    assert.ok(cards.includes('aria-label="第2位、麦畑、勝率25%、4戦"'));
    assert.ok(!cards.includes('牧場'));
    assert.ok(cards.includes('<span class="stats-pct">75%</span>'));
    assert.ok(cards.includes('<span class="stats-count">4戦</span>'));

    const landmarks = UiStatsView.buildLandmarkRowsHtml(bucket, escapeHtml);
    assert.ok(landmarks.includes('aria-label="第1項目、駅、勝率50%、4戦"'));
    assert.ok(landmarks.includes('aria-label="第2項目、港、勝率25%、4戦"'));
});

runTest('stats viewはempty stateをlistとして宣言しない', () => {
    const emptyBucket = makeStats().all;
    const cards = UiStatsView.buildCardRowsHtml(emptyBucket, escapeHtml);
    const landmarks = UiStatsView.buildLandmarkRowsHtml(emptyBucket, escapeHtml);
    assert.ok(cards.includes('stats-empty'));
    assert.ok(!cards.includes('role="list"'));
    assert.strictEqual(landmarks, '');
});

runTest('stats viewは空bucketのonline案内とfilter選択状態を純粋生成する', () => {
    const stats = makeStats();
    stats.cpuTypes['CPU（強）'] = makeStats().all;
    const html = UiStatsView.buildStatsHtml(stats, 'online', '', escapeHtml);

    assert.ok(html.includes('stats-filter-btn active'));
    assert.ok(html.includes('data-stats-mode="online" aria-pressed="true"'));
    assert.ok(html.includes('data-stats-mode="all" aria-pressed="false"'));
    assert.ok(html.includes('data-player-name="CPU（強）" aria-pressed="false"'));
    assert.ok(html.includes('オンライン対戦を完了すると記録されます。'));
    assert.ok(html.includes('CPU（強）'));
});

runTest('stats viewはplayer filterの選択状態をaria-pressedへ反映する', () => {
    const stats = makeStats();
    stats.players.Alice = makeStats().all;
    const html = UiStatsView.buildStatsHtml(stats, 'all', 'Alice', escapeHtml);

    assert.ok(html.includes('data-stats-mode="all" aria-pressed="false"'));
    assert.ok(html.includes('data-player-name="Alice" aria-pressed="true"'));
});

runTest('stats viewはescape関数未注入をfail-fastに拒否する', () => {
    assert.throws(() => UiStatsView.buildStatsHtml(makeStats(), 'all', ''), /escapeHtml/);
});

if (process.exitCode) {
    throw new Error('ui stats viewテストで失敗が発生しました');
}
