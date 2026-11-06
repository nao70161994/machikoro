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
        // This is a rendering fixture: use human settings before the real UI
        // start so shuffled CPU metadata cannot outlive a runtime-only override.
        await page.evaluate(() => GameSetupState.runtime.setPlayerSettings(
            Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` }))
        ));
        await page.locator('#btnStart').click();
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot();
            GameRuntimeState.runtime.setCpuPlayers(Array.from({ length: state.game.players.length }, () => null));
            state.game.currentPlayerIndex = 0;
            state.game.log = [];
            state.game.addLog(LOG_TYPES.SYSTEM, `👤 ${state.game.currentPlayer().name}のターン`);
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
            // Read each render in one browser round trip. The exact array length
            // retains the lot count check alongside both attributes and artwork
            // visibility, including all six slots in the dense fixture.
            await expect.poll(() => lots.evaluateAll(elements => elements.map(element => {
                const art = element.querySelector('.sunset-facility-art');
                const bounds = art?.getBoundingClientRect();
                return {
                    owned: element.getAttribute('data-town-owned'),
                    visible: element.getAttribute('data-town-visible'),
                    artVisible: !!art && !!bounds && bounds.width > 0 && bounds.height > 0 &&
                        getComputedStyle(art).visibility !== 'hidden' && getComputedStyle(art).visibility !== 'collapse',
                };
            })), { message: `森林${total}枚の全施設枠とアートが正しく表示される` }).toEqual(
                Array.from({ length: shown }, () => ({ owned: String(total), visible: String(shown), artVisible: true }))
            );
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
