'use strict';

// Optional controlled A/B review only. This does not replace the browser suite
// or a naturally played game. Load the prior layout source, not copied rules.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { webkit, devices, expect } = require('@playwright/test');

function observeLayout(source) {
    assert.ok(source.includes('function layout() {'));
    assert.ok(source.includes('            onLayout();'));
    return source.replace('function layout() {', 'function layout() {\n            const reviewStarted = performance.now();')
        .replace('            onLayout();', '            onLayout();\n            (window.__railReviewTimings ||= []).push(performance.now() - reviewStarted);');
}

async function review(browser, source, variant, viewport, stage, output, focused) {
    const device = devices[viewport.width === 844 ? 'iPhone 13' : 'Desktop Safari'];
    const context = await browser.newContext({ viewport, deviceScaleFactor: device.deviceScaleFactor,
        isMobile: device.isMobile, hasTouch: device.hasTouch, userAgent: device.userAgent,
        serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.route('**/js/cardTableLayout.js*', route => route.fulfill({ contentType: 'application/javascript', body: source }));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ body: '' }));
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
        await page.goto('http://127.0.0.1:3210/');
        const before = await page.evaluate(stage => {
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
            GameRuntimeState.runtime.setCpuPlayers(Array(4).fill(null));
            cancelCpuSchedule('landmark-rail-review');
            const game = GameRuntimeState.runtime.snapshot().game;
            game.currentPlayerIndex = 0;
            const enabled = getEnabledCardSelection();
            const names = ['麦畑', 'パン屋', ...CARDS.filter(card => enabled.has(card.name) && !['麦畑', 'パン屋'].includes(card.name)).map(card => card.name)].slice(0, stage.cards);
            const landmarks = Player.landmarkNames().filter(name => getEnabledLandmarkSelection().has(name)).slice(0, stage.landmarks);
            game.players.forEach((player, index) => {
                player.name = `街${index + 1}`;
                player.coins = 30;
                player.cards = names.map(name => createCardByName(name));
                for (const name of landmarks) player.landmarks[name] = true;
                for (const name of names) if (!['麦畑', 'パン屋'].includes(name)) SHOP_STOCK[name]--;
            });
            game.log = [];
            game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
            game.phase = GAME_PHASES.BUILD;
            setTutorialEnabled(false);
            render();
            acceptHotseatHandoff();
            dismissTurnGreeting();
            return JSON.stringify(GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
        }, stage);
        await page.evaluate(async () => {
            await document.fonts.ready;
            let previous = '', stable = 0;
            for (let frame = 0; frame < 90; frame++) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                const world = document.getElementById('cardboardSeats');
                const viewport = document.getElementById('cardboardTableViewport');
                const key = JSON.stringify([world.dataset.tableLayoutKey, viewport.dataset.tableScale, viewport.clientWidth, viewport.clientHeight]);
                stable = key === previous ? stable + 1 : 0;
                previous = key;
                if (stable >= 4 && world.dataset.tableLayoutKey) return;
            }
            throw new Error('Table geometry did not settle');
        });
        const sample = await page.evaluate(() => {
            const viewport = document.getElementById('cardboardTableViewport');
            const world = document.getElementById('cardboardSeats');
            const bounds = viewport.getBoundingClientRect();
            const clip = { left: bounds.left + viewport.clientLeft, top: bounds.top + viewport.clientTop };
            clip.right = clip.left + viewport.clientWidth;
            clip.bottom = clip.top + viewport.clientHeight;
            const matrix = new DOMMatrix(getComputedStyle(world).transform);
            const scale = Math.hypot(matrix.a, matrix.b);
            const contained = (rect, outer) => rect.left >= outer.left - 2 && rect.right <= outer.right + 2 &&
                rect.top >= outer.top - 2 && rect.bottom <= outer.bottom + 2;
            const nodes = [...world.querySelectorAll(':scope > .cardboard-player, :scope > #cardboardCenter')];
            const failures = [];
            const groups = nodes.map(node => ({ id: node.id || node.dataset.playerIndex, rect: node.getBoundingClientRect().toJSON() }));
            for (const group of groups) if (!contained(group.rect, clip)) failures.push(`group ${group.id} outside viewport`);
            for (const panel of world.querySelectorAll(':scope > .cardboard-player')) {
                const rect = panel.getBoundingClientRect();
                for (const card of panel.querySelectorAll('.cardboard-card, .cardboard-landmark-built')) {
                    if (!contained(card.getBoundingClientRect(), rect) || !contained(card.getBoundingClientRect(), clip)) failures.push('owned card clipped');
                }
            }
            for (let index = 0; index < groups.length; index++) for (const other of groups.slice(index + 1)) {
                const rect = groups[index].rect;
                if (Math.min(rect.right, other.rect.right) - Math.max(rect.left, other.rect.left) > 2 &&
                    Math.min(rect.bottom, other.rect.bottom) - Math.max(rect.top, other.rect.top) > 2) failures.push('table groups overlap');
            }
            const first = world.querySelector('.cardboard-card');
            return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, clip },
                world: { width: world.offsetWidth, height: world.offsetHeight, packing: world.dataset.tablePacking },
                scale, cardEdgePx: first.offsetWidth * scale, groups, failures,
                owners: [...world.querySelectorAll(':scope > .cardboard-player')].map(panel => ({
                    index: panel.dataset.playerIndex, angle: panel.dataset.tableAngle,
                    rail: panel.dataset.tableLandmarkRail === 'true',
                    cards: panel.querySelectorAll('.cardboard-card').length,
                    landmarks: panel.querySelectorAll('.cardboard-landmark-built').length,
                })), layoutTimingsMs: window.__railReviewTimings || [],
                state: JSON.stringify(GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER)) };
        });
        const screenshot = `${variant}-${stage.name}-${viewport.width}.png`;
        await page.screenshot({ path: path.join(output, screenshot), animations: 'disabled', scale: 'css' });
        await fs.writeFile(path.join(output, screenshot.replace('.png', '.json')), JSON.stringify({ variant, stage, pageErrors, ...sample }, null, 2) + '\n');
        let interaction = null;
        if (focused) {
            const world = page.locator('#cardboardSeats');
            const viewportNode = page.locator('#cardboardTableViewport');
            const original = { scale: await viewportNode.getAttribute('data-table-scale'),
                angle: await viewportNode.getAttribute('data-table-angle'),
                layout: await world.getAttribute('data-table-layout-key') };
            const steadyRefreshes = await page.evaluate(async () => {
                const samples = [];
                for (let cycle = 0; cycle < 3; cycle++) {
                    const start = window.__railReviewTimings.length;
                    window.dispatchEvent(new Event('resize'));
                    for (let frame = 0; frame < 4; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
                    samples.push(window.__railReviewTimings.slice(start));
                }
                return samples;
            });
            await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
            await expect(viewportNode).toHaveAttribute('data-table-focus-player', '1');
            await page.locator('[data-cardboard-camera="back"]').click();
            await expect(viewportNode).toHaveAttribute('data-table-scale', original.scale);
            await expect(viewportNode).toHaveAttribute('data-table-angle', original.angle);
            await expect(world).toHaveAttribute('data-table-layout-key', original.layout);
            await page.locator('[data-cardboard-camera="market"]').click();
            await page.locator('#cardboardMarket .compact-market-expand').click();
            await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
            await page.locator('#cardboardMarketClose').click();
            await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
            await page.locator('[data-cardboard-camera="back"]').click();
            await expect(viewportNode).toHaveAttribute('data-table-scale', original.scale);
            await expect(viewportNode).toHaveAttribute('data-table-angle', original.angle);
            await expect(world).toHaveAttribute('data-table-layout-key', original.layout);
            const afterInteraction = await page.evaluate(() => JSON.stringify(GameSnapshot.serializeUndoState(
                GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER)));
            assert.equal(afterInteraction, before);
            interaction = { steadyRefreshes, cameraRestored: true, stateUnchanged: true };
            await page.screenshot({ path: path.join(output, `${variant}-after-interactions.png`), animations: 'disabled', scale: 'css' });
        }
        assert.equal(sample.state, before, 'Layout must not change canonical game state');
        assert.equal(sample.owners.length, 4);
        assert.equal(sample.groups.length, 5);
        assert.deepEqual(sample.failures, []);
        assert.deepEqual(pageErrors, []);
        for (const owner of sample.owners) {
            assert.equal(owner.cards, stage.cards);
            assert.equal(owner.landmarks, stage.landmarks);
        }
        return { variant, stage, screenshot, pageErrors, interaction, ...sample };
    } finally { await context.close(); }
}

