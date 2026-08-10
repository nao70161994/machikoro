'use strict';

const assert = require('assert');
const AppShellCrashRuntime = require('../js/appShellCrashRuntime');
const CrashScreen = require('../js/crashScreen');
const { runTest } = require('./helpers/test-utils');

function createHarness(overrides = {}) {
    const calls = [];
    let activeElement = null;
    const reloadButton = { name: 'reload', focus() { activeElement = reloadButton; calls.push(['focus', 'reload']); } };
    const resumeButton = { name: 'resume', style: {}, offsetParent: {}, focus() { activeElement = resumeButton; calls.push(['focus', 'resume']); } };
    const message = {};
    const background = { name: 'background' };
    const previousFocus = {
        name: 'previous',
        offsetParent: {},
        focus() { activeElement = previousFocus; calls.push(['focus', 'previous']); },
    };
    const screen = {
        style: {},
        offsetParent: {},
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
        querySelector: () => reloadButton,
        querySelectorAll: () => [resumeButton, reloadButton],
        focus() { calls.push(['focus', 'screen']); },
    };
    const elements = { crashScreen: screen, crashMessage: message, crashResumeBtn: resumeButton };
    const effects = {
        focusableElements: target => target.querySelectorAll(),
        applyView(targets, view) {
            calls.push(['apply-view', view]);
            targets.message.textContent = view.message;
            targets.resumeButton.style.display = view.resumeDisplay;
            targets.screen.style.display = 'flex';
        },
        focusInitial: (targets, initialFocus) => {
            activeElement = initialFocus === 'resume' ? targets.resumeButton : targets.reloadButton;
            calls.push(['focus-initial', initialFocus]);
        },
        applyFocusTrap: (plan, event) => calls.push(['focus-trap', plan, event]),
        disableBackground: targets => { calls.push(['disable-background', targets]); return ['restore']; },
        restoreBackground: restore => calls.push(['restore-background', restore]),
        restoreFocus: (target, backgrounds) => calls.push(['restore-focus', target, backgrounds]),
        hide(target) { calls.push(['hide']); target.style.display = 'none'; },
    };
    let keydownHandler = null;
    const dependencies = {
        addKeydownListener: handler => { keydownHandler = handler; calls.push(['add-keydown']); },
        cancelCpu: reason => calls.push(['cancel-cpu', reason]),
        controller: CrashScreen.createController(),
        effects,
        getActiveElement: () => activeElement || previousFocus,
        getBackgroundElements: () => [background],
        getElementById: id => elements[id] || null,
        policy: CrashScreen,
        readSavedGame: () => '{"saved":true}',
        removeKeydownListener: handler => { calls.push(['remove-keydown', handler === keydownHandler]); },
        resumeGame: () => calls.push(['resume-game']),
        ...overrides,
    };
    return {
        background,
        calls,
        effects,
        elements,
        previousFocus,
        getKeydownHandler: () => keydownHandler,
        runtime: AppShellCrashRuntime.createRuntime(dependencies),
    };
}

runTest('app shell crash runtimeはCPU停止後にview・listener・focusを既存順で適用する', () => {
    const { calls, elements, runtime } = createHarness();
    runtime.show(new Error('boom'));
    assert.deepStrictEqual(calls.map(call => call[0]), [
        'cancel-cpu', 'disable-background', 'apply-view', 'add-keydown', 'focus-initial',
    ]);
    assert.ok(elements.crashMessage.textContent.includes('boom'));
    assert.strictEqual(elements.crashResumeBtn.style.display, 'block');
    runtime.show(new Error('duplicate'));
    assert.strictEqual(calls.filter(call => call[0] === 'cancel-cpu').length, 1);
});

runTest('app shell crash runtimeは同一focus handlerをtrapとresume解除に使う', () => {
    const { calls, getKeydownHandler, runtime } = createHarness();
    runtime.show(new Error('boom'));
    const handler = getKeydownHandler();
    handler({ key: 'Tab', shiftKey: true });
    assert.ok(calls.some(call => call[0] === 'focus-trap' && call[1].focusTarget === 'last'));
    runtime.resume();
    assert.deepStrictEqual(calls.slice(-5).map(call => call[0]), [
        'restore-background', 'resume-game', 'remove-keydown', 'hide', 'restore-focus',
    ]);
    assert.strictEqual(calls.find(call => call[0] === 'remove-keydown')[1], true);
    assert.strictEqual(calls.find(call => call[0] === 'restore-focus')[1].name, 'previous');
});

runTest('app shell crash runtimeは成功した保存復帰後に古いmodal lockを再適用しない', () => {
    let backgroundRef;
    const harness = createHarness({
        resumeGame() {
            harness.calls.push(['resume-game']);
            backgroundRef.inert = false;
            backgroundRef.ariaHidden = null;
            backgroundRef.style.pointerEvents = '';
            return true;
        },
    });
    const { background, calls, effects, runtime } = harness;
    backgroundRef = background;
    background.inert = true;
    background.ariaHidden = 'true';
    background.style = { pointerEvents: 'none' };
    effects.disableBackground = targets => {
        calls.push(['disable-background', targets]);
        for (const target of targets) {
            target.inert = true;
            target.ariaHidden = 'true';
            target.style.pointerEvents = 'none';
        }
        return ['modal-lock'];
    };
    effects.restoreBackground = () => {
        calls.push(['restore-background']);
        background.inert = true;
        background.ariaHidden = 'true';
        background.style.pointerEvents = 'none';
    };

    runtime.show(new Error('boom'));
    assert.strictEqual(runtime.resume(), true);
    assert.strictEqual(background.inert, false);
    assert.strictEqual(background.ariaHidden, null);
    assert.strictEqual(background.style.pointerEvents, '');
    assert.deepStrictEqual(
        calls.filter(call => ['restore-background', 'resume-game'].includes(call[0])).map(call => call[0]),
        ['restore-background', 'resume-game']
    );
});

runTest('app shell crash runtimeはresume拒否時にoverlayと背景lockを維持する', () => {
    const { calls, runtime } = createHarness({
        resumeGame() { calls.push(['resume-game']); return false; },
    });
    runtime.show(new Error('boom'));
    assert.strictEqual(runtime.resume(), false);
    assert.strictEqual(runtime.trapFocus({ key: 'Tab', shiftKey: true }), undefined);
    assert.strictEqual(calls.filter(call => call[0] === 'disable-background').length, 2);
    assert.strictEqual(calls.some(call => call[0] === 'hide'), false);
    assert.deepStrictEqual(
        calls.filter(call => ['restore-background', 'resume-game', 'disable-background'].includes(call[0]))
            .slice(-3).map(call => call[0]),
        ['restore-background', 'resume-game', 'disable-background']
    );
    assert.strictEqual(calls.some(call => call[0] === 'remove-keydown'), false);
});

runTest('app shell crash runtimeはresume例外時も背景lockを再適用して例外を伝える', () => {
    const { calls, runtime } = createHarness({
        resumeGame() { calls.push(['resume-game']); throw new Error('resume failed'); },
    });
    runtime.show(new Error('boom'));
    assert.throws(() => runtime.resume(), /resume failed/);
    assert.strictEqual(calls.filter(call => call[0] === 'disable-background').length, 2);
    assert.strictEqual(calls.some(call => call[0] === 'hide'), false);
});

runTest('app shell crash runtimeは必須依存欠落を初期化時に拒否する', () => {
    assert.throws(() => AppShellCrashRuntime.createRuntime(), /addKeydownListener is required/);
});
