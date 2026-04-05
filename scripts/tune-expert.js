const path = require('path');

const { loadRuntime, runSeries } = require(path.join(__dirname, 'selfplay.js'));

function parseArgs(argv) {
    let games = 8;
    let seed = 1;
    let maxSteps = 5000;
    let basePreset = 'default';
    let top = 5;
    let format = 'text';
    let emitPreset = false;
    let profiles = null;
    let proposePreset = null;
    let evaluateProposal = false;
    let proposalDepth = 1;
    let finalistGames = 0;
    let finalistCount = 0;
    let emitWinners = false;
    const players = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '8', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--base-preset') basePreset = argv[++i] || 'default';
        else if (arg === '--top') top = parseInt(argv[++i] || '5', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--emit-preset') emitPreset = true;
        else if (arg === '--profiles') profiles = (argv[++i] || '').split(',').filter(Boolean);
        else if (arg === '--propose-preset') proposePreset = argv[++i] || 'profileBlend';
        else if (arg === '--evaluate-proposal') evaluateProposal = true;
        else if (arg === '--proposal-depth') proposalDepth = parseInt(argv[++i] || '1', 10);
        else if (arg === '--finalist-games') finalistGames = parseInt(argv[++i] || '0', 10);
        else if (arg === '--finalist-count') finalistCount = parseInt(argv[++i] || '0', 10);
        else if (arg === '--emit-winners') emitWinners = true;
        else players.push(arg);
    }

    return {
        games,
        seed,
        maxSteps,
        basePreset,
        top,
        format,
        emitPreset,
        profiles,
        proposePreset,
        evaluateProposal,
        proposalDepth,
        finalistGames,
        finalistCount,
        emitWinners,
        players: players.length > 0 ? players : ['expert', 'strong', 'strong', 'normal'],
    };
}

function profilePlayers(name) {
    if (name === 'duel') return ['expert', 'strong'];
    if (name === 'trio') return ['expert', 'strong', 'strong'];
    if (name === 'crowd') return ['expert', 'strong', 'strong', 'normal'];
    return ['expert', 'strong', 'strong', 'normal'];
}

function buildCandidateTunings(runtime, basePreset = 'default') {
    const base = runtime.CPU._resolveExpertTuning(basePreset);
    const candidates = [];
    const seen = new Set();
    const addCandidate = (name, tuning) => {
        const key = JSON.stringify(tuning);
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({ name, tuning });
    };

    addCandidate(`${basePreset}:base`, Object.assign({}, base));
    const variations = [
        ['coinWeight', [0.9, 1.1]],
        ['turnWeight', [0.92, 1.08]],
        ['landmarkWeight', [0.9, 1.1]],
        ['builtLandmarkWeight', [0.9, 1.1]],
        ['lateCoinWeight', [0.9, 1.15]],
        ['lateProgressBonus', [0.85, 1.15]],
        ['landmarkActionBonus', [0.9, 1.12]],
        ['lateLandmarkActionBonus', [0.9, 1.15]],
        ['lowValueSpamPenalty', [0.85, 1.15]],
        ['skipPenalty', [0.75, 1.25]],
        ['lookaheadWeight', [0.9, 1.1]],
    ];

    for (const [field, multipliers] of variations) {
        for (const multiplier of multipliers) {
            const tuning = Object.assign({}, base);
            const value = base[field];
            if (typeof value !== 'number') continue;
            tuning[field] = Number((value * multiplier).toFixed(3));
            addCandidate(`${basePreset}:${field}x${multiplier}`, tuning);
        }
    }

    addCandidate(`${basePreset}:landmarkRush`, Object.assign({}, base, {
            landmarkWeight: Number((base.landmarkWeight * 1.12).toFixed(3)),
            lateProgressBonus: Number((base.lateProgressBonus * 1.2).toFixed(3)),
            skipPenalty: Number((base.skipPenalty * 1.2).toFixed(3)),
            landmarkActionBonus: Number((base.landmarkActionBonus * 1.08).toFixed(3)),
        }));
    addCandidate(`${basePreset}:cashTempo`, Object.assign({}, base, {
            coinWeight: Number((base.coinWeight * 1.08).toFixed(3)),
            turnWeight: Number((base.turnWeight * 1.06).toFixed(3)),
            lateCoinWeight: Number((base.lateCoinWeight * 1.12).toFixed(3)),
            lookaheadWeight: Number((base.lookaheadWeight * 0.96).toFixed(3)),
        }));
    addCandidate(`${basePreset}:antiSpamCloser`, Object.assign({}, base, {
            lowValueSpamPenalty: Number((base.lowValueSpamPenalty * 1.2).toFixed(3)),
            landmarkActionBonus: Number((base.landmarkActionBonus * 1.08).toFixed(3)),
            lateLandmarkActionBonus: Number((base.lateLandmarkActionBonus * 1.12).toFixed(3)),
            skipPenalty: Number((base.skipPenalty * 1.1).toFixed(3)),
        }));
    addCandidate(`${basePreset}:tempoCloser`, Object.assign({}, base, {
            turnWeight: Number((base.turnWeight * 1.08).toFixed(3)),
            builtLandmarkWeight: Number((base.builtLandmarkWeight * 1.1).toFixed(3)),
            lookaheadWeight: Number((base.lookaheadWeight * 1.08).toFixed(3)),
            lateProgressBonus: Number((base.lateProgressBonus * 1.12).toFixed(3)),
        }));
    addCandidate(`${basePreset}:patientCloser`, Object.assign({}, base, {
            lateCoinWeight: Number((base.lateCoinWeight * 0.9).toFixed(3)),
            skipPenalty: Number((base.skipPenalty * 1.15).toFixed(3)),
            landmarkActionBonus: Number((base.landmarkActionBonus * 1.12).toFixed(3)),
            lateLandmarkActionBonus: Number((base.lateLandmarkActionBonus * 1.15).toFixed(3)),
        }));

    return candidates;
}

