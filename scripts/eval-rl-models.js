const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const {
    evaluateRlVsJs,
    assertRlModelLineupCompatible,
    summarizeEvaluationEntry,
} = require('./eval-rl-vs-js.js');
const {
    parseIntegerList,
    parseIntegerOrDefault,
    parseLineups,
    parseList,
} = require('./cli-args.js');
const { loadRegistry } = require('./validate-rl-registry.js');
const { makeGameRuntimeLoader } = require('../server/gameRuntimeLoader.js');

let strategyCardCatalog = null;

function loadStrategyCardCatalog() {
    if (strategyCardCatalog) return strategyCardCatalog;
    const runtime = makeGameRuntimeLoader({ baseDir: path.join(__dirname, '..') })();
    strategyCardCatalog = new Map((runtime.CARDS || []).map(card => [card.name, card]));
    return strategyCardCatalog;
}

function parseNumberList(value) {
    return parseIntegerList(value, { min: 1 });
}

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        models: [],
        runLabels: [],
        modelPaths: [],
        games: 50,
        seed: 1,
        maxSteps: 5000,
        rank: 1,
        runRanks: [],
        opponents: ['weak', 'normal', 'strong'],
        lineups: [],
        format: 'text',
        output: '',
        csv: '',
        markdown: '',
        reuseResults: '',
        independentSeeds: false,
        pairedSeats: false,
        allowSmoke: false,
        progressEvery: 0,
        parallelModels: 1,
        abortOnExhaustion: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--models') args.models = parseList(argv[++i]);
        else if (arg === '--run-labels') args.runLabels = parseList(argv[++i]);
        else if (arg === '--model-paths') args.modelPaths = parseList(argv[++i]);
        else if (arg === '--games') args.games = parseIntegerOrDefault(argv[++i], args.games);
        else if (arg === '--seed') args.seed = parseIntegerOrDefault(argv[++i], args.seed);
        else if (arg === '--max-steps') args.maxSteps = parseIntegerOrDefault(argv[++i], args.maxSteps);
        else if (arg === '--rank') args.rank = parseIntegerOrDefault(argv[++i], args.rank);
        else if (arg === '--run-ranks') args.runRanks = parseNumberList(argv[++i]);
        else if (arg === '--opponents') args.opponents = parseList(argv[++i]);
        else if (arg === '--lineups') args.lineups = parseLineups(argv[++i]);
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
        else if (arg === '--csv') args.csv = argv[++i] || '';
        else if (arg === '--markdown') args.markdown = argv[++i] || '';
        else if (arg === '--reuse-results') args.reuseResults = argv[++i] || '';
        else if (arg === '--independent-seeds') args.independentSeeds = true;
        else if (arg === '--paired-seats') args.pairedSeats = true;
        else if (arg === '--allow-smoke') args.allowSmoke = true;
        else if (arg === '--progress-every') args.progressEvery = parseIntegerOrDefault(argv[++i], 0);
        else if (arg === '--parallel-models') args.parallelModels = parseIntegerOrDefault(argv[++i], 1);
        else if (arg === '--abort-on-exhaustion') args.abortOnExhaustion = true;
    }
    return args;
}

function evaluationPlayerCounts(args = {}) {
    if (Array.isArray(args.lineups) && args.lineups.length > 0) {
        return [...new Set(args.lineups.map(lineup => Array.isArray(lineup) ? lineup.length : 0).filter(count => count > 0))];
    }
    return [2];
}

function recommendedEntryPlayerRange(entry, model = null) {
    const role = String(entry && entry.role || '');
    const trainingPlayers = model && model.training && Number.isInteger(model.training.players) ? model.training.players : 0;
    let minPlayers = 1;
    let maxPlayers = 10;
    if (/\b2p\b/.test(role)) maxPlayers = 2;
    if (/\b(?:3p|4p|5p|10p|multiplayer)/i.test(role) || trainingPlayers >= 3) minPlayers = 3;
    return { minPlayers, maxPlayers };
}

function rangeAllowsAnyPlayerCount(range, playerCounts) {
    return playerCounts.some(count => count >= range.minPlayers && count <= range.maxPlayers);
}

