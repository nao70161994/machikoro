'use strict';

const UiPlayerDisplay = (() => {
    const CPU_DIFFICULTIES = Object.freeze(['weak', 'normal', 'strong', 'expert', 'rl']);

    function difficultyLabel(difficulty) {
        if (difficulty === 'weak') return '弱';
        if (difficulty === 'normal') return '普';
        if (difficulty === 'strong') return '強';
        if (difficulty === 'rl') return '深';
        return 'AI';
    }

    function normalizeCpuDifficulty(value) {
        return CPU_DIFFICULTIES.includes(value) ? value : 'normal';
    }

    function resolvePlayerSetting(options = {}) {
        const settings = Array.isArray(options.playerSettings) ? options.playerSettings : [];
        const cpus = Array.isArray(options.cpuPlayers) ? options.cpuPlayers : [];
        const index = options.index;
        const player = options.player;
        const setting = settings[index];
        const cpu = cpus[index] || null;
        const inferredCpu = !!cpu || setting?.type === 'cpu' || player?.isCPU === true;
        if (setting && (!inferredCpu || setting.difficulty || cpu?.difficulty)) {
            return {
                type: inferredCpu ? 'cpu' : 'human',
                difficulty: inferredCpu ? normalizeCpuDifficulty(cpu?.difficulty || setting.difficulty) : 'human',
                name: player?.name || setting.name || `プレイヤー${index + 1}`,
                missing: false,
            };
        }
        return {
            type: inferredCpu ? 'cpu' : 'human',
            difficulty: inferredCpu ? normalizeCpuDifficulty(cpu?.difficulty) : 'human',
            name: player?.name || `プレイヤー${index + 1}`,
            missing: true,
        };
    }

    function buildPlayerHtml(player, index, options = {}) {
        const isActive = index === options.currentPlayerIndex;
        const setting = options.settings[index];
        const cpuLabel = setting.type === 'cpu' ? `🤖${difficultyLabel(setting.difficulty)}` : '👤';
        const landmarks = Object.entries(player.landmarks)
            .filter(([name]) => options.enabledLandmarks.has(name))
            .map(([name, built]) => `<span class="landmark-badge ${built ? 'built' : ''}">${options.getLandmarkEmoji(name)} ${name}</span>`)
            .join('');
        const cards = {};
        for (const card of player.cards) {
            if (!cards[card.name]) cards[card.name] = { count: 0, dormant: 0, color: card.color };
            cards[card.name].count++;
            if (player.isDormant(card)) cards[card.name].dormant++;
        }
        const colorDot = { blue: '#3b82f6', green: '#22c55e', red: '#ef4444', purple: '#a855f7' };
        const cardHtml = Object.entries(cards)
            .sort(([a], [b]) => options.compareCardNames(a, b))
            .map(([name, info]) => {
                const dormantText = info.dormant > 0 ? `（休${info.dormant}）` : '';
                const safeName = options.escapeHtml(name);
                return `<button type="button" class="card-badge" style="border-left:2px solid ${colorDot[info.color]}" data-action="showCardDetail" data-card-name="${safeName}">${safeName}×${info.count}${dormantText}</button>`;
            })
            .join('');
        const itCoins = player.itVentureCoins > 0 ? `<span class="it-badge">💻${player.itVentureCoins}</span>` : '';
        const loanCount = player.cards.filter(card => card.effect === options.loanEffect).length;
        const loanBadge = loanCount > 0 ? `<span class="loan-badge">💳×${loanCount}</span>` : '';
        return `<div class="player-box ${isActive ? 'active' : ''}"><div class="player-header"><div class="player-name-row"><span class="player-icon">${cpuLabel}</span><span class="player-name">${isActive ? '▶ ' : ''}${options.escapeHtml(player.name)}</span></div><div class="player-coin-row"><span class="player-coins">🪙 ${player.coins}</span>${itCoins}${loanBadge}</div></div><div class="player-landmarks">${landmarks}</div><div class="player-cards">${cardHtml}</div></div>`;
    }

    function buildPlayersHtml(players, options = {}) {
        return players.map((player, index) => buildPlayerHtml(player, index, options)).join('');
    }
    return Object.freeze({
        difficultyLabel,
        normalizeCpuDifficulty,
        resolvePlayerSetting,
        buildPlayerHtml,
        buildPlayersHtml,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPlayerDisplay;
if (typeof window !== 'undefined') window.UiPlayerDisplay = UiPlayerDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiPlayerDisplay = UiPlayerDisplay;
