const path = require('path');

const { loadRuntime, simulateGame } = require(path.join(__dirname, 'selfplay.js'));
const { buildCandidateTunings } = require(path.join(__dirname, 'tune-expert.js'));

const DEFAULT_PROFILES = ['duel', 'trio', 'crowd', 'allStrong4'];

function parseArgs(argv) {
    let games = 20;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let expertPreset = 'default';
    let tuningCandidate = '';
    let profiles = DEFAULT_PROFILES.slice();

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '20', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--full') lite = false;
        else if (arg === '--fast') {
            lite = false;
            fast = true;
        }
        else if (arg === '--expert-preset') expertPreset = argv[++i] || 'default';
        else if (arg === '--tuning-candidate') tuningCandidate = argv[++i] || '';
        else if (arg === '--profiles') {
            profiles = (argv[++i] || DEFAULT_PROFILES.join(',')).split(',').map(v => v.trim()).filter(Boolean);
        }
    }

    return { games, seed, maxSteps, format, lite, fast, expertPreset, tuningCandidate, profiles };
}

function resolveExpertTuning(options = {}) {
    if (!options.tuningCandidate) return null;
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, options.expertPreset || 'default');
    const matched = candidates.find(candidate => candidate.name === options.tuningCandidate);
    if (!matched) {
        throw new Error(`unknown tuning candidate: ${options.tuningCandidate}`);
    }
    return matched.tuning;
}

function profilePlayers(name) {
    if (name === 'duel') return ['expert', 'strong'];
    if (name === 'trio') return ['expert', 'strong', 'strong'];
    if (name === 'crowd') return ['expert', 'strong', 'strong', 'normal'];
    if (name === 'allStrong4') return ['expert', 'strong', 'strong', 'strong'];
    throw new Error(`unknown profile: ${name}`);
}

function rotatePlayers(players, offset) {
    return players.map((_, index) => players[(index + offset) % players.length]);
}

function incrementCount(map, key, amount = 1) {
    if (!key) return;
    map[key] = (map[key] || 0) + amount;
}

function topEntries(map, limit = 5) {
    return Object.entries(map || {})
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }));
}

function summarizeLosses(losses) {
    const winnerDifficulties = {};
    const winnerSeats = {};
    const expertMissingLandmarks = {};
    const winnerBuiltLandmarks = {};
    const expertCards = {};
    const winnerCards = {};
    const finalActions = {};
    let totalLandmarkGap = 0;
    let totalTurns = 0;

    for (const loss of losses) {
        incrementCount(winnerDifficulties, loss.winnerDifficulty);
        incrementCount(winnerSeats, `p${loss.winnerSeat + 1}`);
        totalLandmarkGap += loss.landmarkGap;
        totalTurns += loss.turns;

        for (const name of loss.expertMissingLandmarks) incrementCount(expertMissingLandmarks, name);
        for (const name of loss.winnerBuiltLandmarks) incrementCount(winnerBuiltLandmarks, name);
        for (const card of loss.expertTopCards) incrementCount(expertCards, card.name, card.count);
        for (const card of loss.winnerTopCards) incrementCount(winnerCards, card.name, card.count);
        incrementCount(finalActions, loss.lastExpertAction || 'UNKNOWN');
    }

    return {
        losses: losses.length,
        averageLandmarkGap: losses.length > 0 ? totalLandmarkGap / losses.length : 0,
        averageTurns: losses.length > 0 ? totalTurns / losses.length : 0,
        winnerDifficulties,
        winnerSeats,
        expertMissingLandmarks: topEntries(expertMissingLandmarks),
        winnerBuiltLandmarks: topEntries(winnerBuiltLandmarks),
        expertTopCards: topEntries(expertCards),
        winnerTopCards: topEntries(winnerCards),
        finalActions: topEntries(finalActions),
    };
}

