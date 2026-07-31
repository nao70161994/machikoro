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
