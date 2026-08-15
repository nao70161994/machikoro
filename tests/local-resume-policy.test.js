const assert = require('assert');
const LocalResumePolicy = require('../js/localResumePolicy');

assert.strictEqual(LocalResumePolicy.shouldInspectRepository({
    resumePending: true,
    fromPreload: false,
}), false);
assert.strictEqual(LocalResumePolicy.shouldInspectRepository({
    resumePending: true,
    fromPreload: true,
}), true);
assert.strictEqual(LocalResumePolicy.initialDecision({
    resumePending: false,
    repositoryExists: false,
}), LocalResumePolicy.DECISIONS.NO_SAVE);
assert.strictEqual(LocalResumePolicy.initialDecision({
    resumePending: false,
    repositoryExists: true,
}), 'read-save');

assert.deepStrictEqual(LocalResumePolicy.decide({ decoded: { ok: false } }), {
    kind: LocalResumePolicy.DECISIONS.INVALID,
    state: null,
    cpuSettings: [],
});

const state = { players: [{}, {}, {}] };
const cpuSettings = [
    null,
    { difficulty: 'expert' },
    { difficulty: 'rl', modelId: 'portfolio-3p' },
];
assert.strictEqual(LocalResumePolicy.shouldInspectRlLoadState(cpuSettings, false, true), true);
assert.strictEqual(LocalResumePolicy.shouldInspectRlLoadState(cpuSettings, true, true), false);
assert.strictEqual(LocalResumePolicy.shouldInspectRlLoadState([{ difficulty: 'normal' }], false, true), false);

const preloadDecision = LocalResumePolicy.decide({
    decoded: { ok: true, state },
    cpuSettings,
    canPreloadRl: true,
    rlLoadState: { status: 'loading' },
});
assert.strictEqual(preloadDecision.kind, LocalResumePolicy.DECISIONS.PRELOAD_RL);
assert.strictEqual(preloadDecision.state, state);
assert.deepStrictEqual(preloadDecision.cpuSettings, cpuSettings);

for (const facts of [
    { skipRlPreload: true, canPreloadRl: true, rlLoadState: null },
    { skipRlPreload: false, canPreloadRl: false, rlLoadState: null },
    { skipRlPreload: false, canPreloadRl: true, rlLoadState: { status: 'ready' } },
]) {
    assert.strictEqual(LocalResumePolicy.decide({
        decoded: { ok: true, state },
        cpuSettings,
        ...facts,
    }).kind, LocalResumePolicy.DECISIONS.RESUME);
}

const creationPlan = LocalResumePolicy.cpuCreationPlan(cpuSettings, 3);
assert.strictEqual(creationPlan[0], null);
assert.deepStrictEqual(creationPlan[1], {
    difficulty: 'expert',
    options: {
        expertPurpose: 'live',
        playerCount: 3,
        expertOpponentDifficulties: ['human', 'expert', 'rl'],
        rlModelId: null,
    },
});
assert.deepStrictEqual(creationPlan[2], {
    difficulty: 'rl',
    options: {
        expertPurpose: 'live',
        playerCount: 3,
        expertOpponentDifficulties: ['human', 'expert', 'rl'],
        rlModelId: 'portfolio-3p',
    },
});
assert.strictEqual(
    creationPlan[1].options.expertOpponentDifficulties,
    creationPlan[2].options.expertOpponentDifficulties
);

