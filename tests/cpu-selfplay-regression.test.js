const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    CPU_SELFPLAY_DIFFICULTIES,
    CPU_SELFPLAY_PLAYER_COUNTS,
    caseSeed,
    generateCpuSelfplayBaseline,
} = require('../scripts/generate-cpu-selfplay-baseline');
const { runTest } = require('./helpers/test-utils');

const baselinePath = path.join(__dirname, 'fixtures', 'cpu-selfplay-baseline.json');

runTest('CPU selfplay baselineは2〜10人と全difficultyの直積を持つ', () => {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    assert.match(baseline.sourceCommit, /^[0-9a-f]{40}$/);
    assert.deepStrictEqual(baseline.difficulties, Array.from(CPU_SELFPLAY_DIFFICULTIES));
    assert.deepStrictEqual(baseline.playerCounts, Array.from(CPU_SELFPLAY_PLAYER_COUNTS));
    assert.strictEqual(
        baseline.matches.length,
        CPU_SELFPLAY_DIFFICULTIES.length * CPU_SELFPLAY_PLAYER_COUNTS.length
    );
    CPU_SELFPLAY_DIFFICULTIES.forEach(difficulty => {
        CPU_SELFPLAY_PLAYER_COUNTS.forEach(playerCount => {
            assert.ok(baseline.matches.some(match =>
                match.difficulty === difficulty && match.playerCount === playerCount
            ));
        });
    });
});

runTest('CPU selfplay baselineは全caseを完走し現在の結果と完全一致する', () => {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    assert.ok(baseline.matches.every(match => match.exhausted === false));
    assert.ok(baseline.matches.every(match => match.winner >= 0 && match.winner < match.playerCount));
    const current = generateCpuSelfplayBaseline(baseline.sourceCommit);
    assert.deepStrictEqual(current, baseline);
});

runTest('CPU selfplay seed policyはdifficultyと人数ごとに一意になる', () => {
    const seeds = [];
    CPU_SELFPLAY_DIFFICULTIES.forEach(difficulty => {
        CPU_SELFPLAY_PLAYER_COUNTS.forEach(playerCount => {
            seeds.push(caseSeed(difficulty, playerCount));
        });
    });
    assert.strictEqual(new Set(seeds).size, seeds.length);
});
