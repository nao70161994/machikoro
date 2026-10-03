'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');
const { PRODUCTION_HOST } = require('./create-twa-manifest');

const ARTIFACT_DIR = path.resolve(__dirname, '..', 'artifacts', 'twa-emulator');

async function waitForPage(browser, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const context of browser.contexts()) {
            for (const page of context.pages()) {
                try {
                    if (new URL(page.url()).host === PRODUCTION_HOST) return page;
                } catch (_) {
                    // Chrome may still be starting on about:blank.
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`TWA did not open https://${PRODUCTION_HOST}`);
}

async function connectToBrowser(timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            return await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 5000 });
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    throw new Error(`Android Chrome DevTools did not become available: ${lastError && lastError.message}`);
}

async function waitForHumanPhase(page, phase, timeoutMs = 30000) {
    await page.waitForFunction(expected => {
        const game = globalThis.GameRuntimeState?.runtime?.snapshot?.().game;
        const status = document.getElementById('status')?.textContent || '';
        return game && game.phase === expected && !status.includes('CPU');
    }, phase, { timeout: timeoutMs });
}

async function waitForAndroidFocus(expectedPackage, artifactName) {
    const deadline = Date.now() + 15000;
    let dump = '';
    while (Date.now() < deadline) {
        dump = execFileSync('adb', ['shell', 'dumpsys', 'window'], {
            timeout: 10000, encoding: 'utf8',
        });
        const focus = dump.split('\n').find(line => line.includes('mCurrentFocus=')) || '';
        if (focus.includes(`${expectedPackage}/`)) {
            fs.writeFileSync(path.join(ARTIFACT_DIR, artifactName), dump);
            return focus.trim();
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    fs.writeFileSync(path.join(ARTIFACT_DIR, artifactName), dump);
    throw new Error(`Android foreground did not switch to ${expectedPackage}`);
}

async function main() {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const browser = await connectToBrowser();
    try {
        const page = await waitForPage(browser);
        await page.waitForLoadState('domcontentloaded');
        const nativeDisplay = execFileSync('adb', ['shell', 'dumpsys', 'display'], {
            timeout: 10000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
        });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'native-display.txt'), nativeDisplay);
        const nativeCutoutInsets = Array.from(nativeDisplay.matchAll(
            /DisplayCutout\{insets=Rect\((\d+), (\d+) - (\d+), (\d+)\)/g
        ), match => match.slice(1, 5).map(Number)).find(insets => insets.some(value => value > 0)) || null;
        if (process.env.TWA_EMULATOR_CUTOUT === 'tall') {
            assert.ok(nativeCutoutInsets, 'Android did not report the requested nonzero display cutout');
        }
        const shell = await page.evaluate(() => {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
            document.body.appendChild(probe);
            const safeAreaInsets = ['Top', 'Right', 'Bottom', 'Left'].map(side =>
                Number.parseFloat(getComputedStyle(probe)[`padding${side}`]) || 0
            );
            probe.remove();
            return {
                standalone: matchMedia('(display-mode: standalone)').matches,
                fullscreen: matchMedia('(display-mode: fullscreen)').matches,
                viewport: {
                    width: innerWidth,
                    height: innerHeight,
                    screenWidth: screen.width,
                    screenHeight: screen.height,
                },
                documentWidth: document.documentElement.scrollWidth,
                safeAreaSupported: CSS.supports('padding: env(safe-area-inset-top)'),
                safeAreaInsets,
            };
        });
        assert.ok(shell.standalone || shell.fullscreen,
            `Chrome did not launch this page in standalone TWA display mode: ${JSON.stringify(shell)}`);
        assert.ok(shell.viewport.width > 0 && shell.viewport.height > 0);
        assert.ok(shell.documentWidth <= shell.viewport.width,
            `TWA page overflows horizontally: ${JSON.stringify(shell)}`);
        // Deployments may finish between TWA launch and the bootstrap assertions.
        // Resolve an actual client/server mismatch before observing worker state.
        const versionMismatch = await page.evaluate(async () => {
            const response = await fetch('/api/version', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Version fetch failed: ${response.status}`);
            const version = await response.json();
            return version.hash !== window.MACHIKORO_CLIENT_VERSION;
        });
        if (versionMismatch) {
            await page.reload({ waitUntil: 'load' });
        }
        // Exercise the real PWA bootstrap in Android Chrome, without synthetic events.
        await page.waitForFunction(() => typeof window.refreshPwaUpdateState === 'function'
            && typeof window.__machikoroCheckOnlineDelivery === 'function');
        await page.waitForFunction(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return !!registration?.active;
        }, null, { timeout: 60000 });
        const pwaBootstrap = await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            const activeWorker = new URL(registration.active.scriptURL).pathname;
            const response = await fetch('/', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Index fetch failed: ${response.status}`);
            const html = await response.text();
            const policy = response.headers.get('Content-Security-Policy-Report-Only') || '';
            const inlineScripts = [];
            for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
                if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
                const bytes = new TextEncoder().encode(match[2]);
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
                const hash = btoa(String.fromCharCode(...digest));
                inlineScripts.push({
                    bytes: bytes.length,
                    allowed: policy.includes(`'sha256-${hash}'`),
                    pwa: match[2].includes("if ('serviceWorker' in navigator)"),
                });
            }
            return {
                inlineScripts,
                reportOnly: !!policy,
                enforcing: !!response.headers.get('Content-Security-Policy'),
                activeWorker,
                onlineDeliveryAvailable: await window.__machikoroCheckOnlineDelivery(),
            };
        });
        assert.ok(pwaBootstrap.reportOnly && !pwaBootstrap.enforcing,
            'This smoke expects the current Report-Only rollout policy');
        assert.ok(pwaBootstrap.inlineScripts.some(script => script.pwa), 'PWA inline body was not found');
        assert.ok(pwaBootstrap.inlineScripts.every(script => script.allowed),
            'An emitted inline script lacks its exact CSP hash');
        assert.strictEqual(pwaBootstrap.activeWorker, '/sw.js');
        assert.strictEqual(pwaBootstrap.onlineDeliveryAvailable, true);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'title.png') });

        // Use the production lobby controls and close the ephemeral test room.
        await page.locator('#tabOnline').click();
        await page.locator('#playerNameInput').fill('TWA-Smoke');
        let onlineLobby;
        try {
            await page.locator('#onlineCreateSubmitButton').click();
            const roomLabel = page.locator('#onlineWaitingPanel .room-id-display');
            await roomLabel.waitFor({ state: 'visible', timeout: 30000 });
            const roomId = (await roomLabel.textContent()).trim();
            assert.match(roomId, /^[A-Z0-9]{6}$/, 'TWA room creation did not return a valid room ID');
            onlineLobby = await page.evaluate(() => ({
                waitingPanelVisible: document.getElementById('onlineWaitingPanel').getBoundingClientRect().height > 0,
                width: document.documentElement.scrollWidth,
                viewportWidth: innerWidth,
                pwaRefreshAvailable: typeof window.refreshPwaUpdateState === 'function',
                standalone: matchMedia('(display-mode: standalone)').matches,
            }));
            assert.ok(onlineLobby.waitingPanelVisible && onlineLobby.pwaRefreshAvailable);
            assert.ok(onlineLobby.standalone);
            assert.ok(onlineLobby.width <= onlineLobby.viewportWidth, 'TWA online lobby overflows horizontally');
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'online-lobby.png') });
        } finally {
            const leave = page.locator('[data-ui-action="leaveOnlineLobby"]');
            if (await leave.isVisible()) {
                await leave.click();
                const confirm = page.locator('#confirmModal');
                if (await confirm.isVisible()) await page.locator('#confirmOkBtn').click();
                await leave.waitFor({ state: 'hidden' });
            }
        }
        await page.locator('#tabLocal').click();
        await page.locator('.setup-quick-play').click();
        await page.locator('#gameScreen').waitFor({ state: 'visible' });
        const initial = await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot();
            return {
                phase: state.game.phase,
                coins: state.game.players[0].coins,
                cards: state.game.players[0].cards.length,
                width: document.documentElement.scrollWidth,
                viewportWidth: innerWidth,
            };
        });
        assert.ok(initial.width <= initial.viewportWidth,
            `active game overflows the TWA viewport: ${JSON.stringify(initial)}`);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'game.png') });

        await waitForHumanPhase(page, 'roll');
        await page.locator('#btnRoll').click();
        await waitForHumanPhase(page, 'build');
        const buildBaseline = await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            const humanPlayerIndex = game.players.findIndex(player =>
                !String(player.name || '').includes('CPU')
            );
            if (humanPlayerIndex < 0) throw new Error('TWA quick-play did not create a human player');
            const player = game.players[humanPlayerIndex];
            return {
                humanPlayerIndex,
                coins: player.coins,
                cards: player.cards.length,
            };
        });
        const affordableCards = page.locator('#buildMenu button.card-btn[data-action="buildCard"]:not(:disabled)');
        const selectedCardIndex = await affordableCards.evaluateAll(buttons => {
            const costs = buttons.map(button => Number(
                button.querySelector('.card-cost')?.textContent?.replace(/[^0-9]/g, '') || 0
            ));
            const paidIndex = costs.findIndex(cost => cost > 0);
            return paidIndex >= 0 ? paidIndex : (buttons.length > 0 ? 0 : -1);
        });
        assert.ok(selectedCardIndex >= 0, 'there is no affordable market card');
        const marketCard = affordableCards.nth(selectedCardIndex);
        await marketCard.waitFor({ state: 'visible' });
        const cardBounds = await marketCard.boundingBox();
        assert.ok(cardBounds && cardBounds.width > 0 && cardBounds.height > 0,
            'the first affordable market card has no visible hit target');
        const selectedCard = await marketCard.evaluate(button => ({
            name: button.dataset.cardName,
            cost: Number(button.querySelector('.card-cost')?.textContent?.replace(/[^0-9]/g, '') || 0),
        }));
        await marketCard.click();
        const undo = page.locator('#buildMenu .undo-btn');
        await undo.waitFor({ state: 'visible' });
        await page.waitForFunction(({ playerIndex, cardCount }) => {
            const game = GameRuntimeState.runtime.snapshot().game;
            return game.players[playerIndex].cards.length === cardCount;
        }, {
            playerIndex: buildBaseline.humanPlayerIndex,
            cardCount: buildBaseline.cards + 1,
        });
        const built = await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot();
            const humanPlayerIndex = state.game.players.findIndex(player =>
                !String(player.name || '').includes('CPU')
            );
            const player = state.game.players[humanPlayerIndex];
            return { coins: player.coins, cards: player.cards.length };
        });
        assert.strictEqual(built.cards, buildBaseline.cards + 1,
            `market card ${selectedCard.name} tap did not build a facility`);
        if (selectedCard.cost > 0) {
            assert.strictEqual(built.coins, buildBaseline.coins - selectedCard.cost,
                'market build did not spend the displayed card cost');
        } else {
            assert.strictEqual(built.coins, buildBaseline.coins,
                'zero-cost market build unexpectedly changed the coin balance');
        }
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'market.png') });

        await undo.click();
        await page.locator('#confirmModal').waitFor({ state: 'visible' });
        await page.locator('#confirmOkBtn').click();
        await page.locator('#confirmModal').waitFor({ state: 'hidden' });
        await page.waitForFunction(expected => {
            const game = GameRuntimeState.runtime.snapshot().game;
            const player = game.players[expected.humanPlayerIndex];
            return player.cards.length === expected.cards && player.coins === expected.coins;
        }, {
            humanPlayerIndex: buildBaseline.humanPlayerIndex,
            cards: buildBaseline.cards,
            coins: buildBaseline.coins,
        });
        const resumeBaseline = await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            return {
                phase: game.phase,
                currentPlayerIndex: game.currentPlayerIndex,
                lastDiceResult: game.lastDiceResult,
                players: game.players.map(player => ({
                    coins: player.coins,
                    cards: player.cards.map(card => card.name),
                })),
            };
        });
        const homeComponent = execFileSync('adb', ['shell', 'cmd', 'package', 'resolve-activity',
            '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME'],
        { timeout: 10000, encoding: 'utf8' }).trim().split('\n').pop();
        assert.ok(homeComponent && homeComponent.includes('/'), 'Android Home activity was not resolved');
        execFileSync('adb', ['shell', 'input', 'keyevent', 'KEYCODE_HOME'], { timeout: 10000 });
        // CDP-attached Android Chrome can keep document.visibilityState visible on Home.
        // Native window focus proves the actual OS background transition instead.
        const backgroundFocus = await waitForAndroidFocus(homeComponent.split('/')[0], 'background-window.txt');
        const backgroundImage = fs.openSync(path.join(ARTIFACT_DIR, 'background-screen.png'), 'w');
        try {
            execFileSync('adb', ['exec-out', 'screencap', '-p'], {
                timeout: 10000, stdio: ['ignore', backgroundImage, 'pipe'],
            });
        } finally {
            fs.closeSync(backgroundImage);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        execFileSync('adb', ['shell', 'monkey', '-p', 'com.machikoro.game', '1'], { timeout: 15000 });
        const resumedFocus = await waitForAndroidFocus('com.android.chrome', 'resumed-window.txt');
        const resumed = await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            return {
                phase: game.phase,
                currentPlayerIndex: game.currentPlayerIndex,
                lastDiceResult: game.lastDiceResult,
                players: game.players.map(player => ({
                    coins: player.coins,
                    cards: player.cards.map(card => card.name),
                })),
            };
        });
        assert.deepStrictEqual(resumed, resumeBaseline,
            'Android background/resume changed the human build-turn state');
        assert.ok(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches
            || matchMedia('(display-mode: fullscreen)').matches), 'TWA display mode was lost after resume');
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'resumed.png') });
        // Finish the human turn through the real control after returning from Android Home.
        await page.locator('#btnSkip').click();
        await page.locator('#confirmModal').waitFor({ state: 'visible' });
        await page.locator('#confirmOkBtn').click();
        await page.locator('#confirmModal').waitFor({ state: 'hidden' });
        await waitForHumanPhase(page, 'roll');
        const result = {
            status: 'passed',
            testBoundary: process.env.TWA_SIGNED_APK_RUN_ID
                ? 'Production-signed TWA rendering/gameplay in Android Emulator; DAL verification is enabled'
                : 'TWA rendering/gameplay in Android Emulator; DAL verification is bypassed only for this ephemeral test APK',
            signedApkRunId: process.env.TWA_SIGNED_APK_RUN_ID || null,
            dalVerificationBypassed: !process.env.TWA_SIGNED_APK_RUN_ID,
            shell,
            pwaBootstrap,
            onlineLobby,
            cutoutMode: process.env.TWA_EMULATOR_CUTOUT || 'none',
            nativeCutoutInsets,
            initial,
            buildBaseline,
            built,
            undoRestoredState: true,
            backgroundResumeStatePreserved: true,
            backgroundFocus,
            resumedFocus,
            backgroundResumeBoundary: 'Android Home and back with CDP attached; no process eviction or visibility-event guarantee',
            nextHumanTurnReachedAfterResume: true,
            artifacts: ['title.png', 'online-lobby.png', 'game.png', 'market.png', 'resumed.png',
                'background-screen.png', 'background-window.txt', 'resumed-window.txt', 'native-display.txt'],
        };
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
});
