const path = require('path');

const { runSeries } = require(path.join(__dirname, 'selfplay.js'));

function parseArgs(argv) {
    let games = 1;
    let seed = 1;
    let maxSteps = 5000;
    let expertPreset = 'default';
    let fast = false;
    let lite = false;
    let format = 'text';
    const players = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '1', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--expert-preset') expertPreset = argv[++i] || 'default';
        else if (arg === '--fast') fast = true;
        else if (arg === '--lite') lite = true;
        else if (arg === '--format') format = argv[++i] || 'text';
        else players.push(arg);
    }

    return {
        games,
        seed,
        maxSteps,
        expertPreset,
        fast,
        lite,
        format,
        players: players.length > 0 ? players : ['expert', 'strong', 'normal', 'normal'],
    };
}

function summarizeProfile(profileStats) {
    const rows = Object.entries(profileStats).map(([label, value]) => ({
        label,
        calls: value.calls || 0,
        count: value.count || 0,
        timeMs: Number((value.timeMs || 0).toFixed(3)),
    })).sort((a, b) => b.timeMs - a.timeMs || b.count - a.count || b.calls - a.calls || a.label.localeCompare(b.label));
    const totalMeasuredMs = rows.reduce((sum, row) => sum + row.timeMs, 0);
    return rows.map(row => Object.assign({}, row, {
        share: totalMeasuredMs > 0 ? Number(((row.timeMs / totalMeasuredMs) * 100).toFixed(1)) : 0,
        avgMs: row.calls > 0 ? Number((row.timeMs / row.calls).toFixed(3)) : 0,
    }));
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const profileStats = {};
    const result = runSeries({
        games: options.games,
        seed: options.seed,
        maxSteps: options.maxSteps,
        players: options.players,
        expertPreset: options.expertPreset,
        fast: options.fast,
        lite: options.lite,
        profileStats,
    });
    const summary = summarizeProfile(profileStats);

    if (options.format === 'json') {
        console.log(JSON.stringify({
            options,
            result,
            profile: summary,
        }, null, 2));
        return;
    }

    console.log(`games=${result.games} players=${result.players.join(',')} mode=${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')} expertPreset=${options.expertPreset}`);
    console.log(`wins=${JSON.stringify(result.wins)} averageTurns=${result.averageTurns.toFixed(1)} exhausted=${result.exhausted}`);
    for (const row of summary) {
        const extras = [];
        if (row.calls > 0) extras.push(`calls=${row.calls}`);
        if (row.avgMs > 0) extras.push(`avgMs=${row.avgMs}`);
        if (row.count > 0) extras.push(`count=${row.count}`);
        console.log(`${row.label}: timeMs=${row.timeMs} share=${row.share}% ${extras.join(' ')}`.trim());
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    parseArgs,
    summarizeProfile,
};
