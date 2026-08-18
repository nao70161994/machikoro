const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'rl', 'eval-adopted-stability.sh');

runTest('採用RL安定性評価は3・4・5・10人を同じ試合数で評価する', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
    for (const playerCount of [3, 4, 5, 10]) {
        assert.match(source, new RegExp(`LINEUPS_${playerCount}P=`));
        assert.match(source, new RegExp(`--lineups \\"\\$LINEUPS_${playerCount}P\\"`));
        assert.match(source, new RegExp(`\\$\\{OUT_PREFIX\\}-${playerCount}p\\.json`));
        assert.match(source, new RegExp(`\\$\\{OUT_PREFIX\\}-${playerCount}p\\.csv`));
    }
    assert.strictEqual((source.match(/--games "\$GAMES"/g) || []).length, 4);
});

runTest('採用RL安定性評価は各人数で3種類のlineupを持つ', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
    for (const playerCount of [3, 4, 5, 10]) {
        const match = source.match(new RegExp(`LINEUPS_${playerCount}P="([^"]+)"`));
        assert.ok(match, `${playerCount}p lineups missing`);
        const lineups = match[1].split(';').map(lineup => lineup.split(','));
        assert.strictEqual(lineups.length, 3);
        for (const lineup of lineups) {
            assert.strictEqual(lineup.length, playerCount);
            assert.strictEqual(lineup.filter(value => value === 'rl').length, 1);
        }
    }
});
