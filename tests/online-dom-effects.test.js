'use strict';

const assert = require('assert');
const OnlineDomEffects = require('../js/onlineDomEffects');
const { runTest } = require('./helpers/test-utils');

function createRuntime() {
    const elements = {
        onlineStatus: { textContent: '', innerHTML: '', style: {} },
        titleScreen: { style: { display: 'block' } },
        gameScreen: { style: { display: 'none' } },
        onlineCreateSubmitButton: { disabled: false, textContent: '' },
        playerNameInput: { value: ' Alice ' },
    };
    const runtime = OnlineDomEffects.createRuntime({
        getDocument: () => ({ getElementById: id => elements[id] || null }),
    });
    return { elements, runtime };
}

runTest('online DOM effectsはstatus text/htmlとwaiting判定を所有する', () => {
    const { elements, runtime } = createRuntime();
    assert.strictEqual(runtime.setStatusText('⏳ 接続中'), true);
    assert.strictEqual(runtime.statusText(), '⏳ 接続中');
    assert.strictEqual(runtime.isStatusWaiting(), true);
    assert.strictEqual(runtime.setStatusHtml('<b>ready</b>'), true);
    assert.strictEqual(elements.onlineStatus.innerHTML, '<b>ready</b>');
});

runTest('online DOM effectsは画面切替・input・button viewを注入DOMへ限定する', () => {
    const { elements, runtime } = createRuntime();
    assert.strictEqual(runtime.showGame(), true);
    assert.strictEqual(elements.titleScreen.style.display, 'none');
    assert.strictEqual(elements.gameScreen.style.display, 'block');
    assert.strictEqual(runtime.inputValue(OnlineDomEffects.ids.playerName), ' Alice ');
    assert.strictEqual(runtime.applyButtonView(OnlineDomEffects.ids.createButton, {
        disabled: true,
        textContent: '送信中',
    }), true);
    assert.strictEqual(elements.onlineCreateSubmitButton.disabled, true);
    assert.strictEqual(elements.onlineCreateSubmitButton.textContent, '送信中');
    assert.strictEqual(runtime.setText('missing', 'value'), false);
    assert.strictEqual(runtime.inputValue('missing'), '');
});

runTest('online DOM effectsの既存element ID契約はfrozenである', () => {
    assert.ok(Object.isFrozen(OnlineDomEffects.ids));
    assert.strictEqual(OnlineDomEffects.ids.status, 'onlineStatus');
    assert.strictEqual(OnlineDomEffects.ids.createButton, 'onlineCreateSubmitButton');
    assert.strictEqual(OnlineDomEffects.ids.roomId, 'roomIdInput');
});
