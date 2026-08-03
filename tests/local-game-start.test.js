const assert = require('assert');
const LocalGameStart = require('../js/localGameStart');

assert.strictEqual(LocalGameStart.initialDecision({ startPending: true }), 'ignore-pending');
assert.strictEqual(LocalGameStart.initialDecision({ loadStatus: 'loading' }), 'wait-loading');
assert.strictEqual(LocalGameStart.initialDecision({ loadStatus: 'ready' }), 'inspect-preload');
assert.strictEqual(LocalGameStart.preloadDecision(null), 'start');
assert.strictEqual(LocalGameStart.preloadDecision({ then() {} }), 'preload');

const settings = [{ type: 'human', name: 'A' }, { type: 'cpu', difficulty: 'expert' }];
const plan = LocalGameStart.runtimePlan(2, settings, 1500);
assert.deepStrictEqual(plan, {
    playerCount: 2,
    playerSettings: settings,
    cpuSpeed: 1500,
});
assert.notStrictEqual(plan.playerSettings, settings);
assert.notStrictEqual(plan.playerSettings[0], settings[0]);
assert.ok(Object.isFrozen(plan));
assert.ok(Object.isFrozen(plan.playerSettings));
settings[0].name = 'changed';
assert.strictEqual(plan.playerSettings[0].name, 'A');

const calls = [];
const result = LocalGameStart.execute(plan, Object.fromEntries(
    LocalGameStart.EFFECT_STEPS.map(step => [step, value => calls.push([step, value])])
));
assert.deepStrictEqual(calls.map(call => call[0]), LocalGameStart.EFFECT_STEPS);
assert.strictEqual(calls[0][1], plan);
assert.strictEqual(calls[6][1], 2);
assert.deepStrictEqual(result, { ok: true, steps: LocalGameStart.EFFECT_STEPS });

const incompleteCalls = [];
assert.throws(() => LocalGameStart.execute(plan, {
    setRuntime() { incompleteCalls.push('setRuntime'); },
}), /handler is required: saveSettings/);
assert.deepStrictEqual(incompleteCalls, []);
assert.throws(() => LocalGameStart.execute(null, {}), /plan is required/);

console.log('local-game-start.test.js passed');
