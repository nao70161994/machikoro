'use strict';

const assert = require('assert');
const UiDomSnapshot = require('../js/uiDomSnapshot');
const { runTest } = require('./helpers/test-utils');

function createElement(overrides = {}) {
    return Object.assign({
        style: {},
        disabled: false,
        hidden: false,
        inert: false,
        className: '',
        innerHTML: '',
        textContent: '',
        getAttribute: () => null,
        closest: () => null,
        querySelectorAll: () => [],
    }, overrides);
}

runTest('UI DOM snapshotは表示・lock・子要素状態を注入DOMからdetached投影する', () => {
    const usableChild = createElement();
    const blockedChild = createElement({ disabled: true });
    const gameScreen = createElement({ getAttribute: name => name === 'aria-hidden' ? 'true' : null });
    const button = createElement({
        style: { display: 'block', pointerEvents: 'auto' },
        className: 'primary',
        innerHTML: '<span>go</span>',
        textContent: 'long label',
        querySelectorAll: () => [usableChild, blockedChild],
    });
    const elements = { btnRoll: button, gameScreen };
    const runtime = UiDomSnapshot.createRuntime({
        getDocument: () => ({ getElementById: id => elements[id] || null }),
        getComputedStyle: element => element === usableChild
            ? { display: 'block', visibility: 'visible', pointerEvents: 'auto' }
            : {},
        truncateText: (value, limit) => String(value).slice(0, limit),
    });

    assert.deepStrictEqual(runtime.snapshotById('btnRoll'), {
        id: 'btnRoll',
        display: 'block',
        computedDisplay: '',
        visibility: '',
        computedVisibility: '',
        pointerEvents: 'auto',
        computedPointerEvents: '',
        disabled: false,
        hidden: false,
        inert: false,
        ancestorBlocked: true,
        ariaHidden: null,
        className: 'primary',
        htmlLength: 15,
        totalInteractiveChildren: 2,
        usableInteractiveChildren: 1,
        text: 'long label',
    });
    assert.strictEqual(runtime.snapshotById('missing'), null);
    assert.strictEqual(runtime.isVisibleById('btnRoll'), true);
});

runTest('UI DOM snapshotはaction HTML fallbackとcomputed style失敗を既存契約で扱う', () => {
    const runtime = UiDomSnapshot.createRuntime({
        getComputedStyle: () => { throw new Error('blocked'); },
    });
    const htmlOnly = createElement({
        innerHTML: '<button data-action="nextTurn">ok</button><button data-action="nextTurn" disabled>no</button>',
    });
    assert.deepStrictEqual(runtime.interactiveStateForSpec(htmlOnly, {
        selector: '[data-action="nextTurn"]',
        actions: ['nextTurn'],
    }), { total: 2, usable: 1 });
    assert.deepStrictEqual(runtime.interactiveStateForActions(htmlOnly, []), { total: 0, usable: 0 });
    assert.strictEqual(runtime.isInteractiveElementUsable(createElement({ style: { display: 'none' } })), false);
    assert.deepStrictEqual(runtime.interactiveState(createElement({
        querySelectorAll: () => { throw new Error('invalid selector'); },
    })), { total: 0, usable: 0 });
});

runTest('shallow snapshotはshell状態を保ち子走査とHTML文字列取得を省く', () => {
    let childReads = 0, htmlReads = 0, textReads = 0;
    const element = createElement({ style: { display: 'block', pointerEvents: 'none' }, inert: true,
        querySelectorAll() { childReads++; return []; } });
    Object.defineProperty(element, 'innerHTML', { get() { htmlReads++; return '<button>施設</button>'; } });
    Object.defineProperty(element, 'textContent', { get() { textReads++; return '施設'; } });
    const runtime = UiDomSnapshot.createRuntime({ getDocument: () => ({ getElementById: () => element }),
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', pointerEvents: 'none' }) });
    const shallow = runtime.snapshotById('gameScreen', { shallow: true });
    assert.strictEqual(shallow.inert, true);
    assert.strictEqual(shallow.computedDisplay, 'block');
    assert.strictEqual(shallow.computedPointerEvents, 'none');
    assert.strictEqual(shallow.totalInteractiveChildren, null, '未計測を0件と断定しない');
    assert.strictEqual(shallow.htmlLength, null);
    assert.deepStrictEqual([childReads, htmlReads, textReads], [0, 0, 0]);
    const full = runtime.snapshotById('gameScreen');
    assert.strictEqual(full.htmlLength, '<button>施設</button>'.length);
    assert.strictEqual(full.text, '施設');
    assert.ok(childReads > 0 && htmlReads > 0 && textReads > 0, '既定の完全snapshotは維持');
});
