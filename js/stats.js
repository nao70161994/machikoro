/**
 * stats.js - ゲーム統計の記録・表示
 * ローカル / オンライン / 全体 を分けて保持する
 */

let _statsRecorded = false;
let _statsViewMode = 'all';
let _statsPlayerFilter = '';

function escapeStatsHtml(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createEmptyStatsBucket() {
    return { totalGames: 0, wins: 0, totalTurns: 0, cardStats: {}, landmarkStats: {} };
}

function createDefaultStats() {
    return {
        all: createEmptyStatsBucket(),
        local: createEmptyStatsBucket(),
        online: createEmptyStatsBucket(),
        players: {},
        cpuTypes: {},
    };
}

function cloneStatsBucket(bucket) {
    return {
        totalGames: bucket.totalGames || 0,
        wins: bucket.wins || 0,
        totalTurns: bucket.totalTurns || 0,
        cardStats: Object.assign({}, bucket.cardStats || {}),
        landmarkStats: Object.assign({}, bucket.landmarkStats || {}),
    };
}

function normalizeStats(raw) {
    const base = createDefaultStats();
    if (!raw || typeof raw !== 'object') return base;
    if (raw.all && raw.local && raw.online) {
        const players = {};
        const cpuTypes = {};
        for (const [name, bucket] of Object.entries(raw.players || {})) {
            players[name] = cloneStatsBucket(bucket);
        }
        for (const [name, bucket] of Object.entries(raw.cpuTypes || {})) {
            cpuTypes[name] = cloneStatsBucket(bucket);
        }
        return {
            all: cloneStatsBucket(raw.all),
            local: cloneStatsBucket(raw.local),
            online: cloneStatsBucket(raw.online),
            players,
            cpuTypes,
        };
    }
    // 旧形式はローカル統計として扱う
    const legacy = cloneStatsBucket(raw);
    return {
        all: cloneStatsBucket(legacy),
        local: cloneStatsBucket(legacy),
        online: createEmptyStatsBucket(),
        players: {},
        cpuTypes: {},
    };
}

function loadStats() {
    try {
        const raw = localStorage.getItem('gameStats');
        if (raw) return normalizeStats(JSON.parse(raw));
    } catch (e) {}
    return createDefaultStats();
}

function saveStats(stats) {
    try { localStorage.setItem('gameStats', JSON.stringify(stats)); } catch (e) {}
}

function getStatsModeLabel(mode) {
    if (mode === 'local') return 'ローカル';
    if (mode === 'online') return 'オンライン';
    return '全体';
}

function getCurrentStatsBucket(stats, mode) {
    return stats[mode] || createEmptyStatsBucket();
}

function escapeJsSingleQuoted(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function ensurePlayerStatsBucket(stats, playerName) {
    if (!stats.players[playerName]) stats.players[playerName] = createEmptyStatsBucket();
    return stats.players[playerName];
}

function ensureCpuStatsBucket(stats, cpuLabel) {
    if (!stats.cpuTypes[cpuLabel]) stats.cpuTypes[cpuLabel] = createEmptyStatsBucket();
    return stats.cpuTypes[cpuLabel];
}

function getCpuStatsLabel(cpu) {
    if (!cpu) return '';
    if (cpu.difficulty === 'weak') return 'CPU（弱）';
    if (cpu.difficulty === 'normal') return 'CPU（普通）';
    if (cpu.difficulty === 'strong') return 'CPU（強）';
    if (cpu.difficulty === 'rl') return cpu.modelLabel || 'AI（深層学習）';
    return 'CPU（最強）';
}

function updateStatsBucket(bucket, player, won, game) {
    bucket.totalGames++;
    if (won) bucket.wins++;
    bucket.totalTurns += game.turnCount || 0;

    for (const card of player.cards) {
        if (!bucket.cardStats[card.name]) bucket.cardStats[card.name] = { winWith: 0, loseWith: 0 };
        if (won) bucket.cardStats[card.name].winWith++;
        else bucket.cardStats[card.name].loseWith++;
    }

    for (const [name, built] of Object.entries(player.landmarks)) {
        if (!built) continue;
        if (!bucket.landmarkStats[name]) bucket.landmarkStats[name] = { winWith: 0, loseWith: 0 };
        if (won) bucket.landmarkStats[name].winWith++;
        else bucket.landmarkStats[name].loseWith++;
    }
}

function getRecordTargets(game, cpuPlayers) {
    return game.players
        .map((player, index) => {
            const cpu = cpuPlayers[index];
            return {
                player,
                index,
                bucketType: cpu ? 'cpu' : 'player',
                bucketKey: cpu ? getCpuStatsLabel(cpu) : player.name,
            };
        })
        .filter(target => !!target.bucketKey);
}

function updateNamedStats(stats, target, player, won, game) {
    if (target.bucketType === 'cpu') {
        updateStatsBucket(ensureCpuStatsBucket(stats, target.bucketKey), player, won, game);
        return;
    }
    updateStatsBucket(ensurePlayerStatsBucket(stats, target.bucketKey), player, won, game);
}

function getFilteredStatsBucket(stats, filterName) {
    if (!filterName) return null;
    if (stats.players[filterName]) return stats.players[filterName];
    if (stats.cpuTypes[filterName]) return stats.cpuTypes[filterName];
    return createEmptyStatsBucket();
}

// ゲーム終了時に呼び出す（ui.js の render から）
function recordGameStats(winner, game, cpuPlayers) {
    if (_statsRecorded) return;
    _statsRecorded = true;

    const mode = (typeof isOnlineGame !== 'undefined' && isOnlineGame) ? 'online' : 'local';
    const stats = loadStats();
    const targets = getRecordTargets(game, cpuPlayers);
    if (targets.length === 0) return;

    for (const target of targets) {
        const { player, index } = target;
        const won = game.players.indexOf(winner) === index;
        updateStatsBucket(stats.all, player, won, game);
        updateStatsBucket(stats[mode], player, won, game);
        updateNamedStats(stats, target, player, won, game);
    }
    saveStats(stats);
}

// ゲーム開始時にリセット
function resetStatsRecorded() {
    _statsRecorded = false;
}

let _statsHandlersBound = false;

function statsActionFromEvent(event) {
    const target = event && event.target;
    if (!target) return null;
    if (typeof target.closest === 'function') return target.closest('[data-action]');
    return target.dataset && target.dataset.action ? target : null;
}

function handleStatsClick(event) {
    const button = statsActionFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'setStatsViewMode') setStatsViewMode(button.dataset.statsMode);
    else if (action === 'setStatsPlayerFilter') setStatsPlayerFilter(button.dataset.playerName || '');
    else if (action === 'clearStats') clearStats();
}

function bindStatsHandlers(el) {
    if (_statsHandlersBound) return;
    if (el && typeof el.addEventListener === 'function') {
        el.addEventListener('click', handleStatsClick);
    }
    _statsHandlersBound = true;
}

function applyClearStats() {
    localStorage.removeItem('gameStats');
    renderStats();
}

function clearStats() {
    if (typeof showConfirm === 'function') {
        showConfirm('統計をリセットしますか？', applyClearStats);
        return;
    }
    applyClearStats();
}

function setStatsViewMode(mode) {
    _statsViewMode = ['all', 'local', 'online'].includes(mode) ? mode : 'all';
    _statsPlayerFilter = '';
    renderStats();
}

function setStatsPlayerFilter(playerName) {
    _statsPlayerFilter = playerName || '';
    renderStats();
}

function buildStatsFilterTabsHtml(stats) {
    const playerNames = Object.keys(stats.players).sort((a, b) => a.localeCompare(b, 'ja'));
    const cpuLabels = Object.keys(stats.cpuTypes).sort((a, b) => a.localeCompare(b, 'ja'));
    return `
        <div class="stats-filter-tabs">
            <button class="stats-filter-btn ${!_statsPlayerFilter && _statsViewMode === 'all' ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="all">全体</button>
            <button class="stats-filter-btn ${!_statsPlayerFilter && _statsViewMode === 'local' ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="local">ローカル</button>
            <button class="stats-filter-btn ${!_statsPlayerFilter && _statsViewMode === 'online' ? 'active' : ''}" data-action="setStatsViewMode" data-stats-mode="online">オンライン</button>
        </div>
        ${playerNames.length ? `<div class="stats-filter-group-label">プレイヤー別</div><div class="stats-player-filters">
            ${playerNames.map(name => `<button class="stats-player-btn ${_statsPlayerFilter === name ? 'active' : ''}" data-action="setStatsPlayerFilter" data-player-name="${escapeStatsHtml(name)}">${escapeStatsHtml(name)}</button>`).join('')}
        </div>` : ''}
        ${cpuLabels.length ? `<div class="stats-filter-group-label">CPU別</div><div class="stats-player-filters">
            ${cpuLabels.map(name => `<button class="stats-player-btn cpu ${_statsPlayerFilter === name ? 'active' : ''}" data-action="setStatsPlayerFilter" data-player-name="${escapeStatsHtml(name)}">${escapeStatsHtml(name)}</button>`).join('')}
        </div>` : ''}
        ${_statsPlayerFilter ? `<div class="stats-player-filters"><button class="stats-player-btn clear" data-action="setStatsPlayerFilter" data-player-name="">解除</button></div>` : ''}
    `;
}

function buildStatsCardRowsHtml(bucket) {
    const cardEntries = Object.entries(bucket.cardStats)
        .map(([name, s]) => {
            const total = s.winWith + s.loseWith;
            return { name, total, rate: total > 0 ? s.winWith / total : 0 };
        })
        .filter(e => e.total >= 3)
        .sort((a, b) => b.rate - a.rate);

    return cardEntries.slice(0, 15).map((e, i) => {
        const pct = Math.round(e.rate * 100);
        return `<div class="stats-card-row">
            <span class="stats-rank">${i + 1}</span>
            <span class="stats-card-name">${escapeStatsHtml(e.name)}</span>
            <div class="stats-bar-wrap"><div class="stats-bar" style="width:${pct}%"></div></div>
            <span class="stats-pct">${pct}%</span>
            <span class="stats-count">${e.total}戦</span>
        </div>`;
    }).join('') || '<div class="stats-empty">3戦以上のデータがまだありません</div>';
}

function buildStatsLandmarkRowsHtml(bucket) {
    return Object.entries(bucket.landmarkStats)
        .map(([name, s]) => {
            const total = s.winWith + s.loseWith;
            const pct = total > 0 ? Math.round(s.winWith / total * 100) : 0;
            return `<div class="stats-card-row">
                <span class="stats-card-name">${escapeStatsHtml(name)}</span>
                <div class="stats-bar-wrap"><div class="stats-bar stats-bar-lm" style="width:${pct}%"></div></div>
                <span class="stats-pct">${pct}%</span>
                <span class="stats-count">${total}戦</span>
            </div>`;
        }).join('');
}

function renderStats() {
    const el = document.getElementById('tabContentStats');
    if (!el) return;
    bindStatsHandlers(el);

    const stats = loadStats();
    const bucket = _statsPlayerFilter ? getFilteredStatsBucket(stats, _statsPlayerFilter) : getCurrentStatsBucket(stats, _statsViewMode);
    const modeLabel = _statsPlayerFilter ? `${_statsPlayerFilter}の成績` : `${getStatsModeLabel(_statsViewMode)}の成績`;
    const safeModeLabel = escapeStatsHtml(modeLabel);
    const emptyModeLabel = escapeStatsHtml(_statsPlayerFilter || getStatsModeLabel(_statsViewMode));
    const filterTabsHtml = buildStatsFilterTabsHtml(stats);

    if (bucket.totalGames === 0) {
        el.innerHTML = `
            ${filterTabsHtml}
            <div class="stats-empty">まだ${emptyModeLabel}の記録がありません。<br>${_statsViewMode === 'online' ? 'オンライン対戦を完了すると記録されます。' : 'ゲームをプレイすると記録されます。'}</div>
        `;
        return;
    }

    const winRate = Math.round(bucket.wins / bucket.totalGames * 100);
    const avgTurns = Math.round(bucket.totalTurns / bucket.totalGames);
    const cardRows = buildStatsCardRowsHtml(bucket);
    const lmRows = buildStatsLandmarkRowsHtml(bucket);

    el.innerHTML = `
        ${filterTabsHtml}
        <div class="stats-mode-label">${safeModeLabel}</div>

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

        ${lmRows ? `<div class="stats-section-title">🏛️ ランドマーク建設時勝率</div>
        <div class="stats-cards">${lmRows}</div>` : ''}

        <button data-action="clearStats" class="delete-save-btn" style="margin-top:16px;width:100%">🗑 統計をリセット</button>
    `;
}
