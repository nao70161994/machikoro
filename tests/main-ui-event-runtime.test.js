'use strict';
const assert = require('assert');
const MainUiEventRuntime = require('../js/mainUiEventRuntime');
const UiEventDelegation = require('../js/uiEventDelegation');
const { makeElement, runTest } = require('./helpers/test-utils');

function createHarness() {
    const calls = [];
    const handlers = {};
    const elements = Object.fromEntries(['diceChoose', 'pendingMenu', 'buildMenu', 'players', 'speedLabel', 'onlineSpeedLabel', 'pwaUpdateBanner', 'pwaInstallBanner'].map(id => [id, makeElement({ addEventListener: (name, fn) => { handlers[id + ':' + name] = fn; } })]));
    const document = {
        body: makeElement(),
        addEventListener: (name, fn) => { handlers['document:' + name] = fn; },
        getElementById: id => elements[id] || null,
    };
    const effects = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
    const window = { location: { reload: () => calls.push(['reload']) } };
    const runtime = MainUiEventRuntime.createRuntime({
        delegation: UiEventDelegation,
        document,
        formatCpuSpeedLabel: value => `speed:${value}`,
        getWindow: () => window,
        resolveEffect: name => name === 'pwaApplyUpdate' ? null : effects[name],
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

runTest('main UI event runtimeは必須依存欠落を初期化前に拒否する', () => {
    assert.throws(() => MainUiEventRuntime.createRuntime(), /dependencies are required/);
});
