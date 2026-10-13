const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { runTest } = require('./helpers/test-utils');

function loadConfettiRuntime(options = {}) {
    const calls = { setInterval: 0, setTimeout: 0, clearInterval: 0, clearRect: 0, fillRect: 0, alphas: [], observerDisconnect: 0 };
    let appReducedMotion = options.appReducedMotion === true;
    const canvas = {
        style: {},
        width: 0,
        height: 0,
        getContext() {
            if (options.noContext === true) return null;
            return {
                clearRect() { calls.clearRect++; },
                save() {},
                translate() {},
                rotate() {},
                fillRect() { calls.fillRect++; },
                restore() {},
                set globalAlpha(value) { calls.alphas.push(value); },
                fillStyle: '',
            };
        },
    };
    const context = {
        console,
        Math,
        window: {
            innerWidth: options.width || 320,
            innerHeight: options.height || 480,
            devicePixelRatio: options.devicePixelRatio || 1,
            matchMedia(query) {
                calls.matchMediaQuery = query;
                return { matches: !!options.reducedMotion };
            },
        },
        MutationObserver: class {
            constructor(callback) { calls.mutationCallback = callback; }
            observe() { calls.observerObserved = true; }
            disconnect() { calls.observerDisconnect++; }
        },
        document: {
            documentElement: { dataset: { design: options.designTheme || 'classic' } },
            body: {
                classList: {
                    contains(name) {
                        return name === 'accessibility-reduced-motion' && appReducedMotion;
                    },
                },
            },
            getElementById(id) {
                return id === 'confettiCanvas' ? canvas : null;
            },
        },
        setInterval(callback) {
            calls.setInterval++;
            calls.intervalCallback = callback;
            return 1;
        },
        clearInterval() { calls.clearInterval++; },
        setTimeout(callback, delay) {
            calls.setTimeout++;
            calls.timeoutDelay = delay;
            calls.timeoutCallback = callback;
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'confetti.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'confetti.js' });
    return { context, calls, canvas, setAppReducedMotion(value) { appReducedMotion = value; } };
}

runTest('startConfetti は reduced motion 設定時にアニメーションを開始しない', () => {
    const runtime = loadConfettiRuntime({ reducedMotion: true });

    runtime.context.startConfetti();

    assert.strictEqual(runtime.calls.matchMediaQuery, '(prefers-reduced-motion: reduce)');
    assert.strictEqual(runtime.canvas.style.display, 'none');
    assert.strictEqual(runtime.calls.setInterval, 0);
    assert.strictEqual(runtime.calls.setTimeout, 0);
});

runTest('startConfetti はアプリ内の動きを減らす設定でも開始しない', () => {
    const runtime = loadConfettiRuntime({ appReducedMotion: true });

    runtime.context.startConfetti();

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

runTest('紙吹雪の再生中にアプリ内で動きを減らす設定を有効にすると即時停止する', () => {
    const runtime = loadConfettiRuntime();

    runtime.context.startConfetti();
    runtime.setAppReducedMotion(true);
    runtime.calls.mutationCallback();

    assert.strictEqual(runtime.calls.clearInterval, 1);
    assert.strictEqual(runtime.calls.observerObserved, true);
    assert.strictEqual(runtime.calls.observerDisconnect, 1);
    assert.strictEqual(runtime.canvas.style.display, 'none');
});

runTest('canvas contextが使えない環境では勝利画面を壊さず演出を省略する', () => {
    const runtime = loadConfettiRuntime({ noContext: true });

    runtime.context.startConfetti();

    assert.strictEqual(runtime.canvas.style.display, 'none');
    assert.strictEqual(runtime.calls.setInterval, 0);
    assert.strictEqual(runtime.calls.setTimeout, 0);
});

runTest('高解像度画面では紙吹雪canvasのbacking pixel数を抑える', () => {
    const runtime = loadConfettiRuntime({ width: 3840, height: 2160, devicePixelRatio: 2 });

    runtime.context.startConfetti();

    assert.ok(runtime.canvas.width * runtime.canvas.height <= 8_010_000);
    assert.strictEqual(runtime.canvas.style.width, '3840px');
    assert.strictEqual(runtime.canvas.style.height, '2160px');
    runtime.context.stopConfetti();
});

runTest('startConfetti は夕暮れテーマで金・クリーム・テラコッタ系の色を使う', () => {
    const runtime = loadConfettiRuntime({ designTheme: 'sunset' });

    runtime.context.startConfetti();

    const colors = vm.runInContext('Array.from(new Set(confettiPieces.map(piece => piece.color)))', runtime.context);
    assert.ok(colors.length > 0);
    assert.ok(colors.every(color => ['#ffe1a6', '#f5c86e', '#fff1d4', '#d98a6e', '#83a49b'].includes(color)));
});

runTest('紙吹雪は街を見せたまま形に変化をつけて上から一度だけ流れる', () => {
    const runtime = loadConfettiRuntime();

    runtime.context.startConfetti();

    const pieces = vm.runInContext('confettiPieces', runtime.context);
    assert.strictEqual(pieces.length, 42);
    assert.ok(pieces.every(piece => piece.y === piece.launchY && piece.launchY <= 0 && piece.launchY >= -96 &&
        piece.r <= 4.5 && piece.width >= 3 && piece.width <= 6 && piece.height >= 5 && piece.height <= 13 &&
        piece.opacity >= 0.28 && piece.opacity <= 0.4 && piece.gravity > 0));
    pieces[0].y = runtime.canvas.height - 1;
    runtime.calls.intervalCallback();

    assert.ok(pieces[0].y > runtime.canvas.height, '画面下へ抜けた紙吹雪は上から再出現しない');
    assert.ok(runtime.calls.alphas.every(alpha => alpha <= 0.4));
    assert.ok(runtime.calls.fillRect < pieces.length, '画面下に抜けた紙吹雪は描画しない');
    assert.strictEqual(runtime.calls.timeoutDelay, 3600);
});
