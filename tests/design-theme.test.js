'use strict';
const assert = require('assert');
const DesignTheme = require('../js/designTheme');
const { runTest } = require('./helpers/test-utils');

function createPage(storage, loading = false) {
    const listeners = {};
    const attributes = {};
    const elements = { designThemeSelect: { value: '' }, designThemeStatus: { textContent: '' } };
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
    first.listeners.change({ target: { id: 'designThemeSelect', value: 'sunset' } });
    const second = createPage(storage, true);
    assert.strictEqual(second.attributes['data-design'], 'sunset');
    second.listeners.DOMContentLoaded();
    assert.strictEqual(second.elements.designThemeSelect.value, 'sunset');
    second.listeners.change({ target: { id: 'designThemeSelect', value: 'classic' } });
    assert.strictEqual(createPage(storage).runtime.current(), 'classic');
    assert.strictEqual(storage.values.savedGame, 'saved-game');
    assert.strictEqual(storage.values.onlineSession, 'online-session');
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
