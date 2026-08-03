'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

function statsModeLabel(mode) {
    if (mode === 'local') return 'ローカル';
    if (mode === 'online') return 'オンライン';
    return '全体';
}

function emptyStatsBucket() {
    return { totalGames: 0, wins: 0, totalTurns: 0, cardStats: {}, landmarkStats: {} };
}

function statsBucket(stats, viewMode, playerFilter) {
    if (playerFilter) {
        return stats.players[playerFilter] || stats.cpuTypes[playerFilter] || emptyStatsBucket();
    }
    return stats[viewMode] || emptyStatsBucket();
}

function buildFilterTabsHtml(stats, viewMode, playerFilter, escapeHtml) {
    const escape = requireFunction(escapeHtml, 'escapeHtml');
    const playerNames = Object.keys(stats.players).sort((a, b) => a.localeCompare(b, 'ja'));
    const cpuLabels = Object.keys(stats.cpuTypes).sort((a, b) => a.localeCompare(b, 'ja'));
    return `
        <div class="stats-filter-tabs">
            <button class="stats-filter-btn ${!playerFilter && viewMode === 'all' ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="all">全体</button>
            <button class="stats-filter-btn ${!playerFilter && viewMode === 'local' ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="local">ローカル</button>
            <button class="stats-filter-btn ${!playerFilter && viewMode === 'online' ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="online">オンライン</button>
        </div>
        ${playerNames.length ? `<div class="stats-filter-group-label">プレイヤー別</div><div class="stats-player-filters">
            ${playerNames.map(name => `<button class="stats-player-btn ${playerFilter === name ? 'active' : ''}" data-action="setStatsPlayerFilter" data-player-name="${escape(name)}">${escape(name)}</button>`).join('')}
        </div>` : ''}
        ${cpuLabels.length ? `<div class="stats-filter-group-label">CPU別</div><div class="stats-player-filters">
            ${cpuLabels.map(name => `<button class="stats-player-btn cpu ${playerFilter === name ? 'active' : ''}" data-action="setStatsPlayerFilter" data-player-name="${escape(name)}">${escape(name)}</button>`).join('')}
        </div>` : ''}
        ${playerFilter ? `<div class="stats-player-filters"><button class="stats-player-btn clear" data-action="setStatsPlayerFilter" data-player-name="">解除</button></div>` : ''}
    `;
}

function buildCardRowsHtml(bucket, escapeHtml) {
    const escape = requireFunction(escapeHtml, 'escapeHtml');
    const cardEntries = Object.entries(bucket.cardStats)
        .map(([name, result]) => {
            const total = result.winWith + result.loseWith;
            return { name, total, rate: total > 0 ? result.winWith / total : 0 };
        })
        .filter(entry => entry.total >= 3)
        .sort((a, b) => b.rate - a.rate);

    return cardEntries.slice(0, 15).map((entry, index) => {
        const pct = Math.round(entry.rate * 100);
        return `<div class="stats-card-row">
            <span class="stats-rank">${index + 1}</span>
            <span class="stats-card-name">${escape(entry.name)}</span>
            <div class="stats-bar-wrap"><div class="stats-bar" style="width:${pct}%"></div></div>
            <span class="stats-pct">${pct}%</span>
            <span class="stats-count">${entry.total}戦</span>
        </div>`;
    }).join('') || '<div class="stats-empty">3戦以上のデータがまだありません</div>';
}

function buildLandmarkRowsHtml(bucket, escapeHtml) {
    const escape = requireFunction(escapeHtml, 'escapeHtml');
    return Object.entries(bucket.landmarkStats)
        .map(([name, result]) => {
            const total = result.winWith + result.loseWith;
            const pct = total > 0 ? Math.round(result.winWith / total * 100) : 0;
            return `<div class="stats-card-row">
                <span class="stats-card-name">${escape(name)}</span>
                <div class="stats-bar-wrap"><div class="stats-bar stats-bar-lm" style="width:${pct}%"></div></div>
                <span class="stats-pct">${pct}%</span>
                <span class="stats-count">${total}戦</span>
            </div>`;
        }).join('');
}

function buildStatsHtml(stats, viewMode, playerFilter, escapeHtml) {
    const escape = requireFunction(escapeHtml, 'escapeHtml');
    const bucket = statsBucket(stats, viewMode, playerFilter);
    const label = playerFilter || statsModeLabel(viewMode);
    const filterTabsHtml = buildFilterTabsHtml(stats, viewMode, playerFilter, escape);
    if (bucket.totalGames === 0) {
        return `
            ${filterTabsHtml}
            <div class="stats-empty">まだ${escape(label)}の記録がありません。<br>${viewMode === 'online' ? 'オンライン対戦を完了すると記録されます。' : 'ゲームをプレイすると記録されます。'}</div>
        `;
    }

    const winRate = Math.round(bucket.wins / bucket.totalGames * 100);
    const avgTurns = Math.round(bucket.totalTurns / bucket.totalGames);
    const cardRows = buildCardRowsHtml(bucket, escape);
    const landmarkRows = buildLandmarkRowsHtml(bucket, escape);
    return `
        ${filterTabsHtml}
        <div class="stats-mode-label">${escape(label + 'の成績')}</div>

        <div class="stats-overview">
            <div class="stats-overview-item">
                <div class="stats-big">${bucket.totalGames}</div>
                <div class="stats-ov-label">総ゲーム数</div>
            </div>
            <div class="stats-overview-item">
                <div class="stats-big">${winRate}%</div>
                <div class="stats-ov-label">勝率</div>
            </div>
            <div class="stats-overview-item">
                <div class="stats-big">${avgTurns}</div>
                <div class="stats-ov-label">平均ターン</div>
            </div>
        </div>

        <div class="stats-section-title">🃏 カード勝率ランキング <span class="stats-hint">3戦以上・所持時の勝率</span></div>
        <div class="stats-cards">${cardRows}</div>

        ${landmarkRows ? `<div class="stats-section-title">🏛️ ランドマーク建設時勝率</div>
        <div class="stats-cards">${landmarkRows}</div>` : ''}

        <button data-action="clearStats" class="delete-save-btn" style="margin-top:16px;width:100%">🗑 統計をリセット</button>
    `;
}

const UiStatsView = Object.freeze({
    statsModeLabel,
    statsBucket,
    buildFilterTabsHtml,
    buildCardRowsHtml,
    buildLandmarkRowsHtml,
    buildStatsHtml,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiStatsView;
if (typeof window !== 'undefined') window.UiStatsView = UiStatsView;
if (typeof globalThis !== 'undefined') globalThis.UiStatsView = UiStatsView;
