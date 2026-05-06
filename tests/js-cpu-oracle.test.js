const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

function queryOracle(payload) {
    const result = spawnSync(
        process.execPath,
        [path.join(__dirname, '..', 'scripts', 'rl', 'js_cpu_action_oracle.js')],
        {
            input: `${JSON.stringify(payload)}\n`,
            encoding: 'utf8',
        }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    const line = result.stdout.trim().split('\n')[0];
    return JSON.parse(line);
}

function basePlayers() {
    return [
        {
            coins: 4,
            cards: { '麦畑': 1, 'パン屋': 1 },
            landmarks: {},
        },
        {
            coins: 3,
            cards: { '麦畑': 1, 'パン屋': 1 },
            landmarks: {},
        },
    ];
}

{
    const result = queryOracle({
        difficulty: 'normal',
        phase: 'build',
        currentPlayerIndex: 0,
        players: basePlayers(),
        shopStock: {},
    });
    assert.strictEqual(result.label, 'BUY_LM:駅');
}

{
    const result = queryOracle({
        difficulty: 'strong',
        phase: 'selectDice',
        currentPlayerIndex: 0,
        players: [
            {
                coins: 0,
                cards: { '麦畑': 1, 'パン屋': 1, 'サンマ漁船': 2, 'ビジネスセンター': 1, '改装屋': 1, '貸金業': 3 },
                landmarks: { '駅': true, '港': true, 'ショッピングモール': true },
            },
            {
                coins: 1,
                cards: { '麦畑': 1, 'パン屋': 1, 'バーガーショップ': 2, '出版社': 1, '清掃業': 1, '税務署': 1, '貸金業': 3 },
                landmarks: { '駅': true, '港': true },
            },
        ],
        shopStock: {},
    });
    assert.strictEqual(result.label, 'ROLL1');
}

console.log('js-cpu-oracle tests passed');
