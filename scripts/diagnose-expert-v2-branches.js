const path = require('path');

const { loadRuntime, simulateGameLightweight } = require(path.join(__dirname, 'selfplay.js'));
const {
    DEFAULT_PROFILES,
    profilePlayers,
    profileWeight,
    summarize,
} = require(path.join(__dirname, 'eval-expert-vs-strong.js'));

function parseArgs(argv) {
    let games = 20;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let profiles = DEFAULT_PROFILES.slice();
    let margin = 0.2;

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
        } else if (arg === '--profiles') {
            profiles = (argv[++i] || DEFAULT_PROFILES.join(',')).split(',').map(v => v.trim()).filter(Boolean);
        } else if (arg === '--margin') {
            margin = parseFloat(argv[++i] || '0.2');
        }
    }

    return { games, seed, maxSteps, format, lite, fast, profiles, margin };
}

function createCounters() {
    return {
        diceDecisions: 0,
        diceTie: 0,
        diceNearTie: 0,
        diceTwoPreferred: 0,
        rerollDecisions: 0,
        rerollMarginWindow: 0,
        rerollPreferred: 0,
        harborDecisions: 0,
        harborTieOrBetter: 0,
        harborLowRollImproves: 0,
        tvDecisions: 0,
        tvStealTie: 0,
        tvBuiltTie: 0,
    };
}

function addCounters(target, source) {
    for (const [key, value] of Object.entries(source)) {
        target[key] = (target[key] || 0) + value;
    }
}

function rotatePlayers(players, offset) {
    return players.map((_, index) => players[(index + offset) % players.length]);
}

function installBranchDiagnostics(runtime, counters, options = {}) {
    const CPU = runtime.CPU;
    if (!CPU || CPU.__expertV2BranchDiagnosticsInstalled) return () => {};

    const originals = {
        chooseDiceCount: CPU.prototype.chooseDiceCount,
        chooseReroll: CPU.prototype.chooseReroll,
        chooseHarbor: CPU.prototype.chooseHarbor,
        chooseTVTarget: CPU.prototype.chooseTVTarget,
    };
    const margin = Number.isFinite(options.margin) ? options.margin : 0.2;
    const EPS = 1e-9;

    CPU.prototype.chooseDiceCount = function chooseDiceCountWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertDiceMode !== 'random') {
            const current = game.currentPlayer();
            if (current && current.landmarks && current.landmarks[runtime.LANDMARK_NAMES.STATION]) {
                const oneScore = this._expectedDiceScoreWithHarbor(game, false);
                const twoScore = this._expectedDiceScoreWithHarbor(game, true);
                counters.diceDecisions++;
                if (Math.abs(twoScore - oneScore) <= EPS) counters.diceTie++;
                if (Math.abs(twoScore - oneScore) <= margin) counters.diceNearTie++;
                if (twoScore >= oneScore) counters.diceTwoPreferred++;
            }
        }
        return originals.chooseDiceCount.call(this, game);
    };

    CPU.prototype.chooseReroll = function chooseRerollWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertRerollMode !== 'random') {
            const dice = game.lastDiceResult;
            const usingTwoDice = game.lastDice2 > 0;
            const keepScore = (currentDice => {
                const current = game.currentPlayer();
                if (current && current.landmarks && current.landmarks[runtime.LANDMARK_NAMES.HARBOR] && currentDice >= 10) {
                    return Math.max(this._estimateRollScore(game, currentDice), this._estimateRollScore(game, currentDice + 2));
                }
                return this._estimateRollScore(game, currentDice);
            })(dice);
            const rerollScore = this._expectedDiceScoreWithHarbor(game, usingTwoDice);
            counters.rerollDecisions++;
            if (rerollScore > keepScore) counters.rerollPreferred++;
            if (rerollScore > keepScore && rerollScore <= keepScore + margin) counters.rerollMarginWindow++;
        }
        return originals.chooseReroll.call(this, game);
    };

    CPU.prototype.chooseHarbor = function chooseHarborWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertHarborMode !== 'random') {
            const keepScore = this._estimateRollScore(game, game.lastDiceResult);
            const bonusScore = this._estimateRollScore(game, game.lastDiceResult + 2);
            counters.harborDecisions++;
            if (bonusScore >= keepScore) counters.harborTieOrBetter++;
            if (game.lastDiceResult <= 6 && bonusScore > keepScore) counters.harborLowRollImproves++;
        }
        return originals.chooseHarbor.call(this, game);
    };

    CPU.prototype.chooseTVTarget = function chooseTVTargetWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertTvMode !== 'random') {
            const ci = game.currentPlayerIndex;
            const targets = [];
            const stealCounts = {};
            const builtCounts = {};
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const player = game.players[i];
                if (!player || player.coins <= 0) continue;
                const steal = Math.min(5, player.coins);
                const built = player.builtLandmarkCount ? player.builtLandmarkCount() : 0;
                targets.push(i);
                stealCounts[steal] = (stealCounts[steal] || 0) + 1;
                builtCounts[`${steal}:${built}`] = (builtCounts[`${steal}:${built}`] || 0) + 1;
            }
            if (targets.length > 0) {
                counters.tvDecisions++;
                if (Object.values(stealCounts).some(count => count > 1)) counters.tvStealTie++;
                if (Object.values(builtCounts).some(count => count > 1)) counters.tvBuiltTie++;
            }
        }
        return originals.chooseTVTarget.call(this, game);
    };

    CPU.__expertV2BranchDiagnosticsInstalled = true;
    return () => {
        CPU.prototype.chooseDiceCount = originals.chooseDiceCount;
        CPU.prototype.chooseReroll = originals.chooseReroll;
        CPU.prototype.chooseHarbor = originals.chooseHarbor;
        CPU.prototype.chooseTVTarget = originals.chooseTVTarget;
        delete CPU.__expertV2BranchDiagnosticsInstalled;
    };
}

