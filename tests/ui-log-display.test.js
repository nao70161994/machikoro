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
    '<span class="log-detail-card"><span class="log-detail-label">コイン変動</span><span class="log-detail-value">+2コイン</span></span>' +
    '</div><span class="log-chip">収入 1</span>'
);

for (const amount of ['+2', '-2', '0']) {
    const html = UiLogDisplay.buildLogSummaryHtml([
        { type: 'gain', message: `🌾 Aliceの麦畑発動 → ${amount}コイン` },
    ], display, escapeHtml);
    const expected = amount === '0' ? '+0' : amount;
    assert.ok(html.includes(`>${expected}コイン</span>`), amount);
    assert.ok(!html.includes('++'), amount);
}
for (const message of ['🏗️ 麦畑を建設！', '🏆 駅を建設！', '🔨 駅を取り壊して+8コイン']) {
    assert.strictEqual(UiLogDisplay.extractLogDetails({ message }).target, '', message);
    assert.ok(!UiLogDisplay.buildLogSummaryHtml([{ type: 'build', message }], display, escapeHtml)
        .includes('相手/対象'), message);
}
for (const [message, target] of [
    ['🚚 麦畑をAliceに渡して+4コイン', 'Alice'],
    ['🔄 麦畑 ⇔ Aliceの牧場 を交換しました', 'Alice'],
    ['📺 Aliceから5コイン奪いました', 'Alice'],
    ['📺 AliceからBobに5コイン', 'Bob'],
    ['📰 Aliceから5コイン', 'Alice'],
]) assert.strictEqual(UiLogDisplay.extractLogDetails({ message }).target, target, message);

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
    firstHistory.currentLength + 3,
    [
        { type: 'dice', message: '🎲 4+4=8' },
        { type: 'dice', message: '📡 reroll: 4+4=8 → 4+4=8' },
    ]
);
assert.deepStrictEqual(rerollHistory.entries, [
    { type: 'dice', message: 'first' },
    { type: 'gain', message: 'second' },
    { type: 'dice', message: '🎲 4+4=8' },
    { type: 'dice', message: '📡 reroll: 4+4=8 → 4+4=8' },
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

const relatedHtml = UiLogDisplay.buildLogEntriesHtml([
    { type: 'build', message: '🏗️ パン屋を建設！' },
], UiLogDisplay.makeLogTypeDisplay({ BUILD: 'build' }), value => String(value)
    .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
assert.match(relatedHtml, /data-ui-action="highlightLogEntry"/);
assert.match(relatedHtml, /data-player-name=""/);
assert.match(relatedHtml, /data-card-name="パン屋"/);
assert.match(relatedHtml, /data-log-message="🏗️ パン屋を建設！"/);
const sunsetRelatedHtml = UiLogDisplay.buildLogEntriesHtml([
    { type: 'system', message: '👤 Aliceのターン' },
    { type: 'build', message: '🏗️ パン屋を建設！' },
], display, escapeHtml, { stripLeadingEmoji: true, useSunsetIcons: true });
assert.match(sunsetRelatedHtml, /<span>Aliceのターン<\/span><\/button>/);
assert.match(sunsetRelatedHtml, /data-log-message="🏗️ パン屋を建設！"/);
assert.match(sunsetRelatedHtml, /aria-label="関連する盤面を表示: パン屋を建設！"/);
assert.match(sunsetRelatedHtml, /icons\/interface-ui\.svg#log/);
assert.match(sunsetRelatedHtml, /icons\/interface-ui\.svg#build/);
assert.match(sunsetRelatedHtml, /<span>パン屋を建設！<\/span><\/button>/);
const sunsetSummary = UiLogDisplay.buildLogSummaryHtml([
    { type: 'system', message: '👤 Aliceのターン' },
], display, escapeHtml, { stripLeadingEmoji: true });
assert.match(sunsetSummary, /最新: Aliceのターン/);
assert.doesNotMatch(sunsetSummary, /👤/);
assert.match(relatedHtml, /aria-label="関連する盤面を表示:/);

const coinEntries = [
    { type: 'lose', message: '💸 Bobのカフェ発動 → 2コイン獲得' },
    { type: 'lose', message: '💸 Bobのカフェ発動 → 1コイン獲得' },
    { type: 'gain', message: '🌾 Aliceの麦畑発動 → +2コイン' },
    { type: 'gain', message: '🌾 Aliceの麦畑発動 → +2コイン' },
    { type: 'gain', message: '🌾 Bobの麦畑発動 → +2コイン' },
];
const coinSource = JSON.stringify(coinEntries);
const coinOptions = { turnPlayerName: 'Alice', players: [{ name: 'Alice' }, { name: 'Bob' }] };
const grouped = UiLogDisplay.groupCoinEvents(coinEntries, display, coinOptions);
assert.strictEqual(grouped.length, 3);
assert.match(grouped[0].message, /Bobのカフェ.*3コイン支払い（2回）/);
assert.match(grouped[1].message, /Aliceの麦畑.*\+4コイン（2回）/);
assert.strictEqual(grouped[2].message, coinEntries[4].message);
assert.deepStrictEqual(UiLogDisplay.turnCoinSummary(coinEntries, display, coinOptions), {
    actor: 'Alice', income: 4, payment: 3, net: 1,
});
assert.strictEqual(JSON.stringify(coinEntries), coinSource);
const recentCoins = UiLogDisplay.buildRecentEventsHtml(coinEntries, coinEntries, display, escapeHtml, coinOptions);
assert.match(recentCoins, /収入4 \/ 支払い3 \/ \+1コイン/);
assert.match(recentCoins, /カフェ/);
assert.match(recentCoins, /麦畑/);
assert.strictEqual(UiLogDisplay.groupCoinEvents([
    coinEntries[2], '__SEP__', coinEntries[3],
], display).length, 3);
assert.strictEqual(UiLogDisplay.groupCoinEvents([
    coinEntries[2], { type: 'build', message: '🏗️ 牧場を建設！' }, coinEntries[3],
], display).length, 3);
assert.strictEqual(UiLogDisplay.turnCoinSummary(coinEntries, display, {
    turnPlayerName: 'CPU', players: [{ name: 'CPU' }, { name: 'CPU' }],
}), null);
assert.strictEqual(UiLogDisplay.coinEvent({
    type: 'gain', message: '🐟 Aliceのマグロ漁船発動 → 🎲4+5=9コイン',
}, display, coinOptions).amount, 9);

const actorHistory = [
    { type: 'system', message: '👤 CPU普通・2のターン' },
    { type: 'dice', message: '🚉 駅：1個か2個か選んでください' },
    { type: 'dice', message: '🎲 5 が出ました' },
    { type: 'build', message: '🏗️ 寿司屋を建設！' },
    { type: 'system', message: '👤 あなたのターン' },
];
const actorOptions = { players: [{ name: 'CPU普通・2' }, { name: 'あなた' }],
    turnPlayerName: 'あなた', stripLeadingEmoji: true };
const actorSource = JSON.stringify(actorHistory);
const actorRecent = UiLogDisplay.buildRecentEventsHtml(actorHistory, [], display, escapeHtml, actorOptions);
assert.match(actorRecent, /CPU普通・2: 寿司屋を建設！/);
assert.match(actorRecent, /CPU普通・2: 5 が出ました/);
assert.doesNotMatch(actorRecent, /あなた: 寿司屋/);
assert.strictEqual(JSON.stringify(actorHistory), actorSource);
const actorProjection = UiLogDisplay.projectHistoryActors([
    ...actorHistory, { type: 'dice', message: '🎲 2 が出ました' },
    { type: 'dice', message: '📡 振り直し → 3 が出ました' },
    '__SEP__', { type: 'build', message: '🏗️ 牧場を建設！' },
], display, actorOptions);
assert.strictEqual(actorProjection[5].turnActor, 'あなた');
assert.strictEqual(actorProjection[6].turnActor, 'あなた');
assert.strictEqual(actorProjection[8].turnActor, undefined);
assert.strictEqual(UiLogDisplay.projectHistoryActors([
    { type: 'dice', message: '📡 振り直し → 3 が出ました' },
], display, actorOptions)[0].turnActor, undefined);
assert.strictEqual(UiLogDisplay.projectHistoryActors([
    { type: 'system', message: '👤 CPUのターン' },
    { type: 'build', message: '🏗️ 牧場を建設！' },
], display, { players: [{ name: 'CPU' }, { name: 'CPU' }] })[1].turnActor, undefined);

const greenHistory = [
    { type: 'system', message: '👤 CPU普通・2のターン' },
    { type: 'gain', message: '🏪 パン屋発動 → +1コイン' },
    { type: 'gain', message: '🏪 パン屋発動 → +1コイン' },
    { type: 'lose', message: '💸 あなたのカフェ発動 → 2コイン獲得' },
    { type: 'gain', message: '🌾 あなたの麦畑発動 → +1コイン' },
    { type: 'system', message: '👤 あなたのターン' },
    { type: 'gain', message: '🏪 パン屋発動 → +3コイン' },
];
const greenSource = JSON.stringify(greenHistory);
const greenGrouped = UiLogDisplay.groupCoinEvents(
    UiLogDisplay.projectHistoryActors(greenHistory, display, actorOptions), display,
    { ...actorOptions, turnPlayerName: '' });
assert.strictEqual(greenGrouped[1].coinEvent.actor, 'CPU普通・2');
assert.match(greenGrouped[1].message, /CPU普通・2のパン屋.*\+2コイン（2回）/);
assert.strictEqual(greenGrouped[2].coinEvent.actor, 'あなた');
assert.strictEqual(greenGrouped[2].coinEvent.transfer, true);
assert.strictEqual(greenGrouped[3].coinEvent.actor, 'あなた');
assert.strictEqual(greenGrouped[5].coinEvent.actor, 'あなた');
assert.strictEqual(JSON.stringify(greenHistory), greenSource);

const repeatEntries = [
    { type: 'system', message: '👤 CPU普通・2のターン' },
    { type: 'dice', message: '🎲 3+3=6 が出ました' },
    '__SEP__',
    { type: 'system', message: '🎡 遊園地効果！ゾロ目でもう一度ターン' },
    { type: 'gain', message: '🏪 パン屋発動 → +1コイン' },
    { type: 'build', message: '🏗️ 寿司屋を建設！' },
];
const repeatSource = JSON.stringify(repeatEntries);
const repeatProjection = UiLogDisplay.projectHistoryActors(repeatEntries, display, actorOptions);
assert.strictEqual(repeatProjection[4].turnActor, 'CPU普通・2');
assert.strictEqual(repeatProjection[5].turnActor, 'CPU普通・2');
assert.strictEqual(JSON.stringify(repeatEntries), repeatSource);
assert.match(UiLogDisplay.buildRecentEventsHtml(repeatEntries, [], display, escapeHtml,
    actorOptions), /CPU普通・2: 寿司屋を建設！/);
for (const history of [
    repeatEntries.slice(2),
    [repeatEntries[0], '__SEP__', repeatEntries[4], repeatEntries[3], repeatEntries[5]],
    [repeatEntries[0], '__SEP__', '__SEP__', repeatEntries[3], repeatEntries[5]],
    [{ type: 'system', message: '👤 CPUのターン' }, '__SEP__', repeatEntries[3], repeatEntries[5]],
]) {
    const projection = UiLogDisplay.projectHistoryActors(history, display,
        { players: [...actorOptions.players, { name: 'CPU' }, { name: 'CPU' }] });
    assert.strictEqual(projection.at(-1).turnActor, undefined);
}

const stationHistory = UiLogDisplay.createHistoryController();
stationHistory.append([
    actorHistory[0], { type: 'dice', message: '🎲 5 が出ました' },
    { type: 'system', message: '電波塔で振り直しますか？' },
]);
stationHistory.append([{ type: 'dice', message: '🚉 駅：1個か2個か選んでください' }]);
const stationReset = stationHistory.snapshot();
assert.strictEqual(UiLogDisplay.projectHistoryActors(stationReset.entries, display,
    actorOptions).at(-1).turnActor, undefined);
const rerolledLog = [
    { type: 'dice', message: '🚉 駅：1個か2個か選んでください' },
    { type: 'dice', message: '🎲 3 が出ました' },
    { type: 'dice', message: '📡 電波塔で振り直し: 5 → 3' },
    { type: 'build', message: '🏗️ パン屋を建設！' },
    { type: 'gain', message: '🏪 パン屋発動 → +1コイン' },
];
const stationResult = stationHistory.append(rerolledLog);
const stationSource = JSON.stringify(stationResult.entries);
const stationActors = UiLogDisplay.projectHistoryActors(stationResult.entries, display, actorOptions);
for (const entry of stationActors.slice(-5)) assert.strictEqual(entry.turnActor, 'CPU普通・2');
assert.strictEqual(JSON.stringify(stationResult.entries), stationSource);
assert.strictEqual(UiLogDisplay.projectHistoryActors(rerolledLog, display, actorOptions)
    .at(-1).turnActor, undefined);
const conflictingReroll = UiLogDisplay.projectHistoryActors([
    actorHistory[0], '__SEP__', ...rerolledLog, actorHistory[4],
], display, actorOptions);
assert.strictEqual(conflictingReroll[2].turnActor, undefined);

for (const type of ['gain', 'lose']) {
    const prefixEntry = { type, message: '🌾 街の主の麦畑発動 → +2コイン' };
    const prefixOptions = { players: [{ name: '街' }, { name: '街の主' }], turnPlayerName: '街' };
    const preciseEvent = UiLogDisplay.coinEvent(prefixEntry, display, prefixOptions);
    assert.strictEqual(preciseEvent.actor, '街の主');
    assert.strictEqual(preciseEvent.subject, '麦畑');
    assert.strictEqual(preciseEvent.transfer, type === 'lose');
    const ambiguousEvent = UiLogDisplay.coinEvent(prefixEntry, display, {
        ...prefixOptions, players: [...prefixOptions.players, { name: '街の主' }],
    });
    assert.strictEqual(ambiguousEvent.actor, '');
    assert.strictEqual(ambiguousEvent.subject, '麦畑');
    assert.strictEqual(ambiguousEvent.transfer, type === 'lose');
}
assert.strictEqual(UiLogDisplay.projectHistoryActors([
    { type: 'system', message: '👤 街のターン' },
    { type: 'gain', message: '🌾 街の主の麦畑発動 → +2コイン' },
], display, { players: [{ name: '街' }, { name: '街の主' }, { name: '街の主' }] })[1].turnActor,
undefined);
