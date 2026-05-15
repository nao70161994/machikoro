const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    parseWeights,
    parseCsvLine,
    loadMetrics,
    summarizeMetrics,
    renderSummary,
    printSummary,
    writeSummaryOutput,
    writeIndexCsv,
    writeSummaryIndexes,
} = require(path.join(__dirname, '..', 'scripts', 'summarize-rl-metrics.js'));

function writeTempCsv(content) {
    const filePath = path.join(os.tmpdir(), `machikoro-metrics-${process.pid}-${Date.now()}.csv`);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
}

runTest('parseArgs は metrics summary CLI 引数を解釈する', () => {
    const args = parseArgs(['--csv', 'tmp/train.csv', '--format', 'json', '--opponents', 'strong,expert', '--weights', 'strong=1,expert=2', '--draw-penalty', '0.5', '--exhausted-penalty', '0.02', '--run-label', 'baseline', '--baseline-run', 'baseline', '--output', 'tmp/summary.json', '--run-index-csv', 'tmp/run-index.csv', '--config-index-csv', 'tmp/config-index.csv']);
    assert.strictEqual(args.csvPath, 'tmp/train.csv');
    assert.strictEqual(args.format, 'json');
    assert.deepStrictEqual(args.opponents, ['strong', 'expert']);
    assert.deepStrictEqual(args.weights, { strong: 1, expert: 2 });
    assert.strictEqual(args.drawPenalty, 0.5);
    assert.strictEqual(args.exhaustedPenalty, 0.02);
    assert.strictEqual(args.runLabel, 'baseline');
    assert.strictEqual(args.baselineRun, 'baseline');
    assert.strictEqual(args.outputPath, 'tmp/summary.json');
    assert.strictEqual(args.runIndexCsvPath, 'tmp/run-index.csv');
    assert.strictEqual(args.configIndexCsvPath, 'tmp/config-index.csv');
});

runTest('parseWeights は opponent ごとの重みを解釈する', () => {
    assert.deepStrictEqual(parseWeights('strong=1,expert=2.5'), { strong: 1, expert: 2.5 });
});

runTest('parseCsvLine は基本的な CSV 行を分解する', () => {
    assert.deepStrictEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
    assert.deepStrictEqual(parseCsvLine('"a,b",c'), ['a,b', 'c']);
});

runTest('loadMetrics は CSV をオブジェクト配列へ読む', () => {
    const csvPath = writeTempCsv('game,js_opponent,js_win_rate\n1000,strong,0.6\n');
    try {
        const rows = loadMetrics(csvPath);
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].game, '1000');
        assert.strictEqual(rows[0].js_opponent, 'strong');
    } finally {
        fs.rmSync(csvPath, { force: true });
    }
});

runTest('summarizeMetrics は opponent 別ベストと総合上位を返す', () => {
    const rows = [
        { game: '1000', run_label: 'baseline', hidden: '256', lr: '0.0003', rnd: '0.5', train: '0.52', target_pending_rate: '0.08', target_update_rate: '0.08', tv_target_rate: '0.03', bc_target_rate: '0.04', mover_target_rate: '0.01', js_opponent: 'strong', js_win_rate: '0.6', js_first_rate: '0.7', js_second_rate: '0.5', js_draw_rate: '0.1', js_exhausted: '1', js_avg_turns: '17.4' },
        { game: '1000', run_label: 'baseline', hidden: '256', lr: '0.0003', rnd: '0.5', train: '0.52', target_pending_rate: '0.08', target_update_rate: '0.08', tv_target_rate: '0.03', bc_target_rate: '0.04', mover_target_rate: '0.01', js_opponent: 'expert', js_win_rate: '0.3', js_first_rate: '0.2', js_second_rate: '0.4', js_draw_rate: '0.1', js_exhausted: '0', js_avg_turns: '22.1' },
        { game: '2000', run_label: 'baseline', hidden: '256', lr: '0.0003', rnd: '0.55', train: '0.6', target_pending_rate: '0.12', target_update_rate: '0.11', tv_target_rate: '0.05', bc_target_rate: '0.04', mover_target_rate: '0.02', js_opponent: 'strong', js_win_rate: '0.7', js_first_rate: '0.8', js_second_rate: '0.6', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '16.2' },
        { game: '2000', run_label: 'baseline', hidden: '256', lr: '0.0003', rnd: '0.55', train: '0.6', target_pending_rate: '0.12', target_update_rate: '0.11', tv_target_rate: '0.05', bc_target_rate: '0.04', mover_target_rate: '0.02', js_opponent: 'expert', js_win_rate: '0.45', js_first_rate: '0.5', js_second_rate: '0.4', js_draw_rate: '0.05', js_exhausted: '0', js_avg_turns: '20.0' },
    ];
    const summary = summarizeMetrics(rows, { opponents: ['strong', 'expert'] });
    assert.strictEqual(summary.bestByOpponent.strong.game, 2000);
    assert.strictEqual(summary.bestByOpponent.expert.game, 2000);
    assert.strictEqual(summary.bestRuns[0].runLabel, 'baseline');
    assert.strictEqual(summary.bestRuns[0].game, 2000);
    assert.strictEqual(summary.combinedTop[0].game, 2000);
    assert.strictEqual(summary.combinedTop[0].runLabel, 'baseline');
    assert.strictEqual(summary.bestRuns[0].targetPendingRate, 0.12);
    assert.strictEqual(summary.bestRuns[0].bcTargetRate, 0.04);
});

