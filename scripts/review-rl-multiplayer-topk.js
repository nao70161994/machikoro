const fs = require('fs');

function parseArgs(argv) {
    const args = {
        input: '',
        format: 'text',
        output: '',
        diversifiedLimit: 5,
        minGamesPerLineup: 50,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--input') args.input = argv[++i] || '';
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
        else if (arg === '--diversified-limit') args.diversifiedLimit = parseInt(argv[++i] || String(args.diversifiedLimit), 10);
        else if (arg === '--min-games-per-lineup') args.minGamesPerLineup = parseInt(argv[++i] || String(args.minGamesPerLineup), 10);
    }
    return args;
}

function playerCountOfSummary(summary) {
    if (summary && Array.isArray(summary.lineup) && summary.lineup.length >= 2) return summary.lineup.length;
    if (summary && typeof summary.opponent === 'string' && summary.opponent.includes('+')) {
        return summary.opponent.split('+').map(part => part.trim()).filter(Boolean).length;
    }
    return 2;
}

function average(values) {
    const filtered = values.filter(Number.isFinite);
    if (filtered.length === 0) return null;
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function minGamesAcrossSummaries(summaries) {
    const games = summaries
        .map(summary => Number.isFinite(summary.games) ? summary.games : null)
        .filter(value => value !== null);
    if (games.length === 0) return null;
    return Math.min(...games);
}

function buildEntry(result, options = {}) {
    const summaries = Array.isArray(result.summaries) ? result.summaries : [];
    const summaries3p = summaries.filter(summary => playerCountOfSummary(summary) === 3);
    const summaries4p = summaries.filter(summary => playerCountOfSummary(summary) === 4);
    const avg3p = average(summaries3p.map(summary => summary.rlWinRate));
    const avg4p = average(summaries4p.map(summary => summary.rlWinRate));
    const combinedScore = average([avg3p, avg4p]);
    const cardStyle = result.buildSignature && result.buildSignature.cardKey ? result.buildSignature.cardKey : '';
    const landmarkStyle = result.buildSignature && result.buildSignature.landmarkKey ? result.buildSignature.landmarkKey : '';
    const minGamesPerLineup = options.minGamesPerLineup || 50;
    const minGames = minGamesAcrossSummaries(summaries);
    const smokeOnly = minGames === null || minGames < minGamesPerLineup;
    return {
        id: result.id,
        path: result.path || '',
        source: result.source || '',
        status: result.status || '',
        avg3p,
        avg4p,
        combinedScore,
        cardStyle,
        landmarkStyle,
        diversityKey: `${cardStyle} || ${landmarkStyle}`,
        minGames,
        smokeOnly,
        promotionBlocked: smokeOnly,
        promotionWarning: smokeOnly
            ? `smokeOnly: min games per lineup ${minGames === null ? 'n/a' : minGames} < ${minGamesPerLineup}; do not use for adoption`
            : '',
        summaries3p,
        summaries4p,
    };
}

function compareEntries(left, right) {
    const leftCombined = Number.isFinite(left.combinedScore) ? left.combinedScore : -1;
    const rightCombined = Number.isFinite(right.combinedScore) ? right.combinedScore : -1;
    if (leftCombined !== rightCombined) return rightCombined - leftCombined;
    const left4p = Number.isFinite(left.avg4p) ? left.avg4p : -1;
    const right4p = Number.isFinite(right.avg4p) ? right.avg4p : -1;
    if (left4p !== right4p) return right4p - left4p;
    const left3p = Number.isFinite(left.avg3p) ? left.avg3p : -1;
    const right3p = Number.isFinite(right.avg3p) ? right.avg3p : -1;
    if (left3p !== right3p) return right3p - left3p;
    return left.id.localeCompare(right.id);
}

function buildDiversifiedPicks(entries, limit) {
    const picks = [];
    const seenKeys = new Set();
    for (const entry of entries) {
        if (!entry.diversityKey.trim()) {
            picks.push(entry);
            if (picks.length >= limit) break;
            continue;
        }
        if (seenKeys.has(entry.diversityKey)) continue;
        seenKeys.add(entry.diversityKey);
        picks.push(entry);
        if (picks.length >= limit) break;
    }
    if (picks.length >= limit) return picks;
    for (const entry of entries) {
        if (picks.includes(entry)) continue;
        picks.push(entry);
        if (picks.length >= limit) break;
    }
    return picks;
}

function buildNearTiePairs(entries) {
    const pairs = [];
    for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
            const left = entries[i];
            const right = entries[j];
            if (!Number.isFinite(left.combinedScore) || !Number.isFinite(right.combinedScore)) continue;
            const diff = Math.abs(left.combinedScore - right.combinedScore);
            if (diff > 0.05) continue;
            if (left.diversityKey === right.diversityKey) continue;
            pairs.push({
                left: left.id,
                right: right.id,
                diff,
                compareCommand: `npm run eval-rl-models -- --models ${left.id},${right.id} --games 100`,
            });
        }
    }
    return pairs.sort((a, b) => a.diff - b.diff || a.left.localeCompare(b.left) || a.right.localeCompare(b.right));
}

