const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRuntime() {
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Math: Object.create(Math),
    };
    vm.createContext(context);
    for (const file of ['js/Card.js', 'js/Player.js', 'js/GameManager.js', 'js/CPU.js', 'js/RLCPU.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }
    vm.runInContext(
        'this.CPU = CPU; this.RLCPU = RLCPU; this.GameManager = GameManager; this.CARDS = CARDS; this.Player = Player; this.GAME_PHASES = GAME_PHASES;',
        context
    );
    return context;
}

function createRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function randomDie(rng, rollQueue = null) {
    if (Array.isArray(rollQueue) && rollQueue.length > 0) {
        const value = rollQueue.shift();
        if (Number.isFinite(value)) return value;
    }
    return Math.floor(rng() * 6) + 1;
}

function createShopStock(cards) {
    const stock = {};
    for (const card of cards) stock[card.name] = 6;
    return stock;
}

function createPlayers(runtime, difficulties, options = {}) {
    return difficulties.map(difficulty => {
        if (difficulty === 'rl') {
            if (!options.rlModelData) {
                throw new Error('rlModelData is required when using rl difficulty');
            }
            return new runtime.RLCPU(options.rlModelData);
        }
        if (difficulty !== 'expert') return new runtime.CPU(difficulty);
        return new runtime.CPU(difficulty, {
            expertPurpose: options.expertPurpose || 'training',
            simulationMode: options.lite ? 'lite' : (options.fast ? 'fast' : 'full'),
            profileStats: options.profileStats,
            expertPreset: options.expertPreset,
            expertTuning: options.expertTuning,
            expertBehaviorFlags: options.expertBehaviorFlags,
            expertProfilePresets: options.expertProfilePresets,
            expertProfileTunings: options.expertProfileTunings,
        });
    });
}

function createMaskHelper(runtime) {
    return {
        _currentAndOpponent: runtime.RLCPU.prototype._currentAndOpponent,
        _cardCounts: runtime.RLCPU.prototype._cardCounts,
        _dormantCounts: runtime.RLCPU.prototype._dormantCounts,
    };
}

function actionToLabel(runtime, action) {
    const actions = runtime.RLCPU.ACTIONS;
    if (action === actions.ROLL1) return 'ROLL1';
    if (action === actions.ROLL2) return 'ROLL2';
    if (action === actions.KEEP) return 'KEEP';
    if (action === actions.REROLL) return 'REROLL';
    if (action === actions.HARBOR_YES) return 'HARBOR_YES';
    if (action === actions.HARBOR_NO) return 'HARBOR_NO';
    if (action === actions.IT_SAVE) return 'IT_SAVE';
    if (action === actions.IT_SKIP) return 'IT_SKIP';
    if (action === actions.TV_TARGET) return 'TV_TARGET';
    if (action >= actions.BC_BASE && action < actions.BC_BASE + actions.BC_SIZE) {
        const combo = action - actions.BC_BASE;
        const giveIndex = Math.floor(combo / runtime.CARDS.length);
        const takeIndex = combo % runtime.CARDS.length;
        return `BUSINESS:${runtime.CARDS[giveIndex].name}->${runtime.CARDS[takeIndex].name}`;
    }
    if (action >= actions.CLEAN_BASE && action < actions.CLEAN_BASE + runtime.CARDS.length) {
        return `CLEAN:${runtime.CARDS[action - actions.CLEAN_BASE].name}`;
    }
    if (action >= actions.MOVER_BASE && action < actions.MOVER_BASE + runtime.CARDS.length) {
        return `MOVER:${runtime.CARDS[action - actions.MOVER_BASE].name}`;
    }
    if (action >= actions.RENO_BASE && action < actions.RENO_BASE + runtime.RLCPU.LANDMARK_ORDER.length) {
        return `RENO:${runtime.RLCPU.LANDMARK_ORDER[action - actions.RENO_BASE]}`;
    }
    if (action >= actions.BUY_CARD_BASE && action < actions.BUY_CARD_BASE + runtime.CARDS.length) {
        return `BUY_CARD:${runtime.CARDS[action - actions.BUY_CARD_BASE].name}`;
    }
    if (action >= actions.BUY_LM_BASE && action < actions.BUY_LM_BASE + runtime.RLCPU.LANDMARK_ORDER.length) {
        return `BUY_LM:${runtime.RLCPU.LANDMARK_ORDER[action - actions.BUY_LM_BASE]}`;
    }
    if (action === actions.PASS) return 'PASS';
    return `ACTION:${action}`;
}

function listLegalActions(runtime, game, shopStock) {
    const helper = createMaskHelper(runtime);
    const mask = runtime.RLCPU.prototype.actionMask.call(helper, game, shopStock);
    const legalActions = [];
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 0) {
            legalActions.push({ action: i, label: actionToLabel(runtime, i) });
        }
    }
    return legalActions;
}

