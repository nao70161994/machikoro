const assert = require('assert');
const CitySkyline = require('../js/citySkyline');
const { runTest } = require('./helpers/test-utils');

function createCanvas() {
    const calls = [];
    const gradient = { addColorStop(offset, color) { calls.push(['addColorStop', offset, color]); } };
    const context = {
        clearRect(...args) { calls.push(['clearRect', ...args]); },
        createLinearGradient(...args) { calls.push(['createLinearGradient', ...args]); return gradient; },
        createRadialGradient(...args) { calls.push(['createRadialGradient', ...args]); return gradient; },
        fillRect(...args) { calls.push(['fillRect', ...args]); },
        beginPath() { calls.push(['beginPath']); },
        arc(...args) { calls.push(['arc', ...args]); },
        fill() { calls.push(['fill']); },
        ellipse(...args) { calls.push(['ellipse', ...args]); },
        strokeRect(...args) { calls.push(['strokeRect', ...args]); },
        moveTo(...args) { calls.push(['moveTo', ...args]); },
        lineTo(...args) { calls.push(['lineTo', ...args]); },
        stroke() { calls.push(['stroke']); },
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
    };
    return {
        canvas: {
            width: 0,
            height: 0,
            style: {},
            getContext(kind) { calls.push(['getContext', kind]); return context; },
        },
        calls,
    };
}

runTest('city skylineはviewportを480pxで制限して既存canvas寸法を設定する', () => {
    const { canvas, calls } = createCanvas();
    let randomCalls = 0;
    CitySkyline.draw(canvas, 720, () => { randomCalls++; return 0; });

    assert.strictEqual(canvas.width, 480);
    assert.strictEqual(canvas.height, 220);
    assert.strictEqual(canvas.style.width, '100%');
    assert.strictEqual(canvas.style.height, '220px');
    assert.deepStrictEqual(calls[0], ['getContext', '2d']);
    assert.ok(calls.some(call => call[0] === 'clearRect' && call[3] === 480 && call[4] === 220));
    assert.ok(calls.some(call => call[0] === 'arc'));
    assert.ok(calls.some(call => call[0] === 'fillRect'));
    assert.ok(randomCalls > 160);
});

runTest('city skylineは小さいviewportと注入乱数をそのまま描画へ使う', () => {
    const { canvas, calls } = createCanvas();
    const sequence = [0.9, 0.5, 0.25, 0.75];
    let index = 0;
    CitySkyline.draw(canvas, 320, () => sequence[index++ % sequence.length]);

    assert.strictEqual(canvas.width, 320);
    assert.ok(calls.some(call => call[0] === 'clearRect' && call[3] === 320));
    assert.ok(calls.some(call => call[0] === 'stroke'));
    assert.strictEqual(Object.isFrozen(CitySkyline), true);
});
