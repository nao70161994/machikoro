const { test, expect } = require('@playwright/test');

for (const width of [320, 390]) {
    test(`広場${width}pxではログ中だけガイドを隠し展開状態を復元する`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(() => {
            startGameNow(2, [{ type: 'human', name: '街1' }, { type: 'cpu', difficulty: 'normal', name: '街2' }]);
            const state = GameRuntimeState.runtime.snapshot();
            state.cpuPlayers.fill(null);
            cancelCpuSchedule('plaza-log-guide');
            state.game.currentPlayerIndex = 0;
            state.game.turnCount = 4;
            setTutorialEnabled(true);
            render();
            acceptHotseatHandoff();
        });
        const guide = page.locator('#tutorialBox');
        const disclosure = guide.locator('.plaza-guide-disclosure');
        await disclosure.locator('summary').click();
        await expect(guide.locator('.tutorial-body')).toBeVisible();
        await page.locator('[data-field-panel="log"]').click();
        await expect(page.locator('#gameLogContainer')).toBeVisible();
        await expect(guide).toBeHidden();
        await page.evaluate(() => { render(); acceptHotseatHandoff(); });
        await expect(guide).toBeHidden();
        await page.locator('#plazaLogClose').click();
        await expect(guide).toBeVisible();
        await expect(disclosure).toHaveAttribute('open', '');
        await expect(guide.locator('.tutorial-body')).toBeVisible();
        await disclosure.locator('summary').click();
        await page.locator('[data-field-panel="log"]').click();
        await page.locator('#plazaLogClose').click();
        await expect(guide).toBeVisible();
        await expect(disclosure).not.toHaveAttribute('open', '');
        await expect(guide.locator('.tutorial-body')).toBeHidden();
    });
}
