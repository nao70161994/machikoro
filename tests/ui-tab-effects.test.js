'use strict';

const assert = require('assert');
const UiTabEffects = require('../js/uiTabEffects');
const { runTest } = require('./helpers/test-utils');

function element(id, trace) {
    const style = new Proxy({}, { set(target, key, value) { trace.push([id, 'style.' + String(key), value]); target[key] = value; return true; } });
    return { style, className: '', disabled: false, setAttribute(name, value) { trace.push([id, name, value]); } };
}

function traceClass(elementValue, id, trace) {
    let value = '';
    Object.defineProperty(elementValue, 'className', {
        get() { return value; },
        set(next) { trace.push([id, 'className', next]); value = next; },
    });
}

function traceTabIndex(elementValue, id, trace) {
    let value = 0;
    Object.defineProperty(elementValue, 'tabIndex', {
        get() { return value; },
        set(next) { trace.push([id, 'tabIndex', next]); value = next; },
    });
}

runTest('UI main tab effectはcontent→class→ariaの既存順で適用する', () => {
    const trace = [];
    const elements = {
        localContent: element('local-content', trace), onlineContent: element('online-content', trace), tournamentContent: element('tournament-content', trace), statsContent: element('stats-content', trace),
        localButton: element('local-button', trace), onlineButton: element('online-button', trace), tournamentButton: element('tournament-button', trace), statsButton: element('stats-button', trace),
    };
    traceClass(elements.localButton, 'local-button', trace);
    traceClass(elements.onlineButton, 'online-button', trace);
    traceClass(elements.tournamentButton, 'tournament-button', trace);
    traceClass(elements.statsButton, 'stats-button', trace);
    traceTabIndex(elements.localButton, 'local-button', trace);
    traceTabIndex(elements.onlineButton, 'online-button', trace);
    traceTabIndex(elements.tournamentButton, 'tournament-button', trace);
    traceTabIndex(elements.statsButton, 'stats-button', trace);
    UiTabEffects.applyMainTabView(elements, {
        localDisplay: 'none', onlineDisplay: 'flex', tournamentDisplay: 'none', statsDisplay: 'none',
        localButton: { className: 'tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        onlineButton: { className: 'tab-btn active', ariaSelected: 'true', tabIndex: 0 },
        tournamentButton: { className: 'tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        statsButton: { className: 'tab-btn ', ariaSelected: 'false', tabIndex: -1 },
    });
    assert.deepStrictEqual(trace, [
        ['local-content', 'style.display', 'none'], ['online-content', 'style.display', 'flex'], ['tournament-content', 'style.display', 'none'], ['stats-content', 'style.display', 'none'],
        ['local-button', 'className', 'tab-btn '], ['online-button', 'className', 'tab-btn active'], ['tournament-button', 'className', 'tab-btn '], ['stats-button', 'className', 'tab-btn '],
        ['local-button', 'aria-selected', 'false'], ['online-button', 'aria-selected', 'true'], ['tournament-button', 'aria-selected', 'false'], ['stats-button', 'aria-selected', 'false'],
        ['local-button', 'tabIndex', -1], ['online-button', 'tabIndex', 0], ['tournament-button', 'tabIndex', -1], ['stats-button', 'tabIndex', -1],
    ]);
});

runTest('UI online tab effectは表示・class・ariaを既存順で適用する', () => {
    const trace = [];
    const createButton = element('create-button', trace);
    const joinButton = element('join-button', trace);
    traceClass(createButton, 'create-button', trace);
    traceClass(joinButton, 'join-button', trace);
    traceTabIndex(createButton, 'create-button', trace);
    traceTabIndex(joinButton, 'join-button', trace);
    UiTabEffects.applyOnlineTabView({ createContent: element('create-content', trace), joinContent: element('join-content', trace), createButton, joinButton }, {
        createDisplay: 'none', joinDisplay: 'block',
        createButton: { className: 'online-tab-btn ', ariaSelected: 'false', tabIndex: -1 },
        joinButton: { className: 'online-tab-btn active', ariaSelected: 'true', tabIndex: 0 },
    });
    assert.deepStrictEqual(trace, [
        ['create-content', 'style.display', 'none'], ['join-content', 'style.display', 'block'],
        ['create-button', 'className', 'online-tab-btn '], ['join-button', 'className', 'online-tab-btn active'],
        ['create-button', 'aria-selected', 'false'], ['join-button', 'aria-selected', 'true'],
        ['create-button', 'tabIndex', -1], ['join-button', 'tabIndex', 0],
    ]);
});

runTest('UI availability effectは欠落要素を無視して既存要素だけ更新する', () => {
    const trace = [];
    const tabButton = element('tab', trace);
    const createButton = element('create', trace);
    UiTabEffects.applyOnlineAvailabilityView({ tabButton, notice: null, createButton, joinButton: null }, {
        tabOpacity: '0.4', noticeDisplay: 'block', actionDisabled: true,
    });
    assert.strictEqual(tabButton.style.opacity, '0.4');
    assert.strictEqual(createButton.disabled, true);
    assert.deepStrictEqual(trace, [['tab', 'style.opacity', '0.4']]);
});
