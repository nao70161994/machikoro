const { test, expect } = require('@playwright/test');

const THEMES = ['classic', 'sunset', 'plaza', 'cardboard'];
test.use({
    serviceWorkers: 'block',
    video: 'off',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true },
});
const VIEWPORTS = [
    { width: 320, height: 844, name: 'phone-320' },
    { width: 390, height: 844, name: 'phone-390' },
    { width: 844, height: 390, name: 'landscape-844' },
    { width: 1440, height: 936, name: 'desktop-1440' },
];

test.describe('4テーマのゲーム画面ビジュアル回帰', () => {
    test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.addInitScript(() => {
            window.__visualRegressionActions = [];
            document.addEventListener('click', event => {
                const control = event.target.closest('button, [data-action]');
                if (control) window.__visualRegressionActions.push({
                    at: Date.now(), action: control.dataset.action || control.id || control.textContent.trim().slice(0, 60),
                });
            }, true);
        });
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        // Capture the fully loaded shared art, not the transient external-use
        // fallback while the inline SVG library is still being prepared.
        expect(await page.evaluate(() => UiBuildMenu.prepareLocalFacilityArt())).toBe(true);
        await page.evaluate(() => {
            localStorage.setItem('machikoroTutorialEnabled', 'false');
            const originalRandom = Math.random;
            Math.random = () => 0.99;
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({
                type: 'human', name: `街${index + 1}`,
            })));
            Math.random = originalRandom;
            const runtime = GameRuntimeState.runtime;
            const state = runtime.snapshot();
            runtime.setCpuPlayers(Array.from({ length: 4 }, () => null));
            cancelCpuSchedule('theme-visual-regression');
            state.game.currentPlayerIndex = 3;
            state.game.phase = GAME_PHASES.ROLL;
            state.game.turnCount = 2;
            state.game.builtThisTurn = false;
            state.game.lastDiceResult = null;
            state.game.lastDice1 = 0;
            state.game.lastDice2 = 0;
            state.game.players.forEach((player, index) => {
                player.name = `街${index + 1}`;
                player.coins = 8 + index;
                player.cards = [createCardByName('麦畑'), createCardByName('パン屋')];
            });
            state.game.log = [];
            setTutorialEnabled(false);
            render();
            acceptHotseatHandoff();
            PlazaField.focusTarget('self');
            document.getElementById('buildMenu').classList.remove('plaza-market-exploring');
            const updateBanner = document.getElementById('pwaUpdateBanner');
            if (updateBanner) updateBanner.style.display = 'none';
            document.body.classList.remove('pwa-banner-open');
            const installBanner = document.getElementById('pwaInstallBanner');
            if (installBanner) installBanner.style.display = 'none';
        });
    });

    test.afterEach(async ({ page }, testInfo) => {
        if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
        try {
            const evidence = await page.evaluate(() => ({
                url: location.href,
                theme: document.documentElement.dataset.design,
                actions: window.__visualRegressionActions || [],
                state: typeof GameSnapshot !== 'undefined' && typeof GameRuntimeState !== 'undefined'
                    ? GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER)
                    : null,
                visibleControls: [...document.querySelectorAll('#gameScreen button')].map(button => ({
                    id: button.id, text: button.innerText.trim(), disabled: button.disabled,
                    visible: button.getBoundingClientRect().width > 0,
                })),
            }));
            await testInfo.attach('game-state-actions-and-controls.json', {
                body: JSON.stringify(evidence, null, 2), contentType: 'application/json',
            });
        } catch (error) {
            await testInfo.attach('diagnostic-capture-error.txt', { body: String(error), contentType: 'text/plain' });
        }
    });

    for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
            test(`${theme} ${viewport.name}`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.evaluate(themeName => {
                    const select = document.getElementById('gameDesignThemeSelect');
                    select.value = themeName;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    // Theme changes in a live match preserve game state but must
                    // rebuild theme-specific presentation such as the plaza HUD.
                    render();
                    document.documentElement.classList.add('visual-regression-capture');
                }, theme);
                await expect(page.locator('html')).toHaveAttribute('data-design', theme);
                if (theme === 'plaza') {
                    await expect(page.locator('#plazaPlayerHud button[data-player-index]')).toHaveCount(4);
                    await expect(page.locator('#plazaPlayerHud')).toContainText('街1');
                    await expect(page.locator('#plazaPlayerHud')).toContainText('街4');
                }
                if (theme === 'cardboard') {
                    const unavailable = page.locator('#cardboardMarket .compact-market-buy:disabled').first();
                    await expect(unavailable).toHaveCSS('opacity', '1');
                    await expect(unavailable).toHaveCSS('filter', 'none');
                    await expect(page.locator('#cardboardTableCanvas > #cardboardSeats .cardboard-player')).toHaveCount(4);
                    await expect(page.locator('#cardboardSeats #cardboardCenter #cardboardMarket')).toHaveCount(1);
                    await expect(page.locator('#cardboardOverview, #cardboardDetails')).toHaveCount(0);
                    await expect.poll(() => page.locator('#cardboardTableViewport').evaluate(viewport => {
                        const clip = viewport.getBoundingClientRect();
                        const panels = [...viewport.querySelectorAll('.cardboard-player, #cardboardCenter')];
                        return panels.length === 5 && panels.every(panel => {
                            const bounds = panel.getBoundingClientRect();
                            return bounds.width > 0 && bounds.height > 0 && bounds.left >= clip.left - 2 &&
                                bounds.top >= clip.top - 2 && bounds.right <= clip.right + 2 && bounds.bottom <= clip.bottom + 2;
                        });
                    })).toBe(true);
                    const owned = await page.locator('#cardboardSeats .cardboard-player').evaluateAll(panels => panels.map(panel => ({
                        index: Number(panel.dataset.playerIndex),
                        cards: [...panel.querySelectorAll('.cardboard-card')].map(card => ({
                            name: card.dataset.cardName,
                            count: card.querySelector('.cardboard-count')?.textContent,
                            dice: card.querySelector('.cardboard-dice')?.textContent,
                            artCount: card.querySelectorAll('.cardboard-art svg').length,
                        })).sort((left, right) => left.name.localeCompare(right.name)),
                    })).sort((left, right) => left.index - right.index));
                    const expectedCards = [
                        { name: '麦畑', count: '所有 ×1', dice: '1', artCount: 1 },
                        { name: 'パン屋', count: '所有 ×1', dice: '2・3', artCount: 1 },
                    ].sort((left, right) => left.name.localeCompare(right.name));
                    expect(owned).toEqual(Array.from({ length: 4 }, (_, index) => ({ index, cards: expectedCards })));
                }
                if (['classic', 'sunset'].includes(theme) && viewport.name === 'landscape-844') {
                    await expect(page.locator('#players details.player-box-compact')).toHaveCount(3);
                }
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                await expect(page.locator('#gameScreen')).toBeVisible();
                const layout = await page.evaluate(() => {
                    const visible = element => {
                        const rect = element.getBoundingClientRect();
                        const style = getComputedStyle(element);
                        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                    };
                    const controls = [...document.querySelectorAll('#btnRoll, #btnSkip, #btnBuildShortcut')].filter(visible);
                    const rect = element => {
                        const box = element.getBoundingClientRect();
                        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
                    };
                    const hitTargets = controls.filter(element => {
                        const box = element.getBoundingClientRect();
                        const centerX = box.left + box.width / 2;
                        const centerY = box.top + box.height / 2;
                        return !element.disabled && centerX >= 0 && centerX < innerWidth &&
                            centerY >= 0 && centerY < innerHeight;
                    }).map(element => {
                        const box = element.getBoundingClientRect();
                        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                        return { id: element.id, receivesInput: target === element || element.contains(target) };
                    });
                    return {
                        viewportWidth: innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        game: rect(document.getElementById('gameScreen')),
                        controls: controls.map(element => ({ id: element.id, disabled: element.disabled, rect: rect(element) })),
                        actionable: controls.filter(element => !element.disabled).map(element => element.id),
                        hitTargets,
                    };
                });
                expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth + 1);
                expect(layout.controls.length, JSON.stringify(layout)).toBeGreaterThan(0);
                expect(layout.actionable.length, JSON.stringify(layout)).toBeGreaterThan(0);
                expect(layout.hitTargets.filter(target => !target.receivesInput), JSON.stringify(layout)).toEqual([]);
                for (const control of layout.controls) {
                    expect(control.rect.left, `${control.id} left edge`).toBeGreaterThanOrEqual(-1);
                    expect(control.rect.right, `${control.id} right edge`).toBeLessThanOrEqual(viewport.width + 1);
                }

                await expect(page).toHaveScreenshot(`${theme}-${viewport.name}.png`, {
                    animations: 'disabled',
                    caret: 'hide',
                    fullPage: false,
                    scale: 'css',
                    maxDiffPixelRatio: 0.012,
                });

            });
        }
    }
});
