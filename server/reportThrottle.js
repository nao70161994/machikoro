'use strict';

function pruneRateBuckets(now, buckets, windowMs, maxBuckets) {
    for (const [bucketKey, bucket] of buckets.entries()) {
        if (!bucket || now - bucket.windowStart >= windowMs) buckets.delete(bucketKey);
    }
    if (buckets.size <= maxBuckets) return;
    const overflow = buckets.size - maxBuckets;
    for (const bucketKey of Array.from(buckets.keys()).slice(0, overflow)) buckets.delete(bucketKey);
}

function isRateLimited(key, now, buckets, limits) {
    pruneRateBuckets(now, buckets, limits.windowMs, limits.maxBuckets);
    const bucket = buckets.get(key);
    if (!bucket) {
        buckets.set(key, { windowStart: now, count: 1 });
        return false;
    }
    bucket.count++;
    return bucket.count > limits.max;
}

function rememberAndCheckDuplicate(key, now, cache, windowMs) {
    const previous = cache.get(key);
    cache.set(key, now);
    for (const [cachedKey, timestamp] of cache.entries()) {
        if (now - timestamp > windowMs) cache.delete(cachedKey);
    }
    return previous !== undefined && now - previous < windowMs;
}

function makeReportAdmission(options = {}) {
    if (typeof options.dedupeKey !== 'function') {
        throw new TypeError('dedupeKey must be a function');
    }
    const limits = options.limits || {};
    const defaultRateBuckets = options.rateBuckets || new Map();
    const defaultDedupeCache = options.dedupeCache || new Map();
    const dedupeKey = options.dedupeKey;

    function pruneAdmissionRateBuckets(now, buckets = defaultRateBuckets) {
        pruneRateBuckets(
            now,
            buckets,
            limits.rateLimitWindowMs,
            limits.rateLimitMaxBuckets
        );
    }

    function isAdmissionRateLimited(key, now = Date.now(), buckets = defaultRateBuckets) {
        return isRateLimited(key, now, buckets, {
            windowMs: limits.rateLimitWindowMs,
            max: limits.rateLimitMax,
            maxBuckets: limits.rateLimitMaxBuckets,
        });
    }

    function isDuplicate(report, now = Date.now(), cache = defaultDedupeCache) {
        return rememberAndCheckDuplicate(
            dedupeKey(report),
            now,
            cache,
            limits.duplicateWindowMs
        );
    }

    return Object.freeze({
        pruneRateBuckets: pruneAdmissionRateBuckets,
        isRateLimited: isAdmissionRateLimited,
        isDuplicate,
    });
}

module.exports = {
    pruneRateBuckets,
    isRateLimited,
    rememberAndCheckDuplicate,
    makeReportAdmission,
};
