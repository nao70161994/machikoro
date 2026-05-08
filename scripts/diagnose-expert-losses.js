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

function findChosenBuildOption(finalActionDiagnostics) {
    if (!finalActionDiagnostics || !Array.isArray(finalActionDiagnostics.buildOptions)) return null;
    const label = finalActionDiagnostics.buildActionLabel ||
        (finalActionDiagnostics.chosenBuildAction && finalActionDiagnostics.chosenBuildAction.label);
    if (!label) return null;
    return finalActionDiagnostics.buildOptions.find(option => option && option.label === label) || null;
}

const SPECIAL_SPEND_CARD_NAMES = new Set([
    '貸金業',
    '高級フレンチ',
    '会員制BAR',
    'スタジアム',
    'テレビ局',
    'ビジネスセンター',
    '出版社',
    '税務署',
    '改装屋',
    '引越し屋',
    '清掃業',
    '公園',
    'ITベンチャー',
]);

function isSpecialSpendOption(option) {
    return option &&
        option.type === 'card' &&
        SPECIAL_SPEND_CARD_NAMES.has(option.name);
}

function buildFinishDelayTags(option) {
    const preview = option && option.landmarkDelayPreview;
    if (!preview || !preview.wouldTrigger) return [];
    const tags = ['landmark-delay'];
    const hasImmediateDisruption = !!(option.disruptionPreview && option.disruptionPreview.canDelayImmediateWin);
    if (hasImmediateDisruption) tags.push('can-delay-immediate-win');
    else tags.push('no-immediate-disruption');
    if (isSpecialSpendOption(option)) tags.push('special-spend');
    if (preview.remainingLandmarks === 1) tags.push('remaining-one');
    if (preview.nearestLandmark === '空港' && typeof preview.shortfallBefore === 'number' && preview.shortfallBefore <= 6) {
        tags.push('airport-near');
    }
    if (typeof preview.shortfallBefore === 'number' && preview.shortfallBefore <= 6) tags.push('shortfall-before-le6');
    if ((preview.remainingLandmarks === 1 || preview.remainingLandmarks === 2) &&
        typeof preview.shortfallBefore === 'number' &&
        preview.shortfallBefore <= 6 &&
        typeof preview.delayCoins === 'number' &&
        preview.delayCoins > 0) {
        tags.push('strict-delay');
    }
    return tags;
}

function findBestNonDelayOption(finalActionDiagnostics, chosen) {
    if (!finalActionDiagnostics || !Array.isArray(finalActionDiagnostics.buildOptions)) return null;
    return finalActionDiagnostics.buildOptions.find(option =>
        option &&
        option.label !== (chosen && chosen.label) &&
        !(option.landmarkDelayPreview && option.landmarkDelayPreview.wouldTrigger)
    ) || null;
}

function compactBuildOption(option) {
    if (!option) return null;
    return {
        label: option.label || null,
        type: option.type || null,
        name: option.name || null,
        cost: typeof option.cost === 'number' ? option.cost : null,
        score: typeof option.score === 'number' ? option.score : null,
        delayCoins: option.landmarkDelayPreview && typeof option.landmarkDelayPreview.delayCoins === 'number'
            ? option.landmarkDelayPreview.delayCoins
            : null,
    };
}

