'use strict';

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
            <p class="cpu-tournament-note">得意カードは、各試合終了時の初期カードを除く最多所持カードです。</p>`;
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

    return Object.freeze({ escapeHtml, buildRankingsHtml, applyState });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiCpuTournament;
if (typeof window !== 'undefined') window.UiCpuTournament = UiCpuTournament;
if (typeof globalThis !== 'undefined') globalThis.UiCpuTournament = UiCpuTournament;
