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

function buildGameReview(logEntries, logTypes, players, escapeHtml, reviewSummary = null) {
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
    const summaryCounts = reviewSummary && reviewSummary.counts &&
        typeof reviewSummary.counts === 'object' ? reviewSummary.counts : counts;
    const observedItems = [
        ['収入ログ', summaryCounts[logTypes.GAIN] || 0],
        ['支払いログ', summaryCounts[logTypes.LOSE] || 0],
        ['建設ログ', summaryCounts[logTypes.BUILD] || 0],
        ['特殊効果ログ', summaryCounts[logTypes.SPECIAL] || 0],
        ['ダイスログ', summaryCounts[logTypes.DICE] || 0],
    ];
    const complete = !!reviewSummary && reviewSummary.complete === true;
    if (complete && reviewSummary.totalsComplete === true && reviewSummary.totals) {
        observedItems.unshift(
            ['収入総額', reviewSummary.totals.gain || 0],
            ['支払い総額', reviewSummary.totals.lose || 0]
        );
    }
    const historyTitle = complete ? '対戦全体のイベント' : 'この端末で観測した直近ログ';
    const historyNote = complete
        ? '保存・再接続を含む対戦開始からの構造化イベント集計です。'
        : '最大300件。古い保存から再開した場合、以前の記録を含まないことがあります。';
    return `<section class="winner-review" aria-labelledby="winnerReviewTitle"><h3 id="winnerReviewTitle">対戦の振り返り</h3><h4>最終盤面</h4><div class="winner-review-grid">${items.map(([label, value]) => `<div class="winner-review-item"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div><h4>${historyTitle}</h4><p class="winner-review-note">${historyNote}</p><div class="winner-review-grid">${observedItems.map(([label, value]) => `<div class="winner-review-item"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div></section>`;
}

function buildWinnerStatusText(options = {}) {
    const winner = options.winner;
    if (!winner) return '';
    const winnerType = options.isCpuWinner ? 'CPU' : '人間';
    return `ゲーム終了。${String(winner.name || '')}の勝利。${winnerType}プレイヤー、${options.turnCount}ターン。`;
}

function buildShareText(options = {}) {
    const winner = options.winner;
    const players = Array.isArray(options.players) ? options.players : [];
    if (!winner || players.length === 0) return '';
    const standings = players.slice().sort((left, right) => right.coins - left.coins)
        .map((player, index) => `${index + 1}位 ${player.name} ${player.coins}コイン`)
        .join('\n');
    return `🏙️ ダイスシティ 対戦結果\n🏆 ${winner.name}の勝利\n${Number(options.turnCount) || 0}ターン\n${standings}`;
}

function buildResultCardModel(options = {}) {
    const winner = options.winner;
    const players = Array.isArray(options.players) ? options.players : [];
    if (!winner || players.length === 0) return null;
    return Object.freeze({
        winnerName: String(winner.name || '').slice(0, 24),
        turnCount: Math.max(0, Number(options.turnCount) || 0),
        standings: Object.freeze(players.slice().sort((left, right) => right.coins - left.coins)
            .map((player, index) => Object.freeze({
                rank: index + 1,
                name: String(player.name || '').slice(0, 20),
                coins: Number.isFinite(player.coins) ? player.coins : 0,
            }))),
    });
}

function drawResultCard(canvas, model) {
    if (!canvas || !model || typeof canvas.getContext !== 'function') return false;
    const context = canvas.getContext('2d');
    if (!context) return false;
    canvas.width = 1200;
    canvas.height = 630;
    const gradient = typeof context.createLinearGradient === 'function'
        ? context.createLinearGradient(0, 0, 1200, 630) : null;
    if (gradient) {
        gradient.addColorStop(0, '#11182d');
        gradient.addColorStop(1, '#24506b');
        context.fillStyle = gradient;
    } else context.fillStyle = '#18243d';
    context.fillRect(0, 0, 1200, 630);
    context.fillStyle = '#f6c85f';
    context.font = 'bold 42px sans-serif';
    context.fillText('DICE CITY / 対戦結果', 64, 76);
    context.fillStyle = '#ffffff';
    context.font = 'bold 64px sans-serif';
    context.fillText(`🏆 ${model.winnerName} の勝利`, 64, 162);
    context.fillStyle = '#c8d7ee';
    context.font = '28px sans-serif';
    context.fillText(`${model.turnCount}ターン`, 68, 208);
    const columnWidth = 520;
    model.standings.slice(0, 10).forEach((player, index) => {
        const column = index >= 5 ? 1 : 0;
        const row = index % 5;
        const x = 70 + column * columnWidth;
        const y = 280 + row * 62;
        context.fillStyle = player.rank === 1 ? '#f6c85f' : '#ffffff';
        context.font = player.rank === 1 ? 'bold 28px sans-serif' : '26px sans-serif';
        context.fillText(`${player.rank}位  ${player.name}`, x, y);
        context.textAlign = 'right';
        context.fillText(`${player.coins}コイン`, x + 450, y);
        context.textAlign = 'left';
    });
    context.fillStyle = '#91a8c6';
    context.font = '22px sans-serif';
    context.fillText('ダイスシティで遊びました', 70, 600);
    return true;
}

function createGameOriginController() {
    let online = false;
    return Object.freeze({
        record(value) { online = value === true; return online; },
        reset() { online = false; },
        wasOnline() { return online; },
    });
}

function buildWinnerScreenHtml(options = {}) {
    const winner = options.winner;
    const escapeHtml = options.escapeHtml;
    if (!winner || typeof escapeHtml !== 'function') return '';
    const scoreRows = buildWinnerStatsRows(options.players, winner, escapeHtml);
    const streakHtml = buildWinStreakHtml(winner, options.winStreak, escapeHtml);
    const winnerType = options.isCpuWinner ? '🤖 CPU' : '👤 人間';
    const resultAdSlot = typeof options.resultAdSlot === 'string' ? options.resultAdSlot : '';
    const reviewHtml = buildGameReview(
        options.logEntries, options.logTypes, options.players, escapeHtml, options.reviewSummary
    );
    const rematchButton = options.canOnlineRematch
        ? '<div class="winner-rematch-actions"><button id="winnerRematchButton" class="winner-primary-action" data-ui-action="requestOnlineRematch">全員の同意で再戦</button><button class="winner-secondary-action" data-ui-action="declineOnlineRematch">今回は再戦しない</button></div>'
        : (options.canRematch
            ? '<button id="winnerRematchButton" class="winner-primary-action" data-ui-action="rematchLocalGame">同じ設定でもう一度</button>'
            : '');
    return `<div class="winner-screen"><div class="winner-emoji">🏆</div><div class="winner-title">${escapeHtml(winner.name)}の勝利！</div><div class="winner-sub">${winnerType}プレイヤーが勝ちました　${options.turnCount}ターン</div>${streakHtml}<div class="winner-stats" role="list" aria-label="最終コイン">${scoreRows}</div>${reviewHtml}${rematchButton}<button class="winner-secondary-action" data-ui-action="shareGameResult">結果を共有</button><button class="winner-secondary-action" data-ui-action="shareGameResultImage">結果画像を保存・共有</button><button id="winnerRestartButton" class="winner-secondary-action" data-ui-action="restartGame">タイトルへ戻る</button>${resultAdSlot}</div>`;
}

const streakRoot = typeof globalThis !== 'undefined' ? globalThis : null;
const streakBrowserRoot = typeof window !== 'undefined' ? window : null;
const streakRuntime = createStreakController(currentStreakGlobals(streakRoot));
const gameOriginRuntime = createGameOriginController();
if (streakRoot) {
    streakRuntime.bindGlobals(streakRoot, {
        writable: !streakBrowserRoot || streakBrowserRoot !== streakRoot,
    });
}

const UiWinner = Object.freeze({
    createStreakController,
    createGameOriginController,
    streakRuntime,
    gameOriginRuntime,
    buildWinnerStatsRows,
    buildWinStreakHtml,
    buildGameReview,
    buildWinnerStatusText,
    buildShareText,
    buildResultCardModel,
    drawResultCard,
    buildWinnerScreenHtml,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiWinner;
if (typeof window !== 'undefined') window.UiWinner = UiWinner;
if (typeof globalThis !== 'undefined') globalThis.UiWinner = UiWinner;
