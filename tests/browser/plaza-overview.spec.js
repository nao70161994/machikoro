const { test, expect } = require('@playwright/test');

// These assertions measure the ordinary board without an update banner.
// Banner reservation and actions are covered by the PWA/receipt suites.
test.use({ serviceWorkers: 'block' });

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1363, height: 936 }, { width: 844, height: 390 }]) {
    test(`広場の状況・操作・盤面を分離し施設比較へ移動できる ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
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
                acceptHotseatHandoff();
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
        expect(marks.slice().sort()).toEqual(['席1', '席2']);
        await expect(page.locator('#playerBox0 .plaza-seat-mark')).toHaveText('席1');
        await expect(page.locator('#playerBox1 .plaza-seat-mark')).toHaveText('席2');
        await expect(page.locator('#playerBox0 .plaza-seat-mark')).toHaveAttribute('aria-label', '席1');
        await expect(page.locator('#plazaPlayerHud [data-player-index="0"]')).toHaveAttribute('aria-label', /^席1、/);
        if (await page.locator('#btnBuildShortcut').isVisible()) {
            await page.locator('#btnBuildShortcut').click();
            await expect(page.locator('#plazaWorld #buildMenu')).toHaveCSS('visibility', 'visible');
        }
        await page.locator('[data-field-target="market"]').click();
        await expect(page.locator('#plazaWorld')).not.toHaveClass(/plaza-camera-moving/);
        await expect(page.locator('#plazaWorld #buildMenu')).toHaveCSS('visibility', 'visible');
        await expect(page.locator('#buildMenu h3')).toContainText(/施設一覧|市場から施設を選んでください/);
        const marketFocus = await page.evaluate(() => {
            const panel = document.getElementById('buildMenu').getBoundingClientRect();
            const viewport = document.getElementById('plazaViewport').getBoundingClientRect();
            return {
                panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: panel.width },
                viewport: { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom, width: innerWidth },
                columns: getComputedStyle(document.querySelector('#buildMenu .card-grid')).gridTemplateColumns.split(' ').length,
            };
        });
        expect(marketFocus.panel.left).toBeGreaterThanOrEqual(marketFocus.viewport.left);
        expect(marketFocus.panel.right).toBeLessThanOrEqual(marketFocus.viewport.right);
        expect(marketFocus.panel.top).toBeGreaterThanOrEqual(marketFocus.viewport.top);
        expect(marketFocus.panel.bottom).toBeLessThanOrEqual(marketFocus.viewport.bottom);
        expect(marketFocus.panel.width).toBeGreaterThanOrEqual(Math.min(viewport.width - 16, 570) - 1);
        if (viewport.width <= 600) expect(marketFocus.columns).toBe(2);
        if (viewport.width === 844) {
            const firstCard = await page.evaluate(() => {
                const panel = document.getElementById('buildMenu').getBoundingClientRect();
                const viewport = document.getElementById('plazaViewport').getBoundingClientRect();
                const name = document.querySelector('#buildMenu .card-btn .card-name').getBoundingClientRect();
                const cost = document.querySelector('#buildMenu .card-btn .card-cost').getBoundingClientRect();
                return [name, cost].every(rect => rect.height > 0 && rect.top >= panel.top &&
                    rect.bottom <= panel.bottom && rect.top >= viewport.top && rect.bottom <= viewport.bottom);
            });
            expect(firstCard).toBe(true);
        }
        const marketScreenshot = testInfo.outputPath(`plaza-market-focus-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path: marketScreenshot, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`plaza-market-focus-${viewport.width}x${viewport.height}.png`, {
            path: marketScreenshot, contentType: 'image/png',
        });
        await page.locator('[data-field-target="self"]').click();
        await expect(page.locator('#plazaWorld')).not.toHaveClass(/plaza-camera-moving/);
        const comparisonButton = page.locator('[data-field-panel="comparison"]');
        await comparisonButton.click();
        await expect(comparisonButton).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#plazaComparison')).toBeVisible();
        await expect(page.locator('#plazaComparisonHeading')).toBeFocused();
        await expect(page.locator('#plazaComparison thead th')).toHaveCount(3);
        const wheat = page.locator('#plazaComparison tbody tr').filter({ has: page.locator('th[scope="row"] > span:not(.plaza-comparison-facility-art)', { hasText: /^麦畑$/ }) });
        await expect(wheat).toHaveCount(1);
        await expect(wheat.locator('th .sunset-facility-art')).toHaveCount(1);
        await expect(wheat.locator('td')).toHaveText(['1', '1']);
        await page.keyboard.press('Escape');
        await expect(page.locator('#plazaComparison')).toBeHidden();
        await expect(comparisonButton).toBeFocused();
        await comparisonButton.click();
        await expect(page.locator('#plazaComparison')).toBeVisible();
        await page.locator('#plazaComparisonClose').click();
        await expect(comparisonButton).toBeFocused();
        await expect(page.locator('#plazaComparison')).toBeHidden();
        await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

test('終盤の施設比較は行追加後も縦横の読み位置を維持する', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(4, Array.from({ length: 4 }, (_, index) => ({
            type: index ? 'cpu' : 'human', difficulty: 'normal', name: `街${index + 1}`,
        })));
        GameRuntimeState.runtime.setCpuPlayers(Array.from({ length: 4 }, () => null));
        cancelCpuSchedule('plaza-comparison-scroll');
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => { player.cards = CARDS.slice(0, 20).map(card => createCardByName(card.name)); });
        render();
        acceptHotseatHandoff();
    });
    const toggle = page.locator('[data-field-panel="comparison"]');
    await toggle.click();
    const body = page.locator('#plazaComparisonBody');
    await expect.poll(() => body.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(120);
    const before = await body.evaluate(element => {
        element.scrollTop = 120;
        element.scrollLeft = 36;
        return { top: element.scrollTop, left: element.scrollLeft };
    });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards.push(createCardByName('麦畑'));
        render();
        acceptHotseatHandoff();
    });
    await expect.poll(() => body.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft })))
        .toEqual(before);
    const wheat = body.locator('tbody tr').filter({ has: page.locator('th[scope="row"] > span:not(.plaza-comparison-facility-art)', { hasText: /^麦畑$/ }) });
    await expect(wheat).toHaveCount(1);
    await expect(wheat.locator('td').first()).toHaveText('2');
});

