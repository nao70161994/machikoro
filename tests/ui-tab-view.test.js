'use strict';

const assert = require('assert');
const UiTabView = require('../js/uiTabView');
const { runTest } = require('./helpers/test-utils');

runTest('UI main tab viewは表示・class・aria・stats effect条件を純粋計算する', () => {
    const local = UiTabView.buildMainTabView('local');
    assert.deepStrictEqual(local, {
        localDisplay: 'flex',
        onlineDisplay: 'none',
        statsDisplay: 'none',
        localButton: { className: 'tab-btn active', ariaSelected: 'true' },
        onlineButton: { className: 'tab-btn ', ariaSelected: 'false' },
        statsButton: { className: 'tab-btn ', ariaSelected: 'false' },
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
        createButton: { className: 'online-tab-btn ', ariaSelected: 'false' },
        joinButton: { className: 'online-tab-btn active', ariaSelected: 'true' },
    });
    assert.deepStrictEqual(UiTabView.buildOnlineTabView('unknown'), {
        createDisplay: 'none',
        joinDisplay: 'none',
        createButton: { className: 'online-tab-btn ', ariaSelected: 'false' },
        joinButton: { className: 'online-tab-btn ', ariaSelected: 'false' },
    });
});