function defaultRegistryModelIds(registry, args = {}) {
    const registryModels = new Map((registry.models || []).map(model => [model.id, model]));
    const playerCounts = evaluationPlayerCounts(args);
    const recommended = (((registry.portfolioPolicy || {}).recommendedActiveModels) || [])
        .filter(entry => entry && entry.id)
        .filter(entry => rangeAllowsAnyPlayerCount(recommendedEntryPlayerRange(entry, registryModels.get(entry.id)), playerCounts))
        .map(entry => entry.id);
    if (recommended.length > 0) return recommended;
    return (registry.models || [])
        .filter(model => model.status === 'adopted' || model.status === 'candidate')
        .map(model => model.id);
}

function assertSafeRunLabel(runLabel) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runLabel || '') || String(runLabel).includes('..')) {
        throw new Error(`unsafe run-label: ${runLabel}`);
    }
    return runLabel;
}

function browserPathForRunLabel(runLabel, rank = 1) {
    const safeRunLabel = assertSafeRunLabel(runLabel);
    const fileName = rank === 1 ? 'best_model.browser.json' : `best_model.top${rank}.browser.json`;
    return path.join('models', 'rl_model', 'runs', safeRunLabel, fileName);
}

function modelIdForPath(modelPath) {
    const parsed = path.parse(modelPath);
    const segments = path.normalize(modelPath).split(path.sep);
    const runsIndex = segments.lastIndexOf('runs');
    if (runsIndex >= 0 && runsIndex + 1 < segments.length) {
        const runLabel = segments[runsIndex + 1];
        const rankMatch = parsed.name.match(/(?:best_)?model\.top([2-9][0-9]*)\.browser$/);
        return rankMatch ? `${runLabel}-top${rankMatch[1]}` : runLabel;
    }
    return parsed.name.replace(/\.browser$/, '') || modelPath;
}

function resolveModelSpecs(args, registry) {
    const registryModels = new Map((registry.models || []).map(model => [model.id, model]));
    const hasExplicitTargets = args.models.length > 0 || args.runLabels.length > 0 || (args.modelPaths || []).length > 0;
    const ids = args.models.length > 0
        ? args.models
        : (hasExplicitTargets ? [] : defaultRegistryModelIds(registry, args));
    const specs = [];

    for (const id of ids) {
        const model = registryModels.get(id);
        if (!model) throw new Error(`registry に model id がありません: ${id}`);
        specs.push({
            id: model.id,
            label: model.style && model.style.label ? model.style.label : model.id,
            path: model.path,
            source: 'registry',
            status: model.status || '',
        });
    }

    const runRanks = args.runRanks && args.runRanks.length > 0 ? args.runRanks : [args.rank];
    for (const runLabel of args.runLabels) {
        for (const rank of runRanks) {
            specs.push({
                id: rank === 1 ? runLabel : `${runLabel}-top${rank}`,
                label: rank === 1 ? runLabel : `${runLabel} top${rank}`,
                path: browserPathForRunLabel(runLabel, rank),
                source: 'run',
                status: '',
            });
        }
    }

    for (const modelPath of args.modelPaths || []) {
        const id = modelIdForPath(modelPath);
        specs.push({
            id,
            label: id,
            path: modelPath,
            source: 'path',
            status: '',
        });
    }

    return specs;
}

function scoreSummaries(summaries) {
    const weights = { weak: 1, normal: 2, strong: 3, expert: 2 };
    let weightedTotal = 0;
    let weightSum = 0;
    for (const summary of summaries) {
        const weight = weights[summary.opponent] || 1;
        weightedTotal += summary.rlWinRate * weight;
        weightSum += weight;
    }
    return weightSum > 0 ? weightedTotal / weightSum : 0;
}

function modelSha256(modelPath) {
    if (!modelPath || !fs.existsSync(modelPath)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex');
}

function collectBuildCounts(summaries, key) {
    const counts = new Map();
    for (const summary of summaries) {
        const entries = summary.rlBuildStats && Array.isArray(summary.rlBuildStats[key])
            ? summary.rlBuildStats[key]
            : [];
        for (const entry of entries) {
            if (!entry || !entry.name) continue;
            counts.set(entry.name, (counts.get(entry.name) || 0) + (entry.count || 0));
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count }));
}