test('広場のその他メニューから施設とランドマークへ移動できる', async ({ page }) => {
    await page.setViewportSize({ width: 1363, height: 936 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        const state = GameRuntimeState.runtime.snapshot();
        state.game.currentPlayerIndex = 0;
        state.game.phase = GAME_PHASES.BUILD;
        state.cpuPlayers.fill(null);
        cancelCpuSchedule('plaza-camera-menu-navigation');
        window.scheduleCPU = () => false;
        render();
        acceptHotseatHandoff();
        PlazaField.focusTarget('self');
    });
    const menu = page.locator('.plaza-camera-menu > summary');
    await menu.click();
    await page.locator('[data-field-section="landmarks"]').click();
    await expect(page.locator('#buildMenu .build-section:not(.build-card-section) h4').first()).toBeFocused();
    expect(await page.locator('#buildMenu').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await menu.click();
    await page.locator('[data-field-section="facilities"]').click();
    await expect(page.locator('#buildMenu .build-card-section h4')).toBeFocused();
    await expect(page.locator('#crashScreen')).toBeHidden();
});

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`2人の広場は画面方向に合わせて街と市場を配置する ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.locator('[data-field-target="all"]').click();
        await expect(page.locator('#plazaWorld')).not.toHaveClass(/plaza-camera-moving/);
        const layout = await page.evaluate(() => {
            const bounds = item => {
                // offsetLeft may be relative to a nested offset parent; the inline
                // coordinates are the world-space positions assigned by PlazaField.
                return { left: Number.parseFloat(item.style.left), top: Number.parseFloat(item.style.top),
                    width: item.offsetWidth, height: item.offsetHeight };
            };
            const towns = [...document.querySelectorAll('#plazaWorld #players > .player-box')];
            const self = towns.find(item => item.classList.contains('player-box-self'));
            const opponent = towns.find(item => !item.classList.contains('player-box-self'));
            return {
                horizontal: document.getElementById('plazaViewport').clientWidth >= document.getElementById('plazaViewport').clientHeight,
                world: { width: document.getElementById('plazaWorld').offsetWidth, height: document.getElementById('plazaWorld').offsetHeight,
                    classes: document.getElementById('plazaWorld').className },
                self: bounds(self), opponent: bounds(opponent), market: bounds(document.getElementById('buildMenu')),
                zoom: Number.parseInt(document.getElementById('plazaZoomLabel').textContent, 10),
                screenCardWidth: self.getBoundingClientRect().width,
            };
        });
        expect(layout.horizontal).toBe(viewport.width >= viewport.height);
        expect(layout.screenCardWidth).toBeGreaterThanOrEqual(150);
        expect(layout.zoom).toBeGreaterThanOrEqual(30);
        for (const item of [layout.self, layout.opponent, layout.market]) {
            expect(item.left).toBeGreaterThanOrEqual(0);
            expect(item.top).toBeGreaterThanOrEqual(0);
            expect(item.left + item.width).toBeLessThanOrEqual(layout.world.width);
            expect(item.top + item.height).toBeLessThanOrEqual(layout.world.height);
        }
        if (layout.horizontal) {
            expect(layout.world.classes).toContain('plaza-two-player-horizontal');
            expect(layout.opponent.left + layout.opponent.width).toBeLessThan(layout.market.left);
            expect(layout.self.left).toBeGreaterThan(layout.market.left + layout.market.width);
            expect(Math.abs(layout.self.top + layout.self.height / 2 -
                layout.opponent.top - layout.opponent.height / 2)).toBeLessThanOrEqual(1);
        } else {
            expect(layout.world.classes).toContain('plaza-two-player-vertical');
            expect(layout.opponent.top + layout.opponent.height).toBeLessThan(layout.market.top);
            expect(layout.self.top).toBeGreaterThan(layout.market.top + layout.market.height);
            expect(Math.abs(layout.self.left + layout.self.width / 2 -
                layout.opponent.left - layout.opponent.width / 2)).toBeLessThanOrEqual(1);
        }
        const screenshot = testInfo.outputPath(`plaza-two-player-overview-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`plaza-two-player-overview-${viewport.width}x${viewport.height}.png`, {
            path: screenshot, contentType: 'image/png',
        });
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`自分の街に合わせて広場を見やすく拡大する ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(() => {
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({
                type: 'human', name: `街${index + 1}`,
            })));
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = 0;
            state.game.phase = GAME_PHASES.BUILD;
            state.game.turnCount = 2;
            state.cpuPlayers.fill(null);
            cancelCpuSchedule('plaza-self-focus-scale');
            window.scheduleCPU = () => false;
            render();
            acceptHotseatHandoff();
            PlazaField.focusTarget('self');
        });
        await expect.poll(() => page.evaluate(() => {
            const item = document.querySelector('#plazaWorld #players > .player-box-self');
            return item?.getBoundingClientRect().width || 0;
        })).toBeGreaterThan(0);
        const frame = await page.evaluate(() => {
            const viewport = document.getElementById('plazaViewport').getBoundingClientRect();
            const town = document.querySelector('#plazaWorld #players > .player-box-self').getBoundingClientRect();
            return {
                viewport: { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom,
                    width: viewport.width, height: viewport.height },
                town: { left: town.left, right: town.right, top: town.top, bottom: town.bottom,
                    width: town.width, height: town.height },
                zoom: Number.parseInt(document.getElementById('plazaZoomLabel').textContent, 10),
            };
        });
        expect(frame.town.width).toBeGreaterThanOrEqual(Math.min(viewport.width - 16, 450 * 1.09));
        if (viewport.width === 1440) {
            expect(frame.zoom).toBeGreaterThan(110);
            expect(frame.town.left).toBeGreaterThanOrEqual(frame.viewport.left);
            expect(frame.town.right).toBeLessThanOrEqual(frame.viewport.right);
            expect(frame.town.top).toBeGreaterThanOrEqual(frame.viewport.top);
            expect(frame.town.bottom).toBeLessThanOrEqual(frame.viewport.bottom);
        }
        if (viewport.height > 600) {
            expect(frame.town.left).toBeGreaterThanOrEqual(frame.viewport.left);
            expect(frame.town.right).toBeLessThanOrEqual(frame.viewport.right);
            expect(frame.town.top).toBeGreaterThanOrEqual(frame.viewport.top);
            expect(frame.town.bottom).toBeLessThanOrEqual(frame.viewport.bottom);
        }
        const screenshot = testInfo.outputPath(`plaza-self-town-focus-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`plaza-self-town-focus-${viewport.width}x${viewport.height}.png`, {
            path: screenshot, contentType: 'image/png',
        });
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

