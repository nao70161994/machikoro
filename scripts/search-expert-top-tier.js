const path = require('path');

const { loadRuntime, runSeries } = require(path.join(__dirname, 'selfplay.js'));
const { buildCandidateTunings } = require(path.join(__dirname, 'tune-expert.js'));
const { DEFAULT_PROFILES, profilePlayers, profileWeight } = require(path.join(__dirname, 'eval-expert-vs-strong.js'));

function parseArgs(argv) {
    let games = 8;
    let seed = 1;
    let maxSteps = 5000;
    let basePreset = 'default';
    let top = 5;
    let format = 'text';
    let lite = true;
    let fast = false;
    let profiles = DEFAULT_PROFILES.slice();
    let progress = true;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '8', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--base-preset') basePreset = argv[++i] || 'default';
        else if (arg === '--top') top = parseInt(argv[++i] || '5', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--full') lite = false;
        else if (arg === '--fast') {
            lite = false;
            fast = true;
        }
        else if (arg === '--profiles') {
            profiles = (argv[++i] || DEFAULT_PROFILES.join(',')).split(',').map(v => v.trim()).filter(Boolean);
        }
        else if (arg === '--quiet') progress = false;
    }

    return { games, seed, maxSteps, basePreset, top, format, lite, fast, profiles, progress };
}

function summarizeProfileResults(results) {
    const totalWeight = results.reduce((sum, entry) => sum + entry.weight, 0);
    const weightedWinRate = totalWeight > 0
        ? results.reduce((sum, entry) => sum + entry.winRate * entry.weight, 0) / totalWeight
        : 0;
    const minWinRate = results.reduce((min, entry) => Math.min(min, entry.winRate), 1);
    const exhausted = results.reduce((sum, entry) => sum + entry.exhausted, 0);
    const averageTurns = results.reduce((sum, entry) => sum + entry.averageTurns * entry.weight, 0) / Math.max(totalWeight, 1);
    return {
        weightedWinRate,
        minWinRate,
        exhausted,
        averageTurns,
    };
}

function evaluateCandidate(candidate, options, candidateIndex) {
    const profileResults = options.profiles.map((profile, profileIndex) => {
        const players = profilePlayers(profile);
        const result = runSeries({
            games: options.games,
            seed: options.seed + candidateIndex * 1000 + profileIndex * 100,
            maxSteps: options.maxSteps,
            players,
            lite: options.lite,
            fast: options.fast,
            expertPreset: options.basePreset,
            expertPurpose: 'live',
            expertTuning: candidate.tuning,
        });
        return {
            profile,
            players,
            weight: profileWeight(profile),
            games: result.games,
            expertWins: result.wins.expert || 0,
            winRate: result.games > 0 ? (result.wins.expert || 0) / result.games : 0,
            averageTurns: result.averageTurns,
            exhausted: result.exhausted,
        };
    });
    return Object.assign({
        name: candidate.name,
        tuning: candidate.tuning,
        profiles: profileResults,
    }, summarizeProfileResults(profileResults));
}

function rankCandidates(entries) {
    return entries.slice().sort((a, b) =>
        b.weightedWinRate - a.weightedWinRate ||
        b.minWinRate - a.minWinRate ||
        a.exhausted - b.exhausted ||
        a.averageTurns - b.averageTurns ||
        a.name.localeCompare(b.name)
    );
}

function searchTopTier(options = {}) {
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, options.basePreset || 'default');
    const evaluated = candidates.map((candidate, index) => {
        if (options.progress) {
            console.error(`[search ${index + 1}/${candidates.length}] ${candidate.name}`);
        }
        return evaluateCandidate(candidate, options, index);
    });
    const ranked = rankCandidates(evaluated);
    return {
        options,
        totalCandidates: candidates.length,
        rankings: ranked,
        top: ranked.slice(0, options.top || 5),
    };
}

function renderText(result) {
    const lines = [
        `basePreset=${result.options.basePreset} games=${result.options.games} top=${result.options.top} mode=${result.options.lite ? 'lite' : (result.options.fast ? 'fast' : 'full')}`,
        `profiles=${result.options.profiles.join(',')} totalCandidates=${result.totalCandidates}`,
    ];
    for (const entry of result.top) {
        lines.push(
            `${entry.name}: weighted=${(entry.weightedWinRate * 100).toFixed(1)}% min=${(entry.minWinRate * 100).toFixed(1)}% ` +
            `avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted}`
        );
        for (const profile of entry.profiles) {
            lines.push(`  ${profile.profile}: ${(profile.winRate * 100).toFixed(1)}% (${profile.expertWins}/${profile.games})`);
        }
    }
    return lines.join('\n');
}

function renderMarkdown(result) {
    const lines = [
        '# Expert Top-Tier Search',
        '',
        `- basePreset: ${result.options.basePreset}`,
        `- games: ${result.options.games}`,
        `- mode: ${result.options.lite ? 'lite' : (result.options.fast ? 'fast' : 'full')}`,
        `- profiles: ${result.options.profiles.join(',')}`,
        `- totalCandidates: ${result.totalCandidates}`,
        '',
        '| candidate | weighted | min | avgTurns | exhausted |',
        '| --- | ---: | ---: | ---: | ---: |',
    ];
    for (const entry of result.top) {
        lines.push(`| ${entry.name} | ${(entry.weightedWinRate * 100).toFixed(1)}% | ${(entry.minWinRate * 100).toFixed(1)}% | ${entry.averageTurns.toFixed(1)} | ${entry.exhausted} |`);
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const result = searchTopTier(options);
    if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (options.format === 'markdown' || options.format === 'md') {
        console.log(renderMarkdown(result));
        return;
    }
    console.log(renderText(result));
}

if (require.main === module) {
    main();
}

module.exports = {
    evaluateCandidate,
    parseArgs,
    rankCandidates,
    renderMarkdown,
    renderText,
    searchTopTier,
    summarizeProfileResults,
};
