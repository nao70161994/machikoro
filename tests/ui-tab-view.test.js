'use strict';

const assert = require('assert');
const UiTabView = require('../js/uiTabView');
const { runTest } = require('./helpers/test-utils');

runTest('UI main tab viewは表示・class・aria・stats effect条件を純粋計算する', () => {
    const local = UiTabView.buildMainTabView('local');
    assert.deepStrictEqual(local, {
        localDisplay: 'flex',
        onlineDisplay: 'none',
        tournamentDisplay: 'none',
        statsDisplay: 'none',
        localButton: { className: 'tab-btn active', ariaSelected: 'true', tabIndex: 0 },
        onlineButton: { className: 'tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        tournamentButton: { className: 'tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        statsButton: { className: 'tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        renderStats: false,
    });
    const stats = UiTabView.buildMainTabView('stats');
    assert.strictEqual(stats.statsDisplay, 'block');
    assert.strictEqual(stats.statsButton.className, 'tab-btn active');
    assert.strictEqual(stats.renderStats, true);
    assert.ok(Object.isFrozen(stats));
    assert.ok(Object.isFrozen(stats.statsButton));
});

runTest('UI online tab viewはcreate/joinの既存表示契約を維持する', () => {
    assert.deepStrictEqual(UiTabView.buildOnlineTabView('join'), {
        createDisplay: 'none',
        joinDisplay: 'block',
        createButton: { className: 'online-tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        joinButton: { className: 'online-tab-btn active', ariaSelected: 'true', tabIndex: 0 },
    });
    assert.deepStrictEqual(UiTabView.buildOnlineTabView('unknown'), {
        createDisplay: 'none',
        joinDisplay: 'none',
        createButton: { className: 'online-tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        joinButton: { className: 'online-tab-btn ', ariaSelected: 'false', tabIndex: -1 },
    });
});

runTest('UI tab keyboard planは左右を循環しHomeとEndへ移動する', () => {
    assert.deepStrictEqual(UiTabView.buildTabKeyboardPlan('ArrowLeft', 0, 3), {
        handled: true, targetIndex: 2,
    });
    assert.deepStrictEqual(UiTabView.buildTabKeyboardPlan('ArrowRight', 2, 3), {
        handled: true, targetIndex: 0,
    });
    assert.deepStrictEqual(UiTabView.buildTabKeyboardPlan('Home', 2, 3), {
        handled: true, targetIndex: 0,
    });
    assert.deepStrictEqual(UiTabView.buildTabKeyboardPlan('End', 0, 3), {
        handled: true, targetIndex: 2,
    });
    assert.deepStrictEqual(UiTabView.buildTabKeyboardPlan('Enter', 0, 3), {
        handled: false, targetIndex: -1,
    });
    assert.deepStrictEqual(UiTabView.buildTabKeyboardPlan('ArrowRight', -1, 3), {
        handled: false, targetIndex: -1,
    });
});

runTest('UI online availability viewはoffline表示と操作禁止を純粋計算する', () => {
    assert.deepStrictEqual(UiTabView.buildOnlineAvailabilityView(false), {
        tabOpacity: '0.4',
        noticeDisplay: 'block',
        actionDisabled: true,
    });
    const online = UiTabView.buildOnlineAvailabilityView(true);
    assert.deepStrictEqual(online, {
        tabOpacity: '',
        noticeDisplay: 'none',
        actionDisabled: false,
    });
    assert.ok(Object.isFrozen(online));
});
