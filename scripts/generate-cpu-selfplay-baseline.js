'use strict';

const fs = require('fs');
const path = require('path');
const {
    assertSourceCommit,
    currentCommit,
} = require('./generate-cpu-decision-baseline');
const { loadRuntime, simulateGameLightweight } = require('./selfplay');

const CPU_SELFPLAY_DIFFICULTIES = Object.freeze(['weak', 'normal', 'strong', 'expert']);
const CPU_SELFPLAY_PLAYER_COUNTS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10]);
const CPU_SELFPLAY_MAX_STEPS = 1800;
const CPU_SELFPLAY_SEED_BASE = 1700;

function caseSeed(difficulty, playerCount) {
    return CPU_SELFPLAY_SEED_BASE +
        playerCount * 10 +
        CPU_SELFPLAY_DIFFICULTIES.indexOf(difficulty);
}

function generateCpuSelfplayBaseline(sourceCommit = currentCommit()) {
    sourceCommit = assertSourceCommit(sourceCommit);
    const runtime = loadRuntime({ includeRL: false });
    const matches = [];
    CPU_SELFPLAY_DIFFICULTIES.forEach(difficulty => {
        CPU_SELFPLAY_PLAYER_COUNTS.forEach(playerCount => {
            const seed = caseSeed(difficulty, playerCount);
            const result = simulateGameLightweight({
                runtime,
                difficulties: Array(playerCount).fill(difficulty),
                seed,
                maxSteps: CPU_SELFPLAY_MAX_STEPS,
                lite: true,
                expertPreset: 'v2simple',
            });
            matches.push({
                difficulty,
                playerCount,
                seed,
                winner: result.winner,
                turns: result.turns,
                exhausted: result.exhausted,
            });
        });
    });
    return {
        schemaVersion: 1,
        sourceCommit,
        maxSteps: CPU_SELFPLAY_MAX_STEPS,
        difficulties: Array.from(CPU_SELFPLAY_DIFFICULTIES),
        playerCounts: Array.from(CPU_SELFPLAY_PLAYER_COUNTS),
        matches,
    };
}

function parseArgs(argv) {
    const options = {
        output: path.join(__dirname, '..', 'tests', 'fixtures', 'cpu-selfplay-baseline.json'),
        sourceCommit: null,
    };
    for (let index = 0; index < argv.length; index++) {
        if (argv[index] === '--output' && argv[index + 1]) options.output = path.resolve(argv[++index]);
        else if (argv[index] === '--source-commit' && argv[index + 1]) options.sourceCommit = argv[++index];
    }
    return options;
}

function writeCpuSelfplayBaseline(options = {}) {
    const output = options.output || path.join(
        __dirname,
        '..',
        'tests',
        'fixtures',
        'cpu-selfplay-baseline.json'
    );
    const baseline = generateCpuSelfplayBaseline(options.sourceCommit || currentCommit());
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(baseline, null, 2)}\n`);
    return { output, baseline };
}

if (require.main === module) {
    const result = writeCpuSelfplayBaseline(parseArgs(process.argv.slice(2)));
    console.log(`CPU selfplay baseline: ${result.output}`);
    console.log(`source commit: ${result.baseline.sourceCommit}`);
    console.log(`matches: ${result.baseline.matches.length}`);
}

module.exports = {
    CPU_SELFPLAY_DIFFICULTIES,
    CPU_SELFPLAY_MAX_STEPS,
    CPU_SELFPLAY_PLAYER_COUNTS,
    caseSeed,
    generateCpuSelfplayBaseline,
    parseArgs,
    writeCpuSelfplayBaseline,
};
