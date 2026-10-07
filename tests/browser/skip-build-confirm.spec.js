const { test, expect } = require('@playwright/test');

for (const airport of [false, true]) {
    test(`建設を見送る終了は確認しキャンセルで手番を維持する 空港${airport}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        const before = await page.evaluate(airport => {
            startGameNow(2, [{ type: 'human', name: '街1' }, { type: 'cpu', difficulty: 'normal', name: '街2' }]);
            const state = GameRuntimeState.runtime.snapshot();
            state.cpuPlayers.fill(null);
            cancelCpuSchedule('skip-confirm');
            state.game.currentPlayerIndex = 0;
            state.game.phase = GAME_PHASES.BUILD;
            state.game.builtThisTurn = false;
            state.game.players[0].landmarks[LANDMARK_NAMES.AIRPORT] = airport;
            setTutorialEnabled(false);
            render();
            acceptHotseatHandoff();
            return GameSnapshot.serializeGameState(state.game);
        }, airport);
        await page.locator('#btnSkip').click();
        await expect(page.locator('#confirmModal')).toBeVisible();
        await expect(page.locator('#confirmMessage')).toContainText('建設せずにターン終了しますか？');
        if (airport) await expect(page.locator('#confirmMessage')).toContainText('空港効果で+10コイン');
        await page.locator('#confirmCancelBtn').click();
        expect(await page.evaluate(() => GameSnapshot.serializeGameState(GameRuntimeState.runtime.snapshot().game))).toEqual(before);
        await page.locator('#btnSkip').click();
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#confirmModal')).toBeHidden();
        expect(await page.evaluate(() => GameRuntimeState.runtime.snapshot().game.currentPlayerIndex)).toBe(1);
    });
}