function summarizeTraceState(game, shopStock) {
    return {
        currentPlayerIndex: game.currentPlayerIndex,
        phase: game.phase,
        turnCount: game.turnCount,
        lastDiceResult: game.lastDiceResult || 0,
        lastDice1: game.lastDice1 || 0,
        lastDice2: game.lastDice2 || 0,
        pendingTV: game.pendingTV || 0,
        pendingBusiness: game.pendingBusiness || 0,
        pendingCleaning: game.pendingCleaning || 0,
        pendingMover: game.pendingMover || 0,
        pendingRenovation: game.pendingRenovation || 0,
        pendingIT: !!game.pendingIT,
        usedReroll: !!game.usedReroll,
        builtThisTurn: !!game.builtThisTurn,
        shopStock: shopStock ? Object.fromEntries(Object.entries(shopStock).filter(([, count]) => count !== 6)) : {},
        players: game.players.map(player => ({
            coins: player.coins,
            itVentureCoins: player.itVentureCoins || 0,
            landmarks: Object.fromEntries(Object.entries(player.landmarks).filter(([, built]) => built).map(([name]) => [name, true])),
            cards: player.cards.reduce((counts, card) => {
                counts[card.name] = (counts[card.name] || 0) + 1;
                return counts;
            }, {}),
            dormantCards: player.dormantCards.reduce((counts, card) => {
                counts[card.name] = (counts[card.name] || 0) + 1;
                return counts;
            }, {}),
        })),
    };
}

function pushTraceEntry(runtime, game, shopStock, cpu, actionInfo, traceEntries) {
    if (!Array.isArray(traceEntries)) return;
    const entry = {
        actorIndex: game.currentPlayerIndex,
        actorDifficulty: cpu && cpu.difficulty ? cpu.difficulty : (cpu instanceof runtime.RLCPU ? 'rl' : 'cpu'),
        before: summarizeTraceState(game, shopStock),
        legalActions: listLegalActions(runtime, game, shopStock),
        chosenAction: actionInfo ? {
            action: Number.isFinite(actionInfo.action) ? actionInfo.action : null,
            label: actionInfo.label || (Number.isFinite(actionInfo.action) ? actionToLabel(runtime, actionInfo.action) : 'UNKNOWN'),
        } : null,
        rollsUsed: [],
        rollCursor: 0,
    };
    traceEntries.push(entry);
}

function fallbackBusiness(game) {
    const current = game.currentPlayer();
    const myCardIndex = current.cards.findIndex(card => card.category !== '大施設');
    if (myCardIndex < 0) {
        game.pendingBusiness = 0;
        game._checkPending();
        return;
    }
    for (let i = 0; i < game.players.length; i++) {
        if (i === game.currentPlayerIndex) continue;
        const theirCardIndex = game.players[i].cards.findIndex(card => card.category !== '大施設');
        if (theirCardIndex >= 0) {
            game.resolveBusiness(myCardIndex, i, theirCardIndex);
            return;
        }
    }
    game.pendingBusiness = 0;
    game._checkPending();
}

function fallbackCleaning(game) {
    for (const player of game.players) {
        const card = player.getMinorCards().find(entry => !player.isDormant(entry));
        if (card) {
            game.resolveCleaning(card.name);
            return;
        }
    }
    game.pendingCleaning = 0;
    game._checkPending();
}

