const { test, expect } = require('@playwright/test');

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1363, height: 936 }, { width: 844, height: 390 }]) {
    test(`広場の状況・操作・盤面を分離し施設比較へ移動できる ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        for (const phase of ['ROLL', 'BUILD']) {
            await page.evaluate(requestedPhase => {
                cancelCpuSchedule('plaza-overview');
                window.scheduleCPU = () => false;
                const state = GameRuntimeState.runtime.snapshot();
                state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
                state.game.phase = GAME_PHASES[requestedPhase];
                state.game.currentPlayer().coins = 30;
                render();
            }, phase);
            await expect.poll(() => page.evaluate(() => {
                const regions = [
                    document.getElementById('plazaPlayerHud'),
                    document.getElementById('plazaCameraTools'),
                    document.getElementById('plazaViewport'),
                    document.querySelector('#gameScreen > .game-action-panel'),
                    document.getElementById('plazaEvents'),
                    document.querySelector('#gameScreen .game-action-toolbar'),
                ].map(element => element.getBoundingClientRect());
                const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                const separate = regions.slice(0, 5).every((region, index) => regions.slice(index + 1, 5).every(other => !overlaps(region, other)));
                const sidebar = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
                return separate && Math.abs(regions[3].bottom - window.innerHeight) < 1 &&
                    (!sidebar || (regions[2].height > 220 && !overlaps(regions[0], regions[5]) &&
                        !overlaps(regions[2], regions[5])));
            })).toBe(true);
        }
        const marks = await page.locator('#plazaPlayerHud .plaza-seat-mark').allTextContents();
        expect(marks).toEqual(['1', '2']);
        await expect(page.locator('#playerBox0 .plaza-seat-mark')).toHaveText('1');
        await expect(page.locator('#playerBox1 .plaza-seat-mark')).toHaveText('2');
        const comparisonButton = page.locator('[data-field-panel="comparison"]');
        await comparisonButton.click();
        await expect(comparisonButton).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#plazaComparison')).toBeVisible();
        await expect(page.locator('#plazaComparison thead th')).toHaveCount(3);
        const wheat = page.locator('#plazaComparison tbody tr').filter({ has: page.locator('th', { hasText: /^麦畑$/ }) });
        await expect(wheat.locator('td')).toHaveText(['1', '1']);
        await page.locator('#plazaComparisonClose').click();
        await expect(comparisonButton).toBeFocused();
        await expect(page.locator('#plazaComparison')).toBeHidden();
        await page.locator('.plaza-camera-menu > summary').click();
        await page.locator('[data-field-section="landmarks"]').click();
        await expect(page.locator('#buildMenu .build-section h4').last()).toBeFocused();
        expect(await page.locator('#buildMenu').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await page.locator('.plaza-camera-menu > summary').click();
        await page.locator('[data-field-section="facilities"]').click();
        await expect(page.locator('#buildMenu .build-card-section h4')).toBeFocused();
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

for (const playerCount of [4, 10]) {
    test(`広場の${playerCount}人の育った街は地面の境界と他の街を越えない`, async ({ page }) => {
        await page.setViewportSize({ width: 1363, height: 936 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(count => {
            startGameNow(count, Array.from({ length: count }, (_, index) => ({
                type: index === 0 ? 'human' : 'cpu', difficulty: 'normal', name: `街${index + 1}`,
            })));
            cancelCpuSchedule('plaza-full-towns');
            window.scheduleCPU = () => false;
            const state = GameRuntimeState.runtime.snapshot();
            for (const player of state.game.players) player.cards = CARDS.slice(0, 8).flatMap(card => Array(6).fill(card));
            render();
        }, playerCount);
        const fits = () => page.evaluate(() => {
            const world = document.getElementById('plazaWorld').getBoundingClientRect();
            const towns = Array.from(document.querySelectorAll('#plazaWorld #players > .player-box, #plazaWorld #buildMenu'), item => item.getBoundingClientRect());
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            return towns.every(town => town.left >= world.left && town.top >= world.top &&
                town.right <= world.right && town.bottom <= world.bottom) &&
                towns.every((town, index) => towns.slice(index + 1).every(other => !overlaps(town, other)));
        });
        await expect.poll(fits).toBe(true);
        await page.locator('[data-field-target="all"]').click();
        await expect.poll(fits).toBe(true);
        // Every expanded opponent and a resized market must fit without a game render.
        await page.locator('#plazaWorld #players > details').evaluateAll(elements => {
            elements.forEach(element => { element.open = true; });
        });
        await expect.poll(fits).toBe(true);
        await page.locator('[data-field-target="market"]').click();
        await expect.poll(fits).toBe(true);
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}