function buildSignature(summaries) {
    const cards = collectBuildCounts(summaries, 'topCards').slice(0, 5);
    const landmarks = collectBuildCounts(summaries, 'topLandmarks').slice(0, 5);
    return {
        cards,
        landmarks,
        cardKey: cards.map(entry => entry.name).join('/'),
        landmarkKey: landmarks.map(entry => entry.name).join('/'),
    };
}

function clampUnit(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function roundMetric(value) {
    return Math.round(value * 10000) / 10000;
}

function buildStrategyProfile(summaries, cardCatalog = loadStrategyCardCatalog()) {
    const totals = {
        decisions: 0,
        passes: 0,
        cardBuilds: 0,
        landmarkBuilds: 0,
        interactionBuilds: 0,
        engineBuilds: 0,
        majorBuilds: 0,
        unknownCardBuilds: 0,
    };
    let weightedTurns = 0;
    let weightedGames = 0;
    for (const summary of summaries || []) {
        const stats = summary && summary.rlBuildStats;
        if (!stats) continue;
        totals.decisions += Number(stats.total) || 0;
        totals.passes += Number(stats.pass) || 0;
        for (const [name, rawCount] of Object.entries(stats.cards || {})) {
            const count = Number(rawCount) || 0;
            if (count <= 0) continue;
            totals.cardBuilds += count;
            const card = cardCatalog.get(name);
            if (!card) {
                totals.unknownCardBuilds += count;
                continue;
            }
            if (card.color === 'red') totals.interactionBuilds += count;
            else if (card.color === 'purple') {
                totals.interactionBuilds += count;
                totals.majorBuilds += count;
            } else {
                totals.engineBuilds += count;
            }
        }
        for (const rawCount of Object.values(stats.landmarks || {})) {
            const count = Number(rawCount) || 0;
            if (count > 0) totals.landmarkBuilds += count;
        }
        const games = Number(summary.games) || 0;
        if (games > 0 && Number.isFinite(summary.averageTurns)) {
            weightedTurns += summary.averageTurns * games;
            weightedGames += games;
        }
    }
    const knownCardBuilds = Math.max(0, totals.cardBuilds - totals.unknownCardBuilds);
    const allBuilds = totals.cardBuilds + totals.landmarkBuilds;
    const averageTurns = weightedGames > 0 ? weightedTurns / weightedGames : 0;
    const axes = {
        interaction: knownCardBuilds > 0 ? totals.interactionBuilds / knownCardBuilds : 0,
        engine: knownCardBuilds > 0 ? totals.engineBuilds / knownCardBuilds : 0,
        landmarkTempo: allBuilds > 0 ? totals.landmarkBuilds / allBuilds : 0,
    };
    const archetypeScores = {
        interaction: axes.interaction / 0.35,
        engine: axes.engine / 0.75,
        landmarkRush: (axes.landmarkTempo / 0.3) * (averageTurns > 0 ? Math.min(1.2, 65 / averageTurns) : 1),
    };
    const normalized = Object.fromEntries(
        Object.entries(archetypeScores).map(([key, value]) => [key, clampUnit(value)])
    );
    const labels = {
        interaction: '対人干渉型',
        engine: '資産エンジン型',
        landmarkRush: 'ランドマーク速攻型',
    };
    const primaryKey = Object.keys(archetypeScores)
        .sort((left, right) => archetypeScores[right] - archetypeScores[left] || left.localeCompare(right))[0];
    return {
        primary: labels[primaryKey],
        axes: Object.fromEntries(Object.entries(axes).map(([key, value]) => [key, roundMetric(value)])),
        normalized: Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, roundMetric(value)])),
        averageTurns: roundMetric(averageTurns),
        totals,
        method: 'observed-build-v1',
    };
}

function summarizeModel(spec, entries, evaluationConfig = {}) {
    const summaries = entries.map(summarizeEvaluationEntry);
    return {
        id: spec.id,
        label: spec.label,
        source: spec.source,
        status: spec.status,
        path: spec.path,
        modelSha256: modelSha256(spec.path),
        score: scoreSummaries(summaries),
        buildSignature: buildSignature(summaries),
        strategyProfile: buildStrategyProfile(summaries),
        evaluationConfig,
        summaries,
    };
}

