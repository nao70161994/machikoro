const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    diagnoseModel,
    mergeLandmarkRaceSummaries,
    parseArgs,
    renderText,
    summarizeLandmarkRaceMatches,
} = require(path.join(__dirname, '..', 'scripts', 'diagnose-rl-landmark-race.js'));

function playerState(builtLandmarks, missingLandmarks) {
    return {
        builtLandmarkCount: builtLandmarks.length,
        builtLandmarks,
        missingLandmarks,
    };
}

runTest('diagnose-rl-landmark-race parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs([
        '--models', 'm1,m2',
        '--run-labels', 'r1',
        '--run-ranks', '1,2',
        '--games', '7',
        '--seed', '11',
        '--lineups', 'rl,weak,normal,strong;rl,normal,normal,strong',
        '--format', 'json',
        '--output', 'out.json',
    ]);
    assert.deepStrictEqual(args.models, ['m1', 'm2']);
    assert.deepStrictEqual(args.runLabels, ['r1']);
    assert.deepStrictEqual(args.runRanks, [1, 2]);
    assert.strictEqual(args.games, 7);
    assert.strictEqual(args.seed, 11);
    assert.strictEqual(args.format, 'json');
    assert.strictEqual(args.output, 'out.json');
    assert.deepStrictEqual(args.lineups, [
        ['rl', 'weak', 'normal', 'strong'],
        ['rl', 'normal', 'normal', 'strong'],
    ]);
});

