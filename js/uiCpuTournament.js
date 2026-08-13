'use strict';

const uiCpuTournamentCore = typeof globalThis !== 'undefined' && globalThis.CpuTournament
    ? globalThis.CpuTournament
    : typeof require === 'function' ? require('./cpuTournament') : null;

const UiCpuTournament = (() => {
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function buildRankingsHtml(view) {
        if (!view || view.completedGames === 0) return '';
        const rows = view.rankings.map((entry, index) => `
            <tr>
                <td class="cpu-tournament-rank">${index + 1}</td>
                <th scope="row">${escapeHtml(entry.label)}</th>
                <td>${entry.wins}/${entry.appearances}</td>
                <td>${entry.winRate}%</td>
                <td>${entry.averageTurns}</td>
                <td>${escapeHtml(entry.favoriteCard.name)}${entry.favoriteCard.count ? `（${entry.favoriteCard.count}枚）` : ''}</td>
            </tr>`).join('');
        const analysis = uiCpuTournamentCore.analyzeTournament(view);
        const seatRows = analysis.seats.map(seat =>
            `<li>${seat.seat}番席: ${seat.wins}/${seat.appearances}勝（${seat.winRate}%）</li>`
        ).join('');
        const games = (view.games || []).map(game => {
            const winner = game.winner >= 0 ? uiCpuTournamentCore.LABELS[game.difficulties[game.winner]] : '未決着';
            return `<li><span>第${game.index + 1}試合: ${escapeHtml(winner)} / ${game.turns}ターン</span>` +
                `<button data-ui-action="replayCpuTournamentGame" data-history-index="current" data-game-index="${game.index}">再生</button></li>`;
        }).join('');
        return `
            <div class="cpu-tournament-overview">
                <div><strong>${view.completedGames}</strong><span>完了試合</span></div>
                <div><strong>${view.averageTurns}</strong><span>平均決着ターン</span></div>
                <div><strong>${view.exhaustedGames}</strong><span>未決着</span></div>
            </div>
            <div class="cpu-tournament-table-wrap">
                <table class="cpu-tournament-table">
                    <caption>CPU大会ランキング</caption>
                    <thead><tr><th>順位</th><th>CPU</th><th>勝敗</th><th>勝率</th><th>平均ターン</th><th>得意カード</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <section class="cpu-tournament-analysis" aria-labelledby="cpuTournamentAnalysisHeading">
                <h3 id="cpuTournamentAnalysisHeading">CPU分析レポート</h3>
                <p>${analysis.leader ? `首位は<strong>${escapeHtml(analysis.leader.label)}</strong>（勝率${analysis.leader.winRate}%）です。` : '首位データはありません。'}</p>
                <p>${analysis.fastest ? `最短は第${analysis.fastest.index + 1}試合の${analysis.fastest.turns}ターン、最長は第${analysis.longest.index + 1}試合の${analysis.longest.turns}ターンです。` : '決着した試合はありません。'}</p>
                <h4>席順別の勝率</h4><ul>${seatRows}</ul>
            </section>
            <details class="cpu-tournament-games">
                <summary>各試合のリプレイ</summary><ol>${games}</ol>
            </details>
            <p class="cpu-tournament-note">得意カードは、各試合終了時の初期カードを除く最多所持カードです。</p>`;
    }

    function buildHistoryHtml(records) {
        if (!Array.isArray(records) || records.length === 0) {
            return '<p class="cpu-tournament-note">保存された大会履歴はありません。</p>';
        }
        const rows = records.map((record, index) => {
            const leader = record.rankings[0];
            const previous = records[index + 1] && records[index + 1].rankings
                .find(entry => entry.difficulty === leader.difficulty);
            const delta = previous ? Math.round((leader.winRate - previous.winRate) * 10) / 10 : null;
            return `<tr><td>${escapeHtml(new Date(record.createdAt).toLocaleString('ja-JP'))}</td>` +
                `<td>${record.playerCount}人 / ${record.completedGames}試合</td>` +
                `<td>${escapeHtml(leader.label)} ${leader.winRate}%${delta === null ? '' : `（前回比${delta >= 0 ? '+' : ''}${delta}pt）`}</td>` +
                `<td><button data-ui-action="showCpuTournamentHistory" data-history-index="${index}">詳細</button></td></tr>`;
        }).join('');
        return `<div class="cpu-tournament-history-actions">
                <button data-ui-action="exportCpuTournamentJson">JSON保存</button>
                <button data-ui-action="exportCpuTournamentCsv">CSV保存</button>
                <button data-ui-action="clearCpuTournamentHistory">履歴削除</button>
            </div><div class="cpu-tournament-table-wrap"><table class="cpu-tournament-table">
                <caption>過去10大会の比較</caption><thead><tr><th>日時</th><th>条件</th><th>首位</th><th>操作</th></tr></thead>
                <tbody>${rows}</tbody></table></div>`;
    }

    function buildReplayHtml(result) {
        if (!result || !Array.isArray(result.trace)) return '';
        const turns = [];
        let lastTurn = -1;
        for (const entry of result.trace) {
            if (entry.turn === lastTurn && entry !== result.trace.at(-1)) continue;
            lastTurn = entry.turn;
            const player = entry.players[entry.playerIndex] || { coins: 0, cards: 0, landmarks: 0 };
            turns.push(`<li><strong>${entry.turn + 1}ターン目</strong> ${escapeHtml(uiCpuTournamentCore.LABELS[entry.difficulty] || entry.difficulty)} ` +
                `— ${player.coins}コイン / 施設${player.cards}枚 / ランドマーク${player.landmarks}件</li>`);
        }
        const winner = result.winner >= 0 ? uiCpuTournamentCore.LABELS[result.difficulties[result.winner]] : '未決着';
        return `<section class="cpu-tournament-replay" aria-labelledby="cpuTournamentReplayHeading">
            <h3 id="cpuTournamentReplayHeading">対戦リプレイ</h3>
            <p>seed ${result.seed} — ${escapeHtml(winner)}が${result.turns}ターンで勝利</p>
            <ol>${turns.join('')}</ol></section>`;
    }

    function applyState(elements, state) {
        if (!elements || !state) return;
        const view = state.summary;
        const running = state.status === 'running';
        elements.startButton.disabled = running;
        elements.cancelButton.disabled = !running;
        elements.gamesSelect.disabled = running;
        elements.playerCountSelect.disabled = running;
        if (running) {
            elements.status.textContent = `${view.completedGames}/${view.requestedGames}試合を完了しました`;
        } else if (state.status === 'complete') {
            elements.status.textContent = `${view.completedGames}試合が完了しました`;
        } else if (state.status === 'cancelled') {
            elements.status.textContent = `${view.completedGames}試合で中止しました`;
        } else if (state.status === 'failed') {
            elements.status.textContent = `大会を続行できませんでした: ${state.error}`;
        } else {
            elements.status.textContent = '設定を選んで大会を開始してください';
        }
        if (view) elements.results.innerHTML = buildRankingsHtml(view);
    }

    return Object.freeze({ escapeHtml, buildRankingsHtml, buildHistoryHtml, buildReplayHtml, applyState });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCpuTournament;
if (typeof window !== 'undefined') window.UiCpuTournament = UiCpuTournament;
if (typeof globalThis !== 'undefined') globalThis.UiCpuTournament = UiCpuTournament;
