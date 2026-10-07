const { test, expect } = require('@playwright/test');

for (const width of [390, 1440]) {
    test(`広場${width}pxの選択中は市場を縮め明示探索と建設復帰を保つ`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(() => {
            startGameNow(2, [{ type: 'human', name: '街1' }, { type: 'cpu', difficulty: 'normal', name: '街2' }]);
            const state = GameRuntimeState.runtime.snapshot();
            state.cpuPlayers.fill(null);
            cancelCpuSchedule('plaza-market-priority');
            state.game.currentPlayerIndex = 0;
            state.game.players[0].coins = 30;
            setTutorialEnabled(false);
            render();
            acceptHotseatHandoff();
        });
        const market = page.locator('#buildMenu');
        const marketButton = page.locator('[data-field-target="market"]');
        for (const phase of ['SELECT_DICE', 'REROLL_CONFIRM', 'HARBOR_CHOICE', 'PENDING']) {
            await page.evaluate(key => {
                const game = GameRuntimeState.runtime.snapshot().game;
                game.phase = GAME_PHASES[key];
                render();
                acceptHotseatHandoff();
            }, phase);
            await expect(market).toHaveClass(/plaza-market-secondary/);
            expect(await market.evaluate(element => element.offsetHeight)).toBeLessThanOrEqual(180);
        }
        const cards = await market.locator('.card-btn').count();
        expect(cards).toBeGreaterThan(0);
        await marketButton.click();
        await expect(market).toHaveClass(/plaza-market-exploring/);
        expect(await market.evaluate(element => element.offsetHeight)).toBeGreaterThan(180);
        await market.evaluate(element => { element.scrollTop = 120; });
        expect(await market.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await page.evaluate(() => {
            GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD;
            render();
            acceptHotseatHandoff();
        });
        await expect(market).not.toHaveClass(/plaza-market-secondary/);
        expect(await market.evaluate(element => element.offsetHeight)).toBeGreaterThan(180);
        expect(await market.locator('.card-btn').count()).toBeGreaterThan(0);
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}
