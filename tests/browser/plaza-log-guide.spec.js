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

test('ガイドと比較・HUD詳細・出来事詳細を排他表示しランドマークを開ける', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(2, [{ type: 'human', name: '街1' }, { type: 'cpu', name: '街2', difficulty: 'normal' }]);
        const state = GameRuntimeState.runtime.snapshot();
        state.cpuPlayers.fill(null);
        cancelCpuSchedule('panel-combinations');
        state.game.currentPlayerIndex = 0;
        state.game.turnCount = 4;
        state.game.players[0].cards = [createCardByName('麦畑')];
        state.game.players[0].landmarks[LANDMARK_NAMES.STATION] = true;
        setTutorialEnabled(true);
        render();
        acceptHotseatHandoff();
    });
    const guide = page.locator('#tutorialBox');
    await expect(guide).toBeVisible();
    await page.locator('#plazaCameraTools summary').click();
    await page.locator('[data-field-panel="comparison"]').click();
    await expect(page.locator('#plazaComparison')).toBeVisible();
    await expect(guide).toBeHidden();
    await page.locator('#plazaComparisonClose').click();
    await expect(guide).toBeVisible();
    await page.locator('#plazaPlayerHud [data-player-index="0"]').click();
    await expect(guide).toBeHidden();
    await page.locator('#plazaPlayerInsights [data-card-name="麦畑"]').click();
    await expect(page.locator('#cardDetailModal')).toBeVisible();
    await expect(page.locator('#cardDetailModal')).toContainText('麦畑');
    await page.keyboard.press('Escape');
    for (const name of ['駅', '港']) {
        const detail = page.locator(`#plazaPlayerInsights [data-landmark-name="${name}"]`);
        await detail.focus();
        await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[0].coins++; render(); acceptHotseatHandoff(); });
        await expect(detail).toBeFocused();
        await page.locator(`#plazaPlayerInsights [data-landmark-name="${name}"]`).click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await expect(page.locator('#cardDetailModal')).toContainText(name);
        await page.keyboard.press('Escape');
    }
    await page.locator('#plazaPlayerInsightsClose').click();
    await expect(guide).toBeVisible();
    await page.evaluate(() => { const g = GameRuntimeState.runtime.snapshot().game; g.phase = GAME_PHASES.ROLL; g.players[0].landmarks[LANDMARK_NAMES.STATION] = false; g.rollDice(1); render(); acceptHotseatHandoff(); });
    await page.locator('.plaza-receipt-details > summary').click();
    await expect(guide).toBeHidden();
    await page.locator('.plaza-receipt-details > summary').click();
    await expect(guide).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('[data-field-panel="events"]')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-field-panel="events"]')).toBeHidden();
});
