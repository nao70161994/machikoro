'use strict';
const assert = require('assert');
const MainUiEventRuntime = require('../js/mainUiEventRuntime');
const UiEventDelegation = require('../js/uiEventDelegation');
const UiTabView = require('../js/uiTabView');
const UiRangeControl = require('../js/uiRangeControl');
const { makeElement, runTest } = require('./helpers/test-utils');

function createHarness() {
    const calls = [];
    const handlers = {};
    const elements = Object.fromEntries(['diceChoose', 'pendingMenu', 'buildMenu', 'players', 'speedLabel', 'onlineSpeedLabel', 'pwaUpdateBanner', 'pwaInstallBanner'].map(id => [id, makeElement({ addEventListener: (name, fn) => { handlers[id + ':' + name] = fn; } })]));
    elements.pwaUpdateBanner.contains = element => element && element.parentElement === elements.pwaUpdateBanner;
    const document = {
        activeElement: null,
        body: makeElement(),
        addEventListener: (name, fn) => { handlers['document:' + name] = fn; },
        getElementById: id => elements[id] || null,
    };
    const effects = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
    const window = { location: { reload: () => calls.push(['reload']) } };
    const runtime = MainUiEventRuntime.createRuntime({
        delegation: UiEventDelegation,
        document,
        ensureCurrentScreenFocus: () => calls.push(['ensureCurrentScreenFocus']),
        formatCpuSpeedLabel: value => `speed:${value}`,
        getWindow: () => window,
        rangeControl: UiRangeControl,
        resolveEffect: name => name === 'pwaApplyUpdate'
            ? null
            : name === 'shouldKeepPwaUpdateBannerVisible'
                ? () => false
                : effects[name],
        tabView: UiTabView,
    });
    const event = (dataset, extra = {}) => {
        const element = Object.assign(makeElement(), { dataset, disabled: false, closest: () => element }, extra);
        return { target: element, preventDefault: () => calls.push(['preventDefault']) };
    };
    return { calls, document, effects, elements, event, handlers, runtime };
}

runTest('main UI event runtimeはstatic/input/dice commandをdetached effectへ渡す', () => {
    const h = createHarness();
    h.runtime.handleStaticClick(h.event({ uiAction: 'changeCount', delta: '2' }));
    h.runtime.handleStaticInput(h.event({ uiInput: 'cpuSpeed' }, { value: '500' }));
    h.runtime.handleDiceClick(h.event({ action: 'selectDiceCount', useTwo: 'true' }));
    assert.deepStrictEqual(h.calls, [
        ['preventDefault'], ['changeCount', 2], ['preventDefault'], ['selectDiceCount', true],
    ]);
    assert.strictEqual(h.elements.speedLabel.textContent, 'speed:500');
});

runTest('main UI event runtimeはlocal/online速度の表示とaria-valuetextを同期する', () => {
    const h = createHarness();
    const local = h.event({ uiInput: 'cpuSpeed' }, { value: '500' });
    const online = h.event({ uiInput: 'onlineCpuSpeed' }, { value: '100' });

    h.runtime.handleStaticInput(local);
    h.runtime.handleStaticInput(online);

    assert.strictEqual(h.elements.speedLabel.textContent, 'speed:500');
    assert.strictEqual(local.target.getAttribute('aria-valuetext'), 'speed:500');
    assert.strictEqual(h.elements.onlineSpeedLabel.textContent, 'speed:100');
    assert.strictEqual(online.target.getAttribute('aria-valuetext'), 'speed:100');
});

runTest('main UI event runtimeはBusiness Center不使用を専用effectへ渡す', () => {
    const h = createHarness();
    h.runtime.handlePendingClick(h.event({ action: 'skipBusiness' }));
    assert.deepStrictEqual(h.calls, [['preventDefault'], ['skipBusiness']]);
});

