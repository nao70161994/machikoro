const { test, expect } = require('@playwright/test');

const MATCH_SEED = 0x4d414348;
const MAX_MATCH_MS = 300000;

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

test('固定seedの実ブラウザCPU対局は開始から勝者決定まで停止せず進む', async ({ page }, testInfo) => {
    test.setTimeout(MAX_MATCH_MS + 30000);
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
    await page.evaluate(() => {
        GameSetupState.runtime.setCpuSpeed(100);
        document.getElementById('cpuSpeed').value = '100';
        startGameNow(2, [
            { type: 'cpu', difficulty: 'weak', name: '固定CPU1' },
            { type: 'cpu', difficulty: 'weak', name: '固定CPU2' },
        ]);
        window.__matchMonitor = setInterval(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
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
    });
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().cpuPlayers.filter(Boolean).length)).toBe(2);

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
            winner: game.checkWinner()?.name || null,
            turns: game.turnCount,
            phase: game.phase,
            state: GameSnapshot.serializeUndoState(game, SHOP_STOCK, 100),
            history: window.__browserMatchHistory,
        };
    });
    expect(result.turns).toBeGreaterThan(0);
    expect(result.winner).toBeTruthy();
    expect(pageErrors).toEqual([]);
    await testInfo.attach('seeded-match-result.json', {
        body: JSON.stringify(result, null, 2), contentType: 'application/json',
    });
    await testInfo.attach('seeded-match-winner.png', {
        body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
    });
    await page.evaluate(() => clearInterval(window.__matchMonitor));
});
