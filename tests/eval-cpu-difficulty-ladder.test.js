const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    parseArgs,
    validateOptions,
    targetOutcomes,
    summarizePairedOutcomes,
    combinePairedSummaries,
    comparisonPass,
    comparisonClassification,
    evaluateDifficultyGate,
    renderText,
    writeReport,
} = require('../scripts/eval-cpu-difficulty-ladder.js');
const { runTest } = require('./helpers/test-utils');

runTest('CPU difficulty gate argsは複数seedと非劣性marginを解釈する', () => {
    const defaults = parseArgs([]);
    assert.deepStrictEqual(defaults.playerCounts, [8, 9, 10]);
    assert.deepStrictEqual(defaults.seedStarts, [1, 1001, 2001]);
    const args = parseArgs([
        '--player-counts', '4,10',
        '--seed-starts', '7,1007',
        '--blocks', '12',
        '--non-inferiority-margin', '0.02',
        '--gate-mode', 'smoke',
        '--max-window-ms', '9000',
        '--check',
    ]);
    assert.deepStrictEqual(args.playerCounts, [4, 10]);
    assert.deepStrictEqual(args.seedStarts, [7, 1007]);
    assert.strictEqual(args.blocks, 12);
    assert.strictEqual(args.nonInferiorityMargin, 0.02);
    assert.strictEqual(args.gateMode, 'smoke');
    assert.strictEqual(args.maxWindowMs, 9000);
    assert.strictEqual(args.check, true);
    assert.throws(() => validateOptions(Object.assign({}, defaults, { seedStarts: [1] })), /2件以上/);
    assert.throws(() => validateOptions(Object.assign({}, defaults, { playerCounts: [11] })), /2〜10/);
});

runTest('CPU difficulty smoke gateは勝率区間を記録しつつ打切りと時間だけをfail closedにする', () => {
    const options = {
        playerCounts: [2], seedStarts: [1, 2], blocks: 1, maxSteps: 100,
        nonInferiorityMargin: 0, gateMode: 'smoke', maxWindowMs: 10,
    };
    const report = evaluateDifficultyGate(options, {
        now: (() => { let value = 0; return () => value += 1; })(),
        runSeries(runOptions) {
            return {
                exhausted: 0,
                matchLog: [{ winnerIndex: runOptions.players[0] === 'normal' ? 0 : 1 }, { winnerIndex: 0 }],
            };
        },
    });
    assert.strictEqual(report.pass, true);
    assert.strictEqual(report.config.gateMode, 'smoke');
    assert.strictEqual(report.byPlayerCount[0].slowWindows, 0);
});

runTest('paired summaryは同一seed・席の勝敗差と95%区間を集計する', () => {
    const summary = summarizePairedOutcomes(
        [1, 0, 0, 1, 0, 1],
        [1, 1, 0, 0, 1, 1]
    );
    assert.deepStrictEqual({
        samples: summary.samples,
        baselineWins: summary.baselineWins,
        candidateWins: summary.candidateWins,
        candidateOnly: summary.candidateOnly,
        baselineOnly: summary.baselineOnly,
        ties: summary.ties,
    }, {
        samples: 6,
        baselineWins: 3,
        candidateWins: 4,
        candidateOnly: 2,
        baselineOnly: 1,
        ties: 3,
    });
    assert.strictEqual(summary.meanDifference, 1 / 6);
    assert.strictEqual(comparisonPass(summary, 1), true);
    assert.strictEqual(comparisonClassification(summary, 0.1), 'inverted');
    assert.strictEqual(comparisonClassification(Object.assign({}, summary, {
        meanDifference: -0.01,
        difference95: { low: -0.05, high: 0.03 },
    }), 0.1), 'non-inferior');
    assert.strictEqual(comparisonClassification(Object.assign({}, summary, {
        meanDifference: 0.01,
        difference95: { low: -0.05, high: 0.07 },
    }), 0.1), 'ordered');
    const combined = combinePairedSummaries([summary, summary]);
    assert.strictEqual(combined.samples, 12);
    assert.strictEqual(combined.candidateOnly, 4);
    assert.strictEqual(combined.baselineOnly, 2);
});

