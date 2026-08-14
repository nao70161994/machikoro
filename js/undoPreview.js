'use strict';

const UndoPreview = (() => {
    function cardCounts(cards) {
        const counts = new Map();
        for (const card of Array.isArray(cards) ? cards : []) {
            const name = typeof card === 'string' ? card : card && card.name;
            if (typeof name === 'string' && name) counts.set(name, (counts.get(name) || 0) + 1);
        }
        return counts;
    }

    function changedCards(currentCards, previousNames) {
        const current = cardCounts(currentCards);
        const previous = cardCounts(previousNames);
        const removed = [];
        for (const [name, count] of current) {
            const difference = count - (previous.get(name) || 0);
            if (difference > 0) removed.push(difference === 1 ? name : `${name}×${difference}`);
        }
        return removed;
    }

    function changedLandmarks(currentLandmarks, previousLandmarks) {
        return Object.keys(currentLandmarks || {}).filter(name =>
            currentLandmarks[name] === true && (!previousLandmarks || previousLandmarks[name] !== true)
        );
    }

    function build(input = {}) {
        const game = input.game;
        const state = input.state;
        if (!game || !state || !Array.isArray(game.players) ||
                !Number.isInteger(game.currentPlayerIndex)) return null;
        const index = game.currentPlayerIndex;
        const player = game.players[index];
        if (!player) return null;
        const previousCoins = Array.isArray(state.playerCoins) && Number.isFinite(state.playerCoins[index])
            ? state.playerCoins[index] : player.coins;
        const previousCards = Array.isArray(state.playerCardNames) ? state.playerCardNames[index] : [];
        const previousLandmarks = Array.isArray(state.playerLandmarks) ? state.playerLandmarks[index] : {};
        const cards = changedCards(player.cards, previousCards);
        const landmarks = changedLandmarks(player.landmarks, previousLandmarks);
        const removed = [...cards, ...landmarks];
        return Object.freeze({
            playerName: typeof player.name === 'string' ? player.name : `プレイヤー${index + 1}`,
            currentCoins: Number.isFinite(player.coins) ? player.coins : 0,
            previousCoins,
            removed: Object.freeze(removed),
            message: `建設前の状態へ戻しますか？\n${typeof player.name === 'string' ? player.name : `プレイヤー${index + 1}`}：${Number.isFinite(player.coins) ? player.coins : 0} → ${previousCoins}コイン` +
                (removed.length ? `\n取り消される建設：${removed.join('、')}` : ''),
        });
    }

    return Object.freeze({ build, cardCounts, changedCards, changedLandmarks });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UndoPreview;
if (typeof window !== 'undefined') window.UndoPreview = UndoPreview;
if (typeof globalThis !== 'undefined') globalThis.UndoPreview = UndoPreview;