runTest('main UI event runtimeはfilter identityとクリック元を同じeffectへ渡す', () => {
    const h = createHarness();
    const event = h.event({ action: 'setCardFilter', cardFilter: 'red' });

    h.runtime.handleBuildClick(event);

    assert.strictEqual(h.calls.length, 2);
    assert.deepStrictEqual(h.calls[0], ['preventDefault']);
    assert.strictEqual(h.calls[1][0], 'setCardFilter');
    assert.strictEqual(h.calls[1][1], 'red');
    assert.strictEqual(h.calls[1][2], event.target);
});

runTest('main UI event runtimeはstatic/delegated listenerを一度だけ所有する', () => {
    const h = createHarness();
    assert.strictEqual(h.runtime.bindDelegated(), true);
    assert.strictEqual(h.runtime.bindDelegated(), false);
    assert.deepStrictEqual(Object.keys(h.handlers).sort(), [
        'buildMenu:click', 'diceChoose:click', 'document:change', 'document:click',
        'document:input', 'document:keydown', 'pendingMenu:click', 'players:click',
    ]);
});

runTest('main UI event runtimeはPWA apply effect不在時にreloadへfallbackする', () => {
    const h = createHarness();
    h.runtime.handleStaticClick(h.event({ uiAction: 'pwaApplyUpdate' }));
    assert.deepStrictEqual(h.calls, [['preventDefault'], ['reload']]);
});

runTest('main UI event runtimeはupdate banner内のfocusだけを閉鎖後に画面へ戻す', () => {
    const focused = createHarness();
    const dismiss = makeElement({ parentElement: focused.elements.pwaUpdateBanner });
    focused.document.activeElement = dismiss;
    focused.runtime.handleStaticClick(focused.event({ uiAction: 'hidePwaUpdateBanner' }));
    assert.strictEqual(focused.elements.pwaUpdateBanner.style.display, 'none');
    assert.strictEqual(
        focused.calls.filter(call => call[0] === 'ensureCurrentScreenFocus').length,
        1
    );

    const outside = createHarness();
    outside.document.activeElement = makeElement();
    outside.runtime.handleStaticClick(outside.event({ uiAction: 'hidePwaUpdateBanner' }));
    assert.strictEqual(
        outside.calls.filter(call => call[0] === 'ensureCurrentScreenFocus').length,
        0
    );
});

runTest('main UI event runtimeはmainとonline tabを矢印・Home・Endでfocusしてactivateする', () => {
    const h = createHarness();
    function tab(dataset, list) {
        const value = makeElement({
            dataset,
            focus() { h.calls.push(['focus', dataset.tab || dataset.onlineTab]); },
        });
        value.setAttribute('role', 'tab');
        value.closest = selector => selector === '[role="tablist"]' ? list : value;
        return value;
    }
    const mainList = { querySelectorAll: () => mainTabs };
    const mainTabs = [
        tab({ uiAction: 'switchTab', tab: 'local' }, mainList),
        tab({ uiAction: 'switchTab', tab: 'online' }, mainList),
        tab({ uiAction: 'switchTab', tab: 'stats' }, mainList),
    ];
    const onlineList = { querySelectorAll: () => onlineTabs };
    const onlineTabs = [
        tab({ uiAction: 'switchOnlineTab', onlineTab: 'create' }, onlineList),
        tab({ uiAction: 'switchOnlineTab', onlineTab: 'join' }, onlineList),
    ];
    const keyEvent = (target, key) => ({
        target,
        key,
        preventDefault() { h.calls.push(['preventDefault']); },
    });

    assert.strictEqual(h.runtime.handleStaticKeydown(keyEvent(mainTabs[0], 'ArrowLeft')), true);
    assert.strictEqual(h.runtime.handleStaticKeydown(keyEvent(mainTabs[2], 'Home')), true);
    assert.strictEqual(h.runtime.handleStaticKeydown(keyEvent(onlineTabs[0], 'End')), true);
    assert.deepStrictEqual(h.calls, [
        ['preventDefault'], ['focus', 'stats'], ['switchTab', 'stats'],
        ['preventDefault'], ['focus', 'local'], ['switchTab', 'local'],
        ['preventDefault'], ['focus', 'join'], ['switchOnlineTab', 'join'],
    ]);
});

runTest('main UI event runtimeは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => MainUiEventRuntime.createRuntime(), /dependencies are required/);
});
