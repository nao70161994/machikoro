const assert = require('assert');
const UiLogDisplay = require('../js/uiLogDisplay');

const logTypes = {
    DICE: 'dice',
    GAIN: 'gain',
    LOSE: 'lose',
    BUILD: 'build',
    SPECIAL: 'special',
    SYSTEM: 'system',
    ERROR: 'error',
};
const display = UiLogDisplay.makeLogTypeDisplay(logTypes);

assert.deepStrictEqual(UiLogDisplay.classifyLogEntry({ type: 'gain' }, display), {
    cls: 'log-gain',
    label: '収入',
});
assert.deepStrictEqual(UiLogDisplay.classifyLogEntry({ type: 'unknown' }, display), {
    cls: 'log-system',
    label: '進行',
});
assert.ok(Object.isFrozen(display));
assert.ok(Object.isFrozen(display.gain));

assert.deepStrictEqual(UiLogDisplay.extractLogDetails({
    message: '🌾 Aliceの麦畑発動 +2コイン',
}), {
    actor: 'Alice',
    target: '',
    amount: '+2',
    subject: '麦畑',
});
assert.deepStrictEqual(UiLogDisplay.extractLogDetails({
    message: '📺 AliceからBobに5コイン',
}), {
    actor: 'Alice',
    target: 'Bob',
    amount: '5',
    subject: 'AliceからBobに5コイン',
});
assert.deepStrictEqual(UiLogDisplay.extractLogDetails(null), {
    actor: '',
    target: '',
    amount: '',
    subject: '',
});

console.log('ui log display tests passed');

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const entries = [
    { type: 'gain', message: '<old>' },
    '__SEP__',
    { type: 'build', message: 'latest & safe' },
];
assert.strictEqual(UiLogDisplay.buildLogEntriesHtml(entries, display, escapeHtml),
    '<div class="log-item log-gain">&lt;old&gt;</div>' +
    '<div class="log-separator"></div>' +
    '<div class="log-item log-build log-latest">latest &amp; safe</div>'
);

assert.strictEqual(
    UiLogDisplay.buildLogSummaryHtml([], display, escapeHtml),
    '<span class="log-chip">ログはまだありません</span>'
);
const summary = UiLogDisplay.buildLogSummaryHtml([{
    type: 'gain',
    message: '🌾 Aliceの麦畑発動 +2コイン',
}], display, escapeHtml);
assert.strictEqual(summary,
    '<span class="log-chip highlight">最新: 🌾 Aliceの麦畑発動 +2コイン</span>' +
    '<div class="log-detail-row">' +
    '<span class="log-detail-card"><span class="log-detail-label">主体</span><span class="log-detail-value">Alice</span></span>' +
    '<span class="log-detail-card"><span class="log-detail-label">対象カード</span><span class="log-detail-value">麦畑</span></span>' +
    '<span class="log-detail-card"><span class="log-detail-label">コイン変動</span><span class="log-detail-value">++2コイン</span></span>' +
    '</div><span class="log-chip">収入 1</span>'
);

assert.deepStrictEqual(UiLogDisplay.buildLogToggleView(true), {
    collapsed: true,
    iconText: '▶',
    ariaExpanded: 'false',
});
const expandedToggle = UiLogDisplay.buildLogToggleView(false);
assert.deepStrictEqual(expandedToggle, {
    collapsed: false,
    iconText: '▼',
    ariaExpanded: 'true',
});
assert.ok(Object.isFrozen(expandedToggle));

const firstHistory = UiLogDisplay.updateLogHistory([], 0, [
    { type: 'dice', message: 'first' },
    { type: 'gain', message: 'second' },
]);
assert.deepStrictEqual(firstHistory, {
    entries: [
        { type: 'dice', message: 'first' },
        { type: 'gain', message: 'second' },
    ],
    currentLength: 2,
    entryCount: 2,
});
assert.ok(Object.isFrozen(firstHistory));
assert.ok(Object.isFrozen(firstHistory.entries));

const resetHistory = UiLogDisplay.updateLogHistory(
    firstHistory.entries,
    firstHistory.currentLength,
    [{ type: 'build', message: 'new turn' }]
);
assert.deepStrictEqual(resetHistory.entries, [
    { type: 'dice', message: 'first' },
    { type: 'gain', message: 'second' },
    '__SEP__',
    { type: 'build', message: 'new turn' },
]);

const rerollHistory = UiLogDisplay.updateLogHistory(
    firstHistory.entries,
    firstHistory.currentLength,
    [{ type: 'dice', message: '📡 reroll' }]
);
assert.deepStrictEqual(rerollHistory.entries, [
    { type: 'dice', message: 'first' },
    { type: 'gain', message: 'second' },
    { type: 'dice', message: '📡 reroll' },
]);

const boundedHistory = UiLogDisplay.updateLogHistory(
    ['__SEP__', { message: 'old' }, '__SEP__'],
    3,
    [{ message: 'new' }],
    2
);
assert.deepStrictEqual(boundedHistory.entries, [{ message: 'new' }]);
assert.strictEqual(boundedHistory.entryCount, 1);


const sourceHistoryEntries = [{ type: 'dice', message: 'first' }];
const historyController = UiLogDisplay.createHistoryController({
    entries: sourceHistoryEntries,
    currentLength: 1,
    maxEntries: 3,
});
sourceHistoryEntries.push({ type: 'gain', message: 'external' });
assert.deepStrictEqual(historyController.snapshot(), {
    entries: [{ type: 'dice', message: 'first' }],
    currentLength: 1,
    entryCount: 1,
});
const appendedControllerHistory = historyController.append([
    { type: 'dice', message: 'first' },
    { type: 'gain', message: 'second' },
]);
assert.deepStrictEqual(appendedControllerHistory, {
    entries: [
        { type: 'dice', message: 'first' },
        { type: 'gain', message: 'second' },
    ],
    currentLength: 2,
    entryCount: 2,
});
assert.notStrictEqual(historyController.snapshot().entries, historyController.snapshot().entries);
assert.ok(Object.isFrozen(historyController));
assert.ok(Object.isFrozen(appendedControllerHistory));
assert.ok(Object.isFrozen(appendedControllerHistory.entries));
assert.deepStrictEqual(historyController.reset(), {
    entries: [], currentLength: 0, entryCount: 0,
});
