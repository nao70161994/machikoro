const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const MATCH_SEED = 0x4d414348;
const requestedPlayerCount = Number(process.env.CARDBOARD_MATCH_PLAYER_COUNT);
const MATCH_PLAYER_COUNT = requestedPlayerCount === 4 ? 4 : 2;
const MATCH_DESIGN = process.env.CARDBOARD_MATCH_DESIGN === 'plaza' ? 'plaza' : 'cardboard';
const MATCH_DESIGN_LABEL = MATCH_DESIGN === 'plaza' ? 'にぎわい広場' : 'カード卓';
const MATCH_VIEWPORT = process.env.CARDBOARD_MATCH_VIEWPORT === 'plaza-landscape'
    ? { width: 844, height: 390, name: 'plaza-landscape' }
    : { width: 1440, height: 900, name: 'desktop' };
const MAX_MATCH_MS = MATCH_PLAYER_COUNT === 4 ? 900000 : 600000;

test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
    try {
        const diagnostics = await page.evaluate(() => {
            const game = typeof GameRuntimeState !== 'undefined'
                ? GameRuntimeState.runtime.snapshot().game : null;
            return {
                seed: window.__matchSeed,
                history: window.__browserMatchHistory || [],
                state: game && typeof GameSnapshot !== 'undefined'
                    ? GameSnapshot.serializeUndoState(game, SHOP_STOCK, 100) : null,
                visibleScreen: [...document.querySelectorAll('#titleScreen, #gameScreen, .winner-screen')]
                    .filter(element => element.getBoundingClientRect().width > 0)
                    .map(element => element.id || element.className),
            };
        });
        await testInfo.attach('seeded-match-failure-state.json', {
            body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json',
        });
    } catch (error) {
        await testInfo.attach('seeded-match-diagnostic-error.txt', {
            body: String(error), contentType: 'text/plain',
        });
    }
});

