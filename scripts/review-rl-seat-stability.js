'use strict';

const fs = require('fs');
const path = require('path');

function parseList(value) {
    return String(value || '').split(',').map(entry => entry.trim()).filter(Boolean);
}

function parseArgs(argv) {
    const args = { inputs: [], output: '', format: 'text' };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--inputs') args.inputs = parseList(argv[++index]);
        else if (arg === '--output') args.output = argv[++index] || '';
        else if (arg === '--format') args.format = argv[++index] || args.format;
    }
    return args;
}

function loadEvaluationFiles(inputPaths) {
    return inputPaths.map(inputPath => ({
        inputPath,
        results: JSON.parse(fs.readFileSync(inputPath, 'utf8')),
    }));
}

function addArrays(target, values) {
    for (let index = 0; index < values.length; index++) {
        target[index] = (target[index] || 0) + (values[index] || 0);
    }
}

function seatRange(seatRates) {
    if (seatRates.length === 0) return { min: 0, max: 0, gap: 0 };
    const min = Math.min(...seatRates);
    const max = Math.max(...seatRates);
    return { min, max, gap: max - min };
}

function requireSeatCounts(summary, label) {
    const games = summary && summary.rlSeatGamesByIndex;
    const wins = summary && summary.rlSeatWinsByIndex;
    if (!Array.isArray(games) || !Array.isArray(wins) || games.length === 0 || games.length !== wins.length) {
        throw new Error(`${label}: seat game/win counts are required`);
    }
    return { games, wins };
}

function buildSeatStabilityReport(documents) {
    const groups = new Map();
    const seeds = new Set();
    for (const document of documents || []) {
        for (const result of document.results || []) {
            const seed = result && result.evaluationConfig && result.evaluationConfig.seed;
            if (Number.isInteger(seed)) seeds.add(seed);
            for (const summary of result.summaries || []) {
                const lineup = Array.isArray(summary.lineup) ? summary.lineup : [];
                const label = `${result.id || 'unknown'}:${lineup.join('+') || summary.opponent || 'unknown'}`;
                const counts = requireSeatCounts(summary, label);
                const key = `${result.id || 'unknown'}\n${lineup.join('+')}`;
                if (!groups.has(key)) {
                    groups.set(key, {
                        modelId: result.id || 'unknown',
                        lineup,
                        games: 0,
                        rlWins: 0,
                        exhausted: 0,
                        buildTotal: 0,
                        buildPass: 0,
                        seatGames: [],
                        seatWins: [],
                        seedRates: [],
                    });
                }
                const group = groups.get(key);
                group.games += summary.games || 0;
                group.rlWins += summary.rlWins || 0;
                group.exhausted += summary.exhausted || 0;
                group.buildTotal += summary.rlBuildStats && summary.rlBuildStats.total || 0;
                group.buildPass += summary.rlBuildStats && summary.rlBuildStats.pass || 0;
                addArrays(group.seatGames, counts.games);
                addArrays(group.seatWins, counts.wins);
                const rates = counts.games.map((games, index) => games > 0 ? counts.wins[index] / games : 0);
                group.seedRates.push({ seed, winRate: summary.rlWinRate || 0, seatGap: seatRange(rates).gap });
            }
        }
    }
    const lineups = [...groups.values()].map(group => {
        const seatWinRates = group.seatGames.map((games, index) => games > 0 ? (group.seatWins[index] || 0) / games : 0);
        return {
            modelId: group.modelId,
            lineup: group.lineup,
            games: group.games,
            rlWins: group.rlWins,
            winRate: group.games > 0 ? group.rlWins / group.games : 0,
            exhausted: group.exhausted,
            buildPassRate: group.buildTotal > 0 ? group.buildPass / group.buildTotal : 0,
            seatGames: group.seatGames,
            seatWins: group.seatWins,
            seatWinRates,
            seatRange: seatRange(seatWinRates),
            seedRates: group.seedRates.sort((a, b) => (a.seed || 0) - (b.seed || 0)),
        };
    }).sort((a, b) => a.lineup.join('+').localeCompare(b.lineup.join('+')));
    return {
        sourceFiles: (documents || []).map(document => path.basename(document.inputPath || '')),
        seeds: [...seeds].sort((a, b) => a - b),
        lineups,
        maxSeatGap: lineups.reduce((max, lineup) => Math.max(max, lineup.seatRange.gap), 0),
        totalExhausted: lineups.reduce((total, lineup) => total + lineup.exhausted, 0),
        maxBuildPassRate: lineups.reduce((max, lineup) => Math.max(max, lineup.buildPassRate), 0),
        minGamesPerSeat: lineups.reduce((min, lineup) => Math.min(min, ...lineup.seatGames), Infinity),
    };
}

function renderText(report) {
    const minGames = Number.isFinite(report.minGamesPerSeat) ? report.minGamesPerSeat : 0;
    const lines = [
        `seeds=${report.seeds.join(',')} lineups=${report.lineups.length} minGamesPerSeat=${minGames} ` +
        `maxSeatGap=${(report.maxSeatGap * 100).toFixed(1)}pt exhausted=${report.totalExhausted} ` +
        `maxPass=${(report.maxBuildPassRate * 100).toFixed(2)}%`,
    ];
    for (const lineup of report.lineups) {
        lines.push(
            `${lineup.lineup.join('+')}: win=${(lineup.winRate * 100).toFixed(1)}% games=${lineup.games} ` +
            `seat(${lineup.seatWinRates.map((rate, index) => `${index}=${(rate * 100).toFixed(1)}%/${lineup.seatGames[index]}`).join(',')}) ` +
            `gap=${(lineup.seatRange.gap * 100).toFixed(1)}pt exhausted=${lineup.exhausted} ` +
            `pass=${(lineup.buildPassRate * 100).toFixed(2)}%`
        );
    }
    return lines.join('\n');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const report = buildSeatStabilityReport(loadEvaluationFiles(args.inputs));
    if (args.output) fs.writeFileSync(args.output, JSON.stringify(report, null, 2), 'utf8');
    if (args.format === 'json') console.log(JSON.stringify(report, null, 2));
    else console.log(renderText(report));
}

module.exports = {
    parseArgs,
    loadEvaluationFiles,
    seatRange,
    buildSeatStabilityReport,
    renderText,
};
