const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

for (const theme of ['plaza', 'cardboard', 'classic', 'sunset']) {
    test(`ガイド表示中も市場ショートカットから実購入できる ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(value => localStorage.setItem('machikoroDesignTheme', value), theme);
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        const before = await page.evaluate(() => {
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
            GameRuntimeState.runtime.setCpuPlayers(Array(4).fill(null));
            cancelCpuSchedule('guide-market-click');
            const game = GameRuntimeState.runtime.snapshot().game;
            game.currentPlayerIndex = 0;
            game.phase = GAME_PHASES.BUILD;
            game.players[0].coins = 30;
            setTutorialEnabled(true);
            render();
            acceptHotseatHandoff();
            return game.players[0].cards.filter(card => card.name === '麦畑').length;
        });
        await expect(page.locator('#tutorialBox')).toBeVisible();
        if (theme !== 'cardboard') await page.locator('#btnBuildShortcut').click();
        const market = theme === 'cardboard' ? 'cardboardMarket' : 'buildMenu';
        await page.locator(`#${market} [data-action="buildCard"][data-card-name="麦畑"]`).click();
        if (await page.locator('#confirmOkBtn').isVisible()) await page.locator('#confirmOkBtn').click();
        await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.players[0].cards.filter(card => card.name === '麦畑').length)).toBe(before + 1);
        if (theme === 'plaza') {
            await expect(page.locator('#tutorialBox')).toBeHidden();
            await page.locator('[data-field-target="self"]').click();
            await expect(page.locator('#tutorialBox')).toBeVisible();
        }
    });
}
