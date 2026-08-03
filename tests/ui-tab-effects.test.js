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

runTest('UI main tab effectはcontent→class→ariaの既存順で適用する', () => {
    const trace = [];
    const elements = {
        localContent: element('local-content', trace), onlineContent: element('online-content', trace), statsContent: element('stats-content', trace),
        localButton: element('local-button', trace), onlineButton: element('online-button', trace), statsButton: element('stats-button', trace),
    };
    traceClass(elements.localButton, 'local-button', trace);
    traceClass(elements.onlineButton, 'online-button', trace);
    traceClass(elements.statsButton, 'stats-button', trace);
    UiTabEffects.applyMainTabView(elements, {
        localDisplay: 'none', onlineDisplay: 'flex', statsDisplay: 'none',
        localButton: { className: 'tab-btn ', ariaSelected: 'false' },
        onlineButton: { className: 'tab-btn active', ariaSelected: 'true' },
        statsButton: { className: 'tab-btn ', ariaSelected: 'false' },
    });
    assert.deepStrictEqual(trace, [
        ['local-content', 'style.display', 'none'], ['online-content', 'style.display', 'flex'], ['stats-content', 'style.display', 'none'],
        ['local-button', 'className', 'tab-btn '], ['online-button', 'className', 'tab-btn active'], ['stats-button', 'className', 'tab-btn '],
        ['local-button', 'aria-selected', 'false'], ['online-button', 'aria-selected', 'true'], ['stats-button', 'aria-selected', 'false'],
    ]);
});

runTest('UI online tab effectは表示・class・ariaを既存順で適用する', () => {
    const trace = [];
    const createButton = element('create-button', trace);
    const joinButton = element('join-button', trace);
    traceClass(createButton, 'create-button', trace);
    traceClass(joinButton, 'join-button', trace);
    UiTabEffects.applyOnlineTabView({ createContent: element('create-content', trace), joinContent: element('join-content', trace), createButton, joinButton }, {
        createDisplay: 'none', joinDisplay: 'block',
        createButton: { className: 'online-tab-btn ', ariaSelected: 'false' },
        joinButton: { className: 'online-tab-btn active', ariaSelected: 'true' },
    });
    assert.deepStrictEqual(trace, [
        ['create-content', 'style.display', 'none'], ['join-content', 'style.display', 'block'],
        ['create-button', 'className', 'online-tab-btn '], ['join-button', 'className', 'online-tab-btn active'],
        ['create-button', 'aria-selected', 'false'], ['join-button', 'aria-selected', 'true'],
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
