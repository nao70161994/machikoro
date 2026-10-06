const { test, expect } = require('@playwright/test');

for (const design of ['sunset', 'plaza']) {
    test(`街の同種施設は絵一枚ずつと省略枚数で正確に表示する ${design}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.locator('#tabTournament').click();
        await page.locator('#designSwitcher > summary').click();
        await page.locator('#designThemeSelect').selectOption(design);
        await page.locator('#designSwitcher > summary').click();
        await page.locator('#tabLocal').click();
        await page.locator('#customGameSetup > summary').click();
        const increase = page.locator('[data-ui-action="changeCount"][data-delta="1"]');
        await increase.click();
        await increase.click();
        await page.locator('#btnStart').click();
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
            cancelCpuSchedule('town-display-fixture');
            state.game.phase = GAME_PHASES.BUILD;
        });
        for (const total of [1, 2, 6, 7, 1000]) {
            const unchanged = await page.evaluate(total => {
                const game = GameRuntimeState.runtime.snapshot().game;
                game.currentPlayer().cards = Array.from({ length: total }, () => createCardByName('森林'));
                const snapshot = () => JSON.stringify(game.players.map(player => ({
                    coins: player.coins, cards: player.cards,
                })));
                const before = snapshot();
                render();
                acceptHotseatHandoff();
                return snapshot() === before;
            }, total);
            expect(unchanged).toBe(true);
            const town = page.locator('.player-box-self .town-street');
            const lots = town.locator('[data-town-building="card:森林"]');
            const shown = Math.min(total, 6);
            await expect(lots).toHaveCount(shown);
            for (let index = 0; index < shown; index++) {
                await expect(lots.nth(index)).toHaveAttribute('data-town-owned', String(total));
                await expect(lots.nth(index)).toHaveAttribute('data-town-visible', String(shown));
                await expect(lots.nth(index).locator('.sunset-facility-art')).toBeVisible();
            }
            const badges = town.locator('.town-building-count');
            await expect(badges).toHaveCount(total > shown ? 1 : 0);
            if (total > shown) await expect(badges).toHaveText(`+${total - shown}枚`);
            await expect(page.locator('.player-box-self .town-summary')).toContainText(`施設 ${total}枚`);
            const bounded = await town.evaluate(element => ({
                svg: element.querySelectorAll('svg').length,
                nodes: element.querySelectorAll('*').length,
            }));
            expect(bounded.svg).toBeLessThanOrEqual(10);
            expect(bounded.nodes).toBeLessThanOrEqual(500);
        }
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}