function diagnoseProfile(name, options) {
    const basePlayers = profilePlayers(name);
    const runtime = loadRuntime();
    const expertTuning = options.expertTuning || resolveExpertTuning(options);
    const losses = [];
    let expertWins = 0;

    for (let i = 0; i < options.games; i++) {
        const lineup = rotatePlayers(basePlayers, i % basePlayers.length);
        const traceEntries = [];
        const result = simulateGame({
            runtime,
            difficulties: lineup,
            seed: (options.seed || 1) + i,
            maxSteps: options.maxSteps,
            expertPreset: options.expertPreset,
            expertTuning,
            fast: options.fast,
            lite: options.lite,
            traceEntries,
        });
        const expertIndex = lineup.indexOf('expert');
        if (result.winner === expertIndex) {
            expertWins++;
            continue;
        }
        const expertState = result.finalState[expertIndex];
        const winnerState = result.finalState[result.winner];
        const expertTrace = traceEntries.filter(entry => entry.actorDifficulty === 'expert');
        const lastExpertAction = expertTrace.length > 0 ? expertTrace[expertTrace.length - 1].chosenAction.label : null;
        losses.push({
            game: i + 1,
            seed: (options.seed || 1) + i,
            lineup,
            winnerDifficulty: result.winner >= 0 ? lineup[result.winner] : null,
            winnerSeat: result.winner,
            turns: result.turns,
            exhausted: result.exhausted,
            landmarkGap: (winnerState ? winnerState.builtLandmarkCount : 0) - (expertState ? expertState.builtLandmarkCount : 0),
            expertMissingLandmarks: expertState ? expertState.missingLandmarks : [],
            winnerBuiltLandmarks: winnerState ? winnerState.builtLandmarks : [],
            expertTopCards: expertState ? expertState.topCards : [],
            winnerTopCards: winnerState ? winnerState.topCards : [],
            lastExpertAction,
        });
    }

    return {
        profile: name,
        games: options.games,
        expertWins,
        expertWinRate: options.games > 0 ? expertWins / options.games : 0,
        summary: summarizeLosses(losses),
        losses,
    };
}

function toText(entries, options) {
    const lines = [
        `games=${options.games} seed=${options.seed} mode=${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')} expertPreset=${options.expertPreset}` +
        `${options.tuningCandidate ? ` tuningCandidate=${options.tuningCandidate}` : ''}`,
    ];
    for (const entry of entries) {
        lines.push(
            `${entry.profile}: expertWinRate=${(entry.expertWinRate * 100).toFixed(1)}% losses=${entry.summary.losses} ` +
            `avgLandmarkGap=${entry.summary.averageLandmarkGap.toFixed(2)} avgTurns=${entry.summary.averageTurns.toFixed(1)}`
        );
        lines.push(
            `  winners=${topEntries(entry.summary.winnerDifficulties, 4).map(item => `${item.name}:${item.count}`).join(',') || '-'} ` +
            `seats=${topEntries(entry.summary.winnerSeats, 4).map(item => `${item.name}:${item.count}`).join(',') || '-'}`
        );
        lines.push(
            `  expertMissing=${entry.summary.expertMissingLandmarks.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
        );
        lines.push(
            `  winnerBuilt=${entry.summary.winnerBuiltLandmarks.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
        );
        lines.push(
            `  expertCards=${entry.summary.expertTopCards.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
        );
        lines.push(
            `  winnerCards=${entry.summary.winnerTopCards.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
        );
        lines.push(
            `  finalActions=${entry.summary.finalActions.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
        );
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const entries = options.profiles.map(profile => diagnoseProfile(profile, options));
    if (options.format === 'json') {
        console.log(JSON.stringify({ options, entries }, null, 2));
        return;
    }
    console.log(toText(entries, options));
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PROFILES,
    diagnoseProfile,
    parseArgs,
    profilePlayers,
    resolveExpertTuning,
    summarizeLosses,
    toText,
};
