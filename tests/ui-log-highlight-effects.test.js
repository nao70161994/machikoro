'use strict';

const assert = require('assert');
const UiLogHighlightEffects = require('../js/uiLogHighlightEffects');
const { runTest } = require('./helpers/test-utils');

function makeElement(tagName = 'DIV', dataset = {}) {
    const classes = new Set();
    return {
        tagName,
        dataset,
        open: false,
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            contains(name) { return classes.has(name); },
        },
        classes,
        querySelectorAll() { return []; },
        scrollIntoView(options) { this.scrollOptions = options; },
    };
}

runTest('UI log highlight effectsは関連player/cardを開きmotion設定でscrollし期限後に消す', () => {
    const player = makeElement('DETAILS');
    const card = makeElement('BUTTON', { cardName: 'パン屋' });
    player.querySelectorAll = selector => selector === '[data-card-name]' ? [card] : [];
    const players = makeElement();
    const document = {
        body: { classList: { contains: () => true } },
        querySelectorAll: () => [],
        getElementById: id => id === 'playerBox0' ? player : id === 'players' ? players : null,
    };
    let timer = 12;
    let callback;
    const cleared = [];
    const effects = UiLogHighlightEffects.create({
        document,
        getGame: () => ({ players: [{ name: 'Alice' }] }),
        getTimer: () => timer,
        setTimer: value => { timer = value; },
        clearTimeout: value => cleared.push(value),
        schedule: (fn, delay) => { callback = fn; assert.strictEqual(delay, 2200); return 13; },
    });

    assert.strictEqual(effects.highlight('Alice', '', 'パン屋', 'Alice built a card'), true);
    assert.deepStrictEqual(cleared, [12]);
    assert.strictEqual(player.open, true);
    assert.ok(player.classes.has('log-related-highlight'));
    assert.ok(card.classes.has('log-related-highlight'));
    assert.deepStrictEqual(player.scrollOptions, { behavior: 'auto', block: 'center' });
    assert.strictEqual(timer, 13);
    callback();
    assert.strictEqual(player.classes.has('log-related-highlight'), false);
    assert.strictEqual(card.classes.has('log-related-highlight'), false);
    assert.strictEqual(timer, null);
});

runTest('UI log highlight effectsは関連項目なし・gameなしをfalseで返す', () => {
    const document = { body: null, querySelectorAll: () => [], getElementById: () => null };
    let scheduled = false;
    const effects = UiLogHighlightEffects.create({
        document,
        getGame: () => ({ players: [{ name: 'Alice' }] }),
        getTimer: () => null,
        setTimer() {},
        clearTimeout() {},
        schedule() { scheduled = true; return 1; },
    });
    assert.strictEqual(effects.highlight('nobody'), false);
    assert.strictEqual(scheduled, false);
    assert.strictEqual(effects.highlight(''), false);
});

runTest('UI log highlight effectsは必須依存を初期化時に検証する', () => {
    assert.throws(() => UiLogHighlightEffects.create({}), TypeError);
});
