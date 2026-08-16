'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

function statsModeLabel(mode) {
    if (mode === 'local') return 'ローカル';
    if (mode === 'online') return 'オンライン';
    if (mode === 'standard') return '通常市場';
    if (mode === 'ten-type') return '公式10種類市場';
    return '全体';
}

function statsFilters(viewKey) {
    if (viewKey === 'standard' || viewKey === 'ten-type') {
        return Object.freeze({ mode: 'all', marketRule: viewKey });
    }
    const [rawMode, rawMarketRule] = String(viewKey || 'all').split('|');
    return Object.freeze({
        mode: ['all', 'local', 'online'].includes(rawMode) ? rawMode : 'all',
        marketRule: ['standard', 'ten-type'].includes(rawMarketRule) ? rawMarketRule : 'all',
    });
}

function combinedStatsLabel(filters) {
    const labels = [];
    if (filters.mode !== 'all') labels.push(statsModeLabel(filters.mode));
    if (filters.marketRule !== 'all') labels.push(statsModeLabel(filters.marketRule));
    return labels.length ? labels.join(' × ') : '全体';
}

function emptyStatsBucket() {
    return { totalGames: 0, wins: 0, totalTurns: 0, totalFinalCoins: 0,
        totalFinalFacilities: 0, totalFinalLandmarks: 0, cardStats: {}, landmarkStats: {} };
}

function statsBucket(stats, viewMode, playerFilter) {
    if (playerFilter) {
        if (playerFilter.startsWith('人数:')) {
            return stats.playerCounts && stats.playerCounts[playerFilter.slice(3)] || emptyStatsBucket();
        }
        return stats.players[playerFilter] || stats.cpuTypes[playerFilter] || emptyStatsBucket();
    }
    const filters = statsFilters(viewMode);
    if (filters.marketRule !== 'all') {
        if (filters.mode !== 'all') {
            return stats.combinations && stats.combinations[filters.mode] &&
                stats.combinations[filters.mode][filters.marketRule] || emptyStatsBucket();
        }
        return stats.marketRules && stats.marketRules[filters.marketRule] || emptyStatsBucket();
    }
    return stats[filters.mode] || emptyStatsBucket();
}

function buildFilterTabsHtml(stats, viewMode, playerFilter, escapeHtml) {
    const escape = requireFunction(escapeHtml, 'escapeHtml');
    const playerNames = Object.keys(stats.players).sort((a, b) => a.localeCompare(b, 'ja'));
    const cpuLabels = Object.keys(stats.cpuTypes).sort((a, b) => a.localeCompare(b, 'ja'));
    const playerCounts = Object.keys(stats.playerCounts || {}).sort((a, b) => Number(a) - Number(b));
    const filters = statsFilters(viewMode);
    const modePressed = mode => !playerFilter && filters.mode === mode;
    const marketPressed = rule => !playerFilter && filters.marketRule === rule;
    return `
        <div class="stats-filter-tabs">
            <button class="stats-filter-btn ${modePressed('all') ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="all" aria-pressed="${modePressed('all')}">全体</button>
            <button class="stats-filter-btn ${modePressed('local') ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="local" aria-pressed="${modePressed('local')}">ローカル</button>
            <button class="stats-filter-btn ${modePressed('online') ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="online" aria-pressed="${modePressed('online')}">オンライン</button>
        </div>
        <div class="stats-filter-group-label">市場ルール別</div><div class="stats-filter-tabs stats-market-filters">
            <button class="stats-filter-btn ${marketPressed('all') ? 'active' : ''}" data-action="setStatsMarketRule" data-market-rule="all" aria-pressed="${marketPressed('all')}">すべて</button>
            <button class="stats-filter-btn ${marketPressed('standard') ? 'active' : ''}" data-action="setStatsMarketRule" data-market-rule="standard" aria-pressed="${marketPressed('standard')}">通常市場</button>
            <button class="stats-filter-btn ${marketPressed('ten-type') ? 'active' : ''}" data-action="setStatsMarketRule" data-market-rule="ten-type" aria-pressed="${marketPressed('ten-type')}">公式10種類</button>
        </div>
        ${playerNames.length ? `<div class="stats-filter-group-label">プレイヤー別</div><div class="stats-player-filters">
            ${playerNames.map(name => `<button class="stats-player-btn ${playerFilter === name ? 'active' : ''}" data-action="setStatsPlayerFilter" data-player-name="${escape(name)}" aria-pressed="${playerFilter === name}">${escape(name)}</button>`).join('')}
        </div>` : ''}
        ${cpuLabels.length ? `<div class="stats-filter-group-label">CPU別</div><div class="stats-player-filters">
            ${cpuLabels.map(name => `<button class="stats-player-btn cpu ${playerFilter === name ? 'active' : ''}" data-action="setStatsPlayerFilter" data-player-name="${escape(name)}" aria-pressed="${playerFilter === name}">${escape(name)}</button>`).join('')}
        </div>` : ''}
        ${playerCounts.length ? `<div class="stats-filter-group-label">人数別</div><div class="stats-player-filters">
            ${playerCounts.map(count => {
                const value = `人数:${count}`;
                return `<button class="stats-player-btn ${playerFilter === value ? 'active' : ''}" data-action="setStatsPlayerFilter" data-player-name="${value}" aria-pressed="${playerFilter === value}">${count}人戦</button>`;
            }).join('')}
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

    const rows = cardEntries.slice(0, 15).map((entry, index) => {
        const pct = Math.round(entry.rate * 100);
        const accessibleLabel = escape(`第${index + 1}位、${entry.name}、勝率${pct}%、${entry.total}戦`);
        return `<div class="stats-card-row" role="listitem" aria-label="${accessibleLabel}">
            <span class="stats-rank">${index + 1}</span>
            <span class="stats-card-name">${escape(entry.name)}</span>
            <div class="stats-bar-wrap" aria-hidden="true"><div class="stats-bar" style="width:${pct}%"></div></div>
            <span class="stats-pct">${pct}%</span>
            <span class="stats-count">${entry.total}戦</span>
        </div>`;
    }).join('');
    return rows
        ? `<div class="stats-cards" role="list" aria-label="カード勝率ランキング">${rows}</div>`
        : '<div class="stats-empty">3戦以上のデータがまだありません</div>';
}

