const path = require('path');

const { loadRuntime, runSeries } = require(path.join(__dirname, 'selfplay.js'));
const { buildCandidateTunings } = require(path.join(__dirname, 'tune-expert.js'));

const DEFAULT_PROFILES = ['duel', 'trio', 'crowd', 'allStrong4'];

function parseArgs(argv) {
    let games = 50;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let expertPreset = 'v2simple';
    let tuningCandidate = '';
    let profiles = DEFAULT_PROFILES.slice();
    let buildMode = 'ev';
    let diceMode = 'ev';
    let rerollMode = 'simple';
    let itMode = 'always';
    let tvMode = 'simple';
    let businessMode = 'simple';
    let cleaningMode = 'simple';
    let harborMode = 'simple';
    let moverMode = 'simple';
    let renovationMode = 'simple';
    let incomeCapMode = 'none';
    let comboMode = 'core';

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
        }
        else if (arg === '--expert-preset') expertPreset = argv[++i] || 'default';
        else if (arg === '--tuning-candidate') tuningCandidate = argv[++i] || '';
        else if (arg === '--build-mode') buildMode = argv[++i] || 'ev';
        else if (arg === '--dice-mode') diceMode = argv[++i] || 'ev';
        else if (arg === '--reroll-mode') rerollMode = argv[++i] || 'simple';
        else if (arg === '--it-mode') itMode = argv[++i] || 'always';
        else if (arg === '--tv-mode') tvMode = argv[++i] || 'simple';
        else if (arg === '--business-mode') businessMode = argv[++i] || 'simple';
        else if (arg === '--cleaning-mode') cleaningMode = argv[++i] || 'simple';
        else if (arg === '--harbor-mode') harborMode = argv[++i] || 'simple';
        else if (arg === '--mover-mode') moverMode = argv[++i] || 'simple';
        else if (arg === '--renovation-mode') renovationMode = argv[++i] || 'simple';
        else if (arg === '--income-cap-mode') incomeCapMode = argv[++i] || 'none';
        else if (arg === '--combo-mode') comboMode = argv[++i] || 'none';
        else if (arg === '--profiles') {
            profiles = (argv[++i] || DEFAULT_PROFILES.join(',')).split(',').map(v => v.trim()).filter(Boolean);
        }
    }

    return {
        games,
        seed,
        maxSteps,
        format,
        lite,
        fast,
        expertPreset,
        tuningCandidate,
        profiles,
        buildMode,
        diceMode,
        rerollMode,
        itMode,
        tvMode,
        businessMode,
        cleaningMode,
        harborMode,
        moverMode,
        renovationMode,
        incomeCapMode,
        comboMode,
    };
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

function profileWeight(name) {
    if (name === 'duel') return 1;
    if (name === 'trio') return 2;
    if (name === 'crowd') return 3;
    if (name === 'allStrong4') return 4;
    return 1;
}

function evaluateProfile(name, options) {
    const players = profilePlayers(name);
    const expertTuning = options.expertTuning || resolveExpertTuning(options);
    const result = runSeries({
        games: options.games,
        seed: options.seed,
        maxSteps: options.maxSteps,
        players,
        includeRL: false,
        lightweightCpuOnly: true,
        collectMatchLog: false,
        collectBuildStats: false,
        collectBusinessStats: false,
        includeFinalState: false,
        lite: options.lite,
        fast: options.fast,
        expertPreset: options.expertPreset,
        expertTuning,
        expertPurpose: 'live',
        expertBuildMode: options.buildMode || 'ev',
        expertDiceMode: options.diceMode || 'ev',
        expertRerollMode: options.rerollMode || 'simple',
        expertInvestMode: options.itMode || 'always',
        expertTvMode: options.tvMode || 'simple',
        expertBusinessMode: options.businessMode || 'simple',
        expertCleaningMode: options.cleaningMode || 'simple',
        expertHarborMode: options.harborMode || 'simple',
        expertMoverMode: options.moverMode || 'simple',
        expertRenovationMode: options.renovationMode || 'simple',
        expertIncomeCapMode: options.incomeCapMode || 'none',
        expertComboMode: options.comboMode || 'core',
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
        raw: result,
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
        `games=${options.games} seed=${options.seed} mode=${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')} expertPreset=${options.expertPreset}` +
        ` buildMode=${options.buildMode} diceMode=${options.diceMode} rerollMode=${options.rerollMode} itMode=${options.itMode} tvMode=${options.tvMode}` +
        ` businessMode=${options.businessMode} cleaningMode=${options.cleaningMode} harborMode=${options.harborMode} moverMode=${options.moverMode} renovationMode=${options.renovationMode} incomeCapMode=${options.incomeCapMode} comboMode=${options.comboMode}` +
        `${options.tuningCandidate ? ` tuningCandidate=${options.tuningCandidate}` : ''}`,
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
        '# Expert vs Strong',
        '',
        `- games: ${options.games}`,
        `- seed: ${options.seed}`,
        `- mode: ${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')}`,
        `- expertPreset: ${options.expertPreset}`,
        `- buildMode: ${options.buildMode}`,
        `- diceMode: ${options.diceMode}`,
        `- rerollMode: ${options.rerollMode}`,
        `- itMode: ${options.itMode}`,
        `- tvMode: ${options.tvMode}`,
        `- businessMode: ${options.businessMode}`,
        `- cleaningMode: ${options.cleaningMode}`,
        `- harborMode: ${options.harborMode}`,
        `- moverMode: ${options.moverMode}`,
        `- renovationMode: ${options.renovationMode}`,
        `- incomeCapMode: ${options.incomeCapMode}`,
        `- comboMode: ${options.comboMode}`,
        `- tuningCandidate: ${options.tuningCandidate || 'none'}`,
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
    const entries = options.profiles.map(profile => evaluateProfile(profile, options));
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
    resolveExpertTuning,
    summarize,
    toMarkdown,
    toText,
};
