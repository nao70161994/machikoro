const { test, expect } = require('@playwright/test');

for (const width of [390, 1440]) {
    test(`広場${width}pxは市場の横ドラッグと縦スクロールを分け、ログを開閉できる`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.evaluate(() => {
            cancelCpuSchedule('plaza-input');
            window.scheduleCPU = () => false;
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
            state.game.phase = GAME_PHASES.BUILD;
            state.game.currentPlayer().coins = 30;
            render();
            PlazaField.focusTarget('market');
        });
        const market = page.locator('#buildMenu');
        const world = page.locator('#plazaWorld');
        await expect(market).toBeVisible();
        const transform = () => world.evaluate(element => element.style.transform);
        const camera = () => world.evaluate(element => {
            const matrix = new DOMMatrix(element.style.transform);
            return { x: matrix.m41, y: matrix.m42, scale: matrix.a };
        });
        const scroll = () => market.evaluate(element => element.scrollTop);
        const drag = async (dx, dy) => {
            const rect = await market.boundingBox();
            const field = await page.locator('#plazaViewport').boundingBox();
            const x = rect.x + rect.width * 0.55;
            const y = Math.max(field.y + 40, rect.y + 100);
            await page.mouse.move(x, y);
            await market.evaluate(element => element.addEventListener('pointerdown', event => {
                element.dataset.testPointerId = String(event.pointerId);
            }, { once: true }));
            await page.mouse.down();
            await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
            // A child's implicit capture can be lost when the viewport takes it.
            await market.evaluate(element => element.dispatchEvent(new PointerEvent('lostpointercapture', {
                bubbles: true, pointerId: Number(element.dataset.testPointerId),
            })));
            await page.mouse.move(x + dx, y + dy, { steps: 3 });
            await page.mouse.up();
        };
        await market.evaluate(element => { element.scrollTop = 160; });
        const before = await transform();
        const beforePan = await camera();
        await drag(70, 0);
        expect(await transform()).not.toBe(before);
        expect(Math.abs((await camera()).x - beforePan.x - 70)).toBeLessThan(1);
        expect(await scroll()).toBe(160);
        await page.evaluate(() => PlazaField.focusTarget('market'));
        await market.evaluate(element => { element.scrollTop = 160; });
        const beforeScroll = await transform();
        const scrollCamera = await camera();
        await drag(0, -70);
        expect(await scroll()).toBeGreaterThan(160);
        expect(Math.abs((await scroll()) - 160 - 70 / scrollCamera.scale)).toBeLessThan(2);
        expect(await transform()).toBe(beforeScroll);
        await market.evaluate(element => { element.scrollTop = 0; });
        const edge = await transform();
        await drag(0, 60);
        expect(await transform()).not.toBe(edge);
        expect(await scroll()).toBe(0);
        await expect(page.locator('#confirmModal')).toBeHidden();
        await page.evaluate(() => document.getElementById('log').classList.add('collapsed'));
        const logButton = page.locator('[data-field-panel="log"]');
        await logButton.tap();
        await expect(logButton).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#gameLogContainer')).toBeVisible();
        await expect(page.locator('#log')).not.toHaveClass(/collapsed/);
        await page.locator('#plazaLogClose').tap();
        await expect(logButton).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#gameLogContainer')).toBeHidden();
        await expect(logButton).toBeFocused();
    });
}
