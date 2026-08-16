/**
 * stats.js - ゲーム統計の記録・表示
 * ローカル / オンライン / 全体 を分けて保持する
 */

const StatsClientStorageApi = typeof module !== 'undefined' && module.exports
    ? require('./clientStorage')
    : globalThis.ClientStorage;
const statsClientStorageFacade = StatsClientStorageApi.createFacade();
const StatsViewApi = typeof module !== 'undefined' && module.exports
    ? require('./uiStatsView')
    : globalThis.UiStatsView;

let _statsRecorded = false;
let _statsViewMode = 'all';
let _statsMarketFilter = 'all';
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
    return { totalGames: 0, wins: 0, totalTurns: 0, totalFinalCoins: 0,
        totalFinalFacilities: 0, totalFinalLandmarks: 0, cardStats: {}, landmarkStats: {} };
}

function createDefaultStats() {
    return {
        all: createEmptyStatsBucket(),
        local: createEmptyStatsBucket(),
        online: createEmptyStatsBucket(),
        players: {},
        cpuTypes: {},
        playerCounts: {},
        marketRules: {
            standard: createEmptyStatsBucket(),
            'ten-type': createEmptyStatsBucket(),
        },
        combinations: {
            local: { standard: createEmptyStatsBucket(), 'ten-type': createEmptyStatsBucket() },
            online: { standard: createEmptyStatsBucket(), 'ten-type': createEmptyStatsBucket() },
        },
    };
}

function normalizeStatsNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function cloneStatsResultMap(map) {
    const normalized = {};
    for (const [name, value] of Object.entries(map || {})) {
        if (!value || typeof value !== 'object') continue;
        normalized[name] = {
            winWith: normalizeStatsNumber(value.winWith),
            loseWith: normalizeStatsNumber(value.loseWith),
        };
    }
    return normalized;
}

function cloneStatsBucket(bucket) {
    const source = bucket && typeof bucket === 'object' ? bucket : {};
    const totalGames = normalizeStatsNumber(source.totalGames);
    const wins = Math.min(normalizeStatsNumber(source.wins), totalGames);
    return {
        totalGames,
        wins,
        totalTurns: normalizeStatsNumber(source.totalTurns),
        totalFinalCoins: normalizeStatsNumber(source.totalFinalCoins),
        totalFinalFacilities: normalizeStatsNumber(source.totalFinalFacilities),
        totalFinalLandmarks: normalizeStatsNumber(source.totalFinalLandmarks),
        cardStats: cloneStatsResultMap(source.cardStats),
        landmarkStats: cloneStatsResultMap(source.landmarkStats),
    };
}

