const { test, expect, devices } = require('@playwright/test');

test('広場の4人オンラインで全員の街を表示しダイスと手番を同期する', async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(90000);
    const contexts = [];
    const pages = [];
    const errors = [];
    try {
        for (let index = 0; index < 4; index++) {
            const context = await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' });
            contexts.push(context);
            await context.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
            const page = await context.newPage();
            pages.push(page);
            page.on('pageerror', error => errors.push(error.message));
            await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
            await page.goto('/');
            await page.locator('#tabOnline').click();
            await page.locator('#playerNameInput').fill(`広場${index + 1}`);
        }
        const host = pages[0];
        await host.locator('#onlineAdvancedSettings > summary').click();
        for (let index = 0; index < 2; index++) {
            await host.locator('[data-ui-action="changeOnlineCount"][data-delta="1"]').click();
        }
        await host.locator('#onlineAdvancedSettings > summary').click();
        await host.locator('#onlineCreateSubmitButton').click();
        const room = (await host.locator('#onlineWaitingPanel .room-id-display').textContent()).trim();
        for (const guest of pages.slice(1)) {
            await guest.locator('#onlineTabJoin').click();
            await guest.locator('#roomIdInput').fill(room);
            await guest.locator('#onlineJoinSubmitButton').click();
        }
        const ready = '[data-ui-action="setOnlineLobbyReady"][data-ready="true"]';
        for (const page of pages) await page.locator(ready).click();
        for (const page of pages) {
            await expect(page.locator('#gameScreen')).toBeVisible();
            await expect(page.locator('#players > .player-box')).toHaveCount(4);
            await expect(page.locator('.player-box-self')).toHaveCount(1);
        }
        const activeIndex = await host.evaluate(() => GameRuntimeState.runtime.snapshot().game.currentPlayerIndex);
        let active;
        for (const page of pages) {
            if (await page.locator('#btnRoll').isVisible() && await page.locator('#btnRoll').isEnabled()) active = page;
        }
        expect(active).toBeTruthy();
        await active.locator('#btnRoll').click();
        for (const page of pages) {
            await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.phase)).toBe('build');
        }
        const results = await Promise.all(pages.map(page => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.lastDiceResult)));
        expect(new Set(results).size).toBe(1);
        await expect(active.locator('#plazaPlayerHud button')).toHaveCount(4);
        await active.locator('[data-field-target="all"]').click();
        await active.screenshot({ path: testInfo.outputPath('plaza-online-4p.png'), fullPage: true });
        await active.locator('#btnSkip').click();
        await expect(active.locator('#confirmModal')).toBeVisible();
        await active.locator('#confirmOkBtn').click();
        await expect(active.locator('#confirmModal')).toBeHidden();
        for (const page of pages) {
            await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.currentPlayerIndex)).not.toBe(activeIndex);
        }
        expect(errors).toEqual([]);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});
