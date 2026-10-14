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

    // Seat-local artwork uses only a fixed palette and shapes, never game state.
    const CITIZEN_COATS = Object.freeze(['#477ca6', '#b56854', '#4c8c73', '#8c70a7', '#bd8b37',
        '#4e9098', '#a56c8b', '#75894b', '#6669a5', '#a7805a']);
    const CITIZEN_HAIR = Object.freeze(['#4d3a32', '#84563a', '#343d47', '#aa7646']);

    function renderPlayerKindIcon(setting = {}, seatIndex = 0) {
        const seat = Number.isInteger(seatIndex) && seatIndex >= 0 ? seatIndex % CITIZEN_COATS.length : 0;
        const coat = CITIZEN_COATS[seat];
        const variant = seat % 4;
        const svgStart = `<svg class="player-kind-icon" data-citizen-seat="${seat}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`;
        if (setting.type === 'cpu') {
            const antenna = variant % 2 === 0
                ? '<path d="M12 3V6M9 3H15" fill="none" stroke="#9b732c" stroke-width="1.6" stroke-linecap="round"/>'
                : '<path d="M8 6L6 3M16 6L18 3" fill="none" stroke="#9b732c" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="3" r="1.3" fill="#f0c77b"/><circle cx="18" cy="3" r="1.3" fill="#f0c77b"/>';
            const mouth = variant < 2 ? '<path d="M9 16Q12 19 15 16" fill="none" stroke="#304b59" stroke-width="1.5" stroke-linecap="round"/>'
                : '<rect x="9" y="16" width="6" height="2" rx="1" fill="#304b59"/>';
            return `${svgStart}${antenna}<rect x="3" y="6" width="18" height="15" rx="${variant < 2 ? 5 : 3}" fill="${coat}" stroke="#304b59" stroke-width="1.5"/><rect x="6" y="9" width="12" height="6" rx="2" fill="#233c47"/><circle cx="9" cy="12" r="1.4" fill="#fff0d1"/><circle cx="15" cy="12" r="1.4" fill="#fff0d1"/>${mouth}</svg><span class="player-kind-level">${difficultyLabel(setting.difficulty)}</span>`;
        }
        const hair = CITIZEN_HAIR[variant];
        const hairstyles = [
            `<path d="M7 8Q5 2 12 2Q19 2 17 8L14 5L10 6Z" fill="${hair}"/>`,
            `<path d="M6 11V6Q6 1 12 1Q19 1 18 7V11L16 9V5L8 6V10Z" fill="${hair}"/>`,
            `<path d="M6 7Q6 2 12 2Q18 2 18 7Z" fill="${coat}" stroke="#304b59" stroke-width="1"/><path d="M6 7H20" stroke="#304b59" stroke-width="1.5" stroke-linecap="round"/>`,
            `<path d="M7 7Q5 1 10 2Q13 0 15 3Q20 3 17 8L14 5L10 6Z" fill="${hair}"/>`,
        ];
        const glasses = variant === 3 ? '<path d="M8 9H11V11H8ZM13 9H16V11H13ZM11 10H13" fill="none" stroke="#304b59" stroke-width=".9"/>' : '<circle cx="10" cy="9.5" r=".65" fill="#4d3a32"/><circle cx="14" cy="9.5" r=".65" fill="#4d3a32"/>';
        return `${svgStart}<path d="M3 22Q4 15 12 15Q20 15 21 22" fill="${coat}" stroke="#304b59" stroke-width="1.4"/><path d="M9 16L12 20L15 16" fill="#fff0d1"/><circle cx="12" cy="8.5" r="5.2" fill="#e8c58f" stroke="#654e3d" stroke-width="1.2"/>${hairstyles[variant]}${glasses}<path d="M10.5 12Q12 13 13.5 12" fill="none" stroke="#84563a" stroke-width="1" stroke-linecap="round"/></svg>`;
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
        const icon = typeof options.getLandmarkBadgeIcon === 'function'
            ? options.getLandmarkBadgeIcon(name)
            : safeEmoji;
        return `<span class="landmark-badge ${built ? 'built' : ''}" aria-label="${safeLabel}">${icon} ${safeName}</span>`;
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
        const destinations = [
            ['#gameLogContainer', 'ログ', '📋', 'log'],
            [options.marketTargetId === 'cardboardMarket' ? '#cardboardMarket' : '#buildMenu', '建設', '🏗️', 'build'],
        ];
        const destinationLinks = destinations.map(([href, label, emoji, icon]) => {
            const mark = options.useSunsetIcons
                ? `<svg class="player-navigation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#${icon}"></use></svg>`
                : `${emoji} `;
            return `<a class="player-navigation-link destination" href="${href}">${mark}${label}</a>`;
        }).join('');
        return `<span class="player-navigation-items">${playerLinks}${destinationLinks}</span><span class="player-navigation-scroll-hint" aria-hidden="true">↔</span>`;
    }

    function buildPlayerHtml(player, index, options = {}) {
        const isActive = index === options.currentPlayerIndex;
        const isSelf = Number.isInteger(options.myPlayerIndex) && options.myPlayerIndex >= 0 &&
            index === options.myPlayerIndex;
        const compact = options.compactInactive === true && !isSelf &&
            (!isActive || options.compactCurrentPlayer === true);
        const setting = options.settings[index];
        const cpuLabel = setting.type === 'cpu' ? `🤖${difficultyLabel(setting.difficulty)}` : '👤';
        const playerIcon = typeof options.renderPlayerKindIcon === 'function'
            ? options.renderPlayerKindIcon(setting, index)
            : cpuLabel;
        const playerSummary = options.escapeHtml(
            `${player.name}、${isActive ? '現在の手番' : '待機中'}、${playerKindAccessibleLabel(setting)}`
        );
        const landmarks = Object.entries(player.landmarks)
            .filter(([name, built]) => options.enabledLandmarks.has(name) && built)
            .map(([name, built]) => buildLandmarkBadgeHtml(name, built, options))
            .join('');
        const cards = {};
        const colorCounts = { blue: 0, green: 0, red: 0, purple: 0 };
        for (const card of player.cards) {
            if (!cards[card.name]) cards[card.name] = { count: 0, dormant: 0, color: card.color };
            cards[card.name].count++;
            if (Object.prototype.hasOwnProperty.call(colorCounts, card.color)) colorCounts[card.color]++;
            if (player.isDormant(card)) cards[card.name].dormant++;
        }
        const colorLabels = { blue: '青', green: '緑', red: '赤', purple: '紫' };
        const colorSummary = Object.entries(colorCounts).map(([color, count]) =>
            `<span class="player-color-chip player-color-${color}" aria-label="${colorLabels[color]}カード${count}枚"><span>${colorLabels[color]}</span><strong>${count}</strong></span>`
        ).join('');
        const landmarkTotal = options.enabledLandmarks instanceof Set ? options.enabledLandmarks.size : 0;
        const builtLandmarks = Object.entries(player.landmarks)
            .filter(([name, built]) => options.enabledLandmarks.has(name) && built).length;
        const assetSummary = `<div class="player-asset-summary" aria-label="カード内訳 青${colorCounts.blue}枚、緑${colorCounts.green}枚、赤${colorCounts.red}枚、紫${colorCounts.purple}枚、ランドマーク${builtLandmarks}個">${colorSummary}<span class="player-landmark-count">ランドマーク ${builtLandmarks}/${landmarkTotal}</span></div>`;
        const colorDot = { blue: '#3b82f6', green: '#22c55e', red: '#ef4444', purple: '#a855f7' };
        const cardHtml = Object.entries(cards)
            .sort(([a], [b]) => options.compareCardNames(a, b))
            .map(([name, info]) => {
                const dormantText = info.dormant > 0 ? `（休${info.dormant}）` : '';
                const safeName = options.escapeHtml(name);
                return `<button type="button" class="card-badge" style="border-left:2px solid ${colorDot[info.color]}" data-action="showCardDetail" data-card-name="${safeName}">${safeName}×${info.count}${dormantText}</button>`;
            })
            .join('');
        const renderStatusIcon = (name, fallback) => options.useSunsetIcons
            ? `<svg class="player-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#${name}"></use></svg>`
            : fallback;
        const itCoins = player.itVentureCoins > 0
            ? `<span class="it-badge" aria-label="ITベンチャー積立 ${player.itVentureCoins}コイン">${renderStatusIcon('startup', '💻')}${player.itVentureCoins}</span>`
            : '';
        const loanCount = player.cards.filter(card => card.effect === options.loanEffect).length;
        const loanBadge = loanCount > 0
            ? `<span class="loan-badge" aria-label="貸金業ローン ${loanCount}枚">${renderStatusIcon('loan', '💳')}×${loanCount}</span>`
            : '';
        const hasCustomCoinMark = typeof options.getCoinMark === 'function';
        const coinMark = hasCustomCoinMark ? options.getCoinMark() : '🪙';
        const coinAccessibleLabel = hasCustomCoinMark ? '<span class="screen-reader-only">コイン</span>' : '';
        const selfBadge = isSelf ? '<span class="player-self-badge">あなた</span>' : '';
        const town = typeof options.buildTownHtml === 'function' ? options.buildTownHtml(player, index) : '';
        const miniTown = options.plaza && !isSelf
            ? `<div class="plaza-opponent-town">${town}</div><div class="plaza-owned-cards">${cardHtml || '施設なし'}</div>` : '';
        const header = `<div class="player-header"><div class="player-name-row"><span class="player-icon">${playerIcon}</span><span class="player-name" title="${options.escapeHtml(player.name)}">${isActive ? '▶ ' : ''}${options.escapeHtml(player.name)}</span>${selfBadge}</div><div class="player-coin-row"><span class="player-coins">${coinMark} ${player.coins}${coinAccessibleLabel}</span>${itCoins}${loanBadge}</div></div>${options.plaza ? assetSummary : ''}${miniTown}`;
        const detail = `<div class="player-detail">${town}<div class="player-landmarks">${landmarks}</div><div class="player-cards">${cardHtml}</div></div>`;
        const playerClasses = `player-box${isActive ? ' active' : ''}${isSelf ? ' player-box-self' : ''}`;
        if (compact) {
            return `<details id="${playerBoxId(index)}" class="${playerClasses} player-box-compact" role="listitem" aria-label="${playerSummary}"><summary>${header}<span class="player-detail-hint">詳細を表示</span></summary>${detail}</details>`;
        }
        return `<div id="${playerBoxId(index)}" class="${playerClasses}" role="listitem" aria-label="${playerSummary}">${header}${detail}</div>`;
    }

    function buildPlayersHtml(players, options = {}) {
        return players.map((player, index) => buildPlayerHtml(player, index, options)).join('');
    }

    function buildCoinAnimationView(diff, useSunsetIcons = false) {
        const safeDiff = Number.isFinite(diff) ? diff : 0;
        const isGain = safeDiff > 0;
        const amountText = `${isGain ? '+' : ''}${safeDiff}`;
        const gainSizeClass = safeDiff >= 5 ? ' coin-gain-large' : '';
        return Object.freeze({
            playSound: isGain,
            className: `coin-float ${isGain ? 'coin-gain' : 'coin-lose'}${isGain ? gainSizeClass : ''}`,
            text: `${amountText}🪙`,
            ...(useSunsetIcons ? {
                amountText,
                html: `${amountText}<svg class="card-coin-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#coin"></use></svg>`,
            } : {}),
        });
    }

    function landmarkLeadChange(previousCounts, currentCounts) {
        if (!Array.isArray(previousCounts) || !Array.isArray(currentCounts) ||
                previousCounts.length !== currentCounts.length || currentCounts.length < 2) return -1;
        const uniqueLeader = counts => {
            const maximum = Math.max(...counts);
            return maximum > 0 && counts.filter(count => count === maximum).length === 1
                ? counts.indexOf(maximum) : -1;
        };
        const next = uniqueLeader(currentCounts);
        return next >= 0 && next !== uniqueLeader(previousCounts) &&
            currentCounts[next] > previousCounts[next] ? next : -1;
    }

    return Object.freeze({
        difficultyLabel,
        renderPlayerKindIcon,
        normalizeCpuDifficulty,
        playerKindAccessibleLabel,
        resolvePlayerSetting,
        buildLandmarkBadgeHtml,
        playerBoxId,
        buildPlayerNavigationHtml,
        buildPlayerHtml,
        buildPlayersHtml,
        buildCoinAnimationView,
        landmarkLeadChange,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiPlayerDisplay;
if (typeof window !== 'undefined') window.UiPlayerDisplay = UiPlayerDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiPlayerDisplay = UiPlayerDisplay;
