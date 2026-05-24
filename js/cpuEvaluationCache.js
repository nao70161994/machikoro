const CPU_EVALUATION_CACHE_LIMIT = 16;

const CPUEvaluationCache = Object.freeze({
    signature(game) {
        if (!game || !Array.isArray(game.players)) return "";
        const enabled = game.enabledLandmarks ? [...game.enabledLandmarks].sort().join(',') : '';
        const players = game.players.map(player => {
            const landmarks = Player.landmarkNames().map(name => player.landmarks[name] ? '1' : '0').join('');
            const cards = player.cards.map((card, index) => `${card.name}:${player.isDormant(card) ? 1 : 0}:${index}`).join('|');
            return `${player.coins}/${player.itVentureCoins}/${landmarks}/${cards}`;
        }).join('||');
        return `${game.currentPlayerIndex}|${game.phase}|${enabled}|${players}`;
    },

    entry(target, cacheKey, game, factory, limit = CPU_EVALUATION_CACHE_LIMIT) {
        const signature = CPUEvaluationCache.signature(game);
        let store = target[cacheKey];
        if (!store) {
            store = new Map();
            target[cacheKey] = store;
        }
        let entry = store.get(signature);
        if (!entry) {
            entry = factory(signature);
            store.set(signature, entry);
            if (store.size > limit) {
                const oldestKey = store.keys().next().value;
                if (oldestKey !== undefined) store.delete(oldestKey);
            }
        }
        return entry;
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUEvaluationCache, CPU_EVALUATION_CACHE_LIMIT };
}