function fallbackMover(game) {
    const current = game.currentPlayer();
    const cardIndex = current.cards.findIndex(card => card.category !== '大施設');
    if (cardIndex < 0) {
        game.pendingMover = 0;
        game._checkPending();
        return;
    }
    for (let i = 0; i < game.players.length; i++) {
        if (i === game.currentPlayerIndex) continue;
        game.resolveMover(cardIndex, i);
        return;
    }
    game.pendingMover = 0;
    game._checkPending();
}

function fallbackRenovation(game) {
    const current = game.currentPlayer();
    const name = Object.entries(current.landmarks)
        .find(([landmark, built]) => built && landmark !== '役所');
    if (name) {
        game.resolveRenovation(name[0]);
        return;
    }
    game.pendingRenovation = 0;
    game._checkPending();
}

function snapshotBuildState(game) {
    const player = game.currentPlayer();
    const cardCounts = {};
    for (const card of player.cards) {
        cardCounts[card.name] = (cardCounts[card.name] || 0) + 1;
    }
    const builtLandmarks = {};
    for (const [name, built] of Object.entries(player.landmarks)) {
        builtLandmarks[name] = !!built;
    }
    return {
        cards: cardCounts,
        landmarks: builtLandmarks,
    };
}

function detectBuildOutcome(beforeState, afterState) {
    for (const [name, count] of Object.entries(afterState.cards)) {
        const beforeCount = beforeState.cards[name] || 0;
        if (count > beforeCount) {
            return { type: 'card', name };
        }
    }
    for (const [name, built] of Object.entries(afterState.landmarks)) {
        if (built && !beforeState.landmarks[name]) {
            return { type: 'landmark', name };
        }
    }
    return { type: 'pass', name: null };
}

function recordBuildStat(game, cpu, options, outcome) {
    if (!options || !options.buildStats) return;
    const key = game.currentPlayerIndex;
    const stats = options.buildStats[key];
    if (!stats) return;
    stats.total++;
    if (outcome.type === 'pass') {
        stats.pass++;
        return;
    }
    if (outcome.type === 'card') {
        stats.cards[outcome.name] = (stats.cards[outcome.name] || 0) + 1;
        return;
    }
    if (outcome.type === 'landmark') {
        stats.landmarks[outcome.name] = (stats.landmarks[outcome.name] || 0) + 1;
    }
}