const runtimeState = {
    players: [{}, {}],
    cpuSpeed: 800,
    enabledCardsList: ['麦畑'],
    enabledLandmarksList: [],
};
const runtimePlan = LocalResumePolicy.runtimePlan(
    runtimeState,
    [null, { difficulty: 'strong' }],
    ['駅', '空港']
);
assert.strictEqual(runtimePlan.state, runtimeState);
assert.strictEqual(runtimePlan.playerCount, 2);
assert.strictEqual(runtimePlan.cpuSpeed, 800);
assert.deepStrictEqual(runtimePlan.enabledCards, ['麦畑']);
assert.deepStrictEqual(runtimePlan.enabledLandmarks, ['駅', '空港']);
assert.strictEqual(runtimePlan.marketRule, 'standard');
assert.ok(Object.isFrozen(runtimePlan));
assert.ok(Object.isFrozen(runtimePlan.enabledCards));
assert.ok(Object.isFrozen(runtimePlan.enabledLandmarks));
assert.strictEqual(LocalResumePolicy.runtimePlan(
    { players: [{}, {}] },
    [],
    []
).cpuSpeed, 1500);
assert.strictEqual(LocalResumePolicy.runtimePlan(
    { players: [{}, {}], cpuSpeed: 0 },
    [],
    []
).cpuSpeed, 1500);
assert.strictEqual(LocalResumePolicy.runtimePlan(
    { players: [{}, {}], marketSupply: { mode: 'ten-type' } },
    [],
    []
).marketRule, 'ten-type');

const effectOrder = [];
const effects = {};
for (const name of [
    'captureRuntime',
    'rollbackRuntime',
    'invalidateCpuSchedule',
    'cancelDelayedHumanAction',
    'resetOnline',
    'resetUiLocks',
    'applySettings',
    'createCpuPlayers',
    'resetPresentationState',
    'cancelAutoSkip',
    'clearUndo',
    'showGame',
    'render',
    'scheduleCpu',
]) {
    effects[name] = () => effectOrder.push(name);
}
effects.captureRuntime = () => {
    effectOrder.push('captureRuntime');
    return { marker: 'before' };
};
effects.createAndHydrateGame = plan => {
    effectOrder.push('createAndHydrateGame');
    assert.strictEqual(plan, runtimePlan);
    return true;
};
assert.deepStrictEqual(LocalResumePolicy.executeRuntime(runtimePlan, effects), {
    ok: true,
    reason: 'resumed',
});
assert.deepStrictEqual(effectOrder, [
    'captureRuntime',
    'invalidateCpuSchedule',
    'cancelDelayedHumanAction',
    'resetOnline',
    'resetUiLocks',
    'applySettings',
    'createAndHydrateGame',
    'createCpuPlayers',
    'resetPresentationState',
    'cancelAutoSkip',
    'clearUndo',
    'showGame',
    'render',
    'scheduleCpu',
]);

const hydrationFailureOrder = [];
const hydrationFailureEffects = Object.fromEntries(Object.keys(effects).map(name => [
    name,
    () => {
        hydrationFailureOrder.push(name);
        return name === 'createAndHydrateGame' ? false : undefined;
    },
]));
hydrationFailureEffects.captureRuntime = () => {
    hydrationFailureOrder.push('captureRuntime');
    return { marker: 'before' };
};
assert.deepStrictEqual(LocalResumePolicy.executeRuntime(runtimePlan, hydrationFailureEffects), {
    ok: false,
    reason: 'hydrate-failed',
});
assert.deepStrictEqual(hydrationFailureOrder, [
    'captureRuntime',
    'invalidateCpuSchedule',
    'cancelDelayedHumanAction',
    'resetOnline',
    'resetUiLocks',
    'applySettings',
    'createAndHydrateGame',
    'rollbackRuntime',
]);

const runtimeFailureOrder = [];
const runtimeFailureEffects = Object.fromEntries(Object.keys(effects).map(name => [
    name,
    value => {
        runtimeFailureOrder.push([name, value]);
        if (name === 'captureRuntime') return { marker: 'captured' };
        if (name === 'createAndHydrateGame') return true;
        if (name === 'render') throw new Error('temporary render failure');
        return undefined;
    },
]));
assert.deepStrictEqual(LocalResumePolicy.executeRuntime(runtimePlan, runtimeFailureEffects), {
    ok: false,
    reason: 'runtime-failed',
});
assert.deepStrictEqual(runtimeFailureOrder[runtimeFailureOrder.length - 1], [
    'rollbackRuntime',
    { marker: 'captured' },
]);
assert.deepStrictEqual(LocalResumePolicy.executeRuntime(runtimePlan, {}), {
    ok: false,
    reason: 'invalid-effects',
});

console.log('local-resume-policy.test.js passed');