function sortModelResults(results) {
    return results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function evaluateModelSpec(spec, args, index, evaluator = evaluateRlVsJs) {
    const seed = args.independentSeeds ? args.seed + index * args.games * 10 : args.seed;
    const sharedSeeds = !args.independentSeeds;
    const options = {
        modelPath: spec.path,
        games: args.games,
        seed,
        maxSteps: args.maxSteps,
        opponents: args.opponents,
        lineups: args.lineups,
        sharedSeeds,
        pairedSeats: !!args.pairedSeats,
        progressEvery: args.progressEvery,
        abortOnExhaustion: args.abortOnExhaustion === true,
        onProgress: args.progressEvery > 0
            ? progress => process.stderr.write(
                `[model-eval ${spec.id} ${progress.opponent}] ${progress.completed}/${progress.total} exhausted=${progress.exhausted}\n`
            )
            : null,
    };
    return summarizeModel(spec, evaluator(options), {
        games: args.games,
        seed,
        baseSeed: args.seed,
        maxSteps: args.maxSteps,
        opponents: args.opponents,
        lineups: args.lineups,
        sharedSeeds,
        independentSeeds: !!args.independentSeeds,
        pairedSeats: !!args.pairedSeats,
        abortOnExhaustion: args.abortOnExhaustion === true,
    });
}

function reusableEvaluationConfigMatches(cached, expected) {
    const keys = [
        'games', 'seed', 'baseSeed', 'maxSteps', 'opponents', 'lineups',
        'sharedSeeds', 'independentSeeds', 'pairedSeats', 'abortOnExhaustion',
    ];
    return keys.every(key => JSON.stringify(cached && cached[key]) === JSON.stringify(expected && expected[key]));
}

function reusableResultsFromFile(filePath) {
    if (!filePath) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) throw new TypeError('reuse results must be a JSON array');
    return parsed;
}

function findReusableModelResult(spec, args, index, entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const expectedHash = modelSha256(spec.path);
    if (!expectedHash) return null;
    const seed = args.independentSeeds ? args.seed + index * args.games * 10 : args.seed;
    const expectedConfig = {
        games: args.games,
        seed,
        baseSeed: args.seed,
        maxSteps: args.maxSteps,
        opponents: args.opponents,
        lineups: args.lineups,
        sharedSeeds: !args.independentSeeds,
        independentSeeds: !!args.independentSeeds,
        pairedSeats: !!args.pairedSeats,
        abortOnExhaustion: args.abortOnExhaustion === true,
    };
    const canonicalPath = path.resolve(spec.path);
    const reusable = entries.find(entry =>
        entry &&
        path.resolve(entry.path || '') === canonicalPath &&
        entry.modelSha256 === expectedHash &&
        reusableEvaluationConfigMatches(entry.evaluationConfig, expectedConfig) &&
        Array.isArray(entry.summaries) &&
        entry.summaries.length === (args.lineups.length || args.opponents.length) &&
        entry.summaries.every(summary => Number(summary && summary.games) === args.games)
    );
    return reusable ? {
        ...reusable,
        id: spec.id,
        label: spec.label,
        source: spec.source,
        status: spec.status,
        path: spec.path,
        reusedFrom: args.reuseResults,
    } : null;
}

function logReusableModelResult(result) {
    process.stderr.write(
        `[model-eval ${result.id}] reused=${result.reusedFrom} sha256=${result.modelSha256}\n`
    );
    return result;
}

function evaluateModelSpecs(specs, args, evaluator = evaluateRlVsJs) {
    assertRlModelLineupCompatible(null, args.lineups, 'eval-rl-models');
    const reusable = reusableResultsFromFile(args.reuseResults);
    return sortModelResults(specs.map((spec, index) => {
        const cached = findReusableModelResult(spec, args, index, reusable);
        return cached ? logReusableModelResult(cached) : evaluateModelSpec(spec, args, index, evaluator);
    }));
}