function buildReview(results, options = {}) {
    const entries = results.map(result => buildEntry(result, options)).sort(compareEntries);
    return {
        totalModels: entries.length,
        minGamesPerLineup: options.minGamesPerLineup || 50,
        entries,
        diversifiedPicks: buildDiversifiedPicks(entries, options.diversifiedLimit || 5),
        nearTiePairs: buildNearTiePairs(entries),
    };
}

function formatPercent(value) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function renderText(review) {
    const lines = [`RL multiplayer top-k review total=${review.totalModels} minGamesPerLineup=${review.minGamesPerLineup}`];
    lines.push('ranking:');
    for (const [index, entry] of review.entries.entries()) {
        lines.push(
            `- #${index + 1} ${entry.id} combined=${formatPercent(entry.combinedScore)} ` +
            `3p=${formatPercent(entry.avg3p)} 4p=${formatPercent(entry.avg4p)} ` +
            `minGames=${entry.minGames === null ? 'n/a' : entry.minGames} ` +
            `${entry.smokeOnly ? 'gate=smokeOnly promotionBlocked=true ' : 'gate=adoptionCandidate '}style=${entry.cardStyle || 'n/a'}`
        );
        if (entry.promotionWarning) lines.push(`  warning=${entry.promotionWarning}`);
    }
    if (review.diversifiedPicks.length > 0) {
        lines.push('diversifiedPicks:');
        for (const entry of review.diversifiedPicks) {
            lines.push(
                `- ${entry.id} combined=${formatPercent(entry.combinedScore)} ` +
                `3p=${formatPercent(entry.avg3p)} 4p=${formatPercent(entry.avg4p)}`
            );
        }
    }
    if (review.nearTiePairs.length > 0) {
        lines.push('nearTiePairs:');
        for (const pair of review.nearTiePairs.slice(0, 10)) {
            lines.push(`- ${pair.left} / ${pair.right}: diff=${formatPercent(pair.diff)} cmd=${pair.compareCommand}`);
        }
    }
    return lines.join('\n') + '\n';
}

function renderMarkdown(review) {
    const lines = [
        '# RL Multiplayer Top-k Review',
        '',
        `- totalModels: ${review.totalModels}`,
        `- minGamesPerLineup: ${review.minGamesPerLineup}`,
        '- note: rows with `smokeOnly` are not adoption candidates.',
        '',
        '## Ranking',
        '',
        '| rank | id | combined | 3p | 4p | min games | gate | style | landmarks |',
        '|---:|---|---:|---:|---:|---:|---|---|---|',
    ];
    for (const [index, entry] of review.entries.entries()) {
        lines.push(
            `| ${index + 1} | \`${entry.id}\` | ${formatPercent(entry.combinedScore)} | ${formatPercent(entry.avg3p)} | ${formatPercent(entry.avg4p)} | ` +
            `${entry.minGames === null ? 'n/a' : entry.minGames} | ${entry.smokeOnly ? 'smokeOnly' : 'adoptionCandidate'} | ` +
            `${entry.cardStyle || 'n/a'} | ${entry.landmarkStyle || 'n/a'} |`
        );
    }
    if (review.diversifiedPicks.length > 0) {
        lines.push('', '## Diversified Picks', '', '| id | combined | 3p | 4p | style |', '|---|---:|---:|---:|---|');
        for (const entry of review.diversifiedPicks) {
            lines.push(`| \`${entry.id}\` | ${formatPercent(entry.combinedScore)} | ${formatPercent(entry.avg3p)} | ${formatPercent(entry.avg4p)} | ${entry.cardStyle || 'n/a'} |`);
        }
    }
    if (review.nearTiePairs.length > 0) {
        lines.push('', '## Near Tie Pairs', '', '| left | right | diff | compare |', '|---|---|---:|---|');
        for (const pair of review.nearTiePairs.slice(0, 10)) {
            lines.push(`| \`${pair.left}\` | \`${pair.right}\` | ${formatPercent(pair.diff)} | \`${pair.compareCommand}\` |`);
        }
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    if (!args.input) throw new Error('--input is required');
    const results = JSON.parse(fs.readFileSync(args.input, 'utf8'));
    const review = buildReview(results, {
        diversifiedLimit: args.diversifiedLimit,
        minGamesPerLineup: args.minGamesPerLineup,
    });
    let output;
    if (args.format === 'json') output = JSON.stringify(review, null, 2) + '\n';
    else if (args.format === 'markdown' || args.format === 'md') output = renderMarkdown(review);
    else output = renderText(review);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
}

module.exports = {
    parseArgs,
    playerCountOfSummary,
    minGamesAcrossSummaries,
    buildEntry,
    compareEntries,
    buildDiversifiedPicks,
    buildNearTiePairs,
    buildReview,
    renderText,
    renderMarkdown,
};