function playCpuStep(runtime, game, cpu, shopStock, rng) {
    const options = runtime.__selfplayOptions;
    const rollQueue = options && options.rollQueue;
    const tunaDice = [randomDie(rng), randomDie(rng)];
    const traceEntries = options && options.traceEntries;
    const rollStart = Array.isArray(rollQueue) ? rollQueue.length : null;
    try {
        switch (game.phase) {
            case runtime.GAME_PHASES.ROLL:
                pushTraceEntry(runtime, game, shopStock, cpu, {
                    action: runtime.RLCPU.ACTIONS.ROLL1,
                    label: 'ROLL1',
                }, traceEntries);
                if (game.currentPlayer().landmarks['駅']) {
                    game.rollDice(null, tunaDice);
                } else {
                    game.rollDice(randomDie(rng, rollQueue), tunaDice);
                }
                if (Array.isArray(traceEntries)) {
                    traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                }
                return;
            case runtime.GAME_PHASES.SELECT_DICE: {
                const useTwo = cpu.chooseDiceCount(game);
                pushTraceEntry(runtime, game, shopStock, cpu, {
                    action: useTwo ? runtime.RLCPU.ACTIONS.ROLL2 : runtime.RLCPU.ACTIONS.ROLL1,
                    label: useTwo ? 'ROLL2' : 'ROLL1',
                }, traceEntries);
                if (useTwo) {
                    game.selectDiceCount(true, randomDie(rng, rollQueue), randomDie(rng, rollQueue), tunaDice);
                } else {
                    game.selectDiceCount(false, randomDie(rng, rollQueue), null, tunaDice);
                }
                if (Array.isArray(traceEntries)) {
                    traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                }
                return;
            }
            case runtime.GAME_PHASES.REROLL_CONFIRM:
                if (cpu.chooseReroll(game)) {
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: runtime.RLCPU.ACTIONS.REROLL,
                        label: 'REROLL',
                    }, traceEntries);
                    game.rerollDice(randomDie(rng, rollQueue), tunaDice);
                } else {
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: runtime.RLCPU.ACTIONS.KEEP,
                        label: 'KEEP',
                    }, traceEntries);
                    game.skipReroll();
                }
                if (Array.isArray(traceEntries)) {
                    traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                }
                return;
            case runtime.GAME_PHASES.HARBOR_CHOICE:
                {
                    const useHarbor = cpu.chooseHarbor(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: useHarbor ? runtime.RLCPU.ACTIONS.HARBOR_YES : runtime.RLCPU.ACTIONS.HARBOR_NO,
                        label: useHarbor ? 'HARBOR_YES' : 'HARBOR_NO',
                    }, traceEntries);
                    game.resolveHarbor(useHarbor, tunaDice);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                }
                return;
            case runtime.GAME_PHASES.PENDING:
                if (game.pendingTV > 0) {
                    const targetIndex = cpu.chooseTVTarget(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: runtime.RLCPU.ACTIONS.TV_TARGET,
                        label: `TV_TARGET:p${targetIndex + 1}`,
                    }, traceEntries);
                    game.resolveTV(targetIndex);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                    return;
                }
                if (game.pendingBusiness > 0) {
                    const move = cpu.chooseBusinessMove(game);
                    const current = game.currentPlayer();
                    const target = move ? game.players[move.targetIndex] : null;
                    const giveCard = move ? current.cards[move.myCard] : null;
                    const takeCard = move && target ? target.cards[move.theirCard] : null;
                    const giveIndex = giveCard ? runtime.CARDS.findIndex(card => card.name === giveCard.name) : -1;
                    const takeIndex = takeCard ? runtime.CARDS.findIndex(card => card.name === takeCard.name) : -1;
                    const businessAction = giveIndex >= 0 && takeIndex >= 0
                        ? runtime.RLCPU.ACTIONS.BC_BASE + giveIndex * runtime.CARDS.length + takeIndex
                        : null;
                    pushTraceEntry(runtime, game, shopStock, cpu, move ? {
                        action: businessAction,
                        label: businessAction == null ? `BUSINESS:${move.myCard}->${move.theirCard}@p${move.targetIndex + 1}` : actionToLabel(runtime, businessAction),
                    } : {
                        action: runtime.RLCPU.ACTIONS.PASS,
                        label: 'PASS',
                    }, traceEntries);
                    if (move) game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard);
                    else fallbackBusiness(game);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                    return;
                }
                if (game.pendingCleaning > 0) {
                    const cardName = cpu.chooseCleaningTarget(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, cardName ? {
                        action: null,
                        label: `CLEAN:${cardName}`,
                    } : {
                        action: runtime.RLCPU.ACTIONS.PASS,
                        label: 'PASS',
                    }, traceEntries);
                    if (cardName) game.resolveCleaning(cardName);
                    else fallbackCleaning(game);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                    return;
                }
                if (game.pendingMover > 0) {
                    const move = cpu.chooseMoverMove(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, move ? {
                        action: null,
                        label: `MOVER:${move.cardIndex}@p${move.targetIndex + 1}`,
                    } : {
                        action: runtime.RLCPU.ACTIONS.PASS,
                        label: 'PASS',
                    }, traceEntries);
                    if (move) game.resolveMover(move.cardIndex, move.targetIndex);
                    else fallbackMover(game);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                    return;
                }
                if (game.pendingRenovation > 0) {
                    const landmarkName = cpu.chooseRenovationTarget(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, landmarkName ? {
                        action: null,
                        label: `RENO:${landmarkName}`,
                    } : {
                        action: runtime.RLCPU.ACTIONS.PASS,
                        label: 'PASS',
                    }, traceEntries);
                    if (landmarkName) game.resolveRenovation(landmarkName);
                    else fallbackRenovation(game);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                    return;
                }
                if (game.pendingIT) {
                    const save = cpu.chooseITSave(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: save ? runtime.RLCPU.ACTIONS.IT_SAVE : runtime.RLCPU.ACTIONS.IT_SKIP,
                        label: save ? 'IT_SAVE' : 'IT_SKIP',
                    }, traceEntries);
                    game.resolveIT(save);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                    return;
                }
                game.phase = runtime.GAME_PHASES.BUILD;
                return;
            case runtime.GAME_PHASES.BUILD:
                const beforeBuild = snapshotBuildState(game);
                const beforeTrace = Array.isArray(traceEntries) ? traceEntries.length : 0;
                if (Array.isArray(traceEntries)) {
                    let actionInfo = { action: null, label: 'UNKNOWN' };
                    if (cpu instanceof runtime.RLCPU) {
                        const choice = cpu._chooseForGame(game, shopStock);
                        actionInfo = {
                            action: choice.action,
                            label: actionToLabel(runtime, choice.action),
                        };
                    }
                    pushTraceEntry(runtime, game, shopStock, cpu, actionInfo, traceEntries);
                }
                cpu.build(game, shopStock);
                const afterBuild = snapshotBuildState(game);
                const outcome = detectBuildOutcome(beforeBuild, afterBuild);
                recordBuildStat(game, cpu, runtime.__selfplayOptions, outcome);
                if (Array.isArray(traceEntries) && traceEntries.length > beforeTrace) {
                    if (!traceEntries[traceEntries.length - 1].chosenAction || traceEntries[traceEntries.length - 1].chosenAction.label === 'UNKNOWN') {
                        traceEntries[traceEntries.length - 1].chosenAction = {
                            action: outcome.type === 'pass' ? runtime.RLCPU.ACTIONS.PASS : null,
                            label: outcome.type === 'card' ? `BUY_CARD:${outcome.name}` :
                                (outcome.type === 'landmark' ? `BUY_LM:${outcome.name}` : 'PASS'),
                        };
                    }
                }
                if (game.phase === runtime.GAME_PHASES.BUILD) game.nextTurn();
                if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(game, shopStock);
                return;
            default:
                return;
        }
    } finally {
        finalizeTraceRollUsage(options, rollStart);
    }
}