function evaluateModelSpecsParallel(specs, args, workerLimit = args.parallelModels) {
    assertRlModelLineupCompatible(null, args.lineups, 'eval-rl-models');
    const limit = Math.max(1, Math.min(specs.length, Number.isSafeInteger(workerLimit) ? workerLimit : 1));
    if (limit <= 1 || specs.length <= 1) return Promise.resolve(evaluateModelSpecs(specs, args));
    const reusable = reusableResultsFromFile(args.reuseResults);
    return new Promise((resolve, reject) => {
        const results = new Array(specs.length);
        const workers = new Set();
        let nextIndex = 0;
        let completed = 0;
        let settled = false;

        for (let index = 0; index < specs.length; index++) {
            const result = findReusableModelResult(specs[index], args, index, reusable);
            if (!result) continue;
            results[index] = logReusableModelResult(result);
            completed++;
        }
        if (completed === specs.length) {
            resolve(sortModelResults(results));
            return;
        }

        const fail = error => {
            if (settled) return;
            settled = true;
            for (const worker of workers) worker.terminate();
            reject(error);
        };
        const launch = () => {
            while (!settled && workers.size < limit && nextIndex < specs.length) {
                const index = nextIndex++;
                if (results[index]) continue;
                const worker = new Worker(__filename, {
                    workerData: { kind: 'rl-model-evaluation', spec: specs[index], args, index },
                });
                workers.add(worker);
                let received = false;
                worker.once('message', message => {
                    received = true;
                    workers.delete(worker);
                    if (!message || message.ok !== true) {
                        fail(new Error(message && message.error || `model evaluation worker ${index} failed`));
                        return;
                    }
                    results[index] = message.result;
                    completed++;
                    if (completed === specs.length) {
                        settled = true;
                        resolve(sortModelResults(results));
                    } else {
                        launch();
                    }
                });
                worker.once('error', fail);
                worker.once('exit', code => {
                    workers.delete(worker);
                    if (!received && code !== 0) fail(new Error(`model evaluation worker ${index} exited with code ${code}`));
                });
            }
        };
        launch();
    });
}

function renderText(results) {
    const lines = [];
    const gate = evaluationGate(results);
    lines.push(`gate=${gate.name} minGames=${gate.minGames === null ? 'n/a' : gate.minGames}` +
        (gate.smokeOnly ? ' note=smokeOnly; not for adoption' : ''));
    for (const [index, result] of results.entries()) {
        lines.push(`${index + 1}. ${result.id} score=${(result.score * 100).toFixed(1)}%`);
        if (result.buildSignature && result.buildSignature.cardKey) {
            lines.push(`   style=${result.buildSignature.cardKey}`);
        }
        if (result.strategyProfile) {
            const axes = result.strategyProfile.axes;
            lines.push(`   archetype=${result.strategyProfile.primary} interaction=${(axes.interaction * 100).toFixed(1)}% engine=${(axes.engine * 100).toFixed(1)}% landmark=${(axes.landmarkTempo * 100).toFixed(1)}%`);
        }
        for (const summary of result.summaries) {
            const lineup = Array.isArray(summary.lineup) ? summary.lineup : [];
            const seat = lineup.length > 2 && Array.isArray(summary.rlSeatWinRatesByIndex)
                ? ` seat(${summary.rlSeatWinRatesByIndex.map((rate, index) => `${index}=${(rate * 100).toFixed(1)}%`).join(',')})` +
                    (summary.rlSeatWinRateRange ? ` seatGap=${(summary.rlSeatWinRateRange.gap * 100).toFixed(1)}pt` : '')
                : '';
            const players = lineup.length > 0 ? ` players=${lineup.length}` : '';
            lines.push(
                `   ${summary.opponent}: win=${(summary.rlWinRate * 100).toFixed(1)}% ` +
                `games=${summary.games}${players}${seat} avgTurns=${summary.averageTurns.toFixed(1)} exhausted=${summary.exhausted || 0} pass=` +
                `${summary.rlBuildStats ? (summary.rlBuildStats.passRate * 100).toFixed(1) : 'n/a'}%`
            );
            if (summary.rlBusinessStats && summary.rlBusinessStats.total > 0) {
                lines.push(
                    `      business=${summary.rlBusinessStats.total} skip=` +
                    `${(summary.rlBusinessStats.skipRate * 100).toFixed(1)}%`
                );
            }
        }
    }
    return lines.join('\n');
}

