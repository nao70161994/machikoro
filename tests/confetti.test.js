const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { runTest } = require('./helpers/test-utils');

function loadConfettiRuntime(options = {}) {
    const calls = { setInterval: 0, setTimeout: 0, clearInterval: 0, clearRect: 0 };
    const canvas = {
        style: {},
        width: 0,
        height: 0,
        getContext() {
            return {
                clearRect() { calls.clearRect++; },
                save() {},
                translate() {},
                rotate() {},
                fillRect() {},
                restore() {},
                fillStyle: '',
            };
        },
    };
    const context = {
        console,
        Math,
        window: {
            innerWidth: 320,
            innerHeight: 480,
            matchMedia(query) {
                calls.matchMediaQuery = query;
                return { matches: !!options.reducedMotion };
            },
        },
        document: {
            getElementById(id) {
                return id === 'confettiCanvas' ? canvas : null;
            },
        },
        setInterval() {
            calls.setInterval++;
            return 1;
        },
        clearInterval() { calls.clearInterval++; },
        setTimeout() { calls.setTimeout++; },
    };
    context.globalThis = context;
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'confetti.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'confetti.js' });
    return { context, calls, canvas };
}

runTest('startConfetti は reduced motion 設定時にアニメーションを開始しない', () => {
    const runtime = loadConfettiRuntime({ reducedMotion: true });

    runtime.context.startConfetti();

    assert.strictEqual(runtime.calls.matchMediaQuery, '(prefers-reduced-motion: reduce)');
    assert.strictEqual(runtime.canvas.style.display, 'none');
    assert.strictEqual(runtime.calls.setInterval, 0);
    assert.strictEqual(runtime.calls.setTimeout, 0);
});

runTest('startConfetti は通常設定時だけintervalを開始する', () => {
    const runtime = loadConfettiRuntime({ reducedMotion: false });

    runtime.context.startConfetti();

    assert.strictEqual(runtime.canvas.style.display, 'block');
    assert.strictEqual(runtime.calls.setInterval, 1);
    assert.strictEqual(runtime.calls.setTimeout, 1);
});
