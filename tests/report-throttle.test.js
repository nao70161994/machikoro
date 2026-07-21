const assert = require('assert');
const {
    pruneRateBuckets,
    isRateLimited,
    rememberAndCheckDuplicate,
} = require('../server/reportThrottle');
const { runTest } = require('./helpers/test-utils');

runTest('report throttleは期限切れbucketと上限超過の古い挿入順bucketを掃除する', () => {
    const buckets = new Map([
        ['expired', { windowStart: 0, count: 2 }],
        ['missing', null],
        ['oldest-live', { windowStart: 51, count: 1 }],
        ['newest-live', { windowStart: 60, count: 1 }],
    ]);

    pruneRateBuckets(100, buckets, 50, 1);

    assert.deepStrictEqual([...buckets.keys()], ['newest-live']);
});

runTest('report throttleは同一windowの上限超過だけを拒否し期限後にresetする', () => {
    const buckets = new Map();
    const limits = { windowMs: 100, max: 2, maxBuckets: 10 };

    assert.strictEqual(isRateLimited('client', 1000, buckets, limits), false);
    assert.strictEqual(isRateLimited('client', 1010, buckets, limits), false);
    assert.strictEqual(isRateLimited('client', 1020, buckets, limits), true);
    assert.deepStrictEqual(buckets.get('client'), { windowStart: 1000, count: 3 });

    assert.strictEqual(isRateLimited('client', 1100, buckets, limits), false);
    assert.deepStrictEqual(buckets.get('client'), { windowStart: 1100, count: 1 });
});

runTest('report throttleの重複判定は既存のstrict window境界とcache掃除を維持する', () => {
    const cache = new Map([['stale', 0]]);

    assert.strictEqual(rememberAndCheckDuplicate('same', 100, cache, 50), false);
    assert.strictEqual(cache.has('stale'), false);
    assert.strictEqual(rememberAndCheckDuplicate('same', 149, cache, 50), true);
    assert.strictEqual(rememberAndCheckDuplicate('same', 199, cache, 50), false);
    assert.strictEqual(rememberAndCheckDuplicate('same', 200, cache, 50), true);
});