function collectFinishDelayExamples(losses, limit = 10) {
    const examples = [];
    for (const loss of losses) {
        const diagnostics = loss.finalActionDiagnostics;
        const chosen = findChosenBuildOption(diagnostics);
        const preview = chosen && chosen.landmarkDelayPreview;
        if (!preview || !preview.wouldTrigger) continue;
        const bestNonDelay = findBestNonDelayOption(diagnostics, chosen);
        const scoreGapToBestNonDelay = typeof chosen.score === 'number' &&
            bestNonDelay &&
            typeof bestNonDelay.score === 'number'
            ? chosen.score - bestNonDelay.score
            : null;
        examples.push({
            profile: loss.profile || null,
            game: loss.game || null,
            seed: loss.seed || null,
            turns: loss.turns || null,
            lastExpertAction: loss.lastExpertAction || null,
            chosen: compactBuildOption(chosen),
            bestNonDelay: compactBuildOption(bestNonDelay),
            scoreGapToBestNonDelay,
            remainingLandmarks: preview.remainingLandmarks,
            missingLandmarks: diagnostics && Array.isArray(diagnostics.missingLandmarks) ? diagnostics.missingLandmarks.slice(0, 6) : [],
            nearestLandmark: preview.nearestLandmark || null,
            shortfallBefore: preview.shortfallBefore,
            shortfallAfter: preview.shortfallAfter,
            delayCoins: preview.delayCoins,
            coinsBefore: preview.coinsBefore,
            cardCost: preview.cardCost,
            opponentWinThreats: diagnostics && Array.isArray(diagnostics.opponentWinThreats) ? diagnostics.opponentWinThreats.slice(0, 4) : [],
            disruptionPreview: chosen.disruptionPreview || null,
            reasonTags: buildFinishDelayTags(chosen),
        });
    }
    return examples.sort((a, b) => {
        const aStrict = a.reasonTags.includes('strict-delay') ? 1 : 0;
        const bStrict = b.reasonTags.includes('strict-delay') ? 1 : 0;
        if (aStrict !== bStrict) return bStrict - aStrict;
        const aNoDisruption = a.reasonTags.includes('no-immediate-disruption') ? 1 : 0;
        const bNoDisruption = b.reasonTags.includes('no-immediate-disruption') ? 1 : 0;
        if (aNoDisruption !== bNoDisruption) return bNoDisruption - aNoDisruption;
        return (b.delayCoins || 0) - (a.delayCoins || 0);
    }).slice(0, limit);
}

function disruptionOptions(finalActionDiagnostics) {
    if (!finalActionDiagnostics || !Array.isArray(finalActionDiagnostics.buildOptions)) return [];
    return finalActionDiagnostics.buildOptions.filter(option =>
        option &&
        option.disruptionPreview &&
        option.disruptionPreview.canDelayImmediateWin
    );
}

function summarizeMissedImmediateDisruption(losses) {
    const chosenNames = {};
    const missedNames = {};
    const profileNames = {};
    let total = 0;
    let gapLe05 = 0;
    let gapLe1 = 0;
    let chosenAlsoDisrupts = 0;
    let opponentThreatPresent = 0;

    for (const loss of losses) {
        const diagnostics = loss.finalActionDiagnostics;
        const chosen = findChosenBuildOption(diagnostics);
        if (!chosen) continue;
        const missed = disruptionOptions(diagnostics)
            .filter(option => option.label !== chosen.label)
            .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        if (!missed) continue;
        total++;
        const chosenLabel = chosen.label || loss.lastExpertAction || 'UNKNOWN';
        const missedLabel = missed.label || 'UNKNOWN';
        incrementCount(chosenNames, chosenLabel);
        incrementCount(missedNames, missedLabel);
        incrementCount(profileNames, loss.profile || 'UNKNOWN');
        if (chosen.disruptionPreview && chosen.disruptionPreview.canDelayImmediateWin) chosenAlsoDisrupts++;
        if (diagnostics && Array.isArray(diagnostics.opponentWinThreats) && diagnostics.opponentWinThreats.length > 0) {
            opponentThreatPresent++;
        }
        if (typeof chosen.score === 'number' && typeof missed.score === 'number') {
            const gap = chosen.score - missed.score;
            if (gap <= 0.5) gapLe05++;
            if (gap <= 1) gapLe1++;
        }
    }

    return {
        total,
        gapLe05,
        gapLe1,
        chosenAlsoDisrupts,
        opponentThreatPresent,
        chosenNames: topEntries(chosenNames),
        missedNames: topEntries(missedNames),
        profileNames: topEntries(profileNames),
    };
}

