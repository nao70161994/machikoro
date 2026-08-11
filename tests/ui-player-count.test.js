'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const UiPlayerCount = require('../js/uiPlayerCount');
const { makeElement, runTest } = require('./helpers/test-utils');

runTest('player countは人数と単位を一体の表示にする', () => {
    assert.deepStrictEqual(UiPlayerCount.buildView(4), { textContent: '4人' });
});

runTest('player countは値が変わった時だけlive outputを書き換える', () => {
    const output = makeElement({ textContent: '2人' });
    assert.strictEqual(UiPlayerCount.applyView(output, UiPlayerCount.buildView(2)), false);
    assert.strictEqual(UiPlayerCount.applyView(output, UiPlayerCount.buildView(3)), true);
    assert.strictEqual(output.textContent, '3人');
    assert.strictEqual(UiPlayerCount.applyView(output, UiPlayerCount.buildView(3)), false);
});

runTest('local/online人数は操作ボタンに関連付いたpolite atomic outputである', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const id of ['playerCount', 'onlinePlayerCount']) {
        const output = html.match(new RegExp(`<output id="${id}"[^>]*>2人</output>`));
        assert.ok(output);
        assert.ok(output[0].includes('role="status"'));
        assert.ok(output[0].includes('aria-live="polite"'));
        assert.ok(output[0].includes('aria-atomic="true"'));
        assert.strictEqual((html.match(new RegExp(`aria-controls="${id}"`, 'g')) || []).length, 2);
    }
});
