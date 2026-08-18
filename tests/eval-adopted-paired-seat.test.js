const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'rl', 'eval-adopted-paired-seat.sh');

runTest('paired seat評価は10席を同一seed blockで比較する', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
    assert.match(source, /BLOCKS="\$\{1:-20\}"/);
    assert.match(source, /PLAYER_COUNT=10/);
    assert.match(source, /GAMES=\$\(\(BLOCKS \* PLAYER_COUNT\)\)/);
    assert.match(source, /--paired-seats/);
    const lineupMatch = source.match(/LINEUPS="([^"]+)"/);
    assert.ok(lineupMatch);
    for (const lineup of lineupMatch[1].split(';')) {
        assert.strictEqual(lineup.split(',').length, 10);
        assert.strictEqual(lineup.split(',').filter(value => value === 'rl').length, 1);
    }
});