function summarizeFinishDelayActions(losses) {
    const actionNames = {};
    const noImmediateDisruptionActionNames = {};
    const shortfallBeforeLe6ActionNames = {};
    const strictActionNames = {};
    const specialSpendDelayNames = {};
    const specialSpendNoImmediateDisruptionNames = {};
    const nearestLandmarks = {};
    const remainingLandmarks = {};
    let total = 0;
    let canDelayImmediateWin = 0;
    let noImmediateDisruption = 0;
    let shortfallBeforeLe6 = 0;
    let airportNear = 0;
    let remainingOne = 0;
    let remainingOneAirportNear = 0;
    let noImmediateDisruptionAirportNear = 0;
    let strictDelay = 0;
    let strictNoImmediateDisruption = 0;
    let specialSpendDelay = 0;
    let specialSpendDelayNoImmediateDisruption = 0;
    let specialSpendDelayShortfallLe6 = 0;
    let totalDelayCoins = 0;

    for (const loss of losses) {
        const chosen = findChosenBuildOption(loss.finalActionDiagnostics);
        const preview = chosen && chosen.landmarkDelayPreview;
        if (!preview || !preview.wouldTrigger) continue;
        total++;
        const actionLabel = chosen.label || loss.lastExpertAction || 'UNKNOWN';
        incrementCount(actionNames, actionLabel);
        incrementCount(nearestLandmarks, preview.nearestLandmark || 'UNKNOWN');
        incrementCount(remainingLandmarks, String(preview.remainingLandmarks || 'UNKNOWN'));
        const hasImmediateDisruption = !!(chosen.disruptionPreview && chosen.disruptionPreview.canDelayImmediateWin);
        if (hasImmediateDisruption) {
            canDelayImmediateWin++;
        } else {
            noImmediateDisruption++;
            incrementCount(noImmediateDisruptionActionNames, actionLabel);
        }
        const isShortfallBeforeLe6 = typeof preview.shortfallBefore === 'number' && preview.shortfallBefore <= 6;
        if (isShortfallBeforeLe6) {
            shortfallBeforeLe6++;
            incrementCount(shortfallBeforeLe6ActionNames, actionLabel);
        }
        const isAirportNear = preview.nearestLandmark === '空港' &&
            typeof preview.shortfallBefore === 'number' &&
            preview.shortfallBefore <= 6;
        const isRemainingOne = preview.remainingLandmarks === 1;
        const isStrictDelay = (isRemainingOne || preview.remainingLandmarks === 2) &&
            typeof preview.shortfallBefore === 'number' &&
            preview.shortfallBefore <= 6 &&
            typeof preview.delayCoins === 'number' &&
            preview.delayCoins > 0;
        const isSpecialSpend = isSpecialSpendOption(chosen);
        if (isAirportNear) airportNear++;
        if (isRemainingOne) remainingOne++;
        if (isAirportNear && isRemainingOne) remainingOneAirportNear++;
        if (isAirportNear && !hasImmediateDisruption) {
            noImmediateDisruptionAirportNear++;
        }
        if (isStrictDelay) {
            strictDelay++;
            incrementCount(strictActionNames, actionLabel);
            if (!hasImmediateDisruption) strictNoImmediateDisruption++;
        }
        if (isSpecialSpend) {
            specialSpendDelay++;
            incrementCount(specialSpendDelayNames, actionLabel);
            if (!hasImmediateDisruption) {
                specialSpendDelayNoImmediateDisruption++;
                incrementCount(specialSpendNoImmediateDisruptionNames, actionLabel);
            }
            if (isShortfallBeforeLe6) specialSpendDelayShortfallLe6++;
        }
        if (typeof preview.delayCoins === 'number') totalDelayCoins += preview.delayCoins;
    }

    return {
        total,
        canDelayImmediateWin,
        noImmediateDisruption,
        shortfallBeforeLe6,
        airportNear,
        remainingOne,
        remainingOneAirportNear,
        noImmediateDisruptionAirportNear,
        strictDelay,
        strictNoImmediateDisruption,
        specialSpendDelay,
        specialSpendDelayNoImmediateDisruption,
        specialSpendDelayShortfallLe6,
        averageDelayCoins: total > 0 ? totalDelayCoins / total : 0,
        actionNames: topEntries(actionNames),
        noImmediateDisruptionActionNames: topEntries(noImmediateDisruptionActionNames),
        shortfallBeforeLe6ActionNames: topEntries(shortfallBeforeLe6ActionNames),
        strictActionNames: topEntries(strictActionNames),
        specialSpendDelayNames: topEntries(specialSpendDelayNames),
        specialSpendNoImmediateDisruptionNames: topEntries(specialSpendNoImmediateDisruptionNames),
        nearestLandmarks: topEntries(nearestLandmarks),
        remainingLandmarks: topEntries(remainingLandmarks),
    };
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
        finishDelayActions: summarizeFinishDelayActions(losses),
        finishDelayExamples: collectFinishDelayExamples(losses),
        missedImmediateDisruption: summarizeMissedImmediateDisruption(losses),
    };
}

