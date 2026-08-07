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
