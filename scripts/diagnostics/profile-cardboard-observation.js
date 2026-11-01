'use strict';

// Diagnostic only: compare observer traffic and device density. The ordinary
// release/nightly tests and their original frame assertions remain required.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { webkit, devices, expect } = require('@playwright/test');

async function sampleIdleFrames(page, phase) {
    return page.evaluate(({ phase, requestedMs }) => new Promise(resolve => {
        const startedAt = performance.now();
        const startedDateMs = Date.now();
        const frames = [];
        let frameId;
        const measure = timestamp => {
            frames.push({ timestamp, at: performance.now(), dateMs: Date.now() });
            frameId = requestAnimationFrame(measure);
        };
        frameId = requestAnimationFrame(measure);
        setTimeout(() => {
            cancelAnimationFrame(frameId);
            const endedAt = performance.now();
            const gaps = frames.slice(1).map((frame, index) => frame.timestamp - frames[index].timestamp);
            const observationTimes = [startedAt, ...frames.map(frame => frame.at), endedAt];
            const observationGaps = observationTimes.slice(1).map((at, index) => at - observationTimes[index]);
            resolve({ phase, requestedMs, startedAt, endedAt, startedDateMs, endedDateMs: Date.now(),
                timeOrigin: performance.timeOrigin, actualElapsedMs: endedAt - startedAt,
                timerDelayMs: endedAt - startedAt - requestedMs,
                frameCount: frames.length, maxRafGapMs: gaps.length ? Math.max(...gaps) : null,
                maxObservationGapMs: Math.max(...observationGaps), frames,
                url: location.href, dpr: devicePixelRatio,
                viewport: { width: innerWidth, height: innerHeight },
                visibility: document.visibilityState });
        }, requestedMs);
    }), { phase, requestedMs: 1200 });
}

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

async function observe(browser, profile, idleBaseline) {
    const { defaultBrowserType: _browserType, ...device } = devices[profile.desktop ? 'Desktop Safari' : 'iPhone 13'];
    const context = await browser.newContext({ ...device,
        deviceScaleFactor: profile.dpr, serviceWorkers: 'block', reducedMotion: 'no-preference' });
    try {
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.setViewportSize({ width: 844, height: 390 });
        if (idleBaseline) {
            await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>');
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
        const baselines = idleBaseline ? { blank: await sampleIdleFrames(page, 'about:blank') } : null;
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('http://127.0.0.1:3210', { timeout: 45000 });
        if (profile.compositorHint) {
            await page.addStyleTag({ content: '@media (prefers-reduced-motion: no-preference) { body:not(.accessibility-reduced-motion) .cardboard-transfer:not(.cardboard-transfer-static), body:not(.accessibility-reduced-motion) .cardboard-card-activated { will-change: transform, opacity; } }' });
        }
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
        if (idleBaseline) baselines.board = await sampleIdleFrames(page, 'prepared-board');
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
        return { profile, metadata, baselines, sample, result, pageErrors, observationError,
            setupValid: metadata.dpr === profile.dpr && metadata.viewport.width === 844 && metadata.viewport.height === 390 &&
                (!idleBaseline || [baselines.blank, baselines.board].every(baseline => baseline.dpr === profile.dpr &&
                    baseline.viewport.width === 844 && baseline.viewport.height === 390)) && result.dice === 5 &&
                result.players.length === 4 && result.players.every(player => player.coins === 31) && pageErrors.length === 0,
            originalFrameCondition: sample.elapsedMs < 500 && sample.opacity > 0.5 };
    } finally { await context.close(); }
}

async function main() {
    const output = process.argv.find(argument => argument.startsWith('--output='))?.slice(9);
    if (!output) throw new Error('--output=FILE is required');
    const order = process.argv.find(argument => argument.startsWith('--order='))?.slice(8) || 'forward';
    if (!['forward', 'reverse'].includes(order)) throw new Error('--order must be forward or reverse');
    const idleBaselineOption = process.argv.find(argument => argument.startsWith('--idle-baseline='))?.slice(16) || 'false';
    if (!['true', 'false'].includes(idleBaselineOption)) throw new Error('--idle-baseline must be true or false');
    const compositorHintOption = process.argv.find(argument => argument.startsWith('--compositor-hint-comparison='))?.split('=')[1] || 'false';
    if (!['true', 'false'].includes(compositorHintOption)) throw new Error('--compositor-hint-comparison must be true or false');
    const compositorHintComparison = compositorHintOption === 'true';
    const idleBaseline = idleBaselineOption === 'true' || compositorHintComparison;
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
        const profiles = [
            { name: 'mobile3-driver', dpr: 3, driverQueries: true },
            { name: 'mobile3-quiet', dpr: 3, driverQueries: false },
            { name: 'mobile1-quiet', dpr: 1, driverQueries: false },
            { name: 'desktop1-quiet', desktop: true, dpr: 1, driverQueries: false },
        ];
        if (order === 'reverse') profiles.reverse();
        const comparisonProfiles = [false, true, true, false].map((compositorHint, index) => ({
            name: `mobile3-quiet-${index + 1}-${compositorHint ? 'hint' : 'nohint'}`,
            dpr: 3, driverQueries: false, compositorHint, comparisonIndex: index,
        }));
        for (const profile of compositorHintComparison ? comparisonProfiles : profiles) {
            try { results.push(await observe(browser, profile, idleBaseline)); }
            catch (error) { results.push({ profile, error: error.message }); }
        }
        await fs.mkdir(path.dirname(output), { recursive: true });
        await fs.writeFile(output, JSON.stringify({
            scope: 'Exploratory controlled forest roll, not a replacement for release/nightly or complete UI games. Sequential profiles have order/warmup bias; frame failures are data, not suppressed regression assertions.',
            baselineScope: 'Optional 1200ms requested blank and prepared-board RAF windows. Timers may run late; actual elapsed and gaps are recorded. Baseline sampling may warm up the browser and confound comparisons with runs without baselines; blank/idle/active comparisons do not establish causality.',
            comparisonScope: 'Opt-in mobile3 quiet ABBA (nohint, hint, hint, nohint), each in a fresh context with baseline sampling. Injected will-change is diagnostic only. Sequential order, browser reuse and warmup remain confounds; this small comparison does not establish causality or a product fix.',
            browser: browser.version(), order: compositorHintComparison ? 'ABBA' : order,
            idleBaseline, compositorHintComparison, results,
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
