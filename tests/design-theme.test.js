'use strict';
const assert = require('assert');
const DesignTheme = require('../js/designTheme');
const { runTest } = require('./helpers/test-utils');

function createPage(storage, loading = false, extraElements = {}) {
    const listeners = {};
    const attributes = {};
    const elements = {
        designThemeSelect: { value: '' },
        designThemeCurrentLabel: { textContent: '' },
        designThemeStatus: { textContent: '' },
        ...extraElements,
    };
    const document = {
        readyState: loading ? 'loading' : 'complete',
        documentElement: { setAttribute: (key, value) => { attributes[key] = value; } },
        getElementById: id => elements[id] || null,
        addEventListener: (type, listener) => { listeners[type] = listener; },
    };
    const runtime = DesignTheme.initialize(document, () => storage);
    return { runtime, attributes, elements, listeners };
}
function storageWith(value) {
    const values = { savedGame: 'saved-game', onlineSession: 'online-session' };
    if (value != null) values[DesignTheme.STORAGE_KEY] = value;
    return { values, getItem: key => values[key], setItem: (key, value) => { values[key] = value; } };
}

runTest('デザインは従来版が既定で、切替・再起動後も保存ゲームと接続情報を維持する', () => {
    const storage = storageWith();
    const first = createPage(storage);
    assert.strictEqual(first.attributes['data-design'], 'classic');
    assert.strictEqual(first.elements.designThemeCurrentLabel.textContent, 'クラシック');
    first.listeners.change({ target: { id: 'designThemeSelect', value: 'sunset' } });
    assert.strictEqual(first.elements.designThemeCurrentLabel.textContent, '夕暮れの街');
    const second = createPage(storage, true);
    assert.strictEqual(second.attributes['data-design'], 'sunset');
    second.listeners.DOMContentLoaded();
    assert.strictEqual(second.elements.designThemeSelect.value, 'sunset');
    assert.strictEqual(second.elements.designThemeCurrentLabel.textContent, '夕暮れの街');
    second.listeners.change({ target: { id: 'designThemeSelect', value: 'classic' } });
    assert.strictEqual(second.elements.designThemeCurrentLabel.textContent, 'クラシック');
    assert.strictEqual(createPage(storage).runtime.current(), 'classic');
    assert.strictEqual(storage.values.savedGame, 'saved-game');
    assert.strictEqual(storage.values.onlineSession, 'online-session');
});
runTest('盤面モードは端末設定として保存し、ゲーム状態とは独立して切り替えられる', () => {
    const storage = storageWith();
    const page = createPage(storage);
    page.listeners.change({ target: { id: 'designThemeSelect', value: 'plaza' } });
    assert.strictEqual(page.runtime.current(), 'plaza');
    assert.strictEqual(page.elements.designThemeCurrentLabel.textContent, '夕暮れの広場');
    assert.strictEqual(storage.values[DesignTheme.STORAGE_KEY], 'plaza');
    assert.strictEqual(DesignTheme.normalize('plaza'), 'plaza');
    assert.strictEqual(DesignTheme.normalize('unknown'), 'classic');
});
runTest('別端末のデザイン選択と無関係な設定イベントに干渉しない', () => {
    const host = createPage(storageWith('sunset'));
    const guest = createPage(storageWith());
    guest.listeners.change({ target: { id: 'marketRuleSelect', value: 'sunset' } });
    assert.strictEqual(host.runtime.current(), 'sunset');
    assert.strictEqual(guest.runtime.current(), 'classic');
});
runTest('設定破損・ストレージ禁止時も起動と一時切替を可能にする', () => {
    assert.strictEqual(createPage(storageWith('invalid')).runtime.current(), 'classic');
    const page = createPage({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    page.listeners.change({ target: { id: 'designThemeSelect', value: 'sunset' } });
    assert.strictEqual(page.runtime.current(), 'sunset');
    assert.ok(page.elements.designThemeStatus.textContent.includes('今回のみ'));
});

runTest('新版は操作と盤面をガイド・ログより先に置き、従来版では元のDOM順序へ戻す', () => {
    const names = ['status', 'guide', 'actions', 'log', 'players', 'build', 'footer', 'restart'];
    const nodes = Object.fromEntries(names.map(name => [name, { name }]));
    const children = names.map(name => nodes[name]);
    let moves = 0;
    const screen = {
        querySelector: selector => selector === '.game-action-panel' ? nodes.actions : nodes.players,
        insertBefore(element, anchor) {
            moves++;
            children.splice(children.indexOf(element), 1);
            children.splice(children.indexOf(anchor), 0, element);
        },
    };
    for (const node of children) {
        node.parentElement = screen;
        Object.defineProperty(node, 'nextElementSibling', { get: () => children[children.indexOf(node) + 1] });
    }
    const page = createPage(storageWith(), false, {
        gameScreen: screen, tutorialBox: nodes.guide, gameLogContainer: nodes.log, onlineLeaveHelp: nodes.footer,
    });
    assert.deepStrictEqual(children.map(node => node.name), names);
    page.runtime.apply('sunset');
    const expected = ['status', 'actions', 'players', 'build', 'guide', 'log', 'footer', 'restart'];
    assert.deepStrictEqual(children.map(node => node.name), expected);
    const firstMoveCount = moves;
    page.runtime.apply('sunset');
    assert.strictEqual(moves, firstMoveCount);
    assert.deepStrictEqual(children.map(node => node.name), expected);
    page.runtime.apply('classic');
    assert.deepStrictEqual(children.map(node => node.name), names);
    assert.strictEqual(children[3], nodes.log);
});