runTest('summarizeMetrics は重み付けで総合順位を変えられる', () => {
    const rows = [
        { game: '1000', rnd: '0.5', train: '0.52', js_opponent: 'strong', js_win_rate: '0.9', js_first_rate: '0.9', js_second_rate: '0.9', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '16' },
        { game: '1000', rnd: '0.5', train: '0.52', js_opponent: 'expert', js_win_rate: '0.2', js_first_rate: '0.2', js_second_rate: '0.2', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '22' },
        { game: '2000', rnd: '0.55', train: '0.6', js_opponent: 'strong', js_win_rate: '0.7', js_first_rate: '0.7', js_second_rate: '0.7', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '18' },
        { game: '2000', rnd: '0.55', train: '0.6', js_opponent: 'expert', js_win_rate: '0.5', js_first_rate: '0.5', js_second_rate: '0.5', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '20' },
    ];
    const summary = summarizeMetrics(rows, { opponents: ['strong', 'expert'], weights: { strong: 1, expert: 3 } });
    assert.strictEqual(summary.combinedTop[0].game, 2000);
});

runTest('summarizeMetrics は runLabel でフィルタできる', () => {
    const rows = [
        { game: '1000', run_label: 'a', js_opponent: 'strong', js_win_rate: '0.6', js_first_rate: '0.7', js_second_rate: '0.5', js_draw_rate: '0.1', js_exhausted: '1', js_avg_turns: '17.4' },
        { game: '2000', run_label: 'b', js_opponent: 'strong', js_win_rate: '0.7', js_first_rate: '0.8', js_second_rate: '0.6', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '16.2' },
    ];
    const summary = summarizeMetrics(rows, { opponents: ['strong'], runLabel: 'a' });
    assert.strictEqual(summary.jsRows, 1);
    assert.strictEqual(summary.combinedTop[0].game, 1000);
});

runTest('summarizeMetrics は run ごとのベストを返す', () => {
    const rows = [
        { game: '1000', run_label: 'baseline', rnd: '0.5', train: '0.52', js_opponent: 'strong', js_win_rate: '0.6', js_first_rate: '0.7', js_second_rate: '0.5', js_draw_rate: '0.1', js_exhausted: '0', js_avg_turns: '17.4' },
        { game: '1000', run_label: 'baseline', rnd: '0.5', train: '0.52', js_opponent: 'expert', js_win_rate: '0.3', js_first_rate: '0.2', js_second_rate: '0.4', js_draw_rate: '0.1', js_exhausted: '0', js_avg_turns: '22.1' },
        { game: '2000', run_label: 'tuned', rnd: '0.55', train: '0.6', js_opponent: 'strong', js_win_rate: '0.7', js_first_rate: '0.8', js_second_rate: '0.6', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '16.2' },
        { game: '2000', run_label: 'tuned', rnd: '0.55', train: '0.6', js_opponent: 'expert', js_win_rate: '0.45', js_first_rate: '0.5', js_second_rate: '0.4', js_draw_rate: '0.05', js_exhausted: '0', js_avg_turns: '20.0' },
    ];
    const summary = summarizeMetrics(rows, { opponents: ['strong', 'expert'] });
    assert.strictEqual(summary.bestRuns.length, 2);
    assert.strictEqual(summary.bestRuns[0].runLabel, 'tuned');
    assert.strictEqual(summary.bestRuns[0].game, 2000);
    assert.strictEqual(summary.bestRuns[1].runLabel, 'baseline');
    assert.strictEqual(summary.runIndex[0].rank, 1);
    assert.strictEqual(summary.runIndex[0].runLabel, 'tuned');
});

