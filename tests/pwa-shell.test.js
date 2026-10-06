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

runTest('勝利中のPWA通知は折り畳み結果末尾へ移り再描画とタイトル復帰でDOMを保つ', () => {
    const { makeElement } = require('./helpers/test-utils');
    function node(id = '') {
        const element = makeElement({ id, children: [], parentNode: null });
        element.appendChild = child => element.insertBefore(child, null);
        element.insertBefore = (child, next) => {
            child.remove();
            const index = next ? element.children.indexOf(next) : -1;
            element.children.splice(index < 0 ? element.children.length : index, 0, child);
            child.parentNode = element;
            return child;
        };
        element.remove = () => {
            if (element.parentNode) {
                const siblings = element.parentNode.children;
                siblings.splice(siblings.indexOf(element), 1);
                element.parentNode = null;
            }
        };
        Object.defineProperty(element, 'nextSibling', { get() {
            const siblings = element.parentNode?.children || [];
            return siblings[siblings.indexOf(element) + 1] || null;
        } });
        return element;
    }
    const body = node(), screen = node('gameScreen'), update = node('pwaUpdateBanner'), install = node('pwaInstallBanner');
    screen.style.display = 'block';
    update.style.display = 'block';
    install.style.display = 'none';
    body.appendChild(screen); body.appendChild(update); body.appendChild(install);
    const find = (element, id) => element.id === id ? element : element.children.map(child => find(child, id)).find(Boolean);
    let mutation;
    const document = { body, createElement: () => node(), getElementById: id => find(body, id) };
    const controller = PwaShell.createInstallController({ document, window: {
        matchMedia: () => ({ matches: true }),
        MutationObserver: function(callback) { mutation = callback; this.observe = () => {}; },
    }, readStorage: () => null, writeStorage() {} });
    controller.bindInstallHandlers();
    assert.ok(body.classList.contains('pwa-banner-open'));
    body.classList.add('game-finished');
    mutation();
    const dock = document.getElementById('pwaResultNotices');
    assert.strictEqual(dock.parentNode, screen);
    assert.strictEqual(dock.open, undefined);
    assert.strictEqual(update.parentNode, dock);
    assert.strictEqual(document.getElementById('pwaUpdateBanner'), update);
    assert.ok(!body.classList.contains('pwa-banner-open'));
    assert.ok(body.classList.contains('pwa-notices-docked'));
    assert.match(dock.children[0].textContent, /更新/);
    dock.open = true;
    mutation();
    assert.strictEqual(dock.open, true);
    dock.remove(); // Simulate a whole-screen render replacing the result DOM.
    mutation();
    assert.strictEqual(document.getElementById('pwaUpdateBanner'), update);
    assert.strictEqual(dock.parentNode, screen);
    controller.setBannerVisible('pwaUpdateBanner', false);
    assert.strictEqual(dock.hidden, true);
    controller.setBannerVisible('pwaInstallBanner', true);
    assert.strictEqual(dock.hidden, false);
    assert.match(dock.children[0].textContent, /ホーム画面/);
    assert.strictEqual(document.getElementById('pwaInstallBanner'), install);
    screen.style.display = 'none';
    mutation();
    assert.strictEqual(document.getElementById('pwaResultNotices'), undefined);
    assert.strictEqual(update.parentNode, body);
    assert.strictEqual(install.parentNode, body);
    assert.deepStrictEqual(body.children, [screen, update, install]);
    assert.ok(body.classList.contains('pwa-banner-open'));
    assert.ok(!body.classList.contains('pwa-notices-docked'));
});