test(`${MATCH_PLAYER_COUNT}人固定seedの${MATCH_DESIGN_LABEL}CPU対局は完成演出を通って勝者まで進む ${MATCH_VIEWPORT.name}`, async ({ page }, testInfo) => {
    test.setTimeout(MAX_MATCH_MS + 30000);
    await page.setViewportSize({ width: MATCH_VIEWPORT.width, height: MATCH_VIEWPORT.height });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(seed => {
        let state = seed >>> 0;
        Math.random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 0x100000000;
        };
        window.__matchSeed = seed;
        window.__browserMatchHistory = [];
    }, MATCH_SEED);
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(({ playerCount, designName }) => {
        const design = document.getElementById('designThemeSelect');
        design.value = designName;
        design.dispatchEvent(new Event('change', { bubbles: true }));
        GameSetupState.runtime.setCpuSpeed(100);
        document.getElementById('cpuSpeed').value = '100';
        const players = Array.from({ length: playerCount }, (_, index) => ({
            type: 'cpu', difficulty: 'weak', name: `固定CPU${index + 1}`,
        }));
        startGameNow(playerCount, players);
        window.__matchPresentation = { rolls: 0, activations: 0, transfers: 0, landmarkCelebrations: 0, receipts: 0 };
        if (designName === 'plaza') {
            const receipt = document.getElementById('plazaDiceReceipt');
            new MutationObserver(() => {
                const dice = receipt.querySelector('.plaza-receipt-dice');
                const events = document.getElementById('plazaEvents');
                if (dice && events.getClientRects().length && getComputedStyle(events).display !== 'none') {
                    window.__matchPresentation.receipts++;
                }
            }).observe(receipt, { childList: true, subtree: true });
        }
        const board = document.getElementById('cardboardBoard');
        new MutationObserver(records => {
            for (const record of records) {
                if (record.type === 'attributes') {
                    const target = record.target;
                    const oldClass = record.oldValue || '';
                    if (target === board && target.classList.contains('cardboard-new-roll') && !oldClass.includes('cardboard-new-roll')) window.__matchPresentation.rolls++;
                    if (target.classList.contains('cardboard-card-activated') && !oldClass.includes('cardboard-card-activated')) window.__matchPresentation.activations++;
                    if (target.classList.contains('cardboard-landmark-newly-built') && !oldClass.includes('cardboard-landmark-newly-built')) window.__matchPresentation.landmarkCelebrations++;
                }
                if (record.type === 'childList' && [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('cardboard-transfers'))) window.__matchPresentation.transfers++;
                if (record.type === 'childList') {
                    for (const added of record.addedNodes) {
                        if (added.nodeType !== Node.ELEMENT_NODE) continue;
                        const activated = (added.matches('.cardboard-card-activated') ? 1 : 0) + added.querySelectorAll('.cardboard-card-activated').length;
                        window.__matchPresentation.activations += activated;
                    }
                }
            }
        }).observe(board, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
        window.__matchMonitor = setInterval(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            if (designName === 'plaza') {
                const logs = game.log || [];
                const newLogs = logs.slice(window.__matchLogOffset);
                for (const entry of newLogs) {
                    if (entry.type === LOG_TYPES.DICE && entry.diceResolution) window.__matchPresentation.rolls++;
                    if ([LOG_TYPES.GAIN, LOG_TYPES.LOSE].includes(entry.type)) window.__matchPresentation.activations++;
                    if (entry.coinResolution?.transfers?.length) window.__matchPresentation.transfers++;
                    if (entry.type === LOG_TYPES.BUILD && entry.message.startsWith('🏆')) window.__matchPresentation.landmarkCelebrations++;
                }
                window.__matchLogOffset = logs.length;
            }
            const point = {
                at: Date.now(), turns: game.turnCount, phase: game.phase,
                currentPlayerIndex: game.currentPlayerIndex,
                coins: game.players.map(player => player.coins),
                landmarks: game.players.map(player => Object.values(player.landmarks).filter(Boolean).length),
                logLength: game.log.length,
            };
            const history = window.__browserMatchHistory;
            if (!history.length || JSON.stringify(history[history.length - 1]) !== JSON.stringify(point)) history.push(point);
        }, 1000);
    }, { playerCount: MATCH_PLAYER_COUNT, designName: MATCH_DESIGN });
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().cpuPlayers.filter(Boolean).length)).toBe(MATCH_PLAYER_COUNT);

    const deadline = Date.now() + MAX_MATCH_MS;
    let previousTurn = await page.evaluate(() => GameRuntimeState.runtime.snapshot().game.turnCount);
    let lastProgressAt = Date.now();
    while (Date.now() < deadline && !(await page.locator('.winner-screen').isVisible())) {
        await page.waitForTimeout(5000);
        const status = await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            return { turnCount: game.turnCount, phase: game.phase, winner: game.winner || null };
        });
        if (status.turnCount > previousTurn) {
            previousTurn = status.turnCount;
            lastProgressAt = Date.now();
        }
        expect(Date.now() - lastProgressAt, `対局が45秒停止: ${JSON.stringify(status)}`).toBeLessThan(45000);
        expect(pageErrors, 'ブラウザ例外').toEqual([]);
    }

    await expect(page.locator('.winner-screen')).toBeVisible({ timeout: 1000 });
    const result = await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        return {
            seed: window.__matchSeed,
            playerCount: game.players.length,
            design: document.documentElement.dataset.design,
            presentation: window.__matchPresentation,
            winner: game.checkWinner()?.name || null,
            turns: game.turnCount,
            phase: game.phase,
            state: GameSnapshot.serializeUndoState(game, SHOP_STOCK, 100),
            history: window.__browserMatchHistory,
        };
    });
    expect(result.turns).toBeGreaterThan(0);
    expect(result.design).toBe(MATCH_DESIGN);
    expect(result.playerCount).toBe(MATCH_PLAYER_COUNT);
    expect(result.winner).toBeTruthy();
    expect(result.presentation.rolls).toBeGreaterThan(0);
    expect(result.presentation.activations).toBeGreaterThan(0);
    expect(result.presentation.transfers).toBeGreaterThan(0);
    expect(result.presentation.landmarkCelebrations).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
    if (MATCH_DESIGN === 'plaza') expect(result.presentation.receipts).toBeGreaterThan(0);
    await testInfo.attach('seeded-match-result.json', {
        body: JSON.stringify(result, null, 2), contentType: 'application/json',
    });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const winnerScreenshot = await page.screenshot({ animations: 'disabled', fullPage: MATCH_VIEWPORT.height > 500 });
    await testInfo.attach('seeded-match-winner.png', {
        body: winnerScreenshot, contentType: 'image/png',
    });
    if (process.env.CARDBOARD_REVIEW_ARTIFACT_DIR) {
        const artifactDir = path.resolve(process.env.CARDBOARD_REVIEW_ARTIFACT_DIR);
        await fs.mkdir(artifactDir, { recursive: true });
        await fs.writeFile(path.join(artifactDir, `seeded-match-${MATCH_PLAYER_COUNT}p-${MATCH_DESIGN}-${MATCH_VIEWPORT.name}-winner.png`), winnerScreenshot);
        await fs.writeFile(path.join(artifactDir, `seeded-match-${MATCH_PLAYER_COUNT}p-${MATCH_DESIGN}-${MATCH_VIEWPORT.name}-result.json`), JSON.stringify(result, null, 2));
    }
    await page.evaluate(() => clearInterval(window.__matchMonitor));
});