function buildLandmarkRowsHtml(bucket, escapeHtml) {
    const escape = requireFunction(escapeHtml, 'escapeHtml');
    const rows = Object.entries(bucket.landmarkStats)
        .map(([name, result], index) => {
            const total = result.winWith + result.loseWith;
            const pct = total > 0 ? Math.round(result.winWith / total * 100) : 0;
            const accessibleLabel = escape(`第${index + 1}項目、${name}、勝率${pct}%、${total}戦`);
            return `<div class="stats-card-row" role="listitem" aria-label="${accessibleLabel}">
                <span class="stats-card-name">${escape(name)}</span>
                <div class="stats-bar-wrap" aria-hidden="true"><div class="stats-bar stats-bar-lm" style="width:${pct}%"></div></div>
                <span class="stats-pct">${pct}%</span>
                <span class="stats-count">${total}戦</span>
            </div>`;
        }).join('');
    return rows ? `<div class="stats-cards" role="list" aria-label="ランドマーク建設時勝率">${rows}</div>` : '';
}

function buildStatsHtml(stats, viewMode, playerFilter, escapeHtml) {
    const escape = requireFunction(escapeHtml, 'escapeHtml');
    const bucket = statsBucket(stats, viewMode, playerFilter);
    const filters = statsFilters(viewMode);
    const label = playerFilter || combinedStatsLabel(filters);
    const filterTabsHtml = buildFilterTabsHtml(stats, viewMode, playerFilter, escape);
    if (bucket.totalGames === 0) {
        return `
            ${filterTabsHtml}
            <div class="stats-empty">まだ${escape(label)}の記録がありません。<br>${filters.mode === 'online' ? 'オンライン対戦を完了すると記録されます。' : 'ゲームをプレイすると記録されます。'}</div>
        `;
    }

    const winRate = Math.round(bucket.wins / bucket.totalGames * 100);
    const avgTurns = Math.round(bucket.totalTurns / bucket.totalGames);
    const avgCoins = Math.round((bucket.totalFinalCoins || 0) / bucket.totalGames * 10) / 10;
    const avgFacilities = Math.round((bucket.totalFinalFacilities || 0) / bucket.totalGames * 10) / 10;
    const avgLandmarks = Math.round((bucket.totalFinalLandmarks || 0) / bucket.totalGames * 10) / 10;
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

        <div class="stats-section-title">📊 最終盤面の平均</div>
        <div class="stats-overview stats-final-overview">
            <div class="stats-overview-item"><div class="stats-big">${avgCoins}</div><div class="stats-ov-label">コイン</div></div>
            <div class="stats-overview-item"><div class="stats-big">${avgFacilities}</div><div class="stats-ov-label">施設枚数</div></div>
            <div class="stats-overview-item"><div class="stats-big">${avgLandmarks}</div><div class="stats-ov-label">ランドマーク</div></div>
        </div>

        <div class="stats-section-title">🃏 カード勝率ランキング <span class="stats-hint">3戦以上・所持時の勝率</span></div>
        ${cardRows}

        ${landmarkRows ? `<div class="stats-section-title">🏛️ ランドマーク建設時勝率</div>
        ${landmarkRows}` : ''}

        <button data-action="clearStats" class="delete-save-btn" style="margin-top:16px;width:100%">🗑 統計をリセット</button>
    `;
}

const UiStatsView = Object.freeze({
    statsModeLabel,
    statsFilters,
    combinedStatsLabel,
    statsBucket,
    buildFilterTabsHtml,
    buildCardRowsHtml,
    buildLandmarkRowsHtml,
    buildStatsHtml,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiStatsView;
if (typeof window !== 'undefined') window.UiStatsView = UiStatsView;
if (typeof globalThis !== 'undefined') globalThis.UiStatsView = UiStatsView;
