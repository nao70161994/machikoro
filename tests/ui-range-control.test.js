'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const UiRangeControl = require('../js/uiRangeControl');
const { makeElement, runTest } = require('./helpers/test-utils');

runTest('range controlは表示値と読み上げ値を同じformatterから作る', () => {
    assert.deepStrictEqual(
        UiRangeControl.buildValueView('1500', value => `${parseInt(value, 10) / 1000}秒`),
        { textContent: '1.5秒', ariaValueText: '1.5秒' }
    );
});

runTest('range controlはlabelとaria-valuetextを同時に更新する', () => {
    const input = makeElement();
    const label = makeElement();
    const applied = UiRangeControl.applyValueView(input, label, {
        textContent: '超高速',
        ariaValueText: '超高速',
    });

    assert.strictEqual(applied, true);
    assert.strictEqual(label.textContent, '超高速');
    assert.strictEqual(input.getAttribute('aria-valuetext'), '超高速');
});

runTest('CPU速度rangeは初期読み上げ値と44pxのtouch操作領域を持つ', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const localInput = html.match(/<input type="range" id="cpuSpeed"[\s\S]*?>/);
    const onlineInput = html.match(/<input type="range" id="onlineCpuSpeed"[\s\S]*?>/);
    const rangeRule = css.match(/\.speed-setting input\[type="range"\]\s*{([\s\S]*?)}/);

    assert.ok(localInput && localInput[0].includes('aria-valuetext="1.5秒"'));
    assert.ok(onlineInput && onlineInput[0].includes('aria-valuetext="1.5秒"'));
    assert.ok(rangeRule && rangeRule[1].includes('min-height: 44px;'));
});
