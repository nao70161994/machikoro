'use strict';

// Diagnostic only: compare observer traffic and device density. The ordinary
// release/nightly tests and their original frame assertions remain required.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { webkit, devices, expect } = require('@playwright/test');

async function armRoll(page) {
    return page.evaluate(() => {
        window.rollProbeTags = [];
        const viewport = document.getElementById('cardboardTableViewport');
        const observer = new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE || !node.classList.contains('cardboard-activation-tag')) continue;
                if (window.rollProbeTags.length >= 8) continue;
                const rect = node.getBoundingClientRect();
                window.rollProbeTags.push({ at: performance.now(), text: node.textContent,
                    width: rect.width, height: rect.height,
                    visibility: getComputedStyle(node).visibility,
                    route: node.querySelector('.cardboard-activation-route')?.textContent,
                });
            }
        });
        observer.observe(document.getElementById('cardboardBoard'), { childList: true });
        const original = crypto.getRandomValues.bind(crypto);
        let first = true;
        Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value(buffer) {
            if (first) { first = false; buffer[0] = 4; return buffer; }
            return original(buffer);
        } });
        const deadline = performance.now() + 6500;
        const frames = [];
        window.rollProbeSample = new Promise(resolve => {
            function measure(timestamp) {
                const element = document.querySelector('.cardboard-transfer[data-facility="森林"][data-step="3"]');
                const animation = element?.getAnimations()[0];
                if (animation) {
                    const timing = animation.effect.getTiming();
                    const elapsedMs = Number(animation.currentTime) - Number(timing.delay);
                    const frame = { timestamp, at: performance.now(), elapsedMs,
                        opacity: Number(getComputedStyle(element).opacity),
                        currentTime: animation.currentTime, duration: timing.duration, delay: timing.delay };
                    if (frames.length < 180) frames.push(frame);
                    if (elapsedMs >= 180) { observer.disconnect(); resolve({ ...frame, frames }); return; }
                }
                if (performance.now() >= deadline) {
                    observer.disconnect();
                    resolve({ error: 'fourth flight never reached a live frame', frames });
                } else requestAnimationFrame(measure);
            }
            requestAnimationFrame(measure);
        });
        const metadata = { at: Date.now(), timeOrigin: performance.timeOrigin,
            viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio,
            preRollSettled: 'fonts ready plus two RAFs',
            screen: { width: screen.width, height: screen.height },
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
            table: viewport.getBoundingClientRect().toJSON() };
        document.getElementById('btnRoll').click();
        return metadata;
    });
}

async function observe(browser, profile) {
    const { defaultBrowserType: _browserType, ...device } = devices[profile.desktop ? 'Desktop Safari' : 'iPhone 13'];
    const context = await browser.newContext({ ...device,
        deviceScaleFactor: profile.dpr, serviceWorkers: 'block', reducedMotion: 'no-preference' });
    try {
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('http://127.0.0.1:3210', { timeout: 45000 });
        await page.evaluate(() => {
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
            GameRuntimeState.runtime.setCpuPlayers([null, null, null, null]);
            cancelCpuSchedule('observation-probe');
            const game = GameRuntimeState.runtime.snapshot().game;
            game.currentPlayerIndex = 0;
            game.players.forEach(player => { player.cards = [createCardByName('森林')]; player.coins = 30; });
            game.phase = GAME_PHASES.ROLL;
            game.log = [];
            setTutorialEnabled(false);
            render();
            acceptHotseatHandoff();
            document.getElementById('cardboardEventDetails').open = false;
        });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metadata = await armRoll(page);
        // Query assertions are observations here: their failures are preserved
        // as data and do not replace the unchanged release/nightly verdicts.
        let observationError = null;
        if (profile.driverQueries) {
            // Match the regular case's queries during the live chain. Quiet
            // profiles instead wait in one browser evaluation until sampling ends.
            try {
                const tag = page.locator('.cardboard-activation-tag');
                await expect(tag).toBeVisible();
                await expect(tag).toContainText('森林');
                await expect(tag.locator('.cardboard-activation-route')).toContainText('銀行 →');
                await expect(tag.locator('.cardboard-activation-amount')).toHaveCSS('white-space', 'nowrap');
                const flights = page.locator('.cardboard-transfer[data-facility="森林"]');
                await expect(flights).toHaveCount(4);
                await flights.evaluateAll(elements => elements.map(element => element.getAnimations()[0].effect.getTiming()));
                await expect(page.locator('#turnAnnouncer')).toBeHidden();
            } catch (error) { observationError = error.message; }
        }
        const sample = await page.evaluate(() => window.rollProbeSample);
        const result = await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            return { tags: window.rollProbeTags, dice: game.lastDiceResult, phase: game.phase,
                players: game.players.map(player => ({ name: player.name, coins: player.coins })) };
        });
        return { profile, metadata, sample, result, pageErrors, observationError,
            setupValid: metadata.dpr === profile.dpr && result.dice === 5 &&
                result.players.length === 4 && result.players.every(player => player.coins === 31) && pageErrors.length === 0,
            originalFrameCondition: sample.elapsedMs < 500 && sample.opacity > 0.5 };
    } finally { await context.close(); }
}

async function main() {
    const output = process.argv.find(argument => argument.startsWith('--output='))?.slice(9);
    if (!output) throw new Error('--output=FILE is required');
    let server;
    let browser;
    try {
        server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3210' }, stdio: 'inherit' });
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
            try {
                ready = (await fetch('http://127.0.0.1:3210/api/version', { signal: AbortSignal.timeout(1000) })).ok;
            } catch (_) { /* server is still starting */ }
            if (ready) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!ready) throw new Error('Diagnostic server did not start');
        browser = await webkit.launch();
        const results = [];
        for (const profile of [
            { name: 'mobile3-driver', dpr: 3, driverQueries: true },
            { name: 'mobile3-quiet', dpr: 3, driverQueries: false },
            { name: 'mobile1-quiet', dpr: 1, driverQueries: false },
            { name: 'desktop1-quiet', desktop: true, dpr: 1, driverQueries: false },
        ]) {
            try { results.push(await observe(browser, profile)); }
            catch (error) { results.push({ profile, error: error.message }); }
        }
        await fs.mkdir(path.dirname(output), { recursive: true });
        await fs.writeFile(output, JSON.stringify({
            scope: 'Exploratory controlled forest roll, not a replacement for release/nightly or complete UI games. Sequential profiles have order/warmup bias; frame failures are data, not suppressed regression assertions.',
            browser: browser.version(), results,
        }, null, 2));
        // The artifact contains observed conditions including failures. Success
        // means the diagnostic completed, never that every frame was correct.
        console.log(`Observation profiles saved: ${results.length}`);
        if (results.some(result => result.error || !result.setupValid)) process.exitCode = 1;
    } finally {
        try { if (browser) await browser.close(); }
        finally { server?.kill('SIGTERM'); }
    }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
