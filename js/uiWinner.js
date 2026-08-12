'use strict';

function createStreakController(initial = {}) {
    const state = {
        winStreak: Object.prototype.hasOwnProperty.call(initial, 'winStreak')
            ? initial.winStreak
            : 0,
        lastWinnerName: Object.prototype.hasOwnProperty.call(initial, 'lastWinnerName')
            ? initial.lastWinnerName
            : '',
    };

    function snapshot() {
        return Object.freeze({
            winStreak: state.winStreak,
            lastWinnerName: state.lastWinnerName,
        });
    }

    function replace(values = {}) {
        if (Object.prototype.hasOwnProperty.call(values, 'winStreak')) {
            state.winStreak = values.winStreak;
        }
        if (Object.prototype.hasOwnProperty.call(values, 'lastWinnerName')) {
            state.lastWinnerName = values.lastWinnerName;
        }
        return snapshot();
    }

    function recordWinner(winnerName) {
        if (winnerName === state.lastWinnerName) state.winStreak++;
        else {
            state.winStreak = 1;
            state.lastWinnerName = winnerName;
        }
        return snapshot();
    }

    function bindGlobals(root, options = {}) {
        if (!root || (typeof root !== 'object' && typeof root !== 'function')) return false;
        const writable = options.writable !== false;
        Object.defineProperties(root, {
            winStreak: {
                configurable: true,
                enumerable: false,
                get: () => state.winStreak,
                set: writable ? value => { state.winStreak = value; } : undefined,
            },
            lastWinnerName: {
                configurable: true,
                enumerable: false,
                get: () => state.lastWinnerName,
                set: writable ? value => { state.lastWinnerName = value; } : undefined,
            },
        });
        return true;
    }

    return Object.freeze({ snapshot, replace, recordWinner, bindGlobals });
}

function currentStreakGlobals(root) {
    if (!root || (typeof root !== 'object' && typeof root !== 'function')) return {};
    const values = {};
    if (typeof root.winStreak !== 'undefined') values.winStreak = root.winStreak;
    if (typeof root.lastWinnerName !== 'undefined') values.lastWinnerName = root.lastWinnerName;
    return values;
}

function buildWinnerStatsRows(players, winner, escapeHtml) {
    if (!Array.isArray(players) || typeof escapeHtml !== 'function') return '';
    return players.slice().sort((left, right) => right.coins - left.coins).map(player => {
        const isWinner = player === winner;
        const safeName = escapeHtml(player.name);
        const playerKind = isWinner ? '勝者' : 'プレイヤー';
        return `<div class="winner-stats-row ${isWinner ? 'highlight' : ''}" role="listitem" aria-label="${playerKind}、${safeName}、${player.coins}コイン"><span>${isWinner ? '🏆 ' : ''}${safeName}</span><span>🪙 ${player.coins}</span></div>`;
    }).join('');
}

function buildWinStreakHtml(winner, winStreak, escapeHtml) {
    if (!winner || winStreak < 2 || typeof escapeHtml !== 'function') return '';
    return `<div class="win-streak">🔥 ${escapeHtml(winner.name)} ${winStreak}連勝中！</div>`;
}

