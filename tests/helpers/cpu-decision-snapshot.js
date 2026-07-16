function normalizeNumber(value) {
    if (Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return 'NaN';
}

function normalizeValue(value) {
    if (typeof value === 'number') return normalizeNumber(value);
    if (Array.isArray(value)) return Array.from(value, normalizeValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeValue(value[key])]));
}

function createSeededRandom(seed) {
    let state = (seed >>> 0) || 1;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function withSeededRuntimeRandom(runtime, seed, fn) {
    const original = runtime.Math.random;
    runtime.Math.random = createSeededRandom(seed);
    try {
        return fn();
    } finally {
        runtime.Math.random = original;
    }
}

function countCards(player) {
    const counts = Object.create(null);
    player.cards.forEach(card => {
        counts[card.name] = (counts[card.name] || 0) + 1;
    });
    return counts;
}

function listLegalBuildActions(runtime, game, shopStock) {
    const current = game.currentPlayer();
    const actions = [{ type: 'skip' }];
    runtime.Player.landmarkNames().forEach(name => {
        if (
            game.enabledLandmarks.has(name) &&
            !current.landmarks[name] &&
            current.coins >= runtime.Player.landmarkCost(name)
        ) {
            actions.push({ type: 'landmark', name });
        }
    });
    runtime.CARDS.forEach(card => {
        if (
            (shopStock[card.name] || 0) > 0 &&
            current.coins >= card.cost &&
            !(card.color === 'purple' && current.countCardIncludingDormant(card.name) > 0)
        ) {
            actions.push({ type: 'card', cardName: card.name });
        }
    });
    return actions;
}

function captureBuildEvaluation(runtime, cpu, game, shopStock, legalActions) {
    const current = game.currentPlayer();
    const cards = legalActions
        .filter(action => action.type === 'card')
        .map(action => {
            const card = runtime.CARDS.find(candidate => candidate.name === action.cardName);
            return {
                cardName: action.cardName,
                evalCard: normalizeNumber(cpu.evalCard(card, game, current)),
                affordableScore: normalizeNumber(cpu._scoreAffordablePurchase(
                    card,
                    game,
                    current,
                    { difficulty: cpu.difficulty }
                )),
                expertCandidateScore: normalizeNumber(cpu._scoreExpertCardCandidate(card, game, current)),
            };
        });
    const landmarks = legalActions
        .filter(action => action.type === 'landmark')
        .map(action => ({
            name: action.name,
            urgency: normalizeNumber(cpu._landmarkUrgency(action.name, current, game)),
        }));
    const options = {};
    if (cpu.difficulty === 'strong') {
        options.strong = cpu._listStrongBuildOptions(game, shopStock).map(action => Object.assign(
            { score: normalizeNumber(cpu._scoreStrongBuildOption(game, shopStock, action)) },
            action
        ));
    }
    if (cpu.difficulty === 'expert') {
        cpu._syncExpertTuningForGame(game);
        options.expert = cpu._listExpertBuildOptions(game, shopStock).map(action => Object.assign(
            { score: normalizeNumber(cpu._scoreExpertBuildOption(game, shopStock, action)) },
            action
        ));
    }
    return {
        cards,
        landmarks,
        options,
        positionScore: normalizeNumber(cpu._evaluatePosition(game, game.currentPlayerIndex)),
        stableIncome: normalizeNumber(cpu._estimateStableIncome(game, current)),
        winDistance: normalizeNumber(cpu._estimateWinDistance(current, game)),
    };
}

function detectBuildAction(runtime, game, beforeCards, beforeLandmarks) {
    const current = game.currentPlayer();
    const afterCards = countCards(current);
    for (const card of runtime.CARDS) {
        if ((afterCards[card.name] || 0) > (beforeCards[card.name] || 0)) {
            return { type: 'card', cardName: card.name };
        }
    }
    for (const name of runtime.Player.landmarkNames()) {
        if (!beforeLandmarks[name] && current.landmarks[name]) {
            return { type: 'landmark', name };
        }
    }
    return { type: 'skip' };
}

function captureCpuDecisionSnapshot(runtime, fixture, difficulty, options = {}) {
    const cpu = new runtime.CPU(difficulty, Object.assign({
        expertPurpose: 'training',
        simulationMode: 'lite',
    }, options));
    const game = fixture.game;
    const base = {
        fixture: fixture.name,
        decision: fixture.decision,
        difficulty,
        playerCount: game.players.length,
        currentPlayerIndex: game.currentPlayerIndex,
        seed: fixture.seed,
    };

    return withSeededRuntimeRandom(runtime, fixture.seed, () => {
        if (fixture.decision === 'build') {
            const legalActions = listLegalBuildActions(runtime, game, fixture.shopStock);
            const evaluation = captureBuildEvaluation(runtime, cpu, game, fixture.shopStock, legalActions);
            const beforeCards = countCards(game.currentPlayer());
            const beforeLandmarks = Object.assign({}, game.currentPlayer().landmarks);
            const result = cpu.build(game, fixture.shopStock);
            return normalizeValue(Object.assign(base, {
                legalActions,
                evaluation,
                chosenAction: detectBuildAction(runtime, game, beforeCards, beforeLandmarks),
                result,
            }));
        }
        if (fixture.decision === 'diceCount') {
            return normalizeValue(Object.assign(base, {
                legalActions: game.currentPlayer().landmarks[runtime.LANDMARK_NAMES.STATION]
                    ? ['oneDie', 'twoDice']
                    : ['oneDie'],
                chosenAction: cpu.chooseDiceCount(game) ? 'twoDice' : 'oneDie',
            }));
        }
        if (fixture.decision === 'reroll') {
            return normalizeValue(Object.assign(base, {
                legalActions: ['keep', 'reroll'],
                chosenAction: cpu.chooseReroll(game) ? 'reroll' : 'keep',
            }));
        }
        if (fixture.decision === 'harbor') {
            return normalizeValue(Object.assign(base, {
                legalActions: ['keep', 'addTwo'],
                chosenAction: cpu.chooseHarbor(game) ? 'addTwo' : 'keep',
            }));
        }
        if (fixture.decision === 'pending') {
            const resolution = runtime.CPU.choosePendingResolution(game, cpu);
            return normalizeValue(Object.assign(base, {
                legalActions: runtime.CPU._pendingActionDescriptors(game).map(entry => entry.action),
                chosenAction: resolution && {
                    action: resolution.action,
                    payload: resolution.payload,
                },
            }));
        }
        throw new Error(`unknown CPU decision fixture: ${fixture.decision}`);
    });
}

module.exports = {
    captureCpuDecisionSnapshot,
    createSeededRandom,
    listLegalBuildActions,
    normalizeValue,
};
