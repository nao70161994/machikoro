const assert = require('assert');
const UiWatchdogMonitor = require('../js/uiWatchdogMonitor');

const monitor = UiWatchdogMonitor.create({ thresholdMs: 5000, reportSuppressMs: 60000 });
assert.deepStrictEqual(monitor.observeProgress('roll|0', 1000), {
    shouldClassify: false,
    stagnantMs: 0,
});
assert.deepStrictEqual(monitor.observeProgress('roll|0', 5999), {
    shouldClassify: false,
    stagnantMs: 4999,
});
assert.deepStrictEqual(monitor.observeProgress('roll|0', 6000), {
    shouldClassify: true,
    stagnantMs: 5000,
});
assert.strictEqual(
    monitor.decideReport('', '', 6000),
    UiWatchdogMonitor.ACTIONS.NONE
);
assert.strictEqual(
    monitor.decideReport('cpu-turn-stalled', 'cpu-turn-stalled|build', 6000),
    UiWatchdogMonitor.ACTIONS.REPORT_AND_RECOVER
);
assert.strictEqual(
    monitor.decideReport('cpu-turn-stalled', 'cpu-turn-stalled|build', 65999),
    UiWatchdogMonitor.ACTIONS.RECOVER
);
assert.strictEqual(
    monitor.decideReport('cpu-turn-stalled', 'cpu-turn-stalled|build', 66000),
    UiWatchdogMonitor.ACTIONS.REPORT_AND_RECOVER
);
assert.deepStrictEqual(monitor.observeProgress('build|1', 70000), {
    shouldClassify: false,
    stagnantMs: 0,
});

const beforeReset = monitor.snapshot();
assert.strictEqual(beforeReset.lastKey, 'build|1');
assert.strictEqual(beforeReset.lastReportKey, 'cpu-turn-stalled|build');
monitor.reset();
assert.deepStrictEqual(monitor.snapshot(), {
    lastKey: '',
    lastChangedAt: 0,
    lastReportKey: '',
    lastReportAt: 0,
});
assert.deepStrictEqual(monitor.observeProgress('', 80000), {
    shouldClassify: false,
    stagnantMs: 0,
});

console.log('ui-watchdog-monitor.test.js passed');

const batch = UiWatchdogMonitor.createPendingBatchController();
assert.deepStrictEqual(batch.snapshot(), { pending: false, remaining: 0 });
assert.strictEqual(batch.begin(4), true);
assert.strictEqual(batch.begin(2), false);
assert.deepStrictEqual(batch.complete(), { pending: true, remaining: 3 });
batch.complete();
batch.complete();
assert.deepStrictEqual(batch.complete(), { pending: false, remaining: 0 });
assert.deepStrictEqual(batch.complete(), { pending: false, remaining: 0 });
assert.strictEqual(batch.begin(0), false);
assert.ok(Object.isFrozen(batch));
assert.ok(Object.isFrozen(batch.snapshot()));
console.log('ui-watchdog pending batch controller passed');
