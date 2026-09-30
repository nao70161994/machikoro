'use strict';

const assert = require('assert');
const { OnlineEffectAuthority } = require('../js/onlineEffectAuthority');

assert.deepStrictEqual(OnlineEffectAuthority.selectExecutor({
    enabled: false,
    authoritativePlan: true,
    executorAvailable: true,
}), { source: 'legacy', fallbackReason: '' });

assert.deepStrictEqual(OnlineEffectAuthority.selectExecutor({
    enabled: true,
    authoritativePlan: false,
    executorAvailable: true,
    planFallbackReason: 'parity-mismatch',
}), { source: 'legacy-fallback', fallbackReason: 'parity-mismatch' });

assert.deepStrictEqual(OnlineEffectAuthority.selectExecutor({
    enabled: true,
    authoritativePlan: false,
    executorAvailable: true,
    preserveEmptyPlanFallbackReason: true,
}), { source: 'legacy-fallback', fallbackReason: '' });

assert.deepStrictEqual(OnlineEffectAuthority.selectExecutor({
    enabled: true,
    authoritativePlan: true,
    executorAvailable: false,
}), { source: 'legacy-fallback', fallbackReason: 'executor-unavailable' });

assert.deepStrictEqual(OnlineEffectAuthority.selectExecutor({
    enabled: true,
    authoritativePlan: true,
    executorAvailable: false,
}), { source: 'legacy-fallback', fallbackReason: 'executor-unavailable' });

assert.deepStrictEqual(OnlineEffectAuthority.selectExecutor({
    enabled: true,
    authoritativePlan: true,
    executorAvailable: true,
}), { source: 'executor', fallbackReason: '' });

assert.ok(Object.isFrozen(OnlineEffectAuthority.selectExecutor({ enabled: true })));
console.log('online effect authority tests passed');