function summarizeCandidate(result, candidate) {
    const totalWins = Object.values(result.wins).reduce((sum, value) => sum + value, 0);
    const expertWins = result.wins.expert || 0;
    return {
        name: candidate.name,
        expertPreset: 'custom',
        tuning: candidate.tuning,
        games: result.games,
        expertWins,
        winRate: totalWins > 0 ? expertWins / totalWins : 0,
        averageTurns: result.averageTurns,
        exhausted: result.exhausted,
        seatWins: result.seatWins.slice(),
    };
}

function tuneExpert(options = {}) {
    const runtime = loadRuntime();
    const candidates = buildCandidateTunings(runtime, options.basePreset || 'default');
    const rankings = candidates.map((candidate, index) => {
        const result = runSeries({
            games: options.games,
            seed: (options.seed || 1) + index * (options.games || 1),
            maxSteps: options.maxSteps,
            players: options.players,
            expertPreset: options.basePreset,
            expertTuning: candidate.tuning,
        });
        return summarizeCandidate(result, candidate);
    }).sort((a, b) =>
        b.winRate - a.winRate ||
        a.exhausted - b.exhausted ||
        a.averageTurns - b.averageTurns ||
        a.name.localeCompare(b.name)
    );

    return {
        basePreset: options.basePreset || 'default',
        games: options.games || 8,
        players: (options.players || ['expert', 'strong', 'strong', 'normal']).slice(),
        rankings,
        top: rankings.slice(0, options.top || 5),
    };
}

function tuneExpertProfiles(options = {}) {
    const profiles = options.profiles || ['duel', 'crowd'];
    return profiles.map((profile, index) => ({
        profile,
        result: tuneExpert(Object.assign({}, options, {
            profiles: null,
            players: profilePlayers(profile),
            seed: (options.seed || 1) + index * 1000,
        })),
    }));
}

function _diffFromBase(base, tuning) {
    const diff = {};
    for (const [key, value] of Object.entries(tuning)) {
        if (base[key] !== value) diff[key] = value;
    }
    return diff;
}

function proposePresetFromProfiles(profileResults, options = {}) {
    const runtime = loadRuntime();
    const basePreset = options.basePreset || 'default';
    const base = runtime.CPU._resolveExpertTuning(basePreset);
    const contributions = {};

    for (const entry of profileResults) {
        const leader = entry.result.top[0];
        if (!leader) continue;
        const diff = _diffFromBase(base, leader.tuning);
        for (const [key, value] of Object.entries(diff)) {
            if (!contributions[key]) contributions[key] = [];
            contributions[key].push(value);
        }
    }

    const tuning = {};
    for (const [key, values] of Object.entries(contributions)) {
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        tuning[key] = Number(average.toFixed(3));
    }

    return {
        name: options.proposePreset || 'profileBlend',
        basePreset,
        tuning,
        profiles: profileResults.map(entry => ({
            profile: entry.profile,
            leader: entry.result.top[0] ? entry.result.top[0].name : null,
        })),
    };
}

function proposePerProfilePresets(profileResults, options = {}) {
    return profileResults.map((entry, index) => {
        const leader = entry.result.top[0];
        const baseName = options.proposePreset || 'profileBlend';
        return {
            profile: entry.profile,
            proposal: proposePresetFromCombo(
                [{ profile: entry.profile, leader }],
                {
                    basePreset: options.basePreset,
                    proposePreset: `${baseName}_${entry.profile}_${index + 1}`,
                }
            ),
        };
    }).filter(entry => entry.proposal && entry.proposal.profiles[0].leader);
}

