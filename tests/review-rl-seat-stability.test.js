const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');
const {
    parseArgs,
    buildSeatStabilityReport,
    renderText,
} = require('../scripts/review-rl-seat-stability.js');

function document(seed, rates) {
    const games = rates.map(() => 2);
    const wins = rates.map(rate => rate * 2);
    return {
        inputPath: `/tmp/seed${seed}.json`,
        results: [{
            id: 'model',
            evaluationConfig: { seed },
            summaries: [{
                opponent: 'rl+weak+normal',
                lineup: ['rl', 'weak', 'normal'],
                games: 6,
                rlWins: wins.reduce((sum, value) => sum + value, 0),
                rlWinRate: wins.reduce((sum, value) => sum + value, 0) / 6,
                exhausted: seed === 101 ? 1 : 0,
                rlBuildStats: { total: 10, pass: seed === 101 ? 2 : 0 },
                rlSeatGamesByIndex: games,
                rlSeatWinsByIndex: wins,
            }],
        }],
    };
}

runTest('seat stability args は複数入力と出力を解釈する', () => {
    assert.deepStrictEqual(parseArgs(['--inputs', 'a.json,b.json', '--output', 'out.json', '--format', 'json']), {
        inputs: ['a.json', 'b.json'], output: 'out.json', format: 'json',
    });
});

runTest('seat stability report はseedを跨いで席別勝率を試合数加重で集計する', () => {
    const report = buildSeatStabilityReport([
        document(1, [1, 0.5, 0]),
        document(101, [0.5, 0.5, 0.5]),
    ]);
    assert.deepStrictEqual(report.seeds, [1, 101]);
    assert.strictEqual(report.minGamesPerSeat, 4);
    assert.strictEqual(report.lineups[0].games, 12);
    assert.deepStrictEqual(report.lineups[0].seatGames, [4, 4, 4]);
    assert.deepStrictEqual(report.lineups[0].seatWins, [3, 2, 1]);
    assert.deepStrictEqual(report.lineups[0].seatWinRates, [0.75, 0.5, 0.25]);
    assert.strictEqual(report.lineups[0].seatRange.gap, 0.5);
    assert.strictEqual(report.maxSeatGap, 0.5);
    assert.strictEqual(report.totalExhausted, 1);
    assert.strictEqual(report.lineups[0].exhausted, 1);
    assert.strictEqual(report.maxBuildPassRate, 0.1);
    assert.strictEqual(report.lineups[0].buildPassRate, 0.1);
    assert.match(renderText(report), /minGamesPerSeat=4/);
    assert.match(renderText(report), /gap=50\.0pt/);
    assert.match(renderText(report), /exhausted=1/);
    assert.match(renderText(report), /maxPass=10\.00%/);
});

runTest('seat stability report は席の試合数がない旧artifactを拒否する', () => {
    assert.throws(() => buildSeatStabilityReport([{
        inputPath: '/tmp/old.json',
        results: [{ id: 'old', summaries: [{ lineup: ['rl', 'weak'], games: 2 }] }],
    }]), /seat game\/win counts are required/);
});

runTest('seat stability shell は5seedと10人lineupを既定にする', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rl', 'eval-adopted-seat-stability.sh'), 'utf8');
    assert.match(source, /SEEDS="\$\{4:-1,101,201,301,401\}"/);
    const lineupMatch = source.match(/LINEUPS="([^"]+)"/);
    assert.ok(lineupMatch);
    for (const lineup of lineupMatch[1].split(';')) assert.strictEqual(lineup.split(',').length, 10);
    assert.match(source, /review-rl-seat-stability\.js/);
});