runTest('summarizeMetrics は hidden/lr ごとのベストを返す', () => {
    const rows = [
        { game: '1000', run_label: 'a', hidden: '128', lr: '0.001', rnd: '0.4', train: '0.45', js_opponent: 'strong', js_win_rate: '0.5', js_first_rate: '0.5', js_second_rate: '0.5', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '18.0' },
        { game: '1000', run_label: 'a', hidden: '128', lr: '0.001', rnd: '0.4', train: '0.45', js_opponent: 'expert', js_win_rate: '0.2', js_first_rate: '0.2', js_second_rate: '0.2', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '21.0' },
        { game: '2000', run_label: 'b', hidden: '256', lr: '0.0003', rnd: '0.55', train: '0.6', js_opponent: 'strong', js_win_rate: '0.7', js_first_rate: '0.7', js_second_rate: '0.7', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '17.0' },
        { game: '2000', run_label: 'b', hidden: '256', lr: '0.0003', rnd: '0.55', train: '0.6', js_opponent: 'expert', js_win_rate: '0.45', js_first_rate: '0.4', js_second_rate: '0.5', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '20.0' },
    ];
    const summary = summarizeMetrics(rows, { opponents: ['strong', 'expert'] });
    assert.strictEqual(summary.bestConfigs.length, 2);
    assert.strictEqual(summary.bestConfigs[0].configKey, 'hidden=256 lr=0.0003');
    assert.strictEqual(summary.bestConfigs[0].runLabel, 'b');
    assert.strictEqual(summary.configIndex[0].rank, 1);
    assert.strictEqual(summary.configIndex[0].configKey, 'hidden=256 lr=0.0003');
});

runTest('summarizeMetrics は baseline run 比の差分を返す', () => {
    const rows = [
        { game: '1000', run_label: 'baseline', rnd: '0.5', train: '0.52', js_opponent: 'strong', js_win_rate: '0.6', js_first_rate: '0.7', js_second_rate: '0.5', js_draw_rate: '0.1', js_exhausted: '0', js_avg_turns: '17.4' },
        { game: '1000', run_label: 'baseline', rnd: '0.5', train: '0.52', js_opponent: 'expert', js_win_rate: '0.3', js_first_rate: '0.2', js_second_rate: '0.4', js_draw_rate: '0.1', js_exhausted: '0', js_avg_turns: '22.1' },
        { game: '2000', run_label: 'tuned', rnd: '0.55', train: '0.6', js_opponent: 'strong', js_win_rate: '0.7', js_first_rate: '0.8', js_second_rate: '0.6', js_draw_rate: '0.0', js_exhausted: '0', js_avg_turns: '16.2' },
        { game: '2000', run_label: 'tuned', rnd: '0.55', train: '0.6', js_opponent: 'expert', js_win_rate: '0.45', js_first_rate: '0.5', js_second_rate: '0.4', js_draw_rate: '0.05', js_exhausted: '0', js_avg_turns: '20.0' },
    ];
    const summary = summarizeMetrics(rows, { opponents: ['strong', 'expert'], baselineRun: 'baseline' });
    assert.strictEqual(summary.baselineRun, 'baseline');
    assert.strictEqual(summary.baselineRunEntry.runLabel, 'baseline');
    assert.strictEqual(summary.bestRuns[0].runLabel, 'tuned');
    assert.ok(summary.bestRuns[0].scoreDelta > 0);
    assert.ok(Math.abs(summary.bestRuns[0].opponentDeltas.strong - 0.1) < 1e-9);
    assert.ok(Math.abs(summary.bestRuns[0].opponentDeltas.expert - 0.15) < 1e-9);
    assert.strictEqual(summary.bestRuns[1].scoreDelta, 0);
});