async function main() {
    const output = process.argv.find(value => value.startsWith('--output='))?.slice(9);
    if (!output) throw new Error('--output=DIR is required');
    const scene = process.argv.find(value => value.startsWith('--scene='))?.slice(8) || 'all';
    if (!['all', 'middle-844'].includes(scene)) throw new Error('Invalid layout review scene');
    const baselineRef = '98addf35b4b123fa33e907700f5f2d0271bef95b';
    const sources = { before: observeLayout(execFileSync('git', ['show', `${baselineRef}:js/cardTableLayout.js`], { encoding: 'utf8' })),
        after: observeLayout(await fs.readFile('js/cardTableLayout.js', 'utf8')) };
    await fs.mkdir(output, { recursive: true });
    const results = [];
    let server, browser;
    try {
        server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3210' }, stdio: 'inherit' });
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
            try { ready = (await fetch('http://127.0.0.1:3210/api/version', { signal: AbortSignal.timeout(1000) })).ok; } catch (_) { /* startup */ }
            if (ready) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!ready) throw new Error('Review server did not start');
        browser = await webkit.launch();
        for (const viewport of [{ width: 844, height: 390 }, { width: 1440, height: 936 }]) {
            for (const stage of [{ name: 'early', cards: 2, landmarks: 0 }, { name: 'middle', cards: 5, landmarks: 2 }, { name: 'late', cards: 18, landmarks: 5 }]) {
                if (scene === 'middle-844' && (viewport.width !== 844 || stage.name !== 'middle')) continue;
                for (const variant of ['before', 'after']) results.push(await review(browser, sources[variant], variant, viewport, stage, output, scene === 'middle-844'));
            }
        }
    } finally {
        await browser?.close();
        server?.kill('SIGTERM');
        await fs.writeFile(path.join(output, 'comparison.json'), JSON.stringify({ baselineRef,
            scope: 'Controlled static fixtures with reduced motion; one browser context at a time. Layout timing is exploratory, not a frame-rate benchmark or real-game playthrough.', results }, null, 2) + '\n');
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
