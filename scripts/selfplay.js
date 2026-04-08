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

function randomDie(rng) {
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

function playCpuStep(runtime, game, cpu, shopStock, rng) {
    const tunaDice = [randomDie(rng), randomDie(rng)];
    switch (game.phase) {
        case runtime.GAME_PHASES.ROLL:
            game.rollDice(randomDie(rng), tunaDice);
            return;
        case runtime.GAME_PHASES.SELECT_DICE: {
            const useTwo = cpu.chooseDiceCount(game);
            game.selectDiceCount(useTwo, randomDie(rng), randomDie(rng), tunaDice);
            return;
        }
        case runtime.GAME_PHASES.REROLL_CONFIRM:
            if (cpu.chooseReroll(game)) game.rerollDice(randomDie(rng), tunaDice);
            else game.skipReroll();
            return;
        case runtime.GAME_PHASES.HARBOR_CHOICE:
            game.resolveHarbor(cpu.chooseHarbor(game), tunaDice);
            return;
        case runtime.GAME_PHASES.PENDING:
            if (game.pendingTV > 0) {
                game.resolveTV(cpu.chooseTVTarget(game));
                return;
            }
            if (game.pendingBusiness > 0) {
                const move = cpu.chooseBusinessMove(game);
                if (move) game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard);
                else fallbackBusiness(game);
                return;
            }
            if (game.pendingCleaning > 0) {
                const cardName = cpu.chooseCleaningTarget(game);
                if (cardName) game.resolveCleaning(cardName);
                else fallbackCleaning(game);
                return;
            }
            if (game.pendingMover > 0) {
                const move = cpu.chooseMoverMove(game);
                if (move) game.resolveMover(move.cardIndex, move.targetIndex);
                else fallbackMover(game);
                return;
            }
            if (game.pendingRenovation > 0) {
                const landmarkName = cpu.chooseRenovationTarget(game);
                if (landmarkName) game.resolveRenovation(landmarkName);
                else fallbackRenovation(game);
                return;
            }
            game.phase = runtime.GAME_PHASES.BUILD;
            return;
        case runtime.GAME_PHASES.BUILD:
            if (game.pendingIT) {
                game.resolveIT(cpu.chooseITSave(game));
                return;
            }
            cpu.build(game, shopStock);
            if (!game.pendingIT && game.phase === runtime.GAME_PHASES.BUILD) game.nextTurn();
            return;
        default:
            return;
    }
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
    simulateGame,
    runSeries,
    runDifficultyLadder,
    comparePresets,
    parseArgs,
    printSeries,
    printPresetComparison,
    printDifficultyLadder,
};
