const path = require('path');
const vm = require('vm');

const { loadRuntime } = require(path.join(__dirname, 'selfplay.js'));

const DEFAULT_PROFILES = ['duel', 'trio', 'crowd'];

function parseArgs(argv) {
    let games = 50;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let profiles = DEFAULT_PROFILES.slice();

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '50', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--full') lite = false;
        else if (arg === '--fast') {
            lite = false;
            fast = true;
        } else if (arg === '--profiles') {
            profiles = (argv[++i] || DEFAULT_PROFILES.join(',')).split(',').map(v => v.trim()).filter(Boolean);
        }
    }

    return { games, seed, maxSteps, format, lite, fast, profiles };
}

function profilePlayers(name) {
    if (name === 'duel') return ['expert', 'weak'];
    if (name === 'trio') return ['expert', 'weak', 'weak'];
    if (name === 'crowd') return ['expert', 'weak', 'weak', 'weak'];
    throw new Error(`unknown profile: ${name}`);
}

function profileWeight(name) {
    if (name === 'duel') return 1;
    if (name === 'trio') return 2;
    if (name === 'crowd') return 3;
    return 1;
}

function getFastSeriesEvaluator(runtime) {
    if (typeof runtime.__evalExpertVsWeakFast === 'function') return runtime.__evalExpertVsWeakFast;
    vm.runInContext(`
        this.__evalExpertVsWeakFast = function(config) {
            function createRng(seed) {
                let state = seed >>> 0;
                return function() {
                    state = (state * 1664525 + 1013904223) >>> 0;
                    return state / 0x100000000;
                };
            }

            function randomDie(rng) {
                return Math.floor(rng() * 6) + 1;
            }

            function createShopStock() {
                const stock = {};
                for (const card of CARDS) stock[card.name] = 6;
                return stock;
            }

            function createCpu(difficulty) {
                if (difficulty === 'expert') {
                    return new CPU(difficulty, {
                        expertPurpose: 'live',
                        simulationMode: config.lite ? 'lite' : (config.fast ? 'fast' : 'full'),
                    });
                }
                return new CPU(difficulty);
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

            function playStep(game, cpuPlayers, shopStock, rng) {
                const cpu = cpuPlayers[game.currentPlayerIndex];
                const tunaDice = [randomDie(rng), randomDie(rng)];
                switch (game.phase) {
                    case GAME_PHASES.ROLL:
                        if (game.currentPlayer().landmarks['駅']) game.rollDice(null, tunaDice);
                        else game.rollDice(randomDie(rng), tunaDice);
                        return;
                    case GAME_PHASES.SELECT_DICE: {
                        const useTwo = cpu.chooseDiceCount(game);
                        if (useTwo) game.selectDiceCount(true, randomDie(rng), randomDie(rng), tunaDice);
                        else game.selectDiceCount(false, randomDie(rng), null, tunaDice);
                        return;
                    }
                    case GAME_PHASES.REROLL_CONFIRM:
                        if (cpu.chooseReroll(game)) game.rerollDice(randomDie(rng), tunaDice);
                        else game.skipReroll();
                        return;
                    case GAME_PHASES.HARBOR_CHOICE:
                        game.resolveHarbor(cpu.chooseHarbor(game), tunaDice);
                        return;
                    case GAME_PHASES.PENDING:
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
                        if (game.pendingIT) {
                            game.resolveIT(cpu.chooseITInvest(game));
                            return;
                        }
                        game.phase = GAME_PHASES.BUILD;
                        return;
                    case GAME_PHASES.BUILD:
                        cpu.build(game, shopStock);
                        if (game.phase === GAME_PHASES.BUILD) game.nextTurn();
                        return;
                    default:
                        return;
                }
            }

            function rotatePlayers(players, offset) {
                return players.map((_, index) => players[(index + offset) % players.length]);
            }

            const games = config.games || 1;
            const players = config.players;
            const wins = {};
            for (const player of players) wins[player] = 0;
            const seatWins = players.map(() => 0);
            let exhausted = 0;
            let turns = 0;

            for (let i = 0; i < games; i++) {
                const lineup = rotatePlayers(players, i % players.length);
                const game = new GameManager(lineup.length);
                const shopStock = createShopStock();
                const cpuPlayers = lineup.map(createCpu);
                const rng = createRng((config.seed || 1) + i);
                Math.random = rng;
                game.enabledLandmarks = new Set(Player.landmarkNames());
                let safety = 0;
                const maxSteps = config.maxSteps || 5000;

                while (!game.checkWinner() && safety < maxSteps) {
                    playStep(game, cpuPlayers, shopStock, rng);
                    safety++;
                }

                turns += game.turnCount;
                if (safety >= maxSteps) exhausted++;
                const winner = game.checkWinner() ? game.players.indexOf(game.checkWinner()) : -1;
                if (winner >= 0) {
                    wins[lineup[winner]]++;
                    seatWins[winner]++;
                }
            }

            return {
                games,
                players: players.slice(),
                wins,
                seatWins,
                exhausted,
                averageTurns: games > 0 ? turns / games : 0,
            };
        };
    `, runtime);
    return runtime.__evalExpertVsWeakFast;
}

