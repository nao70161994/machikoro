'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

runTest('room ID入力は既存制約を保ってmobile入力補助を宣言する', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const input = html.match(/<input id="roomIdInput"[\s\S]*?>/);
    assert.ok(input);
    assert.ok(input[0].includes('type="text"'));
    assert.ok(input[0].includes('maxlength="6"'));
    assert.ok(input[0].includes('autocapitalize="characters"'));
    assert.ok(input[0].includes('spellcheck="false"'));
    assert.ok(input[0].includes('autocomplete="off"'));
    assert.ok(input[0].includes('enterkeyhint="join"'));
});
