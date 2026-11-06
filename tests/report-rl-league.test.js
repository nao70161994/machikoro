'use strict';
const assert = require('assert');
const { calculate, formatMarkdown, jensenShannon } = require('../scripts/report-rl-league');
const { runTest } = require('./helpers/test-utils');

function match(a, b, players, wa, wb) {
    const lineup = players === 2 ? ['candidate','baseline'] : ['candidate','baseline','normal','strong'];
    const games = players === 2 ? 100 : 80;
    return {
        candidate: 'models/rl_model/portfolio/' + a + '.browser.json',
        baseline: 'models/rl_model/portfolio/' + b + '.browser.json',
        pairedSeats: true, gamesPerLineup: games,
        entries: [{
            lineup, games, candidateWins: wa, baselineWins: wb, exhausted: 0,
            candidateBuildStats: { cards: { 農園: 18, 花畑: 12 }, landmarks: { 駅: 10 } },
            baselineBuildStats: { cards: { 寿司屋: 25, 牧場: 4 }, landmarks: { 港: 12 } },
        }],
        totals: {games,candidateWins:wa,baselineWins:wb},
    };
}
runTest('RL league report ranks by decisive head-to-head share and lists card diversity', () => {
    const r = calculate([match('seed73','seed76',2,58,42),match('seed73','seed71',2,61,39)]);
    assert.strictEqual(r.pairs.length, 2);
    assert.strictEqual(r.standings['2p'][0].name, 'seed73');
    assert.strictEqual(r.standings['2p'][0].wins, 119);
    assert.strictEqual(r.standings['2p'][0].opponentWins, 81);
    assert.strictEqual(r.diversity['2p'].length, 3);
    assert.ok(r.diversity['2p'].some(x => x.jsDivergenceBits > 0.5));
    assert.ok(formatMarkdown(r).includes('Top cards'));
});
runTest('RL league report separates AI and rule-based CPU wins in multiplayer', () => {
    const r = calculate([match('seed104','seed103',4,42,25)]);
    assert.strictEqual(r.pairs[0].otherWins, 13);
    assert.strictEqual(r.standings['4p'][0].cpuWins, 13);
});
runTest('RL league report rejects duplicates, mismatched rotation and exhausted games', () => {
    const a = match('A','B',2,60,40);
    assert.throws(() => calculate([a,a]), /duplicate matchup/);
    assert.throws(() => calculate([{...a, gamesPerLineup:99}]), /rotate seats/);
    assert.throws(() => calculate([{...a, entries:[{...a.entries[0], exhausted:1}]}]), /step-exhausted/);
});
runTest('RL league report divergence 0 for identical distributions', () => {
    assert.strictEqual(jensenShannon({a:.5,b:.5},{a:.5,b:.5}),0);
});
