'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const UiModalClose = require('../js/uiModalClose');
const UiModalOpen = require('../js/uiModalOpen');
const UiModalPolicy = require('../js/uiModalPolicy');
const UiModalRuntime = require('../js/uiModalRuntime');
const { runTest } = require('./helpers/test-utils');

function element(id) {
    const attrs = new Map();
    return {
        id,
        style: { display: 'none' },
        setAttribute: (name, value) => attrs.set(name, String(value)),
        getAttribute: name => attrs.has(name) ? attrs.get(name) : null,
        focus() { this.focused = true; },
        contains: () => true,
    };
}

function createHarness(options = {}) {
    const calls = [];
    const elements = {
        rulesModal: element('rulesModal'),
        cardSelectModal: element('cardSelectModal'),
        confirmModal: element('confirmModal'),
    };
    const opener = { focus: () => calls.push(['restoreFocus']) };
    const document = {
        activeElement: opener,
        body: { classList: { add: value => calls.push(['bodyClass', value]) } },
        getElementById: id => elements[id] || null,
    };
    let activeModalId = null;
    let lastFocus = null;
    const controller = {
        getActiveModalId: () => activeModalId,
        setActiveModalId: value => { activeModalId = value; calls.push(['active', value]); },
        rememberFocus: value => { lastFocus = value; calls.push(['rememberFocus', value]); },
        getLastFocus: () => lastFocus,
        clearLastFocus: () => { lastFocus = null; calls.push(['clearFocus']); },
    };
    const domEffects = {
        clearOrphanLocks: () => { calls.push(['clearOrphan']); return true; },
        focusModal: modal => calls.push(['focusModal', modal.id]),
        focusableElements: () => options.focusable || [],
        isModalVisible: id => elements[id] && elements[id].style.display !== 'none',
        normalizeForOpen: modal => { modal.style.display = 'flex'; calls.push(['normalize', modal.id]); },
        setAppInert: value => calls.push(['inert', value]),
    };
    const runtime = UiModalRuntime.createRuntime({
        appendViolation: entry => calls.push(['violation', entry]),
        buildSnapshot: reason => { calls.push(['snapshot', reason]); return { reason }; },
        canRenderPending: () => true,
        canTrace: () => true,
        closePlan: UiModalClose,
        controller,
        domEffects,
        getCloseHandler: id => options.closeHandlers && options.closeHandlers[id] || null,
        getDocument: () => document,
        isCloseAuthorityEnabled: () => options.closeAuthority === true,
        isOpenAuthorityEnabled: () => options.openAuthority === true,
        nowIso: () => '2026-08-05T00:00:00.000Z',
        openPlan: UiModalOpen,
        policy: UiModalPolicy,
        recordTrace: (...args) => calls.push(['trace', ...args]),
        renderPending: () => calls.push(['renderPending']),
        warn: (...args) => calls.push(['warn', ...args]),
    });
    return { calls, controller, document, elements, runtime };
}

runTest('UI modal runtimeはopen transactionをfocus前後の既存順で実行する', () => {
    const harness = createHarness();
    assert.strictEqual(harness.runtime.open('rulesModal'), true);
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'rememberFocus', 'active', 'bodyClass', 'normalize',
        'focusModal', 'inert',
    ]);
    assert.strictEqual(harness.elements.rulesModal.getAttribute('role'), 'dialog');
    assert.strictEqual(harness.elements.rulesModal.getAttribute('aria-modal'), 'true');
    assert.ok(harness.calls.findIndex(call => call[0] === 'focusModal') <
        harness.calls.findIndex(call => call[0] === 'inert'));
});

runTest('UI modal runtimeはopen authority有効時も同じeffect順を維持する', () => {
    const harness = createHarness({ openAuthority: true });
    assert.strictEqual(harness.runtime.selectOpenPlan('rulesModal').source, 'pure-plan');
    harness.runtime.open('rulesModal');
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'rememberFocus', 'active', 'bodyClass', 'normalize',
        'focusModal', 'inert',
    ]);
});

runTest('UI modal runtimeはcloseでunlock後にpending・focus・traceを実行する', () => {
    const harness = createHarness({ closeAuthority: true });
    harness.runtime.open('rulesModal');
    harness.calls.length = 0;
    assert.strictEqual(harness.runtime.selectClosePlan(
        'rulesModal', {}, [], null
    ).source, 'pure-plan');
    harness.runtime.close('rulesModal');
    assert.deepStrictEqual(harness.calls.map(call => call[0]), [
        'snapshot', 'active', 'inert', 'clearOrphan', 'renderPending',
        'restoreFocus', 'clearFocus', 'snapshot', 'trace',
    ]);
    assert.strictEqual(harness.elements.rulesModal.style.display, 'none');
});

runTest('UI modal runtimeはnested blocking拒否を診断・traceへ記録する', () => {
    const harness = createHarness();
    harness.runtime.open('rulesModal');
    harness.calls.length = 0;
    assert.strictEqual(harness.runtime.open('cardSelectModal'), false);
    const violation = harness.calls.find(call => call[0] === 'violation')[1];
    assert.strictEqual(violation.type, 'nested-blocking-modal-denied');
    assert.strictEqual(violation.activeModalId, 'rulesModal');
    assert.strictEqual(violation.timestamp, '2026-08-05T00:00:00.000Z');
    assert.ok(harness.calls.some(call => call[0] === 'trace'));
    assert.ok(harness.calls.some(call => call[0] === 'warn'));
});

runTest('UI modal runtimeはEscape closeとTab focus commandをpolicyから実行する', () => {
    let closeCount = 0;
    const first = { focus: () => {} };
    const last = { focus: () => {} };
    const harness = createHarness({
        closeHandlers: { rulesModal: () => { closeCount++; } },
        focusable: [first, last],
    });
    harness.runtime.open('rulesModal');
    const escape = { key: 'Escape', preventDefaultCalled: false, preventDefault() { this.preventDefaultCalled = true; } };
    harness.runtime.handleKeydown(escape);
    assert.strictEqual(closeCount, 1);
    assert.strictEqual(escape.preventDefaultCalled, true);

    harness.document.activeElement = last;
    let firstFocused = false;
    first.focus = () => { firstFocused = true; };
    const tab = { key: 'Tab', shiftKey: false, preventDefault() {} };
    harness.runtime.handleKeydown(tab);
    assert.strictEqual(firstFocused, true);
});

runTest('ui.jsはmodal application transactionを専用runtimeへ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');
    assert.ok(source.includes('UiModalRuntime.createRuntime'));
    assert.ok(source.includes('uiModalRuntime.open(id)'));
    assert.ok(source.includes('uiModalRuntime.close(id, options)'));
    assert.strictEqual(source.includes('UiModalOpen.execute(selection.plan'), false);
    assert.strictEqual(source.includes('UiModalClose.execute(selection.plan'), false);
});

runTest('UI modal runtimeは必須adapter欠落を初期化前に拒否する', () => {
    assert.throws(() => UiModalRuntime.createRuntime(), /dependency is required/);
    const { runtime } = createHarness();
    assert.ok(Object.isFrozen(runtime));
    assert.ok(Object.isFrozen(UiModalRuntime.TRACE_MODAL_IDS));
});