function evaluateProfile(profile, options, runtime) {
    const counters = createCounters();
    const uninstall = installBranchDiagnostics(runtime, counters, options);
    try {
        const players = profilePlayers(profile);
        const wins = Object.fromEntries(players.map(player => [player, 0]));
        const seatWins = players.map(() => 0);
        let turns = 0;
        let exhausted = 0;
        for (let i = 0; i < options.games; i++) {
            const lineup = rotatePlayers(players, i % players.length);
            const result = simulateGameLightweight({
                runtime,
                difficulties: lineup,
                seed: (options.seed || 1) + i,
                maxSteps: options.maxSteps,
                lite: options.lite,
                fast: options.fast,
                expertPreset: 'v2simple',
                expertPurpose: 'live',
                expertBuildMode: 'ev',
                expertDiceMode: 'ev',
                expertRerollMode: 'simple',
                expertInvestMode: 'always',
                expertTvMode: 'simple',
                expertBusinessMode: 'simple',
                expertCleaningMode: 'simple',
                expertHarborMode: 'simple',
                expertMoverMode: 'simple',
                expertRenovationMode: 'simple',
                expertIncomeCapMode: 'none',
                expertComboMode: 'core',
                expertComboWeight: 0.35,
                expertBuildTempoWeight: 0.05,
            });
            turns += result.turns;
            if (result.exhausted) exhausted++;
            if (result.winner >= 0) {
                wins[lineup[result.winner]]++;
                seatWins[result.winner]++;
            }
        }
        const expertWins = wins.expert || 0;
        return {
            profile,
            players,
            weight: profileWeight(profile),
            games: options.games,
            expertWins,
            winRate: options.games > 0 ? expertWins / options.games : 0,
            averageTurns: options.games > 0 ? turns / options.games : 0,
            exhausted,
            seatWins,
            counters,
        };
    } finally {
        uninstall();
    }
}

function runDiagnostics(options) {
    const runtime = loadRuntime({ includeRL: false });
    const entries = options.profiles.map(profile => evaluateProfile(profile, options, runtime));
    const summary = summarize(entries.map(entry => ({
        profile: entry.profile,
        weight: entry.weight,
        winRate: entry.winRate,
    })));
    const totals = createCounters();
    for (const entry of entries) addCounters(totals, entry.counters);
    return { options, summary, totals, entries };
}

function rate(numerator, denominator) {
    return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'n/a';
}

function toText(report) {
    const { options, summary, totals, entries } = report;
    const lines = [
        `games=${options.games} seed=${options.seed} mode=${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')} margin=${options.margin}`,
        `weightedWinRate=${(summary.weightedWinRate * 100).toFixed(1)}% minWinRate=${(summary.minWinRate * 100).toFixed(1)}%`,
        `totals: diceTie=${totals.diceTie}/${totals.diceDecisions} (${rate(totals.diceTie, totals.diceDecisions)}) diceNearTie=${totals.diceNearTie}/${totals.diceDecisions} (${rate(totals.diceNearTie, totals.diceDecisions)}) rerollMarginWindow=${totals.rerollMarginWindow}/${totals.rerollDecisions} (${rate(totals.rerollMarginWindow, totals.rerollDecisions)}) harborLowRollImproves=${totals.harborLowRollImproves}/${totals.harborDecisions} (${rate(totals.harborLowRollImproves, totals.harborDecisions)}) tvStealTie=${totals.tvStealTie}/${totals.tvDecisions} (${rate(totals.tvStealTie, totals.tvDecisions)}) tvBuiltTie=${totals.tvBuiltTie}/${totals.tvDecisions} (${rate(totals.tvBuiltTie, totals.tvDecisions)})`,
    ];
    for (const entry of entries) {
        const counters = entry.counters;
        lines.push(
            `${entry.profile}: winRate=${(entry.winRate * 100).toFixed(1)}% avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted} ` +
            `diceTie=${counters.diceTie}/${counters.diceDecisions} rerollMarginWindow=${counters.rerollMarginWindow}/${counters.rerollDecisions} ` +
            `harborLowRollImproves=${counters.harborLowRollImproves}/${counters.harborDecisions} tvStealTie=${counters.tvStealTie}/${counters.tvDecisions}`
        );
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = runDiagnostics(options);
    if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log(toText(report));
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PROFILES,
    createCounters,
    installBranchDiagnostics,
    parseArgs,
    runDiagnostics,
    toText,
};