runTest('diagnose-rl-landmark-race は2人用モデルの4人診断を拒否する', () => {
    const tmpPath = path.join(os.tmpdir(), `machikoro-rl-race-model-${process.pid}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify({ stateDim: 145 }), 'utf8');
    assert.throws(
        () => diagnoseModel(
            { id: 'm145', path: tmpPath },
            {
                lineups: [['rl', 'weak', 'normal', 'strong']],
                games: 1,
                seed: 1,
                maxSteps: 10,
            },
            null
        ),
        /2-player RL model/
    );
    fs.unlinkSync(tmpPath);
});

runTest('diagnose-rl-landmark-race はRL敗戦時のlandmark gapを集計する', () => {
    const summary = summarizeLandmarkRaceMatches([
        {
            lineup: ['rl', 'weak', 'normal', 'strong'],
            winnerIndex: 3,
            turns: 100,
            exhausted: false,
            finalState: [
                playerState(['駅', '港'], ['ショッピングモール', '空港']),
                playerState(['駅'], ['港', 'ショッピングモール', '空港']),
                playerState(['駅', '港', 'ショッピングモール'], ['空港']),
                playerState(['駅', '港', 'ショッピングモール', '空港'], []),
            ],
        },
    ]);
    assert.strictEqual(summary.games, 1);
    assert.strictEqual(summary.losses, 1);
    assert.strictEqual(summary.averageLossLandmarkGap, 2);
    assert.strictEqual(summary.lossesWithRlRemainingTwo, 1);
    assert.strictEqual(summary.rlMissingLandmarkCountsOnLoss['空港'], 1);
    assert.strictEqual(summary.rlMissingLandmarkCountsOnLoss['ショッピングモール'], 1);
    assert.strictEqual(summary.winnerBuiltLandmarkCountsOnLoss['空港'], 1);
});

runTest('diagnose-rl-landmark-race はRL勝利をloss集計から除外する', () => {
    const summary = summarizeLandmarkRaceMatches([
        {
            lineup: ['rl', 'weak'],
            winnerIndex: 0,
            turns: 50,
            finalState: [
                playerState(['駅', '港', '空港'], []),
                playerState(['駅'], ['港', '空港']),
            ],
        },
        {
            lineup: ['rl', 'weak'],
            winnerIndex: 1,
            turns: 70,
            finalState: [
                playerState(['駅'], ['港', '空港']),
                playerState(['駅', '港', '空港'], []),
            ],
        },
    ]);
    assert.strictEqual(summary.games, 2);
    assert.strictEqual(summary.rlWins, 1);
    assert.strictEqual(summary.rlWinRate, 0.5);
    assert.strictEqual(summary.losses, 1);
    assert.strictEqual(summary.averageLossLandmarkGap, 2);
});

runTest('diagnose-rl-landmark-race はRL席が回転してもRL finalStateを見つける', () => {
    const summary = summarizeLandmarkRaceMatches([
        {
            lineup: ['weak', 'rl', 'normal', 'strong'],
            winnerIndex: 3,
            turns: 80,
            finalState: [
                playerState(['駅'], ['港', '空港']),
                playerState(['駅', '港', 'ショッピングモール'], ['空港']),
                playerState(['駅'], ['港', '空港']),
                playerState(['駅', '港', 'ショッピングモール', '空港'], []),
            ],
        },
    ]);
    assert.strictEqual(summary.losses, 1);
    assert.strictEqual(summary.averageLossLandmarkGap, 1);
    assert.strictEqual(summary.lossesWithRlRemainingOne, 1);
    assert.strictEqual(summary.rlMissingLandmarkCountsOnLoss['空港'], 1);
});

runTest('diagnose-rl-landmark-race mergeLandmarkRaceSummaries はsummaryを合算する', () => {
    const merged = mergeLandmarkRaceSummaries([
        {
            games: 2,
            rlWins: 1,
            losses: 1,
            averageTurns: 60,
            averageLossTurns: 70,
            averageLossLandmarkGap: 2,
            exhausted: 0,
            lossesWithRlRemainingOne: 0,
            lossesWithRlRemainingTwo: 1,
            lossGapCounts: { '2': 1 },
            rlMissingLandmarkCountsOnLoss: { '空港': 1 },
            winnerBuiltLandmarkCountsOnLoss: { '空港': 1 },
        },
        {
            games: 1,
            rlWins: 0,
            losses: 1,
            averageTurns: 90,
            averageLossTurns: 90,
            averageLossLandmarkGap: 1,
            exhausted: 1,
            lossesWithRlRemainingOne: 1,
            lossesWithRlRemainingTwo: 0,
            lossGapCounts: { '1': 1 },
            rlMissingLandmarkCountsOnLoss: { '港': 1 },
            winnerBuiltLandmarkCountsOnLoss: { '港': 1 },
        },
    ]);
    assert.strictEqual(merged.games, 3);
    assert.strictEqual(merged.rlWins, 1);
    assert.strictEqual(merged.losses, 2);
    assert.strictEqual(merged.averageTurns, 70);
    assert.strictEqual(merged.averageLossLandmarkGap, 1.5);
    assert.strictEqual(merged.lossGapCounts['1'], 1);
    assert.strictEqual(merged.lossGapCounts['2'], 1);
});

runTest('diagnose-rl-landmark-race renderText は主要値を出力する', () => {
    const text = renderText([
        {
            id: 'model-a',
            aggregate: {
                games: 10,
                rlWinRate: 0.6,
                losses: 4,
                averageLossLandmarkGap: 1.25,
                lossesWithRlRemainingOne: 2,
                lossesWithRlRemainingTwo: 1,
                topRlMissingLandmarksOnLoss: [{ name: '空港', count: 3 }],
            },
            summaries: [
                {
                    opponent: 'rl+strong+strong+strong',
                    raceSummary: {
                        games: 10,
                        rlWinRate: 0.4,
                        losses: 6,
                        averageLossLandmarkGap: 1.8,
                        topRlMissingLandmarksOnLoss: [{ name: '港', count: 2 }],
                    },
                },
            ],
        },
    ]);
    assert.ok(text.includes('model-a: win=60.0% losses=4/10 avgLossGap=1.25'));
    assert.ok(text.includes('空港:3'));
    assert.ok(text.includes('rl+strong+strong+strong: win=40.0% losses=6/10'));
});
