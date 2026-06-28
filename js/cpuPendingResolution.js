const CPUPendingResolution = Object.freeze({
    pendingActionDescriptors(game) {
        if (!game) return [];
        if (typeof GameManager !== "undefined" && typeof GameManager.pendingActionsFor === "function") {
            return GameManager.pendingActionsFor(game);
        }
        if (game.phase !== GAME_PHASES.PENDING) return [];
        const descriptors = [];
        const add = (field, action) => {
            if ((game[field] || 0) > 0) descriptors.push({ field, action, count: game[field] || 0 });
        };
        if (game.pendingIT) descriptors.push({ field: 'pendingIT', action: 'resolveIT', count: 1 });
        add('pendingTV', 'resolveTV');
        add('pendingBusiness', 'resolveBusiness');
        add('pendingCleaning', 'resolveCleaning');
        add('pendingMover', 'resolveMover');
        add('pendingRenovation', 'resolveRenovation');
        return descriptors;
    },

    isCpuOpponentIndex(game, index) {
        return !!game && Number.isInteger(index) && index >= 0 && index < game.players.length && index !== game.currentPlayerIndex;
    },

    fallbackCpuOpponentIndex(game) {
        if (!game || !Array.isArray(game.players)) return null;
        for (let i = 0; i < game.players.length; i++) {
            if (i !== game.currentPlayerIndex) return i;
        }
        return null;
    },

    isCpuMinorCard(card) {
        return !!card && card.category !== CARD_CATEGORIES.MAJOR;
    },

    resolveCpuCard(player, ref) {
        if (!player || !Array.isArray(player.cards) || ref == null) return null;
        const card = Number.isInteger(ref)
            ? player.cards[ref]
            : player.cards.find(entry => entry && entry.name === ref);
        return CPUPendingResolution.isCpuMinorCard(card) ? card : null;
    },

    isCpuBusinessMove(game, move) {
        if (!move || !CPUPendingResolution.isCpuOpponentIndex(game, move.targetIndex)) return false;
        return !!CPUPendingResolution.resolveCpuCard(game.currentPlayer(), move.myCard) &&
            !!CPUPendingResolution.resolveCpuCard(game.players[move.targetIndex], move.theirCard);
    },

    fallbackCpuBusinessMove(game) {
        if (!game) return null;
        const current = game.currentPlayer();
        const myCard = current.cards.findIndex(CPUPendingResolution.isCpuMinorCard);
        if (myCard < 0) return null;
        for (let i = 0; i < game.players.length; i++) {
            if (i === game.currentPlayerIndex) continue;
            const theirCard = game.players[i].cards.findIndex(CPUPendingResolution.isCpuMinorCard);
            if (theirCard >= 0) return { myCard, targetIndex: i, theirCard };
        }
        return null;
    },

    isCpuMoverMove(game, move) {
        if (!move || !CPUPendingResolution.isCpuOpponentIndex(game, move.targetIndex)) return false;
        return !!CPUPendingResolution.resolveCpuCard(game.currentPlayer(), move.cardIndex ?? move.cardName);
    },

    fallbackCpuMoverMove(game) {
        if (!game) return null;
        const cardIndex = game.currentPlayer().cards.findIndex(CPUPendingResolution.isCpuMinorCard);
        const targetIndex = CPUPendingResolution.fallbackCpuOpponentIndex(game);
        if (cardIndex < 0 || targetIndex === null) return null;
        return { cardIndex, targetIndex };
    },

    fallbackCpuRenovationTarget(game) {
        if (!game) return null;
        const current = game.currentPlayer();
        const built = Object.entries(current.landmarks || {})
            .find(([name, value]) => value === true && name !== LANDMARK_NAMES.YAKUSHO);
        return built ? built[0] : null;
    },

    clearPendingField(game, field) {
        if (!game || !field) return;
        if (typeof game.clearPendingField === "function") {
            game.clearPendingField(field);
            return;
        }
        game[field] = 0;
        if (Array.isArray(game.pendingActionQueue)) {
            game.pendingActionQueue = game.pendingActionQueue.filter(entry => entry && entry.field !== field);
        }
        if (typeof game._checkPending === "function") game._checkPending();
    },

    pendingFallback(game, action, field, fallbackFn, options) {
        if (typeof fallbackFn === "function") {
            return {
                action,
                payload: {},
                usedFallback: true,
                apply: () => fallbackFn(game),
            };
        }
        if (options.clearFallback === false) return null;
        return {
            action,
            payload: {},
            usedFallback: true,
            apply: () => CPUPendingResolution.clearPendingField(game, field),
        };
    },

    choosePendingTvResolution(game, cpu, options = {}) {
        let targetIndex = cpu.chooseTVTarget(game);
        const fallback = options.fallbackTvTarget || CPUPendingResolution.fallbackCpuOpponentIndex;
        if (!CPUPendingResolution.isCpuOpponentIndex(game, targetIndex)) targetIndex = fallback(game, cpu);
        if (!CPUPendingResolution.isCpuOpponentIndex(game, targetIndex)) return null;
        return {
            action: 'resolveTV',
            payload: { targetIndex },
            targetIndex,
            apply: () => game.resolveTV(targetIndex),
        };
    },

    choosePendingBusinessResolution(game, cpu, options = {}) {
        let move = cpu.chooseBusinessMove(game);
        const fallback = options.fallbackBusinessMove || CPUPendingResolution.fallbackCpuBusinessMove;
        if (!CPUPendingResolution.isCpuBusinessMove(game, move)) move = fallback(game, cpu);
        if (!CPUPendingResolution.isCpuBusinessMove(game, move)) {
            return CPUPendingResolution.pendingFallback(game, 'resolveBusiness', 'pendingBusiness', options.fallbackBusiness, options);
        }
        return {
            action: 'resolveBusiness',
            payload: move,
            move,
            apply: () => game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard),
        };
    },

    choosePendingMoverResolution(game, cpu, options = {}) {
        let move = cpu.chooseMoverMove(game);
        const fallback = options.fallbackMoverMove || CPUPendingResolution.fallbackCpuMoverMove;
        if (!CPUPendingResolution.isCpuMoverMove(game, move)) move = fallback(game, cpu);
        if (!CPUPendingResolution.isCpuMoverMove(game, move)) {
            return CPUPendingResolution.pendingFallback(game, 'resolveMover', 'pendingMover', options.fallbackMover, options);
        }
        return {
            action: 'resolveMover',
            payload: move,
            move,
            apply: () => game.resolveMover(move.cardIndex, move.targetIndex),
        };
    },

    choosePendingRenovationResolution(game, cpu, options = {}) {
        let landmarkName = cpu.chooseRenovationTarget(game);
        const fallback = options.fallbackRenovationTarget || CPUPendingResolution.fallbackCpuRenovationTarget;
        if (!landmarkName) landmarkName = fallback(game, cpu);
        if (!landmarkName) {
            return CPUPendingResolution.pendingFallback(game, 'resolveRenovation', 'pendingRenovation', options.fallbackRenovation, options);
        }
        return {
            action: 'resolveRenovation',
            payload: { landmarkName },
            landmarkName,
            apply: () => game.resolveRenovation(landmarkName),
        };
    },

    choosePendingItResolution(game, cpu) {
        const doSave = cpu.chooseITInvest(game);
        return {
            action: 'resolveIT',
            payload: { doSave },
            doSave,
            apply: () => game.resolveIT(doSave),
        };
    },

    choosePendingResolution(game, cpu, options = {}) {
        if (!game || !cpu || game.phase !== GAME_PHASES.PENDING) return null;
        const descriptors = CPUPendingResolution.pendingActionDescriptors(game);
        for (const descriptor of descriptors) {
            switch (descriptor.action) {
                case 'resolveTV':
                    return CPUPendingResolution.choosePendingTvResolution(game, cpu, options);
                case 'resolveBusiness':
                    return CPUPendingResolution.choosePendingBusinessResolution(game, cpu, options);
                case 'resolveCleaning':
                    return null;
                case 'resolveIT':
                    return CPUPendingResolution.choosePendingItResolution(game, cpu);
                case 'resolveMover':
                    return CPUPendingResolution.choosePendingMoverResolution(game, cpu, options);
                case 'resolveRenovation':
                    return CPUPendingResolution.choosePendingRenovationResolution(game, cpu, options);
                default:
                    return null;
            }
        }
        return null;
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUPendingResolution };
}
