const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    integerOrDefault,
    parseIntegerList,
    parseIntegerOrDefault,
    parseLineups,
    parseList,
} = require('../scripts/cli-args.js');

runTest('cli-args integer helpers は 0 指定を fallback にしない', () => {
    assert.strictEqual(integerOrDefault(0, 5), 0);
    assert.strictEqual(integerOrDefault(undefined, 5), 5);
    assert.strictEqual(parseIntegerOrDefault('0', 5), 0);
    assert.strictEqual(parseIntegerOrDefault('', 5), 5);
});

runTest('cli-args parseList は空要素を除いて trim する', () => {
    assert.deepStrictEqual(parseList(' a, ,b ,, c '), ['a', 'b', 'c']);
});

runTest('cli-args parseIntegerList は最小値未満と不正値を除外する', () => {
    assert.deepStrictEqual(parseIntegerList('1,2,x,0,4', { min: 1 }), [1, 2, 4]);
    assert.deepStrictEqual(parseIntegerList('0,2', { min: 0 }), [0, 2]);
});

runTest('cli-args parseLineups は rl を含む 2人以上の lineup だけを返す', () => {
    assert.deepStrictEqual(
        parseLineups('rl,weak,normal; normal,strong ; rl ; weak,rl '),
        [['rl', 'weak', 'normal'], ['weak', 'rl']]
    );
});
