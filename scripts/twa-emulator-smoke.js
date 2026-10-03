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

async function main() {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const browser = await connectToBrowser();
    try {
        const page = await waitForPage(browser);
        await page.waitForLoadState('domcontentloaded');
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
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'title.png') });

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
        execFileSync('adb', ['shell', 'input', 'keyevent', 'KEYCODE_HOME'], { timeout: 10000 });
        await page.waitForFunction(() => document.hidden, null, { polling: 100, timeout: 15000 });
        execFileSync('adb', ['shell', 'monkey', '-p', 'com.machikoro.game', '1'], { timeout: 15000 });
        await page.waitForFunction(() => !document.hidden, null, { polling: 100, timeout: 15000 });
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
            testBoundary: 'TWA rendering/gameplay in Android Emulator; DAL verification is bypassed only for this ephemeral test APK',
            shell,
            initial,
            buildBaseline,
            built,
            undoRestoredState: true,
            backgroundResumeStatePreserved: true,
            nextHumanTurnReachedAfterResume: true,
            artifacts: ['title.png', 'game.png', 'market.png', 'resumed.png'],
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