for (const scenario of [
    { width: 390, height: 844, players: 2, cards: 2 },
    { width: 1440, height: 936, players: 4, cards: 5 },
]) {
    test(`広場の施設アートは行ごとに中央へ並ぶ ${scenario.players}人 ${scenario.cards}施設 ${scenario.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: scenario.width, height: scenario.height });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(({ playerCount, cardCount }) => {
            startGameNow(playerCount, Array.from({ length: playerCount }, (_, index) => ({
                type: 'human', name: `街${index + 1}`,
            })));
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = 0;
            state.game.players[0].cards = CARDS.slice(0, cardCount);
            state.game.phase = GAME_PHASES.BUILD;
            state.cpuPlayers.fill(null);
            cancelCpuSchedule('plaza-center-town-lots');
            window.scheduleCPU = () => false;
            render();
            acceptHotseatHandoff();
            PlazaField.focusTarget('self');
        }, { playerCount: scenario.players, cardCount: scenario.cards });
        const layout = await page.evaluate(() => {
            const street = document.querySelector('#plazaWorld #players .player-box-self .town-street');
            const bounds = street.getBoundingClientRect();
            const lots = Array.from(street.querySelectorAll('[data-town-slot-facility]')).map(lot => ({
                row: lot.style.getPropertyValue('--town-y'),
                x: Number.parseFloat(lot.style.getPropertyValue('--town-x')),
                width: Number.parseFloat(lot.style.getPropertyValue('--town-width')),
                left: lot.getBoundingClientRect().left,
                right: lot.getBoundingClientRect().right,
            }));
            return { bounds: { left: bounds.left, right: bounds.right, width: bounds.width }, lots };
        });
        expect(layout.lots).toHaveLength(scenario.cards);
        const rows = new Map();
        for (const lot of layout.lots) {
            const entries = rows.get(lot.row) || [];
            entries.push(lot);
            rows.set(lot.row, entries);
        }
        for (const entries of rows.values()) {
            const centerPercent = (Math.min(...entries.map(lot => lot.x)) +
                Math.max(...entries.map(lot => lot.x + lot.width))) / 2;
            expect(Math.abs(centerPercent - 50)).toBeLessThanOrEqual(0.01);
            const expectedWidth = entries.length === 1 ? 48 : entries.length === 2 ? 38 : entries.length === 3 ? 30 : 23;
            expect(entries.every(lot => lot.width === expectedWidth)).toBe(true);
            expect(entries.every(lot => lot.left >= layout.bounds.left && lot.right <= layout.bounds.right)).toBe(true);
        }
        const screenshot = testInfo.outputPath(`plaza-town-lots-centered-${scenario.players}p-${scenario.cards}lots-${scenario.width}px.png`);
        await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`plaza-town-lots-centered-${scenario.players}p-${scenario.cards}lots-${scenario.width}px.png`, {
            path: screenshot, contentType: 'image/png',
        });
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

test('広場の最近の出来事から関連する街へ安全に移動できる', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        cancelCpuSchedule('plaza-recent-event-review');
        window.scheduleCPU = () => false;
        const state = GameRuntimeState.runtime.snapshot();
        state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
        state.game.phase = GAME_PHASES.BUILD;
        state.game.currentPlayer().coins = 30;
        state.game.addLog(LOG_TYPES.BUILD, '🏗️ 麦畑を建設！', { review: false });
        state.game.addLog(LOG_TYPES.SYSTEM, `👤 ${state.game.currentPlayer().name}のターン`);
        render();
    });
    await page.locator('[data-field-panel="events"]').click();
    await expect(page.locator('#plazaEvents')).toBeVisible();
    await page.locator('.plaza-recent-history > summary').click();
    const logAction = page.locator('#plazaRecentEvents [data-ui-action="highlightLogEntry"]:visible').last();
    await expect(logAction).toBeVisible();
    await logAction.click();
    await expect(page.locator('#crashScreen')).toBeHidden();
    await expect(page.locator('.log-related-highlight').first()).toBeAttached();
});

for (const playerCount of [2, 4, 10]) {
    test(`広場の${playerCount}人の育った街は地面の境界と他の街を越えない`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1363, height: 936 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        const fixtureState = await page.evaluate(count => {
            startGameNow(count, Array.from({ length: count }, (_, index) => ({
                type: index === 0 ? 'human' : 'cpu', difficulty: 'normal', name: `街${index + 1}`,
            })));
            cancelCpuSchedule('plaza-full-towns');
            window.scheduleCPU = () => false;
            const state = GameRuntimeState.runtime.snapshot();
            // Disable actors at the runtime boundary, including recovery through
            // the watchdog's scheduleCpuTurn path. Player setup retains CPU kinds.
            state.cpuPlayers.fill(null);
            cancelCpuSchedule('plaza-full-towns-frozen');
            for (const player of state.game.players) player.cards = CARDS.slice(0, 8).flatMap(card => Array(6).fill(card));
            render();
            acceptHotseatHandoff();
            return { turn: state.game.turnCount, player: state.game.currentPlayerIndex,
                cards: state.game.players.map(player => player.cards.map(card => card.name)) };
        }, playerCount);
        const fits = () => page.evaluate(() => {
            const world = document.getElementById('plazaWorld');
            // Check layout in the world's own coordinate space, independently
            // of the shared camera zoom, and report exact placement violations.
            const towns = Array.from(document.querySelectorAll('#plazaWorld #players > .player-box, #plazaWorld #buildMenu'), item => ({
                id: item.id, parent: item.offsetParent === world,
                left: item.offsetLeft, top: item.offsetTop,
                right: item.offsetLeft + item.offsetWidth,
                bottom: item.offsetTop + item.offsetHeight,
            }));
            const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            const violations = towns.filter(town => !town.parent || town.left < 0 || town.top < 0 ||
                town.right > world.offsetWidth || town.bottom > world.offsetHeight)
                .map(town => ({ boundary: town, width: world.offsetWidth, height: world.offsetHeight }));
            towns.forEach((town, index) => towns.slice(index + 1).forEach(other => {
                if (overlaps(town, other)) violations.push({ overlap: [town, other] });
            }));
            return violations;
        });
        await expect.poll(fits).toEqual([]);
        await expect(page.locator('#plazaWorld .plaza-town-seat-flag').first()).toHaveCSS('display', 'none');
        await expect(page.locator('#plazaWorld #buildMenu')).toHaveCSS('visibility', 'hidden');
        await page.locator('[data-field-target="all"]').click();
        await expect(page.locator('#plazaWorld')).not.toHaveClass(/plaza-camera-moving/);
        await expect.poll(fits).toEqual([]);
        await expect(page.locator('#plazaWorld #buildMenu')).toHaveCSS('visibility', 'visible');
        await expect(page.locator('#plazaWorld .plaza-town-seat-flag')).toHaveCount(playerCount);
        if (playerCount === 2) {
            const overview = await page.evaluate(() => {
                const world = document.getElementById('plazaWorld');
                return { width: world.offsetWidth, height: world.offsetHeight };
            });
            expect(overview.width, `2人盤面幅: ${JSON.stringify(overview)}`).toBeLessThan(1680);
            expect(overview.height, `2人盤面高: ${JSON.stringify(overview)}`).toBeLessThan(1380);
            await page.screenshot({ path: testInfo.outputPath('plaza-overview-2p-1363x936.png') });
        }
        await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('#plazaWorld .plaza-town-seat-flag')).every(flag => {
            const index = Number(flag.dataset.playerIndex);
            const rect = flag.getBoundingClientRect();
            const hud = document.querySelector(`#plazaPlayerHud button[data-player-index="${index}"]`);
            return flag.textContent === `席${index + 1}` && flag.closest('.player-box').id === `playerBox${index}` &&
                flag.getAttribute('aria-hidden') === 'true' &&
                getComputedStyle(flag).getPropertyValue('--plaza-seat-color') === getComputedStyle(hud).getPropertyValue('--plaza-seat-color') &&
                rect.width >= 20 && rect.width <= 64 && rect.height >= 20 && rect.height <= 24;
        }))).toBe(true);
        if (playerCount === 4) {
            const hiddenCamera = await page.evaluate(async () => {
                const screen = document.getElementById('gameScreen');
                const world = document.getElementById('plazaWorld');
                const detail = document.querySelector('#plazaWorld #players > details:not([open])');
                const display = screen.style.display;
                const before = world.style.transform;
                screen.style.display = 'none';
                detail.open = true;
                await Promise.resolve();
                const after = world.style.transform;
                detail.open = false;
                await Promise.resolve();
                screen.style.display = display;
                return { before, after };
            });
            expect(hiddenCamera.after).toBe(hiddenCamera.before);
        }
        // Every expanded opponent and a resized market must fit without a game render.
        await page.locator('#plazaWorld #players > details').evaluateAll(elements => {
            elements.forEach(element => { element.open = true; });
        });
        // Open-attribute mutations must reconcile positions immediately, rather
        // than leaving expanded content outside the world until a later frame.
        expect(await fits()).toEqual([]);
        await expect.poll(fits).toEqual([]);
        await page.locator('[data-field-target="market"]').click();
        await expect(page.locator('#plazaWorld')).not.toHaveClass(/plaza-camera-moving/);
        await expect.poll(fits).toEqual([]);
        await expect(page.locator('#plazaWorld #buildMenu')).toHaveCSS('visibility', 'visible');
        await expect(page.locator('#buildMenu h3')).toContainText('施設一覧');
        const marketLayout = await page.evaluate(() => {
            const panel = document.getElementById('buildMenu').getBoundingClientRect();
            const viewport = document.getElementById('plazaViewport').getBoundingClientRect();
            return {
                panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: panel.width },
                viewport: { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom, width: innerWidth, height: innerHeight },
                columns: getComputedStyle(document.querySelector('#buildMenu .card-grid')).gridTemplateColumns.split(' ').length,
            };
        });
        expect(marketLayout.panel.left).toBeGreaterThanOrEqual(marketLayout.viewport.left);
        expect(marketLayout.panel.right).toBeLessThanOrEqual(marketLayout.viewport.right);
        expect(marketLayout.panel.top).toBeGreaterThanOrEqual(marketLayout.viewport.top);
        expect(marketLayout.panel.bottom).toBeLessThanOrEqual(marketLayout.viewport.bottom);
        expect(marketLayout.panel.width).toBeGreaterThanOrEqual(Math.min(marketLayout.viewport.width - 16, 570) - 1);
        const marketScreenshot = testInfo.outputPath(`plaza-endgame-market-focus-${playerCount}p.png`);
        await page.screenshot({ path: marketScreenshot, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`plaza-endgame-market-focus-${playerCount}p.png`, {
            path: marketScreenshot, contentType: 'image/png',
        });
        if (playerCount >= 5 && marketLayout.viewport.width >= 900) {
            const hudLayout = await page.evaluate(() => {
                const hud = document.getElementById('plazaPlayerHud');
                const hudBounds = hud.getBoundingClientRect();
                const toolsBounds = document.getElementById('plazaCameraTools').getBoundingClientRect();
                const cards = Array.from(hud.querySelectorAll('button')).map(button => button.getBoundingClientRect());
                return {
                    hudHeight: hudBounds.height,
                    toolsTop: toolsBounds.top,
                    hudBottom: hudBounds.bottom,
                    cardsFitVertically: cards.every(card => card.top >= hudBounds.top && card.bottom <= hudBounds.bottom),
                    oneRow: cards.every(card => Math.abs(card.top - cards[0].top) < 2),
                };
            });
            expect(hudLayout, `high-player-count HUD: ${JSON.stringify(hudLayout)}`).toMatchObject({
                hudHeight: 94,
                cardsFitVertically: true,
                oneRow: true,
            });
            expect(hudLayout.toolsTop).toBeGreaterThanOrEqual(hudLayout.hudBottom - 1);
        }
        if (playerCount === 10) {
            await page.setViewportSize({ width: 844, height: 390 });
            const resizedMarketLayout = async () => page.evaluate(() => {
                const viewport = document.getElementById('plazaViewport').getBoundingClientRect();
                const market = document.getElementById('buildMenu').getBoundingClientRect();
                const name = document.querySelector('#buildMenu .card-btn .card-name').getBoundingClientRect();
                const cost = document.querySelector('#buildMenu .card-btn .card-cost').getBoundingClientRect();
                return {
                    viewport: { width: viewport.width, height: viewport.height, top: viewport.top, bottom: viewport.bottom },
                    market: { left: market.left, right: market.right, top: market.top, bottom: market.bottom, width: market.width, height: market.height },
                    name: { top: name.top, bottom: name.bottom }, cost: { top: cost.top, bottom: cost.bottom },
                    panelInside: market.width > 0 && market.height > 0 && market.left >= viewport.left &&
                        market.right <= viewport.right && market.top >= viewport.top && market.bottom <= viewport.bottom,
                    cardInfoInside: name.top >= market.top && name.bottom <= market.bottom && cost.top >= market.top &&
                        cost.bottom <= market.bottom && name.top >= viewport.top && name.bottom <= viewport.bottom &&
                        cost.top >= viewport.top && cost.bottom <= viewport.bottom,
                };
            });
            await expect.poll(resizedMarketLayout).toMatchObject({ viewport: { width: 844 }, panelInside: true, cardInfoInside: true });
            const mobileHudScreenshot = testInfo.outputPath('plaza-endgame-market-focus-10p-844x390.png');
            await page.screenshot({ path: mobileHudScreenshot, fullPage: false, animations: 'disabled' });
            await testInfo.attach('plaza-endgame-market-focus-10p-844x390.png', {
                path: mobileHudScreenshot, contentType: 'image/png',
            });
            const resizedLayout = await resizedMarketLayout();
            expect(resizedLayout.cardInfoInside, `market card bounds after resize: ${JSON.stringify(resizedLayout)}`).toBe(true);
            const compactHud = await page.evaluate(() => {
                const hud = document.getElementById('plazaPlayerHud');
                const bounds = hud.getBoundingClientRect();
                const tools = document.getElementById('plazaCameraTools').getBoundingClientRect();
                const buttons = Array.from(hud.querySelectorAll('button')).map(button => button.getBoundingClientRect());
                return {
                    height: bounds.height,
                    toolsBottom: tools.bottom,
                    hudTop: bounds.top,
                    buttonsFit: buttons.length === 10 && buttons.every(button =>
                        button.top >= bounds.top && button.bottom <= bounds.bottom && button.height >= 44),
                };
            });
            expect(compactHud.height).toBe(44);
            expect(compactHud.toolsBottom).toBeLessThanOrEqual(compactHud.hudTop + 1);
            expect(compactHud.buttonsFit).toBe(true);
        }
        expect(await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            return { turn: game.turnCount, player: game.currentPlayerIndex,
                cards: game.players.map(player => player.cards.map(card => card.name)) };
        })).toEqual(fixtureState);
        await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

