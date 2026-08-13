'use strict';

const assert = require('assert');
const OnlineDomEffects = require('../js/onlineDomEffects');
const { runTest } = require('./helpers/test-utils');

function createRuntime() {
    const elements = {
        onlineGameStatus: { textContent: '', style: { display: 'none' } },
        onlineStatus: { textContent: '', innerHTML: '', style: {} },
        onlineWaitingPanel: { textContent: '', innerHTML: '', style: {} },
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
    assert.strictEqual(elements.onlineGameStatus.textContent, '⏳ 接続中');
    assert.strictEqual(elements.onlineGameStatus.style.display, 'block');
    assert.strictEqual(runtime.isStatusWaiting(), true);
    assert.strictEqual(runtime.setStatusText(''), true);
    assert.strictEqual(elements.onlineGameStatus.textContent, '');
    assert.strictEqual(elements.onlineGameStatus.style.display, 'none');
    assert.strictEqual(runtime.setStatusHtml('<b>ready</b>'), true);
    assert.strictEqual(elements.onlineStatus.innerHTML, '<b>ready</b>');
});

runTest('online DOM effectsは待機操作をlive region外へ描画して同じ操作へfocusを戻す', () => {
    const focusCalls = [];
    function control(attributes) {
        return {
            focus: options => focusCalls.push([attributes['data-ui-action'], options]),
            getAttribute: name => attributes[name] ?? null,
        };
    }
    const oldIncrease = control({
        'data-ui-action': 'changeOnlineLobbySlots',
        'data-delta': '1',
    });
    const newDecrease = control({
        'data-ui-action': 'changeOnlineLobbySlots',
        'data-delta': '-1',
    });
    const newIncrease = control({
        'data-ui-action': 'changeOnlineLobbySlots',
        'data-delta': '1',
    });
    const panel = {
        innerHTML: '',
        contains: target => target === oldIncrease,
        querySelectorAll: () => [newDecrease, newIncrease],
    };
    const status = { textContent: '', focus: options => focusCalls.push(['status', options]) };
    const gameStatus = { textContent: '', style: {} };
    const runtime = OnlineDomEffects.createRuntime({
        getDocument: () => ({
            activeElement: oldIncrease,
            getElementById(id) {
                return { onlineWaitingPanel: panel, onlineStatus: status, onlineGameStatus: gameStatus }[id] || null;
            },
        }),
    });

    assert.strictEqual(runtime.renderWaitingLobby('3枠中2人', '<button>new</button>'), true);
    assert.strictEqual(status.textContent, '3枠中2人');
    assert.strictEqual(panel.innerHTML, '<button>new</button>');
    assert.deepStrictEqual(focusCalls, [['changeOnlineLobbySlots', { preventScroll: true }]]);
});

runTest('online DOM effectsは除外済み操作のfocusを安全なhost操作へ戻す', () => {
    const focusCalls = [];
    const oldRemove = {
        getAttribute: name => ({
            'data-ui-action': 'removeOnlineLobbyPlayer', 'data-player-index': '1',
        })[name] ?? null,
    };
    const fallback = {
        getAttribute: name => name === 'data-ui-action' ? 'startOnlineLobbyNow' : null,
        focus: options => focusCalls.push(options),
    };
    const elements = {
        onlineWaitingPanel: {
            innerHTML: '',
            contains: target => target === oldRemove,
            querySelectorAll: () => [fallback],
        },
        onlineStatus: { textContent: '', focus() {} },
        onlineGameStatus: { textContent: '', style: {} },
    };
    const runtime = OnlineDomEffects.createRuntime({
        getDocument: () => ({
            activeElement: oldRemove,
            getElementById: id => elements[id] || null,
        }),
    });

    runtime.renderWaitingLobby('更新しました', '<button>start</button>');
    assert.deepStrictEqual(focusCalls, [{ preventScroll: true }]);
    runtime.setStatusText('ゲームを開始します');
    assert.strictEqual(elements.onlineWaitingPanel.innerHTML, '');
});

runTest('online DOM effectsは画面切替・input・button viewを注入DOMへ限定する', () => {
    const { elements, runtime } = createRuntime();
    runtime.setStatusText('ロビー待機中');
    assert.strictEqual(runtime.showGame(), true);
    assert.strictEqual(elements.titleScreen.style.display, 'none');
    assert.strictEqual(elements.gameScreen.style.display, 'block');
    assert.strictEqual(elements.onlineGameStatus.textContent, '');
    assert.strictEqual(elements.onlineGameStatus.style.display, 'none');
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
    assert.strictEqual(OnlineDomEffects.ids.waitingPanel, 'onlineWaitingPanel');
    assert.strictEqual(OnlineDomEffects.ids.gameStatus, 'onlineGameStatus');
    assert.strictEqual(OnlineDomEffects.ids.createButton, 'onlineCreateSubmitButton');
    assert.strictEqual(OnlineDomEffects.ids.roomId, 'roomIdInput');
});
