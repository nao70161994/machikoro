'use strict';

const assert = require('assert');
const UiCardSelectEffects = require('../js/uiCardSelectEffects');
const { runTest } = require('./helpers/test-utils');

function createElement() {
    return {
        innerHTML: '',
        textContent: '',
        className: '',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
    };
}

runTest('ui card select effectsはviewを既存selectorと属性へ反映する', () => {
    const elements = {
        cardListBasic: createElement(),
        btnSetBasic: createElement(),
        cardListPlus: createElement(),
        btnSetPlus: createElement(),
        landmarkList: createElement(),
    };
    const requestedIds = [];
    const effects = UiCardSelectEffects.create({
        getElementById(id) {
            requestedIds.push(id);
            return elements[id] || null;
        },
    });

    effects.apply({
        sets: [
            { suffix: 'Basic', cardListHtml: '<b>basic</b>', allOn: true },
            { suffix: 'Plus', cardListHtml: '<b>plus</b>', allOn: false },
        ],
        landmarkListHtml: '<b>landmarks</b>',
    });

    assert.deepStrictEqual(requestedIds, [
        'cardListBasic', 'btnSetBasic',
        'cardListPlus', 'btnSetPlus',
        'landmarkList',
    ]);
    assert.strictEqual(elements.cardListBasic.innerHTML, '<b>basic</b>');
    assert.strictEqual(elements.btnSetBasic.textContent, 'ON');
    assert.strictEqual(elements.btnSetBasic.className, 'set-toggle on');
    assert.strictEqual(elements.btnSetBasic.attributes['aria-pressed'], 'true');
    assert.strictEqual(elements.cardListPlus.innerHTML, '<b>plus</b>');
    assert.strictEqual(elements.btnSetPlus.textContent, 'OFF');
    assert.strictEqual(elements.btnSetPlus.className, 'set-toggle off');
    assert.strictEqual(elements.btnSetPlus.attributes['aria-pressed'], 'false');
    assert.strictEqual(elements.landmarkList.innerHTML, '<b>landmarks</b>');
});

runTest('ui card select effectsは一部のDOMがなくても残りへ反映する', () => {
    const landmarkList = createElement();
    const effects = UiCardSelectEffects.create({
        getElementById: id => id === 'landmarkList' ? landmarkList : null,
    });

    assert.doesNotThrow(() => effects.apply({
        sets: [{ suffix: 'Basic', cardListHtml: 'cards', allOn: true }],
        landmarkListHtml: 'landmarks',
    }));
    assert.strictEqual(landmarkList.innerHTML, 'landmarks');
});

runTest('ui card select effectsはlist置換後も同じtoggleへfocusを移送する', () => {
    const elements = {
        cardListBasic: createElement(),
        landmarkList: createElement(),
    };
    const active = {
        dataset: { action: 'toggleCard', cardName: '牧場' },
    };
    let focusCount = 0;
    const replacement = {
        dataset: { action: 'toggleCard', cardName: '牧場' },
        isConnected: true,
        disabled: false,
        hidden: false,
        getAttribute() { return null; },
        closest() { return null; },
        focus() { focusCount++; },
    };
    const effects = UiCardSelectEffects.create({
        getElementById: id => elements[id] || null,
        getActiveElement: () => active,
        findToggle: identity => identity.action === 'toggleCard' && identity.name === '牧場'
            ? replacement
            : null,
        getWindow: () => ({
            getComputedStyle: () => ({ display: 'inline-block', visibility: 'visible' }),
        }),
    });

    effects.apply({
        sets: [{ suffix: 'Basic', cardListHtml: '<button>牧場</button>', allOn: true }],
        landmarkListHtml: '',
    });

    assert.strictEqual(focusCount, 1);
});

runTest('ui card select effectsは切断・非表示の置換先へfocusしない', () => {
    const active = {
        dataset: { action: 'toggleLandmark', landmarkName: '駅' },
    };
    let focusCount = 0;
    const replacement = {
        isConnected: false,
        disabled: false,
        hidden: false,
        getAttribute() { return null; },
        closest() { return null; },
        focus() { focusCount++; },
    };
    const effects = UiCardSelectEffects.create({
        getElementById: () => null,
        getActiveElement: () => active,
        findToggle: () => replacement,
    });

    effects.apply({ sets: [], landmarkListHtml: '' });
    assert.strictEqual(focusCount, 0);

    replacement.isConnected = true;
    effects.restoreFocus({ action: 'toggleLandmark', name: '駅' });
    assert.strictEqual(focusCount, 1);
    replacement.hidden = true;
    effects.restoreFocus({ action: 'toggleLandmark', name: '駅' });
    assert.strictEqual(focusCount, 1);
});
