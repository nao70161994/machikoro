'use strict';

function buildWinnerStatsRows(players, winner, escapeHtml) {
    if (!Array.isArray(players) || typeof escapeHtml !== 'function') return '';
    return players.slice().sort((left, right) => right.coins - left.coins).map(player => {
        const isWinner = player === winner;
        return `<div class="winner-stats-row ${isWinner ? 'highlight' : ''}"><span>${isWinner ? '🏆 ' : ''}${escapeHtml(player.name)}</span><span>🪙 ${player.coins}</span></div>`;
    }).join('');
}

function buildWinStreakHtml(winner, winStreak, escapeHtml) {
    if (!winner || winStreak < 2 || typeof escapeHtml !== 'function') return '';
    return `<div class="win-streak">🔥 ${escapeHtml(winner.name)} ${winStreak}連勝中！</div>`;
}

function buildWinnerScreenHtml(options = {}) {
    const winner = options.winner;
    const escapeHtml = options.escapeHtml;
    if (!winner || typeof escapeHtml !== 'function') return '';
    const scoreRows = buildWinnerStatsRows(options.players, winner, escapeHtml);
    const streakHtml = buildWinStreakHtml(winner, options.winStreak, escapeHtml);
    const winnerType = options.isCpuWinner ? '🤖 CPU' : '👤 人間';
    const resultAdSlot = typeof options.resultAdSlot === 'string' ? options.resultAdSlot : '';
    return `<div class="winner-screen"><div class="winner-emoji">🏆</div><div class="winner-title">${escapeHtml(winner.name)}の勝利！</div><div class="winner-sub">${winnerType}プレイヤーが勝ちました　${options.turnCount}ターン</div>${streakHtml}<div class="winner-stats">${scoreRows}</div>${resultAdSlot}</div>`;
}

const UiWinner = Object.freeze({
    buildWinnerStatsRows,
    buildWinStreakHtml,
    buildWinnerScreenHtml,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiWinner;
if (typeof window !== 'undefined') window.UiWinner = UiWinner;
if (typeof globalThis !== 'undefined') globalThis.UiWinner = UiWinner;
