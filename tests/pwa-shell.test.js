'use strict';

const assert = require('assert');
const PwaShell = require('../js/pwaShell');
const { runTest } = require('./helpers/test-utils');

function createSubject(options = {}) {
    const listeners = {};
    const storage = {};
    const classes = new Set();
    const elements = {
        pwaInstallBanner: { style: { display: 'none' } },
        pwaUpdateBanner: { style: { display: 'none' } },
    };
    const document = {
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
        window,
        readStorage(key) { return storage[key] || null; },
        writeStorage(key, value) { storage[key] = value; },
    });
    return { controller, listeners, storage, classes, elements };
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
    subject.controller.promptInstall();
    await Promise.resolve();

    assert.strictEqual(prevented, 1);
    assert.strictEqual(prompted, 1);
    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'none');
});

runTest('PWA shellはdismiss契約とstandalone時の未登録を維持する', () => {
    const subject = createSubject();
    subject.controller.setBannerVisible('pwaInstallBanner', true);
    subject.controller.dismissInstall();
    assert.strictEqual(subject.storage.pwaInstallDismissed, '1');
    assert.strictEqual(subject.elements.pwaInstallBanner.style.display, 'none');

    const standalone = createSubject({ standalone: true });
    standalone.controller.bindInstallHandlers();
    assert.strictEqual(standalone.listeners.beforeinstallprompt, undefined);
});
