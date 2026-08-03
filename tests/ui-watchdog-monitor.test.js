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