runTest('printSummary は text 形式で要約を出力する', () => {
    const lines = [];
    const realLog = console.log;
    console.log = (line) => lines.push(line);
    try {
        printSummary({
            totalRows: 4,
            jsRows: 4,
            opponents: ['strong'],
            baselineRun: 'baseline',
            bestByOpponent: {
                strong: {
                    game: 2000,
                    jsWinRate: 0.7,
                    jsFirstRate: 0.8,
                    jsSecondRate: 0.6,
                    jsDrawRate: 0,
                    jsExhausted: 0,
                    jsAvgTurns: 16.2,
                    targetPendingRate: 0.12,
                    targetUpdateRate: 0.11,
                    tvTargetRate: 0.05,
                    bcTargetRate: 0.04,
                    moverTargetRate: 0.02,
                },
            },
            bestRuns: [{ runLabel: 'baseline', game: 2000, score: 0.7, scoreDelta: 0, opponentDeltas: { strong: 0 }, rnd: 0.55, train: 0.6, targetPendingRate: 0.12, targetUpdateRate: 0.11, tvTargetRate: 0.05, bcTargetRate: 0.04, moverTargetRate: 0.02 }],
            bestConfigs: [{ configKey: 'hidden=256 lr=0.0003', runLabel: 'baseline', game: 2000, score: 0.7, rnd: 0.55, train: 0.6, targetPendingRate: 0.12, targetUpdateRate: 0.11, tvTargetRate: 0.05, bcTargetRate: 0.04, moverTargetRate: 0.02 }],
            combinedTop: [{ game: 2000, score: 0.7, rnd: 0.55, train: 0.6, targetPendingRate: 0.12, targetUpdateRate: 0.11, tvTargetRate: 0.05, bcTargetRate: 0.04, moverTargetRate: 0.02 }],
        }, { format: 'text' });
    } finally {
        console.log = realLog;
    }
    const output = lines.join('\n');
    assert.ok(output.includes('rows=4'));
    assert.ok(output.includes('baselineRun=baseline'));
    assert.ok(output.includes('best strong'));
    assert.ok(output.includes('target('));
    assert.ok(output.includes('delta=+0.000'));
    assert.ok(output.includes('config hidden=256 lr=0.0003'));
    assert.ok(output.includes('top game=2000'));
});

runTest('renderSummary は json 形式を返す', () => {
    const text = renderSummary({ totalRows: 1, jsRows: 1, opponents: [], bestByOpponent: {}, bestRuns: [], combinedTop: [] }, { format: 'json' });
    const parsed = JSON.parse(text);
    assert.strictEqual(parsed.totalRows, 1);
});

runTest('writeSummaryOutput は summary をファイルへ保存する', () => {
    const outputPath = path.join(os.tmpdir(), `machikoro-summary-${process.pid}-${Date.now()}.txt`);
    try {
        writeSummaryOutput({
            totalRows: 4,
            jsRows: 4,
            opponents: ['strong'],
            bestByOpponent: {},
            bestRuns: [],
            combinedTop: [],
        }, { format: 'text', outputPath });
        const body = fs.readFileSync(outputPath, 'utf8');
        assert.ok(body.includes('rows=4'));
    } finally {
        fs.rmSync(outputPath, { force: true });
    }
});

runTest('writeIndexCsv は index を CSV へ保存する', () => {
    const outputPath = path.join(os.tmpdir(), `machikoro-run-index-${process.pid}-${Date.now()}.csv`);
    try {
        writeIndexCsv([{ rank: 1, runLabel: 'trial', game: 2000, score: 0.5, hidden: 256, lr: 0.0003 }], outputPath, ['rank', 'runLabel', 'game', 'score', 'hidden', 'lr']);
        const body = fs.readFileSync(outputPath, 'utf8');
        assert.ok(body.includes('rank,runLabel,game,score,hidden,lr'));
        assert.ok(body.includes('1,trial,2000,0.5,256,0.0003'));
    } finally {
        fs.rmSync(outputPath, { force: true });
    }
});

runTest('writeSummaryIndexes は runIndex と configIndex を個別CSVへ保存する', () => {
    const runIndexCsvPath = path.join(os.tmpdir(), `machikoro-run-index-${process.pid}-${Date.now()}.csv`);
    const configIndexCsvPath = path.join(os.tmpdir(), `machikoro-config-index-${process.pid}-${Date.now()}.csv`);
    try {
        writeSummaryIndexes({
            runIndex: [{ rank: 1, runLabel: 'trial', game: 2000, score: 0.5, hidden: 256, lr: 0.0003 }],
            configIndex: [{ rank: 1, configKey: 'hidden=256 lr=0.0003', hidden: 256, lr: 0.0003, runLabel: 'trial', game: 2000, score: 0.5 }],
        }, { runIndexCsvPath, configIndexCsvPath });
        const runBody = fs.readFileSync(runIndexCsvPath, 'utf8');
        const configBody = fs.readFileSync(configIndexCsvPath, 'utf8');
        assert.ok(runBody.includes('runLabel'));
        assert.ok(configBody.includes('configKey'));
    } finally {
        fs.rmSync(runIndexCsvPath, { force: true });
        fs.rmSync(configIndexCsvPath, { force: true });
    }
});