function finalizeTraceRollUsage(options, rollStart) {
    const traceEntries = options && options.traceEntries;
    const rollQueue = options && options.rollQueue;
    const requestedRolls = options && options.requestedRolls;
    if (!Array.isArray(traceEntries) || traceEntries.length <= 0 || !Array.isArray(rollQueue) || !Array.isArray(requestedRolls) || rollStart == null) {
        return;
    }
    const usedCount = Math.max(0, rollStart - rollQueue.length);
    const cursor = options.rollCursor || 0;
    const used = requestedRolls.slice(cursor, cursor + usedCount);
    options.rollCursor = cursor + usedCount;
    traceEntries[traceEntries.length - 1].rollsUsed = used;
    traceEntries[traceEntries.length - 1].rollCursor = cursor;
}

function summarizePlayer(player, enabledLandmarks) {
    const landmarkNames = [...enabledLandmarks];
    const builtLandmarks = landmarkNames.filter(name => player.landmarks[name]);
    const cardCounts = {};
    for (const card of player.cards) {
        cardCounts[card.name] = (cardCounts[card.name] || 0) + 1;
    }
    const topCards = Object.entries(cardCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
    return {
        name: player.name,
        coins: player.coins,
        builtLandmarks,
        missingLandmarks: landmarkNames.filter(name => !player.landmarks[name]),
        builtLandmarkCount: builtLandmarks.length,
        topCards,
        itVentureCoins: player.itVentureCoins || 0,
        totalCards: player.cards.length,
    };
}

function simulateGame(options = {}) {
    const runtime = options.runtime || loadRuntime();
    const difficulties = options.difficulties || ['expert', 'strong'];
    const game = new runtime.GameManager(difficulties.length);
    const shopStock = createShopStock(runtime.CARDS);
    const cpuPlayers = createPlayers(runtime, difficulties, options);
    const rng = createRng(options.seed || 1);
    runtime.Math.random = rng;
    runtime.__selfplayOptions = options;
    game.enabledLandmarks = new Set(runtime.Player.landmarkNames());
    let safety = 0;
    const maxSteps = options.maxSteps || 5000;

    while (!game.checkWinner() && safety < maxSteps) {
        const cpu = cpuPlayers[game.currentPlayerIndex];
        playCpuStep(runtime, game, cpu, shopStock, rng);
        safety++;
    }

    return {
        winner: game.checkWinner() ? game.currentPlayerIndex === game.players.indexOf(game.checkWinner()) ? game.players.indexOf(game.checkWinner()) : game.players.indexOf(game.checkWinner()) : -1,
        turns: game.turnCount,
        exhausted: safety >= maxSteps,
        difficulties: difficulties.slice(),
        seed: options.seed || 1,
        expertPreset: options.expertPreset || 'default',
        expertPurpose: options.expertPurpose || 'training',
        expertTuning: options.expertTuning || null,
        expertBehaviorFlags: options.expertBehaviorFlags || null,
        expertProfilePresets: options.expertProfilePresets || null,
        expertProfileTunings: options.expertProfileTunings || null,
        rlModel: options.rlModelData ? {
            stateDim: options.rlModelData.stateDim,
            hiddenSize: options.rlModelData.hiddenSize,
            numActions: options.rlModelData.numActions,
        } : null,
        fast: !!options.fast,
        lite: !!options.lite,
        finalState: game.players.map(player => summarizePlayer(player, game.enabledLandmarks)),
        traceEntries: Array.isArray(options.traceEntries) ? options.traceEntries.slice() : null,
        buildStats: options.buildStats ? options.buildStats.map(stats => ({
            total: stats.total,
            pass: stats.pass,
            cards: Object.assign({}, stats.cards),
            landmarks: Object.assign({}, stats.landmarks),
        })) : null,
    };
}

function rotatePlayers(players, offset) {
    return players.map((_, index) => players[(index + offset) % players.length]);
}

function runSeries(options = {}) {
    const games = options.games || 20;
    const players = options.players || ['expert', 'strong'];
    const runtime = loadRuntime();
    const wins = Object.fromEntries(players.map(player => [player, 0]));
    const seatWins = players.map(() => 0);
    let exhausted = 0;
    let turns = 0;
    const matchLog = [];
    const buildStats = players.map(() => ({
        total: 0,
        pass: 0,
        cards: {},
        landmarks: {},
    }));

    for (let i = 0; i < games; i++) {
        const lineup = rotatePlayers(players, i % players.length);
        const seed = (options.seed || 1) + i;
        const result = simulateGame({
            runtime,
            difficulties: lineup,
            seed,
            maxSteps: options.maxSteps,
            profileStats: options.profileStats,
            expertPreset: options.expertPreset,
            expertTuning: options.expertTuning,
            expertBehaviorFlags: options.expertBehaviorFlags,
            expertProfilePresets: options.expertProfilePresets,
            expertProfileTunings: options.expertProfileTunings,
            rlModelData: options.rlModelData,
            fast: options.fast,
            lite: options.lite,
            buildStats,
        });
        turns += result.turns;
        if (result.exhausted) exhausted++;
        matchLog.push({
            game: i + 1,
            seed,
            lineup,
            winnerIndex: result.winner,
            winnerDifficulty: result.winner >= 0 ? lineup[result.winner] : null,
            turns: result.turns,
            exhausted: result.exhausted,
            expertPreset: result.expertPreset,
            expertTuning: result.expertTuning,
            expertBehaviorFlags: result.expertBehaviorFlags,
            finalState: result.finalState,
        });
        if (result.winner >= 0) {
            wins[lineup[result.winner]]++;
            seatWins[result.winner]++;
        }
    }

    return {
        games,
        players: players.slice(),
        wins,
        seatWins,
        exhausted,
        averageTurns: games > 0 ? turns / games : 0,
        matchLog,
        buildStats,
    };
}

function runDifficultyLadder(options = {}) {
    const matchups = options.matchups || [
        ['normal', 'weak'],
        ['strong', 'normal'],
        ['expert', 'strong'],
    ];
    return matchups.map(players => ({
        players: players.slice(),
        result: runSeries(Object.assign({}, options, { players })),
    }));
}

function parseArgs(argv) {
    let games = 20;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let details = false;
    let expertPreset = 'default';
    let expertFlags = null;
    let comparePresets = null;
    let ladder = false;
    let fast = false;
    let lite = false;
    const players = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '20', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--details') details = true;
        else if (arg === '--ladder') ladder = true;
        else if (arg === '--fast') fast = true;
        else if (arg === '--lite') lite = true;
        else if (arg === '--expert-preset') expertPreset = argv[++i] || 'default';
        else if (arg === '--expert-flags') expertFlags = JSON.parse(argv[++i] || '{}');
        else if (arg === '--compare-presets') comparePresets = (argv[++i] || 'default').split(',').filter(Boolean);
        else players.push(arg);
    }

    return {
        games,
        seed,
        maxSteps,
        format,
        details,
        fast,
        lite,
        ladder,
        expertPreset,
        expertBehaviorFlags: expertFlags,
        comparePresets,
        players: players.length > 0 ? players : ['expert', 'strong', 'strong', 'normal'],
    };
}