function normalizeStats(raw) {
    const base = createDefaultStats();
    if (!raw || typeof raw !== 'object') return base;
    if (raw.all && raw.local && raw.online) {
        const players = {};
        const cpuTypes = {};
        const playerCounts = {};
        const marketRules = {
            standard: cloneStatsBucket(raw.marketRules && raw.marketRules.standard),
            'ten-type': cloneStatsBucket(raw.marketRules && raw.marketRules['ten-type']),
        };
        const combinations = {};
        for (const mode of ['local', 'online']) {
            combinations[mode] = {
                standard: cloneStatsBucket(raw.combinations && raw.combinations[mode] &&
                    raw.combinations[mode].standard),
                'ten-type': cloneStatsBucket(raw.combinations && raw.combinations[mode] &&
                    raw.combinations[mode]['ten-type']),
            };
        }
        for (const [name, bucket] of Object.entries(raw.players || {})) {
            players[name] = cloneStatsBucket(bucket);
        }
        for (const [name, bucket] of Object.entries(raw.cpuTypes || {})) {
            cpuTypes[name] = cloneStatsBucket(bucket);
        }
        for (const [count, bucket] of Object.entries(raw.playerCounts || {})) {
            if (/^[2-9]$|^10$/.test(count)) playerCounts[count] = cloneStatsBucket(bucket);
        }
        return {
            all: cloneStatsBucket(raw.all),
            local: cloneStatsBucket(raw.local),
            online: cloneStatsBucket(raw.online),
            players,
            cpuTypes,
            playerCounts,
            marketRules,
            combinations,
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
        playerCounts: {},
        marketRules: {
            standard: cloneStatsBucket(legacy),
            'ten-type': createEmptyStatsBucket(),
        },
        combinations: base.combinations,
    };
}

function loadStats() {
    try {
        const raw = statsClientStorageFacade.get('gameStats');
        if (raw) return normalizeStats(JSON.parse(raw));
    } catch (e) {}
    return createDefaultStats();
}

function saveStats(stats) {
    statsClientStorageFacade.set('gameStats', JSON.stringify(stats));
}

function getStatsModeLabel(mode) {
    return StatsViewApi.statsModeLabel(mode);
}

function getCurrentStatsBucket(stats, mode) {
    if (mode === 'standard' || mode === 'ten-type') {
        return stats.marketRules && stats.marketRules[mode] || createEmptyStatsBucket();
    }
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
    bucket.totalFinalCoins += Number.isFinite(player.coins) ? Math.max(0, Math.floor(player.coins)) : 0;
    bucket.totalFinalFacilities += Array.isArray(player.cards) ? player.cards.length : 0;
    bucket.totalFinalLandmarks += Object.values(player.landmarks || {}).filter(Boolean).length;

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
    if (filterName.startsWith('人数:')) return stats.playerCounts[filterName.slice(3)] || createEmptyStatsBucket();
    return createEmptyStatsBucket();
}

// ゲーム終了時に呼び出す（ui.js の render から）
function recordGameStats(winner, game, cpuPlayers) {
    if (_statsRecorded) return;
    _statsRecorded = true;

    const mode = (typeof isOnlineGame !== 'undefined' && isOnlineGame) ? 'online' : 'local';
    const stats = loadStats();
    const marketRule = game && game.marketSupply && game.marketSupply.mode === 'ten-type'
        ? 'ten-type' : 'standard';
    const targets = getRecordTargets(game, cpuPlayers);
    if (targets.length === 0) return;

    for (const target of targets) {
        const { player, index } = target;
        const won = game.players.indexOf(winner) === index;
        updateStatsBucket(stats.all, player, won, game);
        updateStatsBucket(stats[mode], player, won, game);
        updateStatsBucket(stats.marketRules[marketRule], player, won, game);
        updateStatsBucket(stats.combinations[mode][marketRule], player, won, game);
        updateNamedStats(stats, target, player, won, game);
        const countKey = String(game.players.length);
        if (!stats.playerCounts[countKey]) stats.playerCounts[countKey] = createEmptyStatsBucket();
        updateStatsBucket(stats.playerCounts[countKey], player, won, game);
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

function statsFilterFocusIdentity(action, dataset = {}) {
    if (action === 'setStatsViewMode' && dataset.statsMode) {
        return Object.freeze({ action, value: dataset.statsMode });
    }
    if (action === 'setStatsMarketRule' && dataset.marketRule) {
        return Object.freeze({ action, value: dataset.marketRule });
    }
    if (action === 'setStatsPlayerFilter' && dataset.playerName) {
        return Object.freeze({ action, value: dataset.playerName });
    }
    if (action === 'setStatsPlayerFilter') {
        return Object.freeze({ action: 'setStatsViewMode', value: _statsViewMode });
    }
    return null;
}

function canRestoreStatsFilterFocus(element) {
    if (!element || typeof element.focus !== 'function' ||
            element.isConnected === false || element.disabled === true ||
            element.hidden === true) return false;
    if ('offsetParent' in element && element.offsetParent === null) return false;
    if (typeof element.getAttribute === 'function' &&
            element.getAttribute('aria-hidden') === 'true') return false;
    if (typeof element.closest === 'function' &&
            element.closest('[hidden], [aria-hidden="true"]')) return false;
    const windowRef = typeof window !== 'undefined' ? window : null;
    if (windowRef && typeof windowRef.getComputedStyle === 'function') {
        const style = windowRef.getComputedStyle(element);
        if (style && (style.display === 'none' || style.visibility === 'hidden' ||
                style.opacity === '0' || style.pointerEvents === 'none')) return false;
    }
    return true;
}

function restoreStatsFilterFocus(identity) {
    if (!identity) return false;
    const root = document.getElementById('tabContentStats');
    if (!root || typeof root.querySelectorAll !== 'function') return false;
    const candidates = /** @type {any[]} */ (
        Array.from(root.querySelectorAll('[data-action]'))
    );
    const target = candidates.find(element => {
        if (!element || !element.dataset || element.dataset.action !== identity.action) {
            return false;
        }
        if (identity.action === 'setStatsViewMode') return element.dataset.statsMode === identity.value;
        if (identity.action === 'setStatsMarketRule') return element.dataset.marketRule === identity.value;
        return element.dataset.playerName === identity.value;
    });
    if (!canRestoreStatsFilterFocus(target)) return false;
    target.focus({ preventScroll: true });
    return true;
}

function handleStatsClick(event) {
    const button = statsActionFromEvent(event);
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!action) return;
    const focusIdentity = statsFilterFocusIdentity(action, button.dataset);
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (action === 'setStatsViewMode') setStatsViewMode(button.dataset.statsMode);
    else if (action === 'setStatsMarketRule') setStatsMarketRule(button.dataset.marketRule);
    else if (action === 'setStatsPlayerFilter') setStatsPlayerFilter(button.dataset.playerName || '');
    else if (action === 'clearStats') clearStats();
    restoreStatsFilterFocus(focusIdentity);
}

function bindStatsHandlers(el) {
    if (_statsHandlersBound) return;
    if (el && typeof el.addEventListener === 'function') {
        el.addEventListener('click', handleStatsClick);
    }
    _statsHandlersBound = true;
}

function applyClearStats() {
    statsClientStorageFacade.remove('gameStats');
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
    if (mode === 'standard' || mode === 'ten-type') {
        _statsViewMode = 'all';
        _statsMarketFilter = mode;
        _statsPlayerFilter = '';
        renderStats();
        return;
    }
    _statsViewMode = ['all', 'local', 'online'].includes(mode) ? mode : 'all';
    _statsPlayerFilter = '';
    renderStats();
}

function setStatsMarketRule(rule) {
    _statsMarketFilter = ['all', 'standard', 'ten-type'].includes(rule) ? rule : 'all';
    _statsPlayerFilter = '';
    renderStats();
}

function setStatsPlayerFilter(playerName) {
    _statsPlayerFilter = playerName || '';
    renderStats();
}

function buildStatsFilterTabsHtml(stats) {
    return StatsViewApi.buildFilterTabsHtml(
        stats, `${_statsViewMode}|${_statsMarketFilter}`, _statsPlayerFilter, escapeStatsHtml
    );
}

function buildStatsCardRowsHtml(bucket) {
    return StatsViewApi.buildCardRowsHtml(bucket, escapeStatsHtml);
}

function buildStatsLandmarkRowsHtml(bucket) {
    return StatsViewApi.buildLandmarkRowsHtml(bucket, escapeStatsHtml);
}

function renderStats() {
    const el = document.getElementById('tabContentStats');
    if (!el) return;
    bindStatsHandlers(el);

    const stats = loadStats();
    el.innerHTML = StatsViewApi.buildStatsHtml(
        stats, `${_statsViewMode}|${_statsMarketFilter}`, _statsPlayerFilter, escapeStatsHtml
    );
}
