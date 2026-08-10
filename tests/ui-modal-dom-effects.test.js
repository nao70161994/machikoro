'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const UiModalDomEffects = require('../js/uiModalDomEffects');
const UiModalPolicy = require('../js/uiModalPolicy');
const { runTest } = require('./helpers/test-utils');

function createElement(options = {}) {
    const attributes = new Map();
    const classes = new Set(options.classes || []);
    const element = {
        disabled: options.disabled === true,
        hidden: options.hidden === true,
        style: { ...(options.style || {}) },
        focused: false,
        children: options.children || [],
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value),
        },
        closest: () => options.blockedAncestor ? {} : null,
        focus() { this.focused = true; },
        getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        removeAttribute(name) { attributes.delete(name); },
        querySelector(selector) {
            return selector === '.modal-content' ? options.content || null : null;
        },
        querySelectorAll() { return this.children; },
    };
    if (options.hasOwnInert) element.inert = options.inert === true;
    if (options.ariaHidden !== undefined) element.setAttribute('aria-hidden', options.ariaHidden);
    return element;
}

function createHarness(options = {}) {
    const traces = [];
    const roots = {
        titleScreen: createElement({ hasOwnInert: options.nativeInert !== false }),
        gameScreen: createElement({ hasOwnInert: options.nativeInert !== false }),
    };
    const body = createElement({ classes: options.bodyModalOpen ? ['modal-open'] : [] });
    const document = {
        body,
        getElementById: id => roots[id] || options.modals && options.modals[id] || null,
    };
    const controller = UiModalPolicy.createRuntimeController();
    const runtime = UiModalDomEffects.createRuntime({
        controller,
        getDocument: () => document,
        getVisibleBlockingIds: () => options.blockingIds || [],
        getWindow: () => ({
            getComputedStyle: element => element.computed || element.style || {},
        }),
        inertRootIds: ['titleScreen', 'gameScreen'],
        policy: UiModalPolicy,
        recordTrace: (...args) => traces.push(args),
    });
    return { body, controller, roots, runtime, traces };
}

runTest('UI modal DOM effectsは操作可能な先頭要素へfocusする', () => {
    const hidden = createElement({ style: { display: 'none' } });
    const disabled = createElement({ disabled: true });
    const active = createElement();
    const modal = createElement({ children: [hidden, disabled, active] });
    const { runtime } = createHarness();
    assert.deepStrictEqual(runtime.focusableElements(modal), [active]);
    runtime.focusModal(modal);
    assert.strictEqual(active.focused, true);
    assert.strictEqual(modal.focused, false);
});

runTest('UI modal DOM effectsは背景inert属性とpointer stateを完全に往復する', () => {
    const { roots, runtime } = createHarness();
    roots.titleScreen.style.pointerEvents = 'auto';
    roots.gameScreen.setAttribute('aria-hidden', 'menu');
    runtime.setAppInert(true);
    assert.strictEqual(roots.titleScreen.inert, true);
    assert.strictEqual(roots.gameScreen.inert, true);
    assert.strictEqual(roots.titleScreen.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(roots.titleScreen.style.pointerEvents, 'none');
    runtime.setAppInert(false);
    assert.strictEqual(roots.titleScreen.inert, false);
    assert.strictEqual(roots.gameScreen.inert, false);
    assert.strictEqual(roots.titleScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(roots.gameScreen.getAttribute('aria-hidden'), 'menu');
    assert.strictEqual(roots.titleScreen.style.pointerEvents, 'auto');
});

runTest('UI modal DOM effectsはnative inert未定義でも解除時にfalseを明示する', () => {
    const { roots, runtime } = createHarness({ nativeInert: false });
    runtime.setAppInert(true);
    runtime.setAppInert(false);
    assert.strictEqual(roots.titleScreen.inert, false);
    assert.strictEqual(roots.gameScreen.inert, false);
});

runTest('UI modal DOM effectsはgame reset後の次回openでも背景lockを再取得する', () => {
    const { controller, roots, runtime } = createHarness();
    const focus = { focus() {} };
    controller.setActiveModalId('rulesModal');
    controller.rememberFocus(focus);
    runtime.setAppInert(true);
    assert.strictEqual(controller.snapshot().inertRestoreCount, 2);

    assert.deepStrictEqual(runtime.resetRuntimeState(), {
        activeModalId: null,
        hasLastFocus: false,
        inertRestoreCount: 0,
    });
    assert.strictEqual(roots.titleScreen.inert, false);

    controller.setActiveModalId('confirmModal');
    runtime.setAppInert(true);
    assert.strictEqual(controller.snapshot().inertRestoreCount, 2);
    assert.strictEqual(roots.titleScreen.inert, true);
    assert.strictEqual(roots.titleScreen.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(roots.titleScreen.style.pointerEvents, 'none');
});

runTest('UI modal DOM effectsはblocking modal不在時だけ孤立lockを除去する', () => {
    const blocked = createHarness({ blockingIds: ['confirmModal'], bodyModalOpen: true });
    blocked.roots.gameScreen.inert = true;
    assert.strictEqual(blocked.runtime.clearOrphanLocks(), false);
    assert.strictEqual(blocked.roots.gameScreen.inert, true);

    const open = createHarness({ bodyModalOpen: true });
    open.roots.gameScreen.inert = true;
    open.roots.gameScreen.setAttribute('aria-hidden', 'true');
    open.roots.gameScreen.style.pointerEvents = 'none';
    assert.strictEqual(open.runtime.clearOrphanLocks(), true);
    assert.strictEqual(open.roots.gameScreen.inert, false);
    assert.strictEqual(open.roots.gameScreen.getAttribute('aria-hidden'), null);
    assert.strictEqual(open.roots.gameScreen.style.pointerEvents, '');
    assert.strictEqual(open.body.classList.contains('modal-open'), false);
    assert.deepStrictEqual(open.traces[0], [
        'modal-close-orphan-lock-cleared', { visibleBlockingModalIds: [] },
    ]);
});

runTest('UI modal DOM effectsは表示判定とopen visual stateをpolicy形式で投影する', () => {
    const content = createElement({ style: { visibility: 'hidden' } });
    const modal = createElement({ content, style: { display: 'none' } });
    const { runtime } = createHarness({ modals: { rulesModal: modal } });
    assert.strictEqual(runtime.isModalVisible('rulesModal'), false);
    runtime.normalizeForOpen(modal);
    assert.strictEqual(runtime.isModalVisible('rulesModal'), true);
    assert.deepStrictEqual(modal.style, {
        display: 'flex', visibility: 'visible', opacity: '1',
        pointerEvents: 'auto', transform: '',
    });
    assert.strictEqual(content.style.visibility, 'visible');
    assert.strictEqual(content.style.opacity, '1');
    assert.strictEqual(content.style.pointerEvents, 'auto');
});

runTest('ui.jsはmodal DOM mechanicsを専用runtimeへ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');
    assert.ok(source.includes('UiModalDomEffects.createRuntime'));
    assert.ok(source.includes('uiModalDomEffects.setAppInert'));
    assert.ok(source.includes('uiModalDomEffects.resetRuntimeState'));
    assert.ok(source.includes('uiModalDomEffects.clearOrphanLocks'));
    assert.strictEqual(source.includes("root.querySelectorAll('button, [href]"), false);
});

runTest('UI modal DOM effectsは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(() => UiModalDomEffects.createRuntime(), /dependency is required/);
    const { runtime } = createHarness();
    assert.ok(Object.isFrozen(runtime));
});
