const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const args = {
        inputs: [],
        format: 'text',
        output: '',
        topRunLimit: 5,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--inputs') {
            const value = argv[++i] || '';
            args.inputs = value.split(',').map(part => part.trim()).filter(Boolean);
        } else if (arg === '--format') {
            args.format = argv[++i] || args.format;
        } else if (arg === '--output') {
            args.output = argv[++i] || '';
        } else if (arg === '--top-run-limit') {
            args.topRunLimit = parseInt(argv[++i] || String(args.topRunLimit), 10);
        }
    }
    return args;
}

function inferRunLabel(inputPath) {
    const base = path.basename(inputPath);
    return base
        .replace(/^eval-/, '')
        .replace(/-top10-multiplayer\.review\.json$/, '')
        .replace(/\.json$/, '');
}

function average(values) {
    const filtered = values.filter(Number.isFinite);
    if (filtered.length === 0) return null;
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function countDistinctStyles(entries) {
    const seen = new Set();
    for (const entry of entries) {
        const style = `${entry.cardStyle || ''} || ${entry.landmarkStyle || ''}`.trim();
        if (!style || style === '||') continue;
        seen.add(style);
    }
    return seen.size;
}

function buildRunEntry(inputPath, review) {
    const entries = Array.isArray(review.entries) ? review.entries : [];
    const diversifiedPicks = Array.isArray(review.diversifiedPicks) ? review.diversifiedPicks : [];
    const best = entries[0] || null;
    return {
        runLabel: inferRunLabel(inputPath),
        inputPath,
        totalModels: review.totalModels || entries.length,
        bestModelId: best ? best.id : '',
        bestCombined: best ? best.combinedScore : null,
        best3p: best ? best.avg3p : null,
        best4p: best ? best.avg4p : null,
        bestCardStyle: best ? (best.cardStyle || '') : '',
        bestLandmarkStyle: best ? (best.landmarkStyle || '') : '',
        diversifiedCount: diversifiedPicks.length,
        diversifiedAverage: average(diversifiedPicks.map(entry => entry.combinedScore)),
        top3Average: average(entries.slice(0, 3).map(entry => entry.combinedScore)),
        top5Average: average(entries.slice(0, 5).map(entry => entry.combinedScore)),
        distinctStyleCount: countDistinctStyles(entries.slice(0, 10)),
    };
}

function compareRuns(left, right) {
    const leftBest = Number.isFinite(left.bestCombined) ? left.bestCombined : -1;
    const rightBest = Number.isFinite(right.bestCombined) ? right.bestCombined : -1;
    if (leftBest !== rightBest) return rightBest - leftBest;
    const leftDiv = Number.isFinite(left.diversifiedAverage) ? left.diversifiedAverage : -1;
    const rightDiv = Number.isFinite(right.diversifiedAverage) ? right.diversifiedAverage : -1;
    if (leftDiv !== rightDiv) return rightDiv - leftDiv;
    if (left.distinctStyleCount !== right.distinctStyleCount) return right.distinctStyleCount - left.distinctStyleCount;
    return left.runLabel.localeCompare(right.runLabel);
}

function buildNearTieRuns(entries) {
    const pairs = [];
    for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
            const left = entries[i];
            const right = entries[j];
            if (!Number.isFinite(left.bestCombined) || !Number.isFinite(right.bestCombined)) continue;
            const diff = Math.abs(left.bestCombined - right.bestCombined);
            if (diff > 0.05) continue;
            const sameStyle = left.bestCardStyle === right.bestCardStyle && left.bestLandmarkStyle === right.bestLandmarkStyle;
            if (sameStyle) continue;
            pairs.push({
                left: left.runLabel,
                right: right.runLabel,
                diff,
            });
        }
    }
    return pairs.sort((a, b) => a.diff - b.diff || a.left.localeCompare(b.left) || a.right.localeCompare(b.right));
}

