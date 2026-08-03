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

console.log('local-resume-policy.test.js passed');