function buildGameReview(logEntries, logTypes, players, escapeHtml) {
    if (!Array.isArray(logEntries) || !logTypes || typeof escapeHtml !== 'function') return '';
    const counts = {
        [logTypes.GAIN]: 0,
        [logTypes.LOSE]: 0,
        [logTypes.BUILD]: 0,
        [logTypes.SPECIAL]: 0,
        [logTypes.DICE]: 0,
    };
    for (const entry of logEntries) {
        if (entry && Object.prototype.hasOwnProperty.call(counts, entry.type)) counts[entry.type]++;
    }
    const coinValues = (Array.isArray(players) ? players : [])
        .map(player => Number.isFinite(player && player.coins) ? player.coins : 0);
    const finalFacilityCount = (Array.isArray(players) ? players : [])
        .reduce((total, player) => total + (Array.isArray(player && player.cards) ? player.cards.length : 0), 0);
    const finalLandmarkCount = (Array.isArray(players) ? players : [])
        .reduce((total, player) => total + Object.values(player && player.landmarks || {})
            .filter(Boolean).length, 0);
    const spread = coinValues.length ? Math.max(...coinValues) - Math.min(...coinValues) : 0;
    const items = [
        ['最終所持施設', finalFacilityCount],
        ['建設済みランドマーク', finalLandmarkCount],
        ['最終コイン差', spread],
    ];
    const observedItems = [
        ['収入ログ', counts[logTypes.GAIN]],
        ['支払いログ', counts[logTypes.LOSE]],
        ['建設ログ', counts[logTypes.BUILD]],
        ['特殊効果ログ', counts[logTypes.SPECIAL]],
        ['ダイスログ', counts[logTypes.DICE]],
    ];
    return `<section class="winner-review" aria-labelledby="winnerReviewTitle"><h3 id="winnerReviewTitle">対戦の振り返り</h3><h4>最終盤面</h4><div class="winner-review-grid">${items.map(([label, value]) => `<div class="winner-review-item"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div><h4>この端末で観測した直近ログ</h4><p class="winner-review-note">最大300件。再開・再接続より前の記録を含まない場合があります。</p><div class="winner-review-grid">${observedItems.map(([label, value]) => `<div class="winner-review-item"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div></section>`;
}

function buildWinnerStatusText(options = {}) {
    const winner = options.winner;
    if (!winner) return '';
    const winnerType = options.isCpuWinner ? 'CPU' : '人間';
    return `ゲーム終了。${String(winner.name || '')}の勝利。${winnerType}プレイヤー、${options.turnCount}ターン。`;
}

function buildWinnerScreenHtml(options = {}) {
    const winner = options.winner;
    const escapeHtml = options.escapeHtml;
    if (!winner || typeof escapeHtml !== 'function') return '';
    const scoreRows = buildWinnerStatsRows(options.players, winner, escapeHtml);
    const streakHtml = buildWinStreakHtml(winner, options.winStreak, escapeHtml);
    const winnerType = options.isCpuWinner ? '🤖 CPU' : '👤 人間';
    const resultAdSlot = typeof options.resultAdSlot === 'string' ? options.resultAdSlot : '';
    const reviewHtml = buildGameReview(options.logEntries, options.logTypes, options.players, escapeHtml);
    return `<div class="winner-screen"><div class="winner-emoji">🏆</div><div class="winner-title">${escapeHtml(winner.name)}の勝利！</div><div class="winner-sub">${winnerType}プレイヤーが勝ちました　${options.turnCount}ターン</div>${streakHtml}<div class="winner-stats" role="list" aria-label="最終コイン">${scoreRows}</div>${reviewHtml}<button id="winnerRestartButton" class="winner-primary-action" data-ui-action="restartGame">タイトルへ戻る</button>${resultAdSlot}</div>`;
}

const streakRoot = typeof globalThis !== 'undefined' ? globalThis : null;
const streakBrowserRoot = typeof window !== 'undefined' ? window : null;
const streakRuntime = createStreakController(currentStreakGlobals(streakRoot));
if (streakRoot) {
    streakRuntime.bindGlobals(streakRoot, {
        writable: !streakBrowserRoot || streakBrowserRoot !== streakRoot,
    });
}

const UiWinner = Object.freeze({
    createStreakController,
    streakRuntime,
    buildWinnerStatsRows,
    buildWinStreakHtml,
    buildGameReview,
    buildWinnerStatusText,
    buildWinnerScreenHtml,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiWinner;
if (typeof window !== 'undefined') window.UiWinner = UiWinner;
if (typeof globalThis !== 'undefined') globalThis.UiWinner = UiWinner;
