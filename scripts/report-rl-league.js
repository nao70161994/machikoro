'use strict';

/**
 * Aggregate paired-seat tournament results from eval-rl-head-to-head.js.
 * A "win rate" here is conditional on a trained AI winning; rule-based
 * opponents can win multiplayer games and are counted separately.
 */
const fs = require('fs');
const path = require('path');

function modelName(file) {
    return path.basename(String(file || '')).replace(/\.browser\.json$/, '');
}
function sumObject(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
        if (Number.isFinite(value)) target[key] = (target[key] || 0) + value;
    }
}
function topCards(cards, n = 5) {
    return Object.entries(cards || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}
function cardDistribution(stats) {
    const total = Object.values(stats.cards).reduce((sum, v) => sum + v, 0);
    return total ? Object.fromEntries(Object.entries(stats.cards).map(([key, v]) => [key, v / total])) : {};
}
function jensenShannon(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let value = 0;
    for (const key of keys) {
        const x = a[key] || 0, y = b[key] || 0, m = (x + y) / 2;
        if (x) value += x * Math.log2(x / m) / 2;
        if (y) value += y * Math.log2(y / m) / 2;
    }
    return value;
}
function wilson(wins, games, z = 1.96) {
    if (games <= 0) return { low: 0, high: 1 };
    const p = wins / games, z2 = z * z;
    const center = (p + z2 / (2 * games)) / (1 + z2 / games);
    const half = z * Math.sqrt(p * (1 - p) / games + z2 / (4 * games * games)) / (1 + z2 / games);
    return { low: center - half, high: center + half };
}
function calculate(files) {
    const groups = {};
    const pairs = [];
    const seen = new Set();
    for (const entry of files) {
        const r = typeof entry === 'string' ? JSON.parse(fs.readFileSync(entry, 'utf8')) : entry;
        if (!r || !Array.isArray(r.entries) || !r.entries.length || !r.totals) {
            throw Error('invalid head-to-head result');
        }
        const players = r.entries[0].lineup.length;
        if (![2, 4].includes(players)) throw Error('unsupported league player count ' + players);
        if (r.pairedSeats !== true || r.gamesPerLineup % players !== 0) {
            throw Error('league matches must rotate seats evenly');
        }
        if (r.entries.some(e => e.lineup.length !== players || e.exhausted > 0)) {
            throw Error('mixed/incomplete/step-exhausted matchup');
        }
        const a = modelName(r.candidate), b = modelName(r.baseline);
        if (a === b) throw Error('self match not allowed');
        const group = players + 'p';
        const pairKey = [group, ...[a, b].sort()].join(':');
        if (seen.has(pairKey)) throw Error('duplicate matchup ' + pairKey);
        seen.add(pairKey);
        groups[group] ||= {};
        for (const name of [a, b]) {
            groups[group][name] ||= { name, games: 0, wins: 0, opponentWins: 0, cpuWins: 0, cards: {}, landmarks: {}, matchups: 0 };
        }
        const candidate = groups[group][a], baseline = groups[group][b];
        for (const e of r.entries) {
            if (!e.candidateBuildStats || !e.baselineBuildStats) throw Error('missing build statistics');
            if (e.candidateWins + e.baselineWins > e.games) throw Error('invalid win counts');
            candidate.games += e.games;
            baseline.games += e.games;
            candidate.wins += e.candidateWins;
            baseline.wins += e.baselineWins;
            candidate.opponentWins += e.baselineWins;
            baseline.opponentWins += e.candidateWins;
            candidate.cpuWins += e.games - e.candidateWins - e.baselineWins;
            baseline.cpuWins += e.games - e.candidateWins - e.baselineWins;
            sumObject(candidate.cards, e.candidateBuildStats.cards);
            sumObject(baseline.cards, e.baselineBuildStats.cards);
            sumObject(candidate.landmarks, e.candidateBuildStats.landmarks);
            sumObject(baseline.landmarks, e.baselineBuildStats.landmarks);
        }
        candidate.matchups++;
        baseline.matchups++;
        pairs.push({
            group, a, b, games: r.totals.games,
            aWins: r.totals.candidateWins, bWins: r.totals.baselineWins,
            otherWins: r.totals.games - r.totals.candidateWins - r.totals.baselineWins,
        });
    }
    const standings = {};
    const diversity = {};
    for (const [group, members] of Object.entries(groups)) {
        standings[group] = Object.values(members).map(m => ({
            ...m,
            trainedWinShare: m.wins + m.opponentWins > 0 ? m.wins / (m.wins + m.opponentWins) : null,
            overallWinRate: m.games > 0 ? m.wins / m.games : null,
            ci95: wilson(m.wins, m.wins + m.opponentWins),
            topCards: topCards(m.cards),
        })).sort((a, b) => (b.trainedWinShare || 0) - (a.trainedWinShare || 0));
        diversity[group] = [];
        const arr = standings[group];
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                const a = arr[i], b = arr[j];
                const commonTop5 = a.topCards.filter(([name]) => b.topCards.some(([name2]) => name2 === name)).length;
                diversity[group].push({ a: a.name, b: b.name, commonTop5, jsDivergenceBits: jensenShannon(cardDistribution(a), cardDistribution(b)) });
            }
        }
        diversity[group].sort((a, b) => b.jsDivergenceBits - a.jsDivergenceBits);
    }
    return { schema: 1, generatedAt: new Date().toISOString(), pairs, standings, diversity };
}
function formatMarkdown(result) {
    const lines = ['# RL AI league — paired-seat match results', '',
        'Matchup results use paired seats. Win share = AI wins / (both compared AI wins); CPU wins are excluded from that denominator.',
        '95% Wilson intervals are descriptive; paired games are not strictly independent observations.', ''];
    for (const group of Object.keys(result.standings).sort()) {
        lines.push('## ' + group + ' standings', '',
            '| Model | AI win share | AI wins | Opponent AI wins | CPU wins | 95% CI | Top cards |',
            '|---|---:|---:|---:|---:|---:|---|');
        for (const m of result.standings[group]) {
            const pct = n => n === null ? 'n/a' : (n * 100).toFixed(1) + '%';
            lines.push('| ' + m.name + ' | ' + pct(m.trainedWinShare) + ' | ' + m.wins + ' | ' + m.opponentWins +
                ' | ' + m.cpuWins + ' | ' + pct(m.ci95.low) + '–' + pct(m.ci95.high) +
                ' | ' + m.topCards.map(([c, n]) => c + ' ' + n).join('、') + ' |');
        }
        lines.push('', '## ' + group + ' strategy diversity', '',
            '| Pair | Top-5 card overlap | Jensen–Shannon divergence (bits) |',
            '|---|---:|---:|');
        for (const pair of result.diversity[group]) {
            lines.push('| ' + pair.a + ' vs ' + pair.b + ' | ' + pair.commonTop5 +
                ' / 5 | ' + pair.jsDivergenceBits.toFixed(3) + ' |');
        }
        lines.push('');
    }
    lines.push('## Direct matchups', '', '| Group | Candidate | Baseline | Candidate W | Baseline W | CPU W |',
        '|---|---|---|---:|---:|---:|');
    for (const p of result.pairs) lines.push('| ' + p.group + ' | ' + p.a + ' | ' + p.b + ' | ' + p.aWins + ' | ' + p.bWins + ' | ' + p.otherWins + ' |');
    return lines.join('\n') + '\n';
}
function main(argv = process.argv.slice(2)) {
    const dir = argv[0] || 'artifacts/rl-league/raw';
    const out = argv[1] || 'artifacts/rl-league/summary';
    const files = fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => path.join(dir, name)).sort();
    if (!files.length) throw Error('league results are empty');
    const report = calculate(files);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out + '.json', JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(out + '.md', formatMarkdown(report));
    process.stdout.write(formatMarkdown(report));
}
if (require.main === module) main();
module.exports = { modelName, topCards, jensenShannon, wilson, calculate, formatMarkdown };