runTest('target outcomesはlineup循環後も元index 0のCPUを追跡する', () => {
    const result = {
        matchLog: [
            { winnerIndex: 0 },
            { winnerIndex: 3 },
            { winnerIndex: 1 },
            { winnerIndex: 1 },
        ],
    };
    assert.deepStrictEqual(targetOutcomes(result, 4), [1, 1, 0, 1]);
});

runTest('CPU difficulty gateはseed windowを集約して難易度順と打切りを判定する', () => {
    const calls = [];
    const options = {
        playerCounts: [4],
        seedStarts: [1, 101],
        blocks: 1,
        maxSteps: 100,
        nonInferiorityMargin: 0.1,
    };
    const report = evaluateDifficultyGate(options, {
        now: (() => {
            let value = 0;
            return () => ++value;
        })(),
        runSeries(runOptions) {
            calls.push(runOptions);
            const difficulty = runOptions.players[0];
            const winners = difficulty === 'normal'
                ? [0, 0, 0, 0]
                : difficulty === 'strong'
                    ? [0, 3, 2, 1]
                    : [0, 3, 2, 1];
            return {
                exhausted: 0,
                matchLog: winners.map(winnerIndex => ({ winnerIndex })),
            };
        },
    });
    assert.strictEqual(calls.length, 6);
    assert.ok(calls.every(call => call.seedPolicy === 'paired-seats' && call.cpuPurpose === 'live'));
    assert.strictEqual(report.pass, true);
    assert.strictEqual(report.byPlayerCount[0].gamesPerDifficulty, 8);
    assert.strictEqual(report.byPlayerCount[0].comparisons.strongVsNormal.candidateWins, 8);
    assert.strictEqual(report.byPlayerCount[0].comparisons.expertVsStrong.meanDifference, 0);
    assert.match(renderText(report), /4p PASS/);
});

runTest('CPU difficulty gateは各seed windowの進捗を通知する', () => {
    const observed = [];
    evaluateDifficultyGate({
        playerCounts: [2], seedStarts: [1, 11], blocks: 1, maxSteps: 100,
        nonInferiorityMargin: 0.1,
    }, {
        runSeries(runOptions) {
            const winnerIndex = runOptions.players[0] === 'normal' ? 1 : 0;
            return { exhausted: 0, matchLog: [{ winnerIndex }, { winnerIndex: 1 }] };
        },
        onWindow: window => observed.push([window.playerCount, window.seedStart]),
    });
    assert.deepStrictEqual(observed, [[2, 1], [2, 11]]);
});

runTest('CPU difficulty gateは逆転・打切りをfail closedにする', () => {
    const report = evaluateDifficultyGate({
        playerCounts: [2],
        seedStarts: [1, 11],
        blocks: 1,
        maxSteps: 10,
        nonInferiorityMargin: 0,
    }, {
        runSeries(options) {
            const difficulty = options.players[0];
            return {
                exhausted: difficulty === 'expert' ? 1 : 0,
                matchLog: difficulty === 'normal'
                    ? [{ winnerIndex: 0 }, { winnerIndex: 1 }]
                    : [{ winnerIndex: 1 }, { winnerIndex: 0 }],
            };
        },
    });
    assert.strictEqual(report.pass, false);
    assert.strictEqual(report.byPlayerCount[0].pass, false);
    assert.ok(report.byPlayerCount[0].exhausted > 0);
});

runTest('CPU difficulty artifactは親directoryを作りJSONで保存する', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-difficulty-'));
    const output = path.join(root, 'nested', 'report.json');
    const report = { schemaVersion: 1, pass: true };
    writeReport(output, report);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(output, 'utf8')), report);
    fs.rmSync(root, { recursive: true, force: true });
});