for (const width of [320, 390]) {
    test(`縦持ち広場は自分を優先し相手の状況を短い列で確認できる ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.evaluate(() => {
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({
                type: index === 0 ? 'human' : 'cpu', difficulty: 'normal', name: `街${index + 1}`,
            })));
            // Empty actors freeze scheduling while allowing UI CPU kinds to
            // fall back to setup. Null slots would turn every seat into human
            // and move the primary/self town when the fixture changes turns.
            GameRuntimeState.runtime.setCpuPlayers([]);
            cancelCpuSchedule('compact-hud');
            GameRuntimeState.runtime.snapshot().game.log = [];
            resetFullLog();
            render();
            acceptHotseatHandoff();
        });
        await expect(page.locator('#plazaPlayerHud .plaza-hud-self button')).toHaveClass(/self/);
        const selfIndex = await page.locator('#plazaPlayerHud .plaza-hud-self button').getAttribute('data-player-index');
        await expect(page.locator('#plazaPlayerHud .plaza-hud-opponents button')).toHaveCount(3);
        for (const action of ['self', 'market', 'all']) {
            await expect(page.locator(`#plazaCameraTools [data-field-target="${action}"]`)).toBeVisible();
        }
        for (const panel of ['log', 'events', 'comparison']) {
            await expect(page.locator(`#plazaCameraTools [data-field-panel="${panel}"]`)).toBeVisible();
        }
        await expect(page.locator('#plazaCameraTools > details > summary')).toBeVisible();
        await expect.poll(() => page.evaluate(() => {
            const hud = document.getElementById('plazaPlayerHud').getBoundingClientRect();
            const field = document.getElementById('plazaViewport').getBoundingClientRect();
            const tools = document.getElementById('plazaCameraTools').getBoundingClientRect();
            const controls = Array.from(document.querySelectorAll('#plazaCameraTools > button, #plazaCameraTools > details > summary'))
                .filter(control => control.getBoundingClientRect().width > 0);
            const buttons = Array.from(document.querySelectorAll('#plazaPlayerHud button'));
            const opponents = document.querySelector('#plazaPlayerHud .plaza-hud-opponents');
            const opponentBounds = opponents.getBoundingClientRect();
            const opponentButtons = Array.from(opponents.querySelectorAll('button'));
            return tools.height <= 60 && controls.length === 7 && controls.every(control => {
                const rect = control.getBoundingClientRect();
                return rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth;
            }) && opponentBounds.bottom <= hud.bottom &&
                opponents.scrollHeight <= opponents.clientHeight &&
                opponentButtons.every(button => {
                    const rect = button.getBoundingClientRect();
                    return rect.top >= opponentBounds.top && rect.bottom <= opponentBounds.bottom &&
                        getComputedStyle(button.querySelector('.plaza-player-facilities')).display === 'none';
                }) &&
                hud.height <= 112 && field.height > 480 && buttons.every(button =>
                button.getBoundingClientRect().height >= 44 && button.querySelector('.plaza-player-coins') &&
                button.textContent.includes('目標'));
        })).toBe(true);
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('#plazaPlayerHud .plaza-hud-opponents button');
            GameRuntimeState.runtime.snapshot().game.currentPlayerIndex = Number(buttons[buttons.length - 1].dataset.playerIndex);
            render();
            acceptHotseatHandoff();
        });
        const last = page.locator('#plazaPlayerHud .plaza-hud-opponents button').last();
        await expect(last).toHaveAttribute('aria-current', 'true');
        await expect(page.locator('#plazaPlayerHud .plaza-hud-self button')).toHaveAttribute('data-player-index', selfIndex);
        expect(await last.evaluate(button => {
            const bounds = button.parentElement.getBoundingClientRect();
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right;
        })).toBe(true);
        await last.focus();
        await expect(last).toBeFocused();
        expect(await last.evaluate(button => {
            const bounds = button.parentElement.getBoundingClientRect();
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right;
        })).toBe(true);
        await last.press('Enter');
        await expect(page.locator('#plazaPlayerInsightsClose')).toBeFocused();
        await page.locator('#plazaPlayerInsightsClose').press('Escape');
        await expect(last).toBeFocused();
        await page.locator('[data-field-panel="comparison"]').click();
        await expect(page.locator('#plazaComparison thead th')).toHaveCount(5);
        await page.locator('#plazaComparisonClose').click();
        await expect(page.locator('[data-field-panel="comparison"]')).toBeFocused();
        await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
    });
}
