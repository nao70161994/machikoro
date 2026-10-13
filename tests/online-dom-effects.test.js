'use strict';

const assert = require('assert');
const OnlineDomEffects = require('../js/onlineDomEffects');
const { runTest } = require('./helpers/test-utils');

function createRuntime() {
    const elements = {
        onlineGameStatus: { textContent: '', style: { display: 'none' }, setAttribute(name, value) { this[name] = value; } },
        onlineStatus: { textContent: '', innerHTML: '', style: {}, setAttribute(name, value) { this[name] = value; } },
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
    assert.strictEqual(elements.onlineGameStatus['data-status-kind'], 'waiting');
    assert.strictEqual(runtime.isStatusWaiting(), true);
    assert.strictEqual(runtime.setStatusText(''), true);
    assert.strictEqual(elements.onlineGameStatus.textContent, '');
    assert.strictEqual(elements.onlineGameStatus.style.display, 'none');
    assert.strictEqual(runtime.setStatusHtml('<b>ready</b>'), true);
    assert.strictEqual(elements.onlineStatus.innerHTML, '<b>ready</b>');
});

runTest('online DOM effectsは接続・復元・成功・失敗状態に一貫した意味属性を付ける', () => {
    const { elements, runtime } = createRuntime();
    runtime.setStatusText('♻️ ゲームを復元中...');
    assert.strictEqual(elements.onlineStatus['data-status-kind'], 'restore');
    assert.strictEqual(elements.onlineGameStatus['data-status-kind'], 'restore');
    runtime.setStatusText('✅ ルームに参加しました');
    assert.strictEqual(elements.onlineGameStatus['data-status-kind'], 'success');
    runtime.setStatusText('❌ 復元に失敗しました');
    assert.strictEqual(elements.onlineGameStatus['data-status-kind'], 'error');
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

runTest('online待機室の再描画は開いた設定と見出しフォーカスを保つ', () => {
    const focusCalls = [];
    const oldSummary = { getAttribute: name => name === 'data-waiting-focus' ? 'setup' : null };
    const newSummary = {
        getAttribute: name => name === 'data-waiting-focus' ? 'setup' : null,
        focus: options => focusCalls.push(options),
    };
    const oldDetails = { open: true, getAttribute: name => name === 'data-waiting-details' ? 'setup' : null };
    const newDetails = { open: false, getAttribute: name => name === 'data-waiting-details' ? 'setup' : null };
    const panel = {
        innerHTML: '',
        contains: target => target === oldSummary,
        querySelectorAll(selector) {
            return selector === '[data-waiting-details]' ? [this.innerHTML ? newDetails : oldDetails] : [newSummary];
        },
    };
    const status = { textContent: '' };
    const runtime = OnlineDomEffects.createRuntime({
        getDocument: () => ({
            activeElement: oldSummary,
            getElementById(id) {
                return { onlineWaitingPanel: panel, onlineStatus: status, onlineGameStatus: { textContent: '', style: {} } }[id] || null;
            },
        }),
    });

    runtime.renderWaitingLobby('参加者が増えました', '<details><summary>設定</summary></details>');
    assert.strictEqual(newDetails.open, true);
    assert.deepStrictEqual(focusCalls, [{ preventScroll: true }]);
});

runTest('online待機室の更新中は同一ルームのQRを表示したままにする', () => {
    const svg = { cloneNode: () => ({ cloned: true }) };
    let currentButton, currentQr;
    const makeButton = roomId => ({
        textContent: 'QRを表示',
        attributes: { 'data-room-id': roomId },
        getAttribute(name) { return this.attributes[name] ?? null; },
        setAttribute(name, value) { this.attributes[name] = value; },
    });
    const makeQr = visible => ({
        childNodes: visible ? [svg] : [],
        classList: {
            contains: name => name === 'is-visible' && visible,
            toggle(name, value) { if (name === 'is-visible') visible = value; },
        },
        replaceChildren(...children) { this.childNodes = children; },
    });
    currentButton = makeButton('ROOM01');
    currentQr = makeQr(true);
    const panel = {
        innerHTML: '',
        contains: () => false,
        querySelector: selector => selector === '.room-qr-toggle' ? currentButton : currentQr,
        querySelectorAll: () => [],
        set innerHTML(value) {
            this._innerHTML = value;
            currentButton = makeButton(value.includes('ROOM02') ? 'ROOM02' : 'ROOM01');
            currentQr = makeQr(false);
        },
        get innerHTML() { return this._innerHTML || ''; },
    };
    const runtime = OnlineDomEffects.createRuntime({
        getDocument: () => ({
            activeElement: null,
            getElementById(id) {
                return { onlineWaitingPanel: panel, onlineStatus: { textContent: '' }, onlineGameStatus: { textContent: '', style: {} } }[id] || null;
            },
        }),
    });

    runtime.renderWaitingLobby('参加者が増えました', 'ROOM01');
    assert.deepStrictEqual(currentQr.childNodes, [{ cloned: true }]);
    assert.strictEqual(currentButton.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(currentButton.textContent, 'QRを隠す');

    currentButton = makeButton('ROOM01');
    currentQr = makeQr(true);
    runtime.renderWaitingLobby('別ルームへ移動しました', 'ROOM02');
    assert.deepStrictEqual(currentQr.childNodes, []);
    assert.strictEqual(currentButton.getAttribute('aria-expanded'), null);
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

runTest('online DOM effectsは予約席の残り秒数をDOMだけで更新する', () => {
    const attributes = {
        'data-reserved-until': '61500',
        'data-player-name': 'Alice',
    };
    const countdown = {
        textContent: '',
        getAttribute: name => attributes[name] ?? null,
    };
    const panel = { querySelectorAll: () => [countdown] };
    const runtime = OnlineDomEffects.createRuntime({
        getDocument: () => ({ getElementById: id => id === 'onlineWaitingPanel' ? panel : null }),
    });
    assert.strictEqual(runtime.refreshWaitingReservationCountdowns(1500), 1);
    assert.strictEqual(countdown.textContent, 'Alice（再接続待ち・残り60秒）');
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
    assert.strictEqual(OnlineDomEffects.ids.readinessSummary, 'onlineReadinessSummary');
    assert.strictEqual(OnlineDomEffects.ids.gameStatus, 'onlineGameStatus');
    assert.strictEqual(OnlineDomEffects.ids.createButton, 'onlineCreateSubmitButton');
    assert.strictEqual(OnlineDomEffects.ids.roomId, 'roomIdInput');
});