function renderCsv(results) {
    const rows = ['rank,id,score,strategyPrimary,interactionShare,engineShare,landmarkTempo,buildSignatureCards,buildSignatureLandmarks,opponent,games,winRate,seatMinWinRate,seatMaxWinRate,seatGap,avgTurns,exhausted,exhaustedRate,passRate,businessTotal,businessSkipRate,businessGive,businessTake,businessExchanges,topCards,topLandmarks'];
    for (const [index, result] of results.entries()) {
        const profile = result.strategyProfile;
        const signatureCards = result.buildSignature
            ? result.buildSignature.cards.map(entry => `${entry.name}x${entry.count}`).join('|')
            : '';
        const signatureLandmarks = result.buildSignature
            ? result.buildSignature.landmarks.map(entry => `${entry.name}x${entry.count}`).join('|')
            : '';
        for (const summary of result.summaries) {
            const build = summary.rlBuildStats;
            const business = summary.rlBusinessStats;
            const businessGive = business ? business.topGiveCards.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const businessTake = business ? business.topTakeCards.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const businessExchanges = business ? business.topExchanges.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const topCards = build ? build.topCards.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            const topLandmarks = build ? build.topLandmarks.map(entry => `${entry.name}x${entry.count}`).join('|') : '';
            rows.push([
                index + 1,
                result.id,
                result.score.toFixed(6),
                profile ? profile.primary : '',
                profile ? profile.axes.interaction.toFixed(6) : '',
                profile ? profile.axes.engine.toFixed(6) : '',
                profile ? profile.axes.landmarkTempo.toFixed(6) : '',
                `"${signatureCards.replace(/"/g, '""')}"`,
                `"${signatureLandmarks.replace(/"/g, '""')}"`,
                summary.opponent,
                summary.games,
                summary.rlWinRate.toFixed(6),
                summary.rlSeatWinRateRange ? summary.rlSeatWinRateRange.min.toFixed(6) : '',
                summary.rlSeatWinRateRange ? summary.rlSeatWinRateRange.max.toFixed(6) : '',
                summary.rlSeatWinRateRange ? summary.rlSeatWinRateRange.gap.toFixed(6) : '',
                summary.averageTurns.toFixed(3),
                summary.exhausted || 0,
                summary.games > 0 ? ((summary.exhausted || 0) / summary.games).toFixed(6) : '',
                build ? build.passRate.toFixed(6) : '',
                business ? business.total : '',
                business ? business.skipRate.toFixed(6) : '',
                `"${businessGive.replace(/"/g, '""')}"`,
                `"${businessTake.replace(/"/g, '""')}"`,
                `"${businessExchanges.replace(/"/g, '""')}"`,
                `"${topCards.replace(/"/g, '""')}"`,
                `"${topLandmarks.replace(/"/g, '""')}"`,
            ].join(','));
        }
    }
    return rows.join('\n') + '\n';
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function evaluationGate(results, minGamesPerLineup = 50) {
    const games = [];
    for (const result of results || []) {
        for (const summary of result.summaries || []) {
            if (Number.isFinite(summary.games)) games.push(summary.games);
        }
    }
    const minGames = games.length > 0 ? Math.min(...games) : null;
    const candidateReady = minGames !== null && minGames >= minGamesPerLineup;
    const mainSampleReady = minGames !== null && minGames >= 100;
    const exhaustedGames = (results || []).reduce((total, result) => total + (result.summaries || []).reduce((
        (subtotal, summary) => subtotal + Math.max(0, Number(summary.exhausted) || 0)
    ), 0), 0);
    const runtimeStable = exhaustedGames === 0;
    const pairedSeats = (results || []).length > 0 && (results || []).every(result => (
        result && result.evaluationConfig && result.evaluationConfig.pairedSeats === true
    ));
    const mainAdoptionReady = mainSampleReady && pairedSeats && runtimeStable;
    const highConfidence = minGames !== null && minGames >= 300 && pairedSeats && runtimeStable;
    const smokeOnly = !candidateReady;
    return {
        minGames,
        smokeOnly,
        candidateReady,
        mainSampleReady,
        pairedSeats,
        exhaustedGames,
        runtimeStable,
        mainAdoptionReady,
        highConfidence,
        name: smokeOnly
            ? 'smokeOnly'
            : !runtimeStable
            ? 'runtimeUnstable'
            : highConfidence
            ? 'highConfidence'
            : mainAdoptionReady
            ? 'mainAdoptionReview'
            : 'candidateGate',
    };
}

function renderMarkdown(results) {
    const gate = evaluationGate(results);
    const lines = [
        `- gate: ${gate.name}`,
        `- minGames: ${gate.minGames === null ? 'n/a' : gate.minGames}`,
        gate.smokeOnly
            ? '- note: smokeOnly results are not adoption candidates.'
            : !gate.runtimeStable
            ? '- note: step exhaustion occurred; resolve it before adoption.'
            : gate.highConfidence
            ? '- note: meets the 300-game high-confidence review threshold.'
            : gate.mainAdoptionReady
            ? '- note: meets the 100-game main adoption review threshold.'
            : gate.mainSampleReady
            ? '- note: sample size is sufficient, but paired-seat evaluation is still required before main adoption.'
            : '- note: meets the 50-game candidate gate; run at least 100 games before main adoption.',
        '',
        '| rank | id | score | archetype | style | opponents | seat gap | pass | avgTurns |',
        '|---:|---|---:|---|---|---|---|---|---|',
    ];
    for (const [index, result] of results.entries()) {
        const style = result.buildSignature && result.buildSignature.cardKey
            ? result.buildSignature.cardKey
            : '';
        const opponents = result.summaries.map(summary => (
            `${summary.opponent} ${formatPercent(summary.rlWinRate)}`
        )).join('<br>');
        const pass = result.summaries.map(summary => (
            `${summary.opponent} ` +
            `${summary.rlBuildStats ? formatPercent(summary.rlBuildStats.passRate) : 'n/a'}`
        )).join('<br>');
        const seatGap = result.summaries.map(summary => (
            `${summary.opponent} ` +
            `${summary.rlSeatWinRateRange ? `${(summary.rlSeatWinRateRange.gap * 100).toFixed(1)}pt` : 'n/a'}`
        )).join('<br>');
        const avgTurns = result.summaries.map(summary => (
            `${summary.opponent} ${summary.averageTurns.toFixed(1)}`
        )).join('<br>');
        lines.push([
            index + 1,
            `\`${result.id}\``,
            formatPercent(result.score),
            result.strategyProfile ? result.strategyProfile.primary : '',
            style,
            opponents,
            seatGap,
            pass,
            avgTurns,
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    return lines.join('\n') + '\n';
}

function assertEvaluationGateAllowsOutput(results, args = {}) {
    const gate = evaluationGate(results);
    if (gate.smokeOnly && !args.allowSmoke) {
        throw new Error(`短期評価(smokeOnly)は採用artifactとして出力できません: minGames=${gate.minGames === null ? 'n/a' : gate.minGames}. --allow-smoke を明示してください。`);
    }
    return gate;
}

function writeOutputs(results, args) {
    assertEvaluationGateAllowsOutput(results, args);
    if (args.output) fs.writeFileSync(args.output, JSON.stringify(results, null, 2), 'utf8');
    if (args.csv) fs.writeFileSync(args.csv, renderCsv(results), 'utf8');
    if (args.markdown) fs.writeFileSync(args.markdown, renderMarkdown(results), 'utf8');
}

if (!isMainThread && workerData && workerData.kind === 'rl-model-evaluation') {
    try {
        const result = evaluateModelSpec(workerData.spec, workerData.args, workerData.index);
        parentPort.postMessage({ ok: true, result });
    } catch (error) {
        parentPort.postMessage({ ok: false, error: error && error.stack || String(error) });
        process.exitCode = 1;
    }
} else if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const registry = loadRegistry(args.registryPath);
    evaluateModelSpecsParallel(resolveModelSpecs(args, registry), args).then(results => {
        writeOutputs(results, args);
        if (args.format === 'json') console.log(JSON.stringify(results, null, 2));
        else console.log(renderText(results));
    }).catch(error => {
        console.error(error && error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    parseArgs,
    parseLineups,
    parseNumberList,
    assertRlModelLineupCompatible,
    defaultRegistryModelIds,
    assertSafeRunLabel,
    browserPathForRunLabel,
    modelIdForPath,
    resolveModelSpecs,
    scoreSummaries,
    modelSha256,
    reusableEvaluationConfigMatches,
    reusableResultsFromFile,
    findReusableModelResult,
    logReusableModelResult,
    buildSignature,
    buildStrategyProfile,
    summarizeModel,
    sortModelResults,
    evaluateModelSpec,
    evaluateModelSpecs,
    evaluateModelSpecsParallel,
    evaluationGate,
    assertEvaluationGateAllowsOutput,
    renderText,
    renderCsv,
    renderMarkdown,
    writeOutputs,
};