function buildReview(inputPaths) {
    const runs = inputPaths.map(inputPath => {
        const review = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        return buildRunEntry(inputPath, review);
    }).sort(compareRuns);
    return {
        totalRuns: runs.length,
        runs,
        recommendedRuns: runs.slice(0, 5),
        diversifiedRuns: runs
            .slice()
            .sort((left, right) => {
                if (left.distinctStyleCount !== right.distinctStyleCount) return right.distinctStyleCount - left.distinctStyleCount;
                return compareRuns(left, right);
            })
            .slice(0, 5),
        nearTieRuns: buildNearTieRuns(runs),
    };
}

function formatPercent(value) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';
}

function renderText(review) {
    const lines = [`RL multiplayer experiment-set review totalRuns=${review.totalRuns}`];
    lines.push('ranking:');
    for (const [index, run] of review.runs.entries()) {
        lines.push(
            `- #${index + 1} ${run.runLabel} best=${formatPercent(run.bestCombined)} ` +
            `top3=${formatPercent(run.top3Average)} diversified=${formatPercent(run.diversifiedAverage)} ` +
            `styles=${run.distinctStyleCount} bestModel=${run.bestModelId || 'n/a'}`
        );
    }
    if (review.diversifiedRuns.length > 0) {
        lines.push('diversifiedRuns:');
        for (const run of review.diversifiedRuns) {
            lines.push(
                `- ${run.runLabel} styles=${run.distinctStyleCount} best=${formatPercent(run.bestCombined)} ` +
                `diversified=${formatPercent(run.diversifiedAverage)}`
            );
        }
    }
    if (review.nearTieRuns.length > 0) {
        lines.push('nearTieRuns:');
        for (const pair of review.nearTieRuns.slice(0, 10)) {
            lines.push(`- ${pair.left} / ${pair.right}: diff=${formatPercent(pair.diff)}`);
        }
    }
    return lines.join('\n') + '\n';
}

function renderMarkdown(review) {
    const lines = [
        '# RL Multiplayer Experiment Set Review',
        '',
        `- totalRuns: ${review.totalRuns}`,
        '',
        '## Ranking',
        '',
        '| rank | run | best | top3 | diversified | styleCount(top10) | bestModel |',
        '|---:|---|---:|---:|---:|---:|---|',
    ];
    for (const [index, run] of review.runs.entries()) {
        lines.push(
            `| ${index + 1} | \`${run.runLabel}\` | ${formatPercent(run.bestCombined)} | ${formatPercent(run.top3Average)} | ` +
            `${formatPercent(run.diversifiedAverage)} | ${run.distinctStyleCount} | \`${run.bestModelId || 'n/a'}\` |`
        );
    }
    if (review.diversifiedRuns.length > 0) {
        lines.push('', '## Diversified Runs', '', '| run | best | diversified | styleCount(top10) |', '|---|---:|---:|---:|');
        for (const run of review.diversifiedRuns) {
            lines.push(`| \`${run.runLabel}\` | ${formatPercent(run.bestCombined)} | ${formatPercent(run.diversifiedAverage)} | ${run.distinctStyleCount} |`);
        }
    }
    if (review.nearTieRuns.length > 0) {
        lines.push('', '## Near Tie Runs', '', '| left | right | diff |', '|---|---|---:|');
        for (const pair of review.nearTieRuns.slice(0, 10)) {
            lines.push(`| \`${pair.left}\` | \`${pair.right}\` | ${formatPercent(pair.diff)} |`);
        }
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    if (args.inputs.length === 0) throw new Error('--inputs is required');
    const review = buildReview(args.inputs);
    let output;
    if (args.format === 'json') output = JSON.stringify(review, null, 2) + '\n';
    else if (args.format === 'markdown' || args.format === 'md') output = renderMarkdown(review);
    else output = renderText(review);
    if (args.output) fs.writeFileSync(args.output, output, 'utf8');
    else process.stdout.write(output);
}

module.exports = {
    parseArgs,
    inferRunLabel,
    buildRunEntry,
    compareRuns,
    buildNearTieRuns,
    buildReview,
    renderText,
    renderMarkdown,
};
