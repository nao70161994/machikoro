/**
 * stats.js - ゲーム統計の記録・表示
 * ローカルゲームのみ記録（オンラインは除外）
 */

let _statsRecorded = false;

function loadStats() {
    try {
        const raw = localStorage.getItem('gameStats');
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { totalGames: 0, wins: 0, totalTurns: 0, cardStats: {}, landmarkStats: {} };
}

// ゲーム終了時に呼び出す（ui.js の render から）
function recordGameStats(winner, game, cpuPlayers) {
    if (_statsRecorded) return;
    if (typeof isOnlineGame !== 'undefined' && isOnlineGame) return;
    _statsRecorded = true;

    // 人間プレイヤーを特定（最初の1人）
    const humanIdx = game.players.findIndex((_, i) => !cpuPlayers[i]);
    if (humanIdx < 0) return;

    const player = game.players[humanIdx];
    const won = game.players.indexOf(winner) === humanIdx;
    const stats = loadStats();

    stats.totalGames++;
    if (won) stats.wins++;
    stats.totalTurns += game.turnCount || 0;

    // 所持カード統計
    for (const card of player.cards) {
        if (!stats.cardStats[card.name]) stats.cardStats[card.name] = { winWith: 0, loseWith: 0 };
        if (won) stats.cardStats[card.name].winWith++;
        else      stats.cardStats[card.name].loseWith++;
    }

    // ランドマーク統計
    for (const [name, built] of Object.entries(player.landmarks)) {
        if (!built) continue;
        if (!stats.landmarkStats[name]) stats.landmarkStats[name] = { winWith: 0, loseWith: 0 };
        if (won) stats.landmarkStats[name].winWith++;
        else      stats.landmarkStats[name].loseWith++;
    }

    try { localStorage.setItem('gameStats', JSON.stringify(stats)); } catch (e) {}
}

// ゲーム開始時にリセット
function resetStatsRecorded() {
    _statsRecorded = false;
}

function clearStats() {
    localStorage.removeItem('gameStats');
    renderStats();
}

function renderStats() {
    const el = document.getElementById('tabContentStats');
    if (!el) return;

    const stats = loadStats();

    if (stats.totalGames === 0) {
        el.innerHTML = '<div class="stats-empty">まだゲームの記録がありません。<br>ローカルゲームをプレイすると記録されます。</div>';
        return;
    }

    const winRate = Math.round(stats.wins / stats.totalGames * 100);
    const avgTurns = Math.round(stats.totalTurns / stats.totalGames);

    // カード勝率ランキング（3戦以上のみ表示）
    const cardEntries = Object.entries(stats.cardStats)
        .map(([name, s]) => {
            const total = s.winWith + s.loseWith;
            return { name, total, rate: total > 0 ? s.winWith / total : 0 };
        })
        .filter(e => e.total >= 3)
        .sort((a, b) => b.rate - a.rate);

    const cardRows = cardEntries.slice(0, 15).map((e, i) => {
        const pct = Math.round(e.rate * 100);
        return `<div class="stats-card-row">
            <span class="stats-rank">${i + 1}</span>
            <span class="stats-card-name">${escapeHtml(e.name)}</span>
            <div class="stats-bar-wrap"><div class="stats-bar" style="width:${pct}%"></div></div>
            <span class="stats-pct">${pct}%</span>
            <span class="stats-count">${e.total}戦</span>
        </div>`;
    }).join('') || '<div class="stats-empty">3戦以上のデータがまだありません</div>';

    // ランドマーク建設率
    const lmRows = Object.entries(stats.landmarkStats)
        .map(([name, s]) => {
            const total = s.winWith + s.loseWith;
            const pct = total > 0 ? Math.round(s.winWith / total * 100) : 0;
            return `<div class="stats-card-row">
                <span class="stats-card-name">${escapeHtml(name)}</span>
                <div class="stats-bar-wrap"><div class="stats-bar stats-bar-lm" style="width:${pct}%"></div></div>
                <span class="stats-pct">${pct}%</span>
                <span class="stats-count">${total}戦</span>
            </div>`;
        }).join('');

    el.innerHTML = `
        <div class="stats-overview">
            <div class="stats-overview-item">
                <div class="stats-big">${stats.totalGames}</div>
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

        <button onclick="clearStats()" class="delete-save-btn" style="margin-top:16px;width:100%">🗑 統計をリセット</button>
    `;
}
