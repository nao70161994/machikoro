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
        await page.locator('[data-field-target="market"]').click();
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
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator('.plaza-camera-menu > summary').click();
        await page.locator('[data-field-section="landmarks"]').click();
        await expect(page.locator('#buildMenu .build-section:not(.build-card-section) h4').first()).toBeFocused();
        expect(await page.locator('#buildMenu').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        await page.locator('.plaza-camera-menu > summary').click();
        await page.locator('[data-field-section="facilities"]').click();
        await expect(page.locator('#buildMenu .build-card-section h4')).toBeFocused();
        await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

for (const playerCount of [4, 10]) {
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
        await expect.poll(fits).toEqual([]);
        await expect(page.locator('#plazaWorld #buildMenu')).toHaveCSS('visibility', 'visible');
        await expect(page.locator('#plazaWorld .plaza-town-seat-flag')).toHaveCount(playerCount);
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
            await expect.poll(() => page.evaluate(() => {
                const viewport = document.getElementById('plazaViewport').getBoundingClientRect();
                const market = document.getElementById('buildMenu').getBoundingClientRect();
                return viewport.width === 844 && market.width > 0 && market.height > 0 &&
                    market.left < viewport.right && market.right > viewport.left &&
                    market.top < viewport.bottom && market.bottom > viewport.top;
            })).toBe(true);
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
            const mobileHudScreenshot = testInfo.outputPath('plaza-endgame-market-focus-10p-844x390.png');
            await page.screenshot({ path: mobileHudScreenshot, fullPage: false, animations: 'disabled' });
            await testInfo.attach('plaza-endgame-market-focus-10p-844x390.png', {
                path: mobileHudScreenshot, contentType: 'image/png',
            });
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
            return tools.height <= 60 && controls.length === 6 && controls.every(control => {
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
