const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function startPlazaGame(page, count, viewport = { width: 844, height: 390 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('machikoroDesignTheme', 'plaza');
        localStorage.setItem('machikoroTutorialEnabled', 'false');
    });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(count => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({
            type: index ? 'cpu' : 'human', difficulty: 'normal', name: `街${index + 1}`,
        })));
        GameRuntimeState.runtime.setCpuPlayers(Array.from({ length: count }, () => null));
        cancelCpuSchedule('plaza-landscape-hud');
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayerIndex = 0;
        game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            player.coins = 30;
            player.cards = Array.from({ length: 4 }, () => createCardByName(index ? 'カフェ' : '麦畑'));
        });
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, count);
    await expect(page.locator('html')).toHaveAttribute('data-design', 'plaza');
    await expect(page.locator('#gameScreen')).toBeVisible();
}

test('横持ちの4人戦は全席を読みやすく並べ、広場と操作域を全幅に保つ', async ({ page }, testInfo) => {
    await startPlazaGame(page, 4);
    const layout = await page.evaluate(() => {
        const rect = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return { x: value.x, y: value.y, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
        };
        const buttons = [...document.querySelectorAll('#plazaPlayerHud button')].map(button => {
            const r = button.getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
                fontSize: parseFloat(getComputedStyle(button).fontSize), nameSize: parseFloat(getComputedStyle(button.querySelector('.plaza-player-name')).fontSize) };
        });
        const townArt = [...document.querySelectorAll('#plazaWorld #players .sunset-facility-art')]
            .map(art => art.getBoundingClientRect().height).filter(height => height > 0);
        return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            tools: rect('#plazaCameraTools'), hud: rect('#plazaPlayerHud'), field: rect('#plazaViewport'),
            events: rect('#plazaEvents'), actions: rect('.game-action-panel'), buttons,
            toolbar: rect('.game-action-toolbar'), toolbarLabels: [...document.querySelectorAll('.game-action-toolbar summary')].map(summary => ({
                visibleLabel: getComputedStyle(summary, '::after').content,
                textFits: summary.scrollWidth <= summary.clientWidth,
                targetHeight: summary.getBoundingClientRect().height,
            })),
            townArtHeights: townArt,
            allButtonsHit: [...document.querySelectorAll('#plazaPlayerHud button')].every(button => {
                const r = button.getBoundingClientRect();
                const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return target === button || button.contains(target);
            }),
        };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.hud.x).toBe(0);
    expect(layout.hud.width).toBe(layout.viewportWidth);
    expect(layout.hud.height).toBeLessThanOrEqual(68);
    expect(layout.hud.y).toBeGreaterThanOrEqual(layout.tools.bottom - 1);
    expect(layout.field.x).toBe(0);
    expect(layout.field.width).toBe(layout.viewportWidth);
    expect(layout.field.height).toBeGreaterThanOrEqual(180);
    expect(layout.field.y).toBeGreaterThanOrEqual(layout.hud.bottom - 1);
    expect(layout.events.height).toBe(0);
    expect(layout.actions.width).toBe(layout.viewportWidth);
    expect(layout.actions.height).toBeLessThanOrEqual(64);
    expect(layout.toolbarLabels).toHaveLength(3);
    expect(layout.toolbarLabels.every(label => label.visibleLabel !== 'none' && label.textFits && label.targetHeight >= 44)).toBe(true);
    expect(layout.buttons).toHaveLength(4);
    expect(layout.buttons.every(button => button.width >= 180 && button.height >= 52 && button.fontSize >= 12 && button.nameSize >= 12)).toBe(true);
    expect(layout.allButtonsHit).toBe(true);
    expect(layout.townArtHeights.length).toBeGreaterThan(0);
    expect(Math.min(...layout.townArtHeights)).toBeGreaterThanOrEqual(50);
    const screenshot = testInfo.outputPath('plaza-landscape-4p.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('横持ち4人戦のHUDと広場', { path: screenshot, contentType: 'image/png' });
    await page.locator('#plazaPlayerHud [data-player-index="2"]').click();
    await expect(page.locator('#plazaPlayerInsights')).toBeVisible();
    await expect(page.locator('#plazaPlayerInsightsHeading')).toContainText('街3');
    await page.locator('#plazaPlayerInsightsClose').click();
    await expect(page.locator('#plazaPlayerInsights')).toBeHidden();
    await page.evaluate(() => PlazaField.focusTarget('self'));
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const fit = await page.evaluate(() => {
            const field = document.getElementById('plazaViewport').getBoundingClientRect();
            const town = document.getElementById('playerBox0').getBoundingClientRect();
            return { documentWidth: document.documentElement.scrollWidth, fieldWidth: field.width,
                townLeft: town.left, townRight: town.right };
        });
        expect(fit.documentWidth).toBeLessThanOrEqual(viewport.width + 1);
        expect(fit.fieldWidth).toBe(viewport.width);
        expect(fit.townLeft).toBeGreaterThanOrEqual(7);
        expect(fit.townRight).toBeLessThanOrEqual(viewport.width - 7);
        const portraitScreenshot = testInfo.outputPath(`plaza-portrait-${viewport.width}.png`);
        await page.screenshot({ path: portraitScreenshot });
        await testInfo.attach(`縦持ち${viewport.width}pxで街を表示`, { path: portraitScreenshot, contentType: 'image/png' });
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => PlazaField.focusTarget('self'));
    await page.locator('#btnRoll').click();
    await expect(page.locator('#plazaEvents')).toBeVisible();
    await expect(page.locator('#plazaDiceReceipt .plaza-receipt-dice')).toBeVisible();
});

