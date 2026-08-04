'use strict';

const assert = require('assert');
const UiRecoveryEffects = require('../js/uiRecoveryEffects');
const { runTest } = require('./helpers/test-utils');

function createElement(overrides = {}) {
    const attributes = new Map(Object.entries(overrides.attributes || {}));
    return Object.assign({
        style: {},
        hidden: false,
        inert: false,
        getAttribute: name => attributes.has(name) ? attributes.get(name) : null,
        removeAttribute: name => attributes.delete(name),
    }, overrides, { attributes });
}

runTest('UI recovery effectsはmodal lock属性を既存順で解除する', () => {
    const element = createElement({
        inert: true,
        style: { pointerEvents: 'none' },
        attributes: { 'aria-hidden': 'true' },
    });
    const runtime = UiRecoveryEffects.createRuntime({
        getDocument: () => ({ getElementById: id => id === 'gameScreen' ? element : null }),
    });

    assert.strictEqual(runtime.clearModalLock('gameScreen'), true);
    assert.strictEqual(element.inert, false);
    assert.strictEqual(element.getAttribute('aria-hidden'), null);
    assert.strictEqual(element.style.pointerEvents, '');
    assert.strictEqual(runtime.clearModalLock('gameScreen'), false);
    assert.strictEqual(runtime.clearModalLock('missing'), false);
});

runTest('UI recovery effectsはshell visibilityとdisplayを独立して復旧する', () => {
    const shell = createElement({ hidden: true, inert: true });
    const modal = createElement({ style: { display: 'none', pointerEvents: 'none' } });
    const elements = { shell, modal };
    const runtime = UiRecoveryEffects.createRuntime({
        getDocument: () => ({ getElementById: id => elements[id] || null }),
    });

    assert.strictEqual(runtime.clearShellLock('shell'), true);
    assert.strictEqual(shell.hidden, false);
    assert.strictEqual(shell.inert, false);
    assert.strictEqual(runtime.restoreDisplay('modal'), true);
    assert.strictEqual(modal.style.display, 'block');
    assert.strictEqual(runtime.restoreDisplay('modal'), false);
    assert.strictEqual(runtime.clearPointerEvents('modal'), true);
    assert.strictEqual(runtime.hide('modal'), true);
    assert.strictEqual(modal.style.display, 'none');
});

runTest('UI recovery effectsは強制lock解除とbody class除去を注入DOM内に限定する', () => {
    const element = createElement({
        inert: false,
        style: { pointerEvents: 'none' },
        attributes: { 'aria-hidden': 'true' },
    });
    const classes = new Set(['modal-open']);
    const classList = {
        contains: value => classes.has(value),
        remove: value => classes.delete(value),
    };
    const runtime = UiRecoveryEffects.createRuntime({
        getDocument: () => ({ body: { classList }, getElementById: () => element }),
    });

    assert.strictEqual(runtime.forceClearModalLock('modal'), true);
    assert.strictEqual(element.getAttribute('aria-hidden'), null);
    assert.strictEqual(element.style.pointerEvents, '');
    assert.strictEqual(runtime.removeBodyModalOpen(), true);
    assert.strictEqual(classes.has('modal-open'), false);
    assert.strictEqual(runtime.removeBodyModalOpen(), false);
});

runTest('UI recovery effectsはaction elementのinteraction lockをoptionどおり解除する', () => {
    const element = createElement({
        disabled: true,
        hidden: true,
        inert: true,
        style: { display: 'none', pointerEvents: 'none' },
        attributes: { 'aria-hidden': 'true' },
    });
    const runtime = UiRecoveryEffects.createRuntime();

    assert.strictEqual(runtime.releaseInteractionLock(element, {
        enable: true,
        displayValue: 'block',
        pointerEventsValue: 'auto',
    }), true);
    assert.deepStrictEqual({
        disabled: element.disabled,
        hidden: element.hidden,
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
        display: element.style.display,
        pointerEvents: element.style.pointerEvents,
    }, {
        disabled: false,
        hidden: false,
        inert: false,
        ariaHidden: null,
        display: 'block',
        pointerEvents: 'auto',
    });
    assert.strictEqual(runtime.releaseInteractionLock(element, { enable: true }), false);
});

runTest('UI recovery effectsはissue別のdisplay強制と限定解除を保持する', () => {
    const element = createElement({
        hidden: true,
        inert: true,
        style: { display: 'block', pointerEvents: 'none' },
        attributes: { 'aria-hidden': 'true' },
    });
    const runtime = UiRecoveryEffects.createRuntime({
        getDocument: () => ({ getElementById: () => element }),
    });

    assert.strictEqual(runtime.releaseInteractionLockById('target', {
        reveal: false,
        clearAriaHidden: false,
        forceDisplay: true,
        displayValue: '',
        pointerEventsValue: 'auto',
    }), true);
    assert.strictEqual(element.hidden, true);
    assert.strictEqual(element.inert, false);
    assert.strictEqual(element.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(element.style.display, '');
    assert.strictEqual(element.style.pointerEvents, 'auto');
});

runTest('UI recovery effectsは不足action HTMLを一度だけ補い子要素を返す', () => {
    const child = createElement({ disabled: true });
    const parent = createElement({
        innerHTML: '',
        children: [],
        querySelectorAll() { return this.children; },
        insertAdjacentHTML(position, html) {
            assert.strictEqual(position, 'afterbegin');
            this.innerHTML = html + this.innerHTML;
            this.children = [child];
        },
    });
    const runtime = UiRecoveryEffects.createRuntime({
        getDocument: () => ({ getElementById: id => id === 'buildMenu' ? parent : null }),
    });

    const first = runtime.ensureHtmlChildren(
        'buildMenu',
        '[data-action="undoBuild"]',
        '<button data-action="undoBuild">undo</button>',
        /data-action=["']undoBuild["']/
    );
    assert.strictEqual(first.changed, true);
    assert.deepStrictEqual(first.elements, [child]);
    const second = runtime.ensureHtmlChildren(
        'buildMenu',
        '[data-action="undoBuild"]',
        '<button data-action="undoBuild">undo</button>',
        /data-action=["']undoBuild["']/
    );
    assert.strictEqual(second.changed, false);
    assert.deepStrictEqual(second.elements, [child]);
});
