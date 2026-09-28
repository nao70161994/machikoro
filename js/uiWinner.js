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

function buildWinnerStatsRows(players, winner, escapeHtml, options = {}) {
    if (!Array.isArray(players) || typeof escapeHtml !== 'function') return '';
    const sunset = options.designTheme === 'sunset';
    return players.map((player, index) => ({ player, index }))
        .sort((left, right) => right.player.coins - left.player.coins).map(({ player, index }) => {
        const isWinner = player === winner;
        const safeName = escapeHtml(player.name);
        const playerKind = isWinner ? '勝者' : 'プレイヤー';
        const award = sunset && isWinner
            ? '<svg class="winner-award-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 2h10v5a5 5 0 0 1-10 0V2ZM5 4H2v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4M8 12v3H5v3h10v-3h-3v-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : (isWinner ? '🏆 ' : '');
        const coin = sunset && typeof options.renderCoinMark === 'function'
            ? `${options.renderCoinMark()} `
            : (sunset
                ? '<svg class="winner-coin-fallback" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8"/><path d="M12.5 6.5c-.6-.6-1.4-.9-2.4-.9-1.2 0-2 .6-2 1.5 0 2.5 4.8 1 4.8 3.7 0 1-.9 1.7-2.3 1.7-1.1 0-2-.4-2.7-1.1M10.5 4.8v10.4"/></svg> '
                : '🪙 ');
        const cpu = sunset && typeof options.isCpuPlayer === 'function' && options.isCpuPlayer(index);
        const kindIcon = sunset
            ? `<svg class="winner-kind-icon ${cpu ? 'is-cpu' : 'is-human'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${cpu
                ? '<rect x="4" y="6" width="16" height="14" rx="4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><path d="M9 16h6M12 3v3"/>'
                : '<circle cx="12" cy="8" r="4"/><path d="M4 21c.5-4.5 3.2-7 8-7s7.5 2.5 8 7Z"/>'}</svg>`
            : '';
        return `<div class="winner-stats-row ${isWinner ? 'highlight' : ''}" role="listitem" aria-label="${playerKind}、${safeName}、${player.coins}コイン"><span>${award}${kindIcon}${safeName}</span><span>${coin}${player.coins}</span></div>`;
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
        ? '対戦開始からの収支・建設ログの集計です。'
        : '最大300件。古い対局から再開すると以前の記録は含まれません。';
    return `<section class="winner-review" aria-labelledby="winnerReviewTitle"><h3 id="winnerReviewTitle">対戦の振り返り</h3><h4>最終盤面</h4><div class="winner-review-grid winner-final-grid">${items.map(([label, value]) => `<div class="winner-review-item"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div><h4>${historyTitle}</h4><p class="winner-review-note">${historyNote}</p><div class="winner-review-grid">${observedItems.map(([label, value]) => `<div class="winner-review-item"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div></section>`;
}

function shouldCompactReview(design, viewportWidth) {
    return design === 'sunset' || (Number.isFinite(viewportWidth) &&
        (viewportWidth <= 480 || viewportWidth >= 760));
}

function buildMarketReview(marketSupply, escapeHtml) {
    if (!marketSupply || marketSupply.mode !== 'ten-type' || typeof escapeHtml !== 'function') return '';
    const refillCount = Number.isSafeInteger(marketSupply.refillSequence) &&
        marketSupply.refillSequence >= 0 ? marketSupply.refillSequence : 0;
    const deckCount = Array.isArray(marketSupply.deck) ? marketSupply.deck.length : 0;
    const revealedCount = Number.isSafeInteger(marketSupply.revealedCardCount) &&
        marketSupply.revealedCardCount >= 0 ? marketSupply.revealedCardCount : 0;
    const complete = marketSupply.totalsComplete === true;
    const items = [
        ['補充回数', refillCount],
        [complete ? '公開したカード' : '記録に残る公開カード', revealedCount],
        ['最終山札', deckCount],
    ];
    const note = complete
        ? '対戦開始時の公開分を含む公式10種類市場の集計です。'
        : '古い保存から再開したため、保持された履歴の範囲だけを表示しています。';
    return `<section class="winner-market-review" aria-labelledby="winnerMarketReviewTitle"><h3 id="winnerMarketReviewTitle">🏪 市場の振り返り</h3><p class="winner-review-note">${escapeHtml(note)}</p><div class="winner-review-grid">${items.map(([label, value]) => `<div class="winner-review-item"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div></section>`;
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
        .map(player => `${player === winner ? "🏆 " : ""}${player.name} ${player.coins}コイン`)
        .join('\n');
    return `🏙️ ダイスシティ 対戦結果\n🏆 ${winner.name}の勝利\n${Number(options.turnCount) || 0}ターン\n最終コイン（多い順）\n${standings}`;
}

function buildResultCardModel(options = {}) {
    const winner = options.winner;
    const players = Array.isArray(options.players) ? options.players : [];
    if (!winner || players.length === 0) return null;
    return Object.freeze({
        winnerName: String(winner.name || '').slice(0, 24),
        turnCount: Math.max(0, Number(options.turnCount) || 0),
        standings: Object.freeze(players.slice().sort((left, right) => right.coins - left.coins)
            .map(player => Object.freeze({
                isWinner: player === winner,
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
    const roundedRect = (x, y, width, height, radius) => {
        context.beginPath();
        if (typeof context.roundRect === 'function') context.roundRect(x, y, width, height, radius);
        else context.rect(x, y, width, height);
    };
    const fillRoundRect = (x, y, width, height, radius, fill, stroke, lineWidth = 1) => {
        roundedRect(x, y, width, height, radius);
        context.fillStyle = fill;
        context.fill();
        if (stroke) {
            context.strokeStyle = stroke;
            context.lineWidth = lineWidth;
            context.stroke();
        }
    };
    const fittedText = (value, maxWidth, baseSize, minSize = 20) => {
        let size = baseSize;
        context.font = `bold ${size}px sans-serif`;
        while (size > minSize && typeof context.measureText === 'function' &&
            context.measureText(value).width > maxWidth) {
            size -= 2;
            context.font = `bold ${size}px sans-serif`;
        }
        return size;
    };
    const gradient = typeof context.createLinearGradient === 'function'
        ? context.createLinearGradient(0, 0, 1200, 630) : null;
    if (gradient) {
        gradient.addColorStop(0, '#122237');
        gradient.addColorStop(0.55, '#1d3548');
        gradient.addColorStop(1, '#263e4c');
        context.fillStyle = gradient;
    } else context.fillStyle = '#172b3d';
    context.fillRect(0, 0, 1200, 630);

    // A quiet sunset skyline gives the result image the same illustrated-city identity as the game.
    context.save();
    context.beginPath();
    context.arc(1000, 176, 88, 0, Math.PI * 2);
    context.fillStyle = '#efc985';
    context.globalAlpha = 0.92;
    context.fill();
    context.globalAlpha = 1;
    context.beginPath();
    context.moveTo(748, 270);
    context.quadraticCurveTo(845, 216, 930, 260);
    context.quadraticCurveTo(1034, 210, 1200, 254);
    context.lineTo(1200, 360);
    context.lineTo(748, 360);
    context.closePath();
    context.fillStyle = '#354d5a';
    context.fill();
    const drawCityPolygon = (points, fill, stroke = '#293f4a', lineWidth = 2) => {
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length; index++) {
            context.lineTo(points[index][0], points[index][1]);
        }
        context.closePath();
        context.fillStyle = fill;
        context.fill();
        if (stroke) {
            context.strokeStyle = stroke;
            context.lineWidth = lineWidth;
            context.stroke();
        }
    };
    const drawCityLine = (points, color, lineWidth = 2) => {
        context.beginPath();
        context.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length; index++) {
            context.lineTo(points[index][0], points[index][1]);
        }
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.stroke();
    };
    const drawCityWindow = (x, y, width, height, warm = true) => {
        context.fillStyle = '#344d57';
        context.fillRect(x - 3, y - 3, width + 6, height + 6);
        context.fillStyle = warm ? '#f7dfa9' : '#9bbab6';
        context.fillRect(x, y, width, height);
        context.fillStyle = warm ? 'rgba(255, 245, 213, 0.42)' : 'rgba(220, 239, 226, 0.44)';
        context.fillRect(x + 2, y + 2, Math.max(2, width * 0.24), height - 4);
        drawCityLine([[x + width / 2, y], [x + width / 2, y + height]], '#526a69', 1.5);
        drawCityLine([[x, y + height / 2], [x + width, y + height / 2]], '#526a69', 1.5);
        drawCityLine([[x + 1, y + 1], [x + width - 1, y + 1]], 'rgba(255, 247, 222, 0.74)', 1);
    };
    const buildings = [
        { type: 'home', x: 784, y: 203, w: 68, h: 112, color: '#dbc69f', roof: '#986d68' },
        { type: 'shop', x: 862, y: 165, w: 82, h: 150, color: '#e7d1a9', roof: '#557d83' },
        { type: 'tower', x: 958, y: 221, w: 63, h: 94, color: '#b9a88c', roof: '#8a708a' },
        { type: 'home', x: 1035, y: 183, w: 91, h: 132, color: '#e4caa1', roof: '#a86f5b' },
    ];
    for (const building of buildings) {
        const { type, x, y, w, h, color, roof } = building;
        const ground = y + h;
        context.fillStyle = 'rgba(13, 29, 41, 0.34)';
        context.beginPath();
        context.ellipse(x + w / 2 + 7, ground + 7, w * 0.64, 9, 0, 0, Math.PI * 2);
        context.fill();
        drawCityPolygon([[x + w - 14, y + 8], [x + w + 7, y + 1], [x + w + 7, ground - 2], [x + w - 14, ground + 5]], '#b49d7f', '#293f4a', 1.5);
        drawCityPolygon([[x, y + 3], [x + w, y + 3], [x + w, ground], [x, ground]], color, '#293f4a', 2);
        context.fillStyle = 'rgba(65, 75, 75, 0.22)';
        context.fillRect(x + w - 13, y + 5, 7, h - 9);

        if (type === 'tower') {
            drawCityPolygon([[x - 7, y + 3], [x + w / 2, y - 24], [x + w + 7, y + 3], [x + w - 2, y + 12], [x + 2, y + 12]], roof, '#293f4a', 2);
            drawCityLine([[x + 7, y + 5], [x + w / 2, y - 15], [x + w - 7, y + 5]], '#cbb8c1', 2);
            context.beginPath();
            context.arc(x + w / 2, y + 23, 10, 0, Math.PI * 2);
            context.fillStyle = '#f5dfad';
            context.fill();
            context.strokeStyle = '#344d57';
            context.lineWidth = 2;
            context.stroke();
            drawCityLine([[x + w / 2, y + 23], [x + w / 2, y + 17]], '#344d57', 1.7);
            drawCityLine([[x + w / 2, y + 23], [x + w / 2 + 5, y + 25]], '#344d57', 1.7);
            drawCityWindow(x + 10, y + 45, 13, 18, false);
            drawCityWindow(x + w - 23, y + 45, 13, 18, true);
            drawCityPolygon([[x + w / 2 - 8, ground - 31], [x + w / 2 + 8, ground - 31], [x + w / 2 + 8, ground], [x + w / 2 - 8, ground]], '#596d70', '#293f4a', 1.5);
            context.fillStyle = '#f1d298';
            context.fillRect(x + w / 2 + 4, ground - 17, 2, 3);
        } else if (type === 'shop') {
            drawCityPolygon([[x - 7, y + 8], [x + 8, y - 12], [x + w - 8, y - 12], [x + w + 7, y + 8]], roof, '#293f4a', 2.5);
            drawCityLine([[x + 5, y + 5], [x + 16, y - 8], [x + w - 14, y - 8]], '#a9c3b7', 2);
            drawCityWindow(x + 15, y + 18, 14, 19, false);
            drawCityWindow(x + 51, y + 18, 14, 19, true);
            context.fillStyle = '#9f675d';
            context.fillRect(x + 7, y + 43, w - 14, 12);
            for (let stripe = 0; stripe < 5; stripe++) {
                context.fillStyle = stripe % 2 ? '#f2dec0' : '#d98b6d';
                context.fillRect(x + 8 + stripe * ((w - 16) / 5), y + 43, (w - 16) / 5, 11);
            }
            context.fillStyle = '#d2ad72';
            context.fillRect(x + 7, y + 53, w - 14, 3);
            drawCityWindow(x + 12, y + 64, 25, 30, true);
            drawCityWindow(x + 45, y + 64, 25, 30, false);
            drawCityPolygon([[x + w / 2 - 8, ground - 37], [x + w / 2 + 8, ground - 37], [x + w / 2 + 8, ground], [x + w / 2 - 8, ground]], '#536c70', '#293f4a', 1.5);
            context.fillStyle = '#efd197';
            context.fillRect(x + w / 2 + 3, ground - 20, 2, 3);
            drawCityLine([[x + 5, ground - 4], [x + w - 5, ground - 4]], '#f0d7a3', 2);
        } else {
            const roofPeak = y - (w > 75 ? 24 : 27);
            drawCityPolygon([[x - 8, y + 4], [x + w / 2, roofPeak], [x + w + 8, y + 4], [x + w, y + 12], [x, y + 12]], roof, '#293f4a', 2.5);
            drawCityLine([[x + 10, y + 4], [x + w / 2, roofPeak + 8], [x + w - 10, y + 4]], '#efc49b', 2);
            if (w > 75) {
                drawCityPolygon([[x + w / 2 - 8, roofPeak + 12], [x + w / 2 + 8, roofPeak + 12], [x + w / 2 + 8, roofPeak + 26], [x + w / 2 - 8, roofPeak + 26]], '#7d737f', '#293f4a', 1.3);
            }
            const windowY = y + 24;
            drawCityWindow(x + 10, windowY, 14, 17, true);
            drawCityWindow(x + w - 24, windowY, 14, 17, false);
            if (h > 120) {
                drawCityWindow(x + 12, windowY + 30, 13, 16, false);
                drawCityWindow(x + w - 25, windowY + 30, 13, 16, true);
            }
            const doorWidth = w > 75 ? 18 : 15;
            drawCityPolygon([[x + w / 2 - doorWidth / 2 - 3, ground - 35], [x + w / 2 + doorWidth / 2 + 3, ground - 35], [x + w / 2 + doorWidth / 2 + 3, ground], [x + w / 2 - doorWidth / 2 - 3, ground]], '#6a7c7a', '#293f4a', 1.5);
            context.fillStyle = '#e9c98e';
            context.fillRect(x + w / 2 + doorWidth / 2 - 1, ground - 17, 2, 3);
            drawCityLine([[x + 2, ground - 3], [x + w - 2, ground - 3]], '#f3dcac', 2);
        }
    }
    context.beginPath();
    context.moveTo(748, 328);
    context.quadraticCurveTo(928, 295, 1200, 328);
    context.lineTo(1200, 367);
    context.lineTo(748, 367);
    context.closePath();
    context.fillStyle = '#60786e';
    context.fill();
    context.beginPath();
    context.moveTo(790, 360);
    context.quadraticCurveTo(922, 324, 1125, 350);
    context.strokeStyle = '#d9c69e';
    context.lineWidth = 8;
    context.stroke();
    context.restore();

    fillRoundRect(64, 48, 310, 42, 21, '#253e50', 'rgba(239, 201, 133, 0.7)', 1.5);
    context.fillStyle = '#f4ce83';
    context.font = 'bold 21px sans-serif';
    context.fillText('DICE CITY', 84, 76);
    context.fillStyle = '#c1cbd0';
    context.font = '17px sans-serif';
    context.fillText('対 戦 結 果', 214, 76);

    context.beginPath();
    context.arc(111, 175, 44, 0, Math.PI * 2);
    context.fillStyle = '#233b4b';
    context.fill();
    context.strokeStyle = '#d8ae61';
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(111, 175, 37, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(246, 216, 159, 0.42)';
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.moveTo(96, 156);
    context.lineTo(126, 156);
    context.lineTo(124, 175);
    context.quadraticCurveTo(122, 188, 111, 188);
    context.quadraticCurveTo(100, 188, 98, 175);
    context.closePath();
    context.fillStyle = '#f1bd54';
    context.fill();
    context.strokeStyle = '#8b5a2d';
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.moveTo(98, 162);
    context.lineTo(88, 160);
    context.lineTo(90, 170);
    context.quadraticCurveTo(92, 178, 102, 180);
    context.moveTo(124, 162);
    context.lineTo(134, 160);
    context.lineTo(132, 170);
    context.quadraticCurveTo(130, 178, 120, 180);
    context.strokeStyle = '#d89b42';
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = '#ffe8aa';
    context.fillRect(107, 188, 8, 13);
    fillRoundRect(94, 201, 34, 7, 3, '#e9b653');
    fillRoundRect(90, 210, 42, 7, 3, '#c98a39');

    context.fillStyle = '#fff0d2';
    const winnerLabel = `${model.winnerName} の勝利`;
    context.font = `bold ${fittedText(winnerLabel, 560, 50, 30)}px sans-serif`;
    context.fillText(winnerLabel, 176, 164, 560);
    fillRoundRect(178, 188, 214, 40, 20, 'rgba(239, 201, 133, 0.12)', 'rgba(239, 201, 133, 0.42)');
    context.fillStyle = '#f4d493';
    context.font = 'bold 20px sans-serif';
    context.fillText(`${model.turnCount} ターンで完成`, 198, 215);
    context.fillStyle = '#c5d0d5';
    context.font = '17px sans-serif';
    context.fillText('あなたの街が、この街の主役。', 178, 258);

    context.fillStyle = '#e7d2a4';
    context.font = 'bold 19px sans-serif';
    context.fillText('最終コイン', 64, 306);
    const columnWidth = 520;
    const rowHeight = 45;
    const rowGap = 7;
    model.standings.slice(0, 10).forEach((player, index) => {
        const column = Math.floor(index / 5);
        const row = index % 5;
        const x = 64 + column * (columnWidth + 24);
        const y = 322 + row * (rowHeight + rowGap);
        const isWinner = player.isWinner;
        fillRoundRect(
            x, y, columnWidth, rowHeight, 12,
            isWinner ? '#e9be63' : 'rgba(17, 35, 50, 0.62)',
            isWinner ? '#ffe7aa' : 'rgba(155, 180, 191, 0.34)', 1.2
        );
        if (isWinner) {
            context.beginPath();
            context.arc(x + 25, y + rowHeight / 2, 9, 0, Math.PI * 2);
            context.fillStyle = '#815929';
            context.fill();
            context.fillStyle = '#fff1cd';
            context.font = 'bold 13px sans-serif';
            context.fillText('1', x + 21, y + rowHeight / 2 + 5);
        } else {
            context.fillStyle = '#a9bbc4';
            context.font = 'bold 15px sans-serif';
            context.fillText(String(index + 1).padStart(2, '0'), x + 16, y + 28);
        }
        context.fillStyle = isWinner ? '#263b45' : '#edf1e9';
        const nameX = x + 48;
        const nameWidth = 310;
        const nameSize = fittedText(player.name, nameWidth, 21, 14);
        context.font = `${isWinner ? 'bold ' : ''}${nameSize}px sans-serif`;
        context.fillText(player.name, nameX, y + 29, nameWidth);
        context.fillStyle = isWinner ? '#765020' : '#f1cb75';
        context.textAlign = 'right';
        context.font = 'bold 18px sans-serif';
        context.fillText(`${player.coins} コイン`, x + columnWidth - 20, y + 28);
        context.textAlign = 'left';
    });
    context.fillStyle = '#a6b7bf';
    context.font = '15px sans-serif';
    context.fillText('DICE CITY   •   街をつくり、サイコロで競う。', 64, 606);
    context.textAlign = 'right';
    context.fillStyle = '#d9c294';
    context.font = '14px sans-serif';
    context.fillText('対戦の記録', 1136, 606);
    context.textAlign = 'left';
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
    const sunset = options.designTheme === 'sunset';
    const scoreRows = buildWinnerStatsRows(options.players, winner, escapeHtml, options);
    const streakHtml = buildWinStreakHtml(winner, options.winStreak, escapeHtml);
    const winnerType = sunset
        ? `<svg class="winner-kind-icon ${options.isCpuWinner ? 'is-cpu' : 'is-human'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${options.isCpuWinner
            ? '<rect x="4" y="6" width="16" height="14" rx="4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><path d="M9 16h6M12 3v3"/>'
            : '<circle cx="12" cy="8" r="4"/><path d="M4 21c.5-4.5 3.2-7 8-7s7.5 2.5 8 7Z"/>'}</svg>${options.isCpuWinner ? 'CPU' : '人間'}`
        : (options.isCpuWinner ? '🤖 CPU' : '👤 人間');
    const resultAdSlot = typeof options.resultAdSlot === 'string' ? options.resultAdSlot : '';
    const reviewHtml = buildGameReview(
        options.logEntries, options.logTypes, options.players, escapeHtml, options.reviewSummary
    );
    const marketReviewHtml = buildMarketReview(options.marketSupply, escapeHtml);
    const reviewBeforeActions = options.compactReview ? '' : reviewHtml + marketReviewHtml;
    const reviewAfterActions = options.compactReview
        ? `<details class="winner-review-details"><summary>対戦の詳しい記録</summary>${reviewHtml}${marketReviewHtml}</details>`
        : '';
    const rematchButton = options.canOnlineRematch
        ? '<div class="winner-rematch-actions"><button id="winnerRematchButton" class="winner-primary-action" data-ui-action="requestOnlineRematch">全員の同意で再戦</button><button class="winner-secondary-action" data-ui-action="declineOnlineRematch">今回は再戦しない</button></div>'
        : (options.canRematch
            ? '<button id="winnerRematchButton" class="winner-primary-action" data-ui-action="rematchLocalGame">同じ設定でもう一度</button>'
            : '');
    return `<div class="winner-screen"><svg class="winner-trophy-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="winnerGold" x1="18" y1="8" x2="46" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe6a3"/><stop offset=".52" stop-color="#f1bd54"/><stop offset="1" stop-color="#c88732"/></linearGradient></defs><path d="M17 13H47V26C47 36 40.5 42 32 42S17 36 17 26V13Z" fill="url(#winnerGold)" stroke="#8b5a2d" stroke-width="2"/><path d="M17 18H10V24C10 31 14.5 35 21 35M47 18H54V24C54 31 49.5 35 43 35" fill="none" stroke="#d89b42" stroke-width="4" stroke-linecap="round"/><path d="M25 42V49H39V42M21 55H43L40 49H24L21 55Z" fill="url(#winnerGold)" stroke="#8b5a2d" stroke-width="2" stroke-linejoin="round"/><path d="M32 18L34.3 23.1L40 23.8L35.8 27.7L36.9 33.3L32 30.4L27.1 33.3L28.2 27.7L24 23.8L29.7 23.1L32 18Z" fill="#fff4d3"/><path d="M10 10L11.5 13.5L15 15L11.5 16.5L10 20L8.5 16.5L5 15L8.5 13.5L10 10ZM53 40L54.3 43.2L57.5 44.5L54.3 45.8L53 49L51.7 45.8L48.5 44.5L51.7 43.2L53 40Z" fill="#f2c86e"/></svg><div class="winner-title"><span class="winner-title-name">${escapeHtml(winner.name)}</span><span class="winner-title-outcome">の勝利！</span></div><div class="winner-sub"><span class="winner-sub-type">${winnerType}プレイヤーが勝ちました</span><span class="winner-sub-turn">${options.turnCount}ターン</span></div>${streakHtml}${options.townHtml || ''}<div class="winner-stats" role="list" aria-label="最終コイン">${scoreRows}</div>${reviewBeforeActions}${rematchButton}<div class="winner-share-actions"><button class="winner-secondary-action" data-ui-action="shareGameResult">結果を共有</button><button class="winner-secondary-action" data-ui-action="shareGameResultImage">画像を保存・共有</button></div><button id="winnerRestartButton" class="winner-secondary-action" data-ui-action="restartGame">タイトルへ戻る</button>${reviewAfterActions}${resultAdSlot}</div>`;
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
    buildMarketReview,
    shouldCompactReview,
    buildWinnerStatusText,
    buildShareText,
    buildResultCardModel,
    drawResultCard,
    buildWinnerScreenHtml,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiWinner;
if (typeof window !== 'undefined') window.UiWinner = UiWinner;
if (typeof globalThis !== 'undefined') globalThis.UiWinner = UiWinner;