function evaluateProfile(name, options) {
    const players = profilePlayers(name);
    const runtime = options.runtime || loadRuntime({ includeRL: false });
    const evaluator = getFastSeriesEvaluator(runtime);
    const result = evaluator({
        games: options.games,
        seed: options.seed,
        maxSteps: options.maxSteps,
        players,
        lite: options.lite,
        fast: options.fast,
    });
    const expertWins = result.wins.expert || 0;
    const winRate = result.games > 0 ? expertWins / result.games : 0;
    return {
        profile: name,
        players,
        weight: profileWeight(name),
        games: result.games,
        expertWins,
        winRate,
        averageTurns: result.averageTurns,
        exhausted: result.exhausted,
        seatWins: result.seatWins.slice(),
    };
}

function summarize(entries) {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    const weightedWinRate = totalWeight > 0
        ? entries.reduce((sum, entry) => sum + entry.winRate * entry.weight, 0) / totalWeight
        : 0;
    const minWinRate = entries.reduce((min, entry) => Math.min(min, entry.winRate), 1);
    return {
        weightedWinRate,
        minWinRate,
        profiles: entries.length,
    };
}

function toText(entries, summary, options) {
    const lines = [
        `games=${options.games} seed=${options.seed} mode=${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')}`,
        `weightedWinRate=${(summary.weightedWinRate * 100).toFixed(1)}% minWinRate=${(summary.minWinRate * 100).toFixed(1)}%`,
    ];
    for (const entry of entries) {
        lines.push(
            `${entry.profile}: ${entry.expertWins}/${entry.games} (${(entry.winRate * 100).toFixed(1)}%) ` +
            `avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted} ` +
            `seatWins=${entry.seatWins.join(',')} players=${entry.players.join(',')}`
        );
    }
    return lines.join('\n');
}

function toMarkdown(entries, summary, options) {
    const lines = [
        '# Expert v2simple vs Weak',
        '',
        `- games: ${options.games}`,
        `- seed: ${options.seed}`,
        `- mode: ${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')}`,
        `- weightedWinRate: ${(summary.weightedWinRate * 100).toFixed(1)}%`,
        `- minWinRate: ${(summary.minWinRate * 100).toFixed(1)}%`,
        '',
        '| profile | players | weight | winRate | seatWins | avgTurns | exhausted |',
        '| --- | --- | ---: | ---: | --- | ---: | ---: |',
    ];
    for (const entry of entries) {
        lines.push(
            `| ${entry.profile} | ${entry.players.join(',')} | ${entry.weight} | ${(entry.winRate * 100).toFixed(1)}% | ${entry.seatWins.join(',')} | ${entry.averageTurns.toFixed(1)} | ${entry.exhausted} |`
        );
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const runtime = loadRuntime({ includeRL: false });
    const entries = options.profiles.map(profile => evaluateProfile(profile, Object.assign({}, options, { runtime })));
    const summary = summarize(entries);
    if (options.format === 'json') {
        console.log(JSON.stringify({ options, summary, entries }, null, 2));
        return;
    }
    if (options.format === 'markdown' || options.format === 'md') {
        console.log(toMarkdown(entries, summary, options));
        return;
    }
    console.log(toText(entries, summary, options));
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PROFILES,
    evaluateProfile,
    parseArgs,
    profilePlayers,
    profileWeight,
    summarize,
    toMarkdown,
    toText,
};
