#!/usr/bin/env node

const fs = require('fs');

const RATIO_FIELDS = [
    'mallBasicChosen',
    'portfolioMissedNear05',
    'portfolioMissedVsConvenience',
    'basicDuplicateChosen',
    'basicDuplicateCopy3Plus',
];

function parseArgs(argv) {
    return {
        inputPath: argv[0] || '',
        skewRatio: Number.parseFloat(argv[1] || '1.5'),
    };
}

function readInput(inputPath) {
    const text = inputPath ? fs.readFileSync(inputPath, 'utf8') : fs.readFileSync(0, 'utf8');
    return JSON.parse(text);
}

function ratio(attribution, field) {
    const total = attribution && attribution.totalBuilds ? attribution.totalBuilds : 0;
    if (total <= 0) return 0;
    return (attribution[field] || 0) / total;
}

function percent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function formatTopNames(items, limit = 5) {
    const top = (items || []).slice(0, limit);
    if (!top.length) return '-';
    return top.map(item => `${item.name}:${item.count}`).join(',');
}

function classifyField(lossRatio, winRatio, skewRatio, lossTotal, winTotal) {
    if (lossTotal < 10 || winTotal < 10) return 'low-sample';
    if (lossRatio > 0 && lossRatio >= winRatio * skewRatio) return 'loss-skew';
    return 'not-loss-specific';
}

function summarizeEntry(entry, options = {}) {
    const summary = entry.summary || {};
    const lossAttr = summary.buildAttribution || {};
    const winAttr = summary.winBuildAttribution || {};
    const skewRatio = options.skewRatio || 1.5;
    const fields = RATIO_FIELDS.map(field => {
        const lossRatio = ratio(lossAttr, field);
        const winRatio = ratio(winAttr, field);
        return {
            field,
            loss: lossAttr[field] || 0,
            win: winAttr[field] || 0,
            lossRatio,
            winRatio,
            status: classifyField(lossRatio, winRatio, skewRatio, lossAttr.totalBuilds || 0, winAttr.totalBuilds || 0),
        };
    });

    return {
        profile: entry.profile || '',
        games: entry.games || 0,
        expertWins: entry.expertWins || 0,
        expertWinRate: entry.expertWinRate || 0,
        losses: summary.losses || 0,
        lossBuilds: lossAttr.totalBuilds || 0,
        winBuilds: winAttr.totalBuilds || 0,
        fields,
        lossMissedWinners: lossAttr.portfolioMissedWinnerNames || [],
        winMissedWinners: winAttr.portfolioMissedWinnerNames || [],
    };
}

function summarizeReport(report, options = {}) {
    return (report.entries || []).map(entry => summarizeEntry(entry, options));
}

function renderText(summaries) {
    const lines = [];
    for (const summary of summaries) {
        lines.push(
            `${summary.profile}: expertWinRate=${percent(summary.expertWinRate)} ` +
            `wins=${summary.expertWins}/${summary.games} losses=${summary.losses} ` +
            `builds=loss:${summary.lossBuilds} win:${summary.winBuilds}`
        );
        for (const field of summary.fields) {
            lines.push(
                `  ${field.field}=loss:${field.loss}(${percent(field.lossRatio)}) ` +
                `win:${field.win}(${percent(field.winRatio)}) ${field.status}`
            );
        }
        lines.push(`  lossMissedWinners=${formatTopNames(summary.lossMissedWinners)}`);
        lines.push(`  winMissedWinners=${formatTopNames(summary.winMissedWinners)}`);
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = readInput(options.inputPath);
    console.log(renderText(summarizeReport(report, options)));
}

if (require.main === module) {
    main();
}

module.exports = {
    RATIO_FIELDS,
    classifyField,
    parseArgs,
    ratio,
    renderText,
    summarizeEntry,
    summarizeReport,
};
