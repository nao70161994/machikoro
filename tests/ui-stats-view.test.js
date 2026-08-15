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
        totalFinalCoins: 0,
        totalFinalFacilities: 0,
        totalFinalLandmarks: 0,
        cardStats: {},
        landmarkStats: {},
    });
    return { all: empty(), local: empty(), online: empty(), players: {}, cpuTypes: {}, playerCounts: {},
        marketRules: { standard: empty(), 'ten-type': empty() } };
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
    stats.marketRules['ten-type'].totalGames = 4;
    assert.strictEqual(UiStatsView.statsBucket(stats, 'ten-type', '').totalGames, 4);
});

runTest('stats viewは市場ルール別filterと名称を表示する', () => {
    const stats = makeStats();
    stats.marketRules['ten-type'].totalGames = 1;
    stats.marketRules['ten-type'].wins = 1;
    const html = UiStatsView.buildStatsHtml(stats, 'ten-type', '', escapeHtml);
    assert.ok(html.includes('data-stats-mode="standard"'));
    assert.ok(html.includes('data-stats-mode="ten-type" aria-pressed="true"'));
    assert.ok(html.includes('公式10種類市場の成績'));
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

runTest('stats viewは長い実名称と999戦のaria全文・visible値を保つ', () => {
    const bucket = makeStats().all;
    bucket.cardStats = {
        コンベンションセンター: { winWith: 999, loseWith: 0 },
    };
    bucket.landmarkStats = {
        ショッピングモール: { winWith: 999, loseWith: 0 },
    };

    const cards = UiStatsView.buildCardRowsHtml(bucket, escapeHtml);
    assert.ok(cards.includes('aria-label="第1位、コンベンションセンター、勝率100%、999戦"'));
    assert.ok(cards.includes('<span class="stats-card-name">コンベンションセンター</span>'));
    assert.ok(cards.includes('<span class="stats-pct">100%</span>'));
    assert.ok(cards.includes('<span class="stats-count">999戦</span>'));

    const landmarks = UiStatsView.buildLandmarkRowsHtml(bucket, escapeHtml);
    assert.ok(landmarks.includes('aria-label="第1項目、ショッピングモール、勝率100%、999戦"'));
    assert.ok(landmarks.includes('<span class="stats-card-name">ショッピングモール</span>'));
    assert.ok(landmarks.includes('<span class="stats-pct">100%</span>'));
    assert.ok(landmarks.includes('<span class="stats-count">999戦</span>'));
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

runTest('stats viewは人数別bucketと最終盤面平均を表示する', () => {
    const stats = makeStats();
    stats.playerCounts['4'] = {
        ...makeStats().all,
        totalGames: 2,
        wins: 1,
        totalTurns: 16,
        totalFinalCoins: 15,
        totalFinalFacilities: 9,
        totalFinalLandmarks: 5,
    };
    const html = UiStatsView.buildStatsHtml(stats, 'all', '人数:4', escapeHtml);
    assert.ok(html.includes('data-player-name="人数:4" aria-pressed="true"'));
    assert.ok(html.includes('4人戦'));
    assert.ok(html.includes('人数:4の成績'));
    assert.ok(html.includes('<div class="stats-big">7.5</div><div class="stats-ov-label">コイン</div>'));
    assert.ok(html.includes('<div class="stats-big">4.5</div><div class="stats-ov-label">施設枚数</div>'));
    assert.ok(html.includes('<div class="stats-big">2.5</div><div class="stats-ov-label">ランドマーク</div>'));
});

runTest('stats viewはescape関数未注入をfail-fastに拒否する', () => {
    assert.throws(() => UiStatsView.buildStatsHtml(makeStats(), 'all', ''), /escapeHtml/);
});

if (process.exitCode) {
    throw new Error('ui stats viewテストで失敗が発生しました');
}