function enumerateProfileLeaderCombos(profileResults, depth = 1) {
    const limit = Math.max(1, depth || 1);
    const lists = profileResults.map(entry => ({
        profile: entry.profile,
        leaders: (entry.result.top || []).slice(0, limit),
    })).filter(entry => entry.leaders.length > 0);
    const combos = [];

    function walk(index, acc) {
        if (index >= lists.length) {
            combos.push(acc.slice());
            return;
        }
        const entry = lists[index];
        for (const leader of entry.leaders) {
            acc.push({ profile: entry.profile, leader });
            walk(index + 1, acc);
            acc.pop();
        }
    }

    walk(0, []);
    return combos;
}

function proposePresetFromCombo(combo, options = {}) {
    const runtime = loadRuntime();
    const basePreset = options.basePreset || 'default';
    const base = runtime.CPU._resolveExpertTuning(basePreset);
    const contributions = {};

    for (const entry of combo) {
        const diff = _diffFromBase(base, entry.leader.tuning);
        for (const [key, value] of Object.entries(diff)) {
            if (!contributions[key]) contributions[key] = [];
            contributions[key].push(value);
        }
    }

    const tuning = {};
    for (const [key, values] of Object.entries(contributions)) {
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        tuning[key] = Number(average.toFixed(3));
    }

    return {
        name: options.proposePreset || 'profileBlend',
        basePreset,
        tuning,
        profiles: combo.map(entry => ({
            profile: entry.profile,
            leader: entry.leader.name,
        })),
    };
}

function evaluateProposalAgainstBase(proposal, options = {}) {
    const profiles = options.profiles || ['duel', 'crowd'];
    return profiles.map((profile, index) => {
        const players = profilePlayers(profile);
        const seed = (options.seed || 1) + index * 2000;
        const baseResult = runSeries({
            games: options.games,
            seed,
            maxSteps: options.maxSteps,
            players,
            expertPreset: proposal.basePreset,
        });
        const proposalResult = runSeries({
            games: options.games,
            seed,
            maxSteps: options.maxSteps,
            players,
            expertPreset: proposal.basePreset,
            expertTuning: proposal.tuning,
        });
        const baseWins = baseResult.wins.expert || 0;
        const proposalWins = proposalResult.wins.expert || 0;
        return {
            profile,
            players,
            basePreset: proposal.basePreset,
            proposalName: proposal.name,
            baseWins,
            proposalWins,
            winDelta: proposalWins - baseWins,
            baseAverageTurns: baseResult.averageTurns,
            proposalAverageTurns: proposalResult.averageTurns,
            exhaustedDelta: proposalResult.exhausted - baseResult.exhausted,
        };
    });
}

function rankProposalsFromProfiles(profileResults, options = {}) {
    const combos = enumerateProfileLeaderCombos(profileResults, options.proposalDepth || 1);
    return combos.map((combo, index) => {
        const proposal = proposePresetFromCombo(combo, {
            basePreset: options.basePreset,
            proposePreset: `${options.proposePreset || 'profileBlend'}${index + 1}`,
        });
        const evaluation = evaluateProposalAgainstBase(proposal, options);
        const totalWinDelta = evaluation.reduce((sum, entry) => sum + entry.winDelta, 0);
        const totalTurnDelta = evaluation.reduce((sum, entry) => sum + (entry.proposalAverageTurns - entry.baseAverageTurns), 0);
        return {
            proposal,
            evaluation,
            totalWinDelta,
            totalTurnDelta,
        };
    }).sort((a, b) =>
        b.totalWinDelta - a.totalWinDelta ||
        a.totalTurnDelta - b.totalTurnDelta ||
        a.proposal.name.localeCompare(b.proposal.name)
    );
}

function runFinalistPlayoff(rankings, options = {}) {
    const finalistCount = Math.max(0, options.finalistCount || 0);
    const finalistGames = Math.max(0, options.finalistGames || 0);
    if (finalistCount <= 0 || finalistGames <= 0) return [];
    const finalists = rankings.slice(0, finalistCount);
    return finalists.map((entry, index) => {
        const evaluation = evaluateProposalAgainstBase(entry.proposal, Object.assign({}, options, {
            games: finalistGames,
            seed: (options.seed || 1) + 5000 + index * 500,
        }));
        const totalWinDelta = evaluation.reduce((sum, item) => sum + item.winDelta, 0);
        const totalTurnDelta = evaluation.reduce((sum, item) => sum + (item.proposalAverageTurns - item.baseAverageTurns), 0);
        return {
            proposal: entry.proposal,
            evaluation,
            totalWinDelta,
            totalTurnDelta,
        };
    }).sort((a, b) =>
        b.totalWinDelta - a.totalWinDelta ||
        a.totalTurnDelta - b.totalTurnDelta ||
        a.proposal.name.localeCompare(b.proposal.name)
    );
}