function finalActionDiagnosticsFromTrace(expertTrace) {
    if (!Array.isArray(expertTrace) || expertTrace.length <= 0) return null;
    for (let i = expertTrace.length - 1; i >= 0; i--) {
        if (expertTrace[i] && expertTrace[i].buildDiagnostics) {
            return expertTrace[i].buildDiagnostics;
        }
    }
    return null;
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
            includeBuildDiagnostics: true,
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
        const finalActionDiagnostics = finalActionDiagnosticsFromTrace(expertTrace);
        losses.push({
            profile: name,
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
            finalActionDiagnostics,
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
        const finishDelay = entry.summary.finishDelayActions;
        if (finishDelay && finishDelay.total > 0) {
            lines.push(
                `  finishDelayActions=total:${finishDelay.total} noImmediateDisruption:${finishDelay.noImmediateDisruption} ` +
                `canDelayImmediateWin:${finishDelay.canDelayImmediateWin} shortfallBefore<=6:${finishDelay.shortfallBeforeLe6} ` +
                `airportNear:${finishDelay.airportNear} remainingOne:${finishDelay.remainingOne} ` +
                `remainingOneAirportNear:${finishDelay.remainingOneAirportNear} noImmediateDisruptionAirportNear:${finishDelay.noImmediateDisruptionAirportNear} ` +
                `strict:${finishDelay.strictDelay} strictNoDisruption:${finishDelay.strictNoImmediateDisruption} ` +
                `special:${finishDelay.specialSpendDelay} specialNoDisruption:${finishDelay.specialSpendDelayNoImmediateDisruption} ` +
                `specialShortfall<=6:${finishDelay.specialSpendDelayShortfallLe6} ` +
                `avgDelayCoins:${finishDelay.averageDelayCoins.toFixed(2)}`
            );
            lines.push(
                `  finishDelayNames=${finishDelay.actionNames.map(item => `${item.name}:${item.count}`).join(',') || '-'} ` +
                `nearest=${finishDelay.nearestLandmarks.map(item => `${item.name}:${item.count}`).join(',') || '-'} ` +
                `remaining=${finishDelay.remainingLandmarks.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
            );
            lines.push(
                `  finishDelayStrict=${finishDelay.strictActionNames.map(item => `${item.name}:${item.count}`).join(',') || '-'} ` +
                `special=${finishDelay.specialSpendDelayNames.map(item => `${item.name}:${item.count}`).join(',') || '-'} ` +
                `specialNoDisruption=${finishDelay.specialSpendNoImmediateDisruptionNames.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
            );
            const examples = entry.summary.finishDelayExamples || [];
            if (examples.length > 0) {
                lines.push(
                    `  finishDelayExamples=${examples.slice(0, 3).map(example =>
                        `g${example.game || '?'}:${example.lastExpertAction || '?'} delay:${example.delayCoins} ` +
                        `remain:${example.remainingLandmarks} near:${example.nearestLandmark || '?'} tags:${example.reasonTags.join('|')}`
                    ).join(' ; ')}`
                );
            }
        }
        const missedDisruption = entry.summary.missedImmediateDisruption;
        if (missedDisruption && missedDisruption.total > 0) {
            lines.push(
                `  missedImmediateDisruption=total:${missedDisruption.total} gap<=0.5:${missedDisruption.gapLe05} ` +
                `gap<=1:${missedDisruption.gapLe1} chosenAlsoDisrupts:${missedDisruption.chosenAlsoDisrupts} ` +
                `opponentThreat:${missedDisruption.opponentThreatPresent}`
            );
            lines.push(
                `  missedDisruptionNames=missed:${missedDisruption.missedNames.map(item => `${item.name}:${item.count}`).join(',') || '-'} ` +
                `chosen:${missedDisruption.chosenNames.map(item => `${item.name}:${item.count}`).join(',') || '-'} ` +
                `profiles:${missedDisruption.profileNames.map(item => `${item.name}:${item.count}`).join(',') || '-'}`
            );
        }
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
    finalActionDiagnosticsFromTrace,
    findChosenBuildOption,
    collectFinishDelayExamples,
    summarizeMissedImmediateDisruption,
    summarizeFinishDelayActions,
    summarizeLosses,
    toText,
};
