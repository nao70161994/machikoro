'use strict';

const UiPlayerDisplay = (() => {
    const CPU_DIFFICULTIES = Object.freeze(['weak', 'normal', 'strong', 'expert', 'rl']);

    function difficultyLabel(difficulty) {
        if (difficulty === 'weak') return '弱';
        if (difficulty === 'normal') return '普';
        if (difficulty === 'strong') return '強';
        if (difficulty === 'rl') return '深';
        return '最強';
    }

    function normalizeCpuDifficulty(value) {
        return CPU_DIFFICULTIES.includes(value) ? value : 'normal';
    }

    function playerKindAccessibleLabel(setting = {}) {
        if (setting.type !== 'cpu') return '人間';
        const difficulty = normalizeCpuDifficulty(setting.difficulty);
        if (difficulty === 'weak') return 'CPU（弱）';
        if (difficulty === 'strong') return 'CPU（強）';
        if (difficulty === 'expert') return 'CPU（最強）';
        if (difficulty === 'rl') return 'AI（深層学習・ランダム）';
        return 'CPU（普通）';
    }

    function resolvePlayerSetting(options = {}) {
        const settings = Array.isArray(options.playerSettings) ? options.playerSettings : [];
        const cpus = Array.isArray(options.cpuPlayers) ? options.cpuPlayers : [];
        const index = options.index;
        const player = options.player;
        const setting = settings[index];
        const cpu = cpus[index] || null;
        const hasRuntimeCpuSlot = Number.isInteger(index) && index >= 0 && index < cpus.length;
        const inferredCpu = hasRuntimeCpuSlot
            ? !!cpu
            : setting?.type === 'cpu' || player?.isCPU === true;
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

    function buildLandmarkBadgeHtml(name, built, options = {}) {
        const stateLabel = built ? '建設済み' : '未建設';
        const safeLabel = options.escapeHtml(`${name}、${stateLabel}`);
        const safeEmoji = options.escapeHtml(options.getLandmarkEmoji(name));
        const safeName = options.escapeHtml(name);
        return `<span class="landmark-badge ${built ? 'built' : ''}" aria-label="${safeLabel}">${safeEmoji} ${safeName}</span>`;
    }

    function playerBoxId(index) {
        return `playerBox${index}`;
    }

    function buildPlayerNavigationHtml(players, options = {}) {
        if (!Array.isArray(players) || players.length < 5 || typeof options.escapeHtml !== 'function') {
            return '';
        }
        const playerLinks = players.map((player, index) => {
            const isActive = index === options.currentPlayerIndex;
            const isSelf = index === options.myPlayerIndex;
            const marker = isActive ? '▶ ' : (isSelf ? '自分：' : '');
            const label = `${marker}${player?.name || `プレイヤー${index + 1}`}`;
            const current = isActive ? ' aria-current="true"' : '';
            return `<a class="player-navigation-link${isActive ? ' active' : ''}${isSelf ? ' self' : ''}" href="#${playerBoxId(index)}"${current}>${options.escapeHtml(label)}</a>`;
        }).join('');
        const destinationLinks = [
            ['#gameLogContainer', '📋 ログ'],
            ['#buildMenu', '🏗️ 建設'],
        ].map(([href, label]) => `<a class="player-navigation-link destination" href="${href}">${label}</a>`).join('');
        return playerLinks + destinationLinks;
    }

    function buildPlayerHtml(player, index, options = {}) {
        const isActive = index === options.currentPlayerIndex;
        const compact = options.compactInactive === true && !isActive && index !== options.myPlayerIndex;
        const setting = options.settings[index];
        const cpuLabel = setting.type === 'cpu' ? `🤖${difficultyLabel(setting.difficulty)}` : '👤';
        const playerSummary = options.escapeHtml(
            `${player.name}、${isActive ? '現在の手番' : '待機中'}、${playerKindAccessibleLabel(setting)}`
        );
        const landmarks = Object.entries(player.landmarks)
            .filter(([name]) => options.enabledLandmarks.has(name))
            .map(([name, built]) => buildLandmarkBadgeHtml(name, built, options))
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
        const header = `<div class="player-header"><div class="player-name-row"><span class="player-icon">${cpuLabel}</span><span class="player-name">${isActive ? '▶ ' : ''}${options.escapeHtml(player.name)}</span></div><div class="player-coin-row"><span class="player-coins">🪙 ${player.coins}</span>${itCoins}${loanBadge}</div></div>`;
        const detail = `<div class="player-detail"><div class="player-landmarks">${landmarks}</div><div class="player-cards">${cardHtml}</div></div>`;
        if (compact) {
            return `<details id="${playerBoxId(index)}" class="player-box player-box-compact" role="listitem" aria-label="${playerSummary}"><summary>${header}<span class="player-detail-hint">詳細を表示</span></summary>${detail}</details>`;
        }
        return `<div id="${playerBoxId(index)}" class="player-box ${isActive ? 'active' : ''}" role="listitem" aria-label="${playerSummary}">${header}${detail}</div>`;
    }

    function buildPlayersHtml(players, options = {}) {
        return players.map((player, index) => buildPlayerHtml(player, index, options)).join('');
    }

    function buildCoinAnimationView(diff) {
        const isGain = diff > 0;
        return Object.freeze({
            playSound: isGain,
            className: `coin-float ${isGain ? 'coin-gain' : 'coin-lose'}`,
            text: `${isGain ? '+' : ''}${diff}🪙`,
        });
    }

    return Object.freeze({
        difficultyLabel,
        normalizeCpuDifficulty,
        playerKindAccessibleLabel,
        resolvePlayerSetting,
        buildLandmarkBadgeHtml,
        playerBoxId,
        buildPlayerNavigationHtml,
        buildPlayerHtml,
        buildPlayersHtml,
        buildCoinAnimationView,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPlayerDisplay;
if (typeof window !== 'undefined') window.UiPlayerDisplay = UiPlayerDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiPlayerDisplay = UiPlayerDisplay;