function selectWinningFinalists(finalists) {
    return finalists.filter(entry => entry.totalWinDelta > 0);
}

function formatPresetObject(name, tuning) {
    const entries = Object.entries(tuning)
        .map(([key, value]) => `    ${key}: ${typeof value === 'number' ? value : JSON.stringify(value)},`)
        .join('\n');
    return `${name}: {\n${entries}\n},`;
}

function printTuningResults(result, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`basePreset=${result.basePreset} games=${result.games} players=${result.players.join(',')}`);
    for (const entry of result.top) {
        console.log(
            `${entry.name} winRate=${(entry.winRate * 100).toFixed(1)}% expertWins=${entry.expertWins}/${entry.games} averageTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted}`
        );
        if (options.emitPreset) {
            const presetName = entry.name.replace(/[^a-zA-Z0-9]+/g, '_');
            console.log(formatPresetObject(presetName, entry.tuning));
        }
    }
}

function printProfileResults(results, options = {}) {
    if (options.format === 'json') {
        const output = { results };
        if (options.proposePreset) {
            output.proposal = proposePresetFromProfiles(results, options);
            if (options.evaluateProposal) {
                output.evaluation = evaluateProposalAgainstBase(output.proposal, options);
                if ((options.proposalDepth || 1) > 1) {
                    output.proposalRankings = rankProposalsFromProfiles(results, options);
                    if ((options.finalistGames || 0) > 0 && (options.finalistCount || 0) > 0) {
                        output.finalists = runFinalistPlayoff(output.proposalRankings, options);
                        if (options.emitWinners) {
                            output.winners = selectWinningFinalists(output.finalists);
                        }
                    }
                }
            }
        }
        console.log(JSON.stringify(output, null, 2));
        return;
    }
    for (const entry of results) {
        console.log(`[${entry.profile}]`);
        printTuningResults(entry.result, options);
    }
    if (options.proposePreset) {
        const proposal = proposePresetFromProfiles(results, options);
        console.log('[proposal]');
        console.log(`basePreset=${proposal.basePreset} name=${proposal.name}`);
        for (const profile of proposal.profiles) {
            console.log(`${profile.profile}: ${profile.leader || 'none'}`);
        }
        console.log(formatPresetObject(proposal.name, proposal.tuning));
        if (options.evaluateProposal) {
            console.log('[proposal-evaluation]');
            for (const entry of evaluateProposalAgainstBase(proposal, options)) {
                console.log(
                    `${entry.profile} proposalWins=${entry.proposalWins}/${options.games || 8} baseWins=${entry.baseWins}/${options.games || 8} winDelta=${entry.winDelta} turns=${entry.proposalAverageTurns.toFixed(1)} vs ${entry.baseAverageTurns.toFixed(1)} exhaustedDelta=${entry.exhaustedDelta}`
                );
            }
            if ((options.proposalDepth || 1) > 1) {
                console.log('[proposal-ranking]');
                const rankings = rankProposalsFromProfiles(results, options);
                for (const ranked of rankings) {
                    console.log(
                        `${ranked.proposal.name} totalWinDelta=${ranked.totalWinDelta} totalTurnDelta=${ranked.totalTurnDelta.toFixed(1)} leaders=${ranked.proposal.profiles.map(entry => `${entry.profile}:${entry.leader}`).join(',')}`
                    );
                }
                if ((options.finalistGames || 0) > 0 && (options.finalistCount || 0) > 0) {
                    console.log('[proposal-finalists]');
                    const finalists = runFinalistPlayoff(rankings, options);
                    for (const finalist of finalists) {
                        console.log(
                            `${finalist.proposal.name} totalWinDelta=${finalist.totalWinDelta} totalTurnDelta=${finalist.totalTurnDelta.toFixed(1)} games=${options.finalistGames}`
                        );
                    }
                    if (options.emitWinners) {
                        console.log('[proposal-winners]');
                        const winners = selectWinningFinalists(finalists);
                        if (winners.length === 0) {
                            console.log('none');
                        }
                        for (const winner of winners) {
                            console.log(formatPresetObject(winner.proposal.name, winner.proposal.tuning));
                        }
                    }
                }
            }
        }
    }
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    if (options.profiles && options.profiles.length > 0) {
        printProfileResults(tuneExpertProfiles(options), options);
    } else {
        printTuningResults(tuneExpert(options), options);
    }
}

module.exports = {
    parseArgs,
    buildCandidateTunings,
    formatPresetObject,
    profilePlayers,
    enumerateProfileLeaderCombos,
    proposePresetFromProfiles,
    proposePerProfilePresets,
    proposePresetFromCombo,
    evaluateProposalAgainstBase,
    rankProposalsFromProfiles,
    runFinalistPlayoff,
    selectWinningFinalists,
    tuneExpert,
    tuneExpertProfiles,
};
