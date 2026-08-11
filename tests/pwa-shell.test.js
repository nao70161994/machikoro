'use strict';

const assert = require('assert');
const PwaShell = require('../js/pwaShell');
const { runTest } = require('./helpers/test-utils');

function createSubject(options = {}) {
    const listeners = {};
    const storage = {};
    const classes = new Set();
    function banner() {
        const element = {
            style: { display: 'none' },
            contains(candidate) { return candidate && candidate.parentElement === element; },
        };
        return element;
    }
    const elements = {
        pwaInstallBanner: banner(),
        pwaUpdateBanner: banner(),
    };
    let focusRestoreCalls = 0;
    const document = {
        activeElement: null,
        body: {
            classList: {
                toggle(name, enabled) {
                    if (enabled) classes.add(name);
                    else classes.delete(name);
                },
            },
        },
        getElementById(id) { return elements[id] || null; },
    };
    const window = {
        matchMedia() { return { matches: !!options.standalone }; },
        addEventListener(event, handler) { listeners[event] = handler; },
    };
    const controller = PwaShell.createInstallController({
        document,
        ensureCurrentScreenFocus() { focusRestoreCalls += 1; },
        window,
        readStorage(key) { return storage[key] || null; },
        writeStorage(key, value) { storage[key] = value; },
    });
    return {
        controller, listeners, storage, classes, document, elements,
        focusRestoreCalls: () => focusRestoreCalls,
        focusInside(id) {
            document.activeElement = { parentElement: elements[id] };
        },
    };
}

runTest('PWA shellはupdate banner表示中にinstall bannerを重ねない', () => {
    const subject = createSubject();
    subject.elements.pwaUpdateBanner.style.display = 'block';
    subject.controller.setBannerVisible('pwaInstallBanner', true);

    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'none');
    assert.strictEqual(subject.classes.has('pwa-banner-open'), true);
});

runTest('PWA shellはbeforeinstallpromptを一度だけ登録してprompt完了後に閉じる', async () => {
    const subject = createSubject();
    let prevented = 0;
    let prompted = 0;
    subject.controller.bindInstallHandlers();
    const firstHandler = subject.listeners.beforeinstallprompt;
    subject.controller.bindInstallHandlers();
    assert.strictEqual(subject.listeners.beforeinstallprompt, firstHandler);

    firstHandler({
        preventDefault() { prevented += 1; },
        prompt() { prompted += 1; },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'block');
    subject.focusInside('pwaInstallBanner');
    subject.controller.promptInstall();
    await Promise.resolve();

    assert.strictEqual(prevented, 1);
    assert.strictEqual(prompted, 1);
    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'none');
    assert.strictEqual(subject.focusRestoreCalls(), 1);
});

runTest('PWA shellはinstall promptを呼出前に消費して二重操作を無視する', async () => {
    const subject = createSubject();
    let prompted = 0;
    let resolveChoice;
    subject.controller.bindInstallHandlers();
    subject.listeners.beforeinstallprompt({
        preventDefault() {},
        prompt() {
            prompted += 1;
            if (prompted > 1) throw new Error('InvalidStateError');
        },
        userChoice: new Promise(resolve => { resolveChoice = resolve; }),
    });

    assert.doesNotThrow(() => {
        subject.controller.promptInstall();
        subject.controller.promptInstall();
    });
    assert.strictEqual(prompted, 1);
    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'block');

    resolveChoice({ outcome: 'accepted' });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'none');
});

runTest('PWA shellはpromptとuserChoiceの拒否を外へ伝播させずbannerを閉じる', async () => {
    for (const prompt of [
        () => { throw new Error('prompt threw'); },
        () => Promise.reject(new Error('prompt rejected')),
    ]) {
        const subject = createSubject();
        subject.controller.bindInstallHandlers();
        subject.listeners.beforeinstallprompt({
            preventDefault() {},
            prompt,
            userChoice: Promise.reject(new Error('choice rejected')),
        });

        subject.focusInside('pwaInstallBanner');
        assert.doesNotThrow(() => subject.controller.promptInstall());
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'none');
        assert.strictEqual(subject.focusRestoreCalls(), 1);
    }
});

runTest('PWA shellはdismiss契約とstandalone時の未登録を維持する', () => {
    const subject = createSubject();
    subject.controller.setBannerVisible('pwaInstallBanner', true);
    subject.focusInside('pwaInstallBanner');
    subject.controller.dismissInstall();
    assert.strictEqual(subject.storage.pwaInstallDismissed, '1');
    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'none');
    assert.strictEqual(subject.focusRestoreCalls(), 1);

    const outside = createSubject();
    outside.controller.setBannerVisible('pwaInstallBanner', true);
    outside.document.activeElement = {};
    outside.controller.dismissInstall();
    assert.strictEqual(outside.focusRestoreCalls(), 0);

    const standalone = createSubject({ standalone: true });
    standalone.controller.bindInstallHandlers();
    assert.strictEqual(standalone.listeners.beforeinstallprompt, undefined);
});