test('PC幅では4人の席カードと街のアートを広い盤面に表示する', async ({ page }, testInfo) => {
    await startPlazaGame(page, 4, { width: 1440, height: 936 });
    const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        fieldWidth: document.getElementById('plazaViewport').getBoundingClientRect().width,
        seatWidths: [...document.querySelectorAll('#plazaPlayerHud button')].map(button => button.getBoundingClientRect().width),
        seatTextSizes: [...document.querySelectorAll('#plazaPlayerHud button')].map(button => ({
            name: parseFloat(getComputedStyle(button.querySelector('.plaza-player-name')).fontSize),
            coins: parseFloat(getComputedStyle(button.querySelector('.plaza-player-coins')).fontSize),
        })),
        artHeights: [...document.querySelectorAll('#plazaWorld #players .sunset-facility-art')]
            .map(art => art.getBoundingClientRect().height).filter(height => height > 0),
    }));
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.fieldWidth).toBe(1440);
    expect(layout.seatWidths).toHaveLength(4);
    expect(layout.seatWidths.every(width => width >= 300)).toBe(true);
    expect(layout.seatTextSizes.every(size => size.name >= 15 && size.coins >= 14)).toBe(true);
    expect(layout.artHeights.length).toBeGreaterThan(0);
    expect(Math.min(...layout.artHeights)).toBeGreaterThanOrEqual(50);
    const screenshot = testInfo.outputPath('plaza-desktop-1440.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('1440pxのにぎわい広場', { path: screenshot, contentType: 'image/png' });
});

test('横持ち10人戦は相手HUDを横にスクロールして選択できる', async ({ page }) => {
    await startPlazaGame(page, 10);
    const scroller = page.locator('#plazaPlayerHud .plaza-hud-opponents');
    const overflow = await scroller.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.width);
    const lastSeat = page.locator('#plazaPlayerHud [data-player-index="9"]');
    await lastSeat.scrollIntoViewIfNeeded();
    await lastSeat.click();
    await expect(page.locator('#plazaPlayerInsights')).toBeVisible();
    await expect(page.locator('#plazaPlayerInsightsHeading')).toContainText('街10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