function comparePresets(options) {
    const presets = options.comparePresets || ['default', 'refined', 'rush', 'economy'];
    return presets.map(preset => ({
        preset,
        result: runSeries(Object.assign({}, options, { expertPreset: preset, comparePresets: null })),
    }));
}

function printSeries(result, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`games=${result.games} players=${result.players.join(',')} expertPreset=${options.expertPreset || 'default'}`);
    for (const [difficulty, winCount] of Object.entries(result.wins)) {
        const rate = result.games > 0 ? ((winCount / result.games) * 100).toFixed(1) : '0.0';
        console.log(`${difficulty}: ${winCount} wins (${rate}%)`);
    }
    console.log(`seatWins=${result.seatWins.join(',')}`);
    console.log(`averageTurns=${result.averageTurns.toFixed(1)} exhausted=${result.exhausted}`);
    if (options.details) {
        for (const match of result.matchLog) {
                console.log(
                    `game=${match.game} seed=${match.seed} lineup=${match.lineup.join(',')} winner=${match.winnerDifficulty || 'none'} turns=${match.turns} exhausted=${match.exhausted} preset=${match.expertPreset}`
                );
            for (let i = 0; i < match.finalState.length; i++) {
                const player = match.finalState[i];
                const role = match.lineup[i];
                const topCards = player.topCards.map(card => `${card.name}x${card.count}`).join(',');
                console.log(
                    `  p${i + 1}=${role} coins=${player.coins} landmarks=${player.builtLandmarkCount}/${player.builtLandmarks.length + player.missingLandmarks.length} built=${player.builtLandmarks.join('|') || '-'} missing=${player.missingLandmarks.join('|') || '-'} cards=${topCards || '-'}`
                );
            }
        }
    }
}

function printPresetComparison(comparisons, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(comparisons, null, 2));
        return;
    }
    for (const entry of comparisons) {
        printSeries(entry.result, Object.assign({}, options, { expertPreset: entry.preset, details: false }));
    }
}

function printDifficultyLadder(entries, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    for (const entry of entries) {
        printSeries(entry.result, Object.assign({}, options, {
            expertPreset: entry.players.includes('expert') ? (options.expertPreset || 'default') : 'n/a',
            details: false,
        }));
    }
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    if (options.ladder) {
        printDifficultyLadder(runDifficultyLadder(options), options);
    } else if (options.comparePresets && options.comparePresets.length > 0) {
        printPresetComparison(comparePresets(options), options);
    } else {
        printSeries(runSeries(options), options);
    }
}

module.exports = {
    loadRuntime,
    createRng,
    createShopStock,
    createPlayers,
    actionToLabel,
    listLegalActions,
    summarizeTraceState,
    playCpuStep,
    simulateGame,
    runSeries,
    runDifficultyLadder,
    comparePresets,
    parseArgs,
    printSeries,
    printPresetComparison,
    printDifficultyLadder,
};
