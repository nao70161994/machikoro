'use strict';
const assert = require('assert');
const UiScreenFocus = require('../js/uiScreenFocus');
const { makeElement, runTest } = require('./helpers/test-utils');

function createDocument(overrides = {}) {
    const elements = {
        crashScreen: makeElement({ style: { display: 'none' } }),
        gameScreen: makeElement({ style: { display: 'block' } }),
        status: makeElement(),
        titleHeading: makeElement(),
        titleScreen: makeElement({ style: { display: 'none' } }),
        ...overrides,
    };
    const documentRef = {
        activeElement: null,
        body: makeElement(),
        documentElement: makeElement(),
        elements,
        getElementById: id => elements[id] || null,
    };
    Object.values(elements).forEach(element => {
        const originalFocus = element.focus;
        element.focus = focusOptions => {
            originalFocus.call(element, focusOptions);
            documentRef.activeElement = element;
        };
    });
    return documentRef;
}

runTest('screen focusは描画後のゲームstatusをプログラムfocus対象にする', () => {
    const documentRef = createDocument();

    assert.strictEqual(UiScreenFocus.focusGame(documentRef), true);
    assert.strictEqual(documentRef.elements.status.focused, true);
    assert.strictEqual(documentRef.elements.status.getAttribute('tabindex'), '-1');
});

runTest('screen focusはpreferred target切断時に可視screenへfallbackする', () => {
    const documentRef = createDocument({ status: makeElement({ isConnected: false }) });

    assert.strictEqual(UiScreenFocus.focusGame(documentRef), true);
    assert.strictEqual(documentRef.elements.gameScreen.focused, true);
    assert.strictEqual(documentRef.elements.status.focused, undefined);
});

runTest('screen focusはタイトルheadingへ戻し非表示screenを選ばない', () => {
    const documentRef = createDocument({
        gameScreen: makeElement({ style: { display: 'none' } }),
        titleScreen: makeElement({ style: { display: 'block' } }),
    });

    assert.strictEqual(UiScreenFocus.focusGame(documentRef), false);
    assert.strictEqual(UiScreenFocus.focusTitle(documentRef), true);
    assert.strictEqual(documentRef.elements.titleHeading.focused, true);
});

runTest('screen focusはmodalとcrash screenのfocusを奪わない', () => {
    const modalDocument = createDocument();
    modalDocument.body.classList.add('modal-open');
    assert.strictEqual(UiScreenFocus.focusGame(modalDocument), false);

    const crashDocument = createDocument({
        crashScreen: makeElement({ style: { display: 'flex' } }),
    });
    assert.strictEqual(UiScreenFocus.focusGame(crashDocument), false);
    assert.strictEqual(crashDocument.elements.status.focused, undefined);
});

runTest('screen focus補完は接続済みの現在focusを維持する', () => {
    const documentRef = createDocument();
    const active = makeElement();
    documentRef.activeElement = active;

    assert.strictEqual(UiScreenFocus.ensureCurrentScreenFocus(documentRef), false);
    assert.strictEqual(documentRef.activeElement, active);
    assert.strictEqual(documentRef.elements.status.focused, undefined);
});

runTest('screen focus補完は切断・非表示祖先配下のfocusをgame statusへ戻す', () => {
    const disconnectedDocument = createDocument();
    disconnectedDocument.activeElement = makeElement({ isConnected: false });
    assert.strictEqual(UiScreenFocus.ensureCurrentScreenFocus(disconnectedDocument), true);
    assert.strictEqual(disconnectedDocument.activeElement, disconnectedDocument.elements.status);

    const hiddenAncestorDocument = createDocument();
    const opener = makeElement({
        parentElement: makeElement({ style: { display: 'none' } }),
    });
    hiddenAncestorDocument.activeElement = opener;
    assert.strictEqual(UiScreenFocus.ensureCurrentScreenFocus(hiddenAncestorDocument), true);
    assert.strictEqual(hiddenAncestorDocument.activeElement, hiddenAncestorDocument.elements.status);
});

runTest('screen focus補完は別modal表示中にfocusを移さない', () => {
    const documentRef = createDocument();
    documentRef.activeElement = documentRef.body;
    documentRef.body.classList.add('modal-open');

    assert.strictEqual(UiScreenFocus.ensureCurrentScreenFocus(documentRef), false);
    assert.strictEqual(documentRef.elements.status.focused, undefined);
});
