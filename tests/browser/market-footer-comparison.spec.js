const { test, expect, devices } = require('@playwright/test');
const fs = require('node:fs/promises');

// Optional controlled A/B diagnostic. Only the supplied real old stylesheet
// and compact-market renderer differ. This is not physical-device validation
// or a replacement for the separate strict footer clipping regression.
test('旧市場と新市場の全38施設は同じ正本と卓配置を保つ', async ({ browser }, testInfo) => {
    test.skip(!process.env.MARKET_BEFORE_STYLE || !process.env.MARKET_BEFORE_JS, '旧sourceを指定した任意比較');
    test.setTimeout(180000);
    const oldStyle = await fs.readFile(process.env.MARKET_BEFORE_STYLE);
    const oldRenderer = await fs.readFile(process.env.MARKET_BEFORE_JS);
    const report = { kind: 'controlled-old-source-comparison', physicalDevice: false, pairs: [] };
    const rectKeys = ['x', 'y', 'width', 'height'];
    const capture = async (variant, viewport) => {
        const context = await browser.newContext({ ...devices['iPhone 13'], viewport,
            baseURL: testInfo.project.use.baseURL || 'http://127.0.0.1:3210', serviceWorkers: 'block' });
        try {
            const page = await context.newPage();
            const served = { style: 0, renderer: 0 };
            if (variant === 'before') {
                await page.route('**/style.css*', route => {
                    served.style++;
                    return route.fulfill({ status: 200, contentType: 'text/css', body: oldStyle });
                });
                await page.route('**/js/uiCompactMarket.js*', route => {
                    served.renderer++;
                    return route.fulfill({ status: 200, contentType: 'application/javascript', body: oldRenderer });
                });
            }
            await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
            await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
            await page.goto('/');
            await page.evaluate(() => {
                startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
                GameRuntimeState.runtime.setCpuPlayers(Array(4).fill(null));
                cancelCpuSchedule('market-footer-comparison');
                const game = GameRuntimeState.runtime.snapshot().game;
                game.currentPlayerIndex = 0;
                game.phase = GAME_PHASES.BUILD;
                game.players.forEach((player, index) => {
                    player.name = `街${index + 1}`;
                    player.coins = 30;
                    player.cards = ['麦畑', 'パン屋', 'カフェ'].map(createCardByName);
                });
                game.log = [];
                game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
                setTutorialEnabled(false);
                render();
                acceptHotseatHandoff();
                game.currentPlayer().coins = 3;
                game.currentPlayer().cards.push(createCardByName('公園'));
                SHOP_STOCK['公園']--;
                setCardFilter('');
                game.marketSupply.pendingHighlightNames = CARDS.map(card => card.name);
                render();
            });
            const snapshot = () => page.evaluate(() => {
                const runtime = GameRuntimeState.runtime.snapshot();
                return GameSnapshot.serializeGameState(runtime.game, SHOP_STOCK, {
                    pendingActionsFor: GameManager.serializedPendingActionsFor,
                    undoState: runtime.undoState, logLimit: Number.MAX_SAFE_INTEGER,
                });
            });
            const beforeFit = await snapshot();
            // Use the normal overview action, not the retained inspection anchor
            // from a previous viewport. Both variants must show the same mode.
            const overview = page.locator('[data-cardboard-camera="overview"]');
            if (!await overview.isVisible()) await page.locator('#cardboardMoreMenu > summary').click();
            await overview.click();
            await page.evaluate(() => document.fonts.ready);
            await page.evaluate(() => new Promise((resolve, reject) => {
                let previous = '', stable = 0, frames = 0;
                const inspect = () => {
                    const viewport = document.getElementById('cardboardTableViewport');
                    const world = document.getElementById('cardboardSeats');
                    const signature = JSON.stringify([world.dataset.tableLayoutKey, viewport.dataset.tableScale,
                        viewport.scrollLeft, viewport.scrollTop, world.getBoundingClientRect().toJSON()]);
                    stable = signature === previous ? stable + 1 : 0;
                    previous = signature;
                    if (stable >= 4) resolve();
                    else if (++frames >= 120) reject(new Error('Overview geometry did not settle'));
                    else requestAnimationFrame(inspect);
                };
                requestAnimationFrame(inspect);
            }));
            const data = await page.evaluate(rectKeys => {
                const rect = element => {
                    const box = element.getBoundingClientRect();
                    return Object.fromEntries(rectKeys.map(key => [key, box[key]]));
                };
                const viewport = document.getElementById('cardboardTableViewport');
                const world = document.getElementById('cardboardSeats');
                const facilities = [...document.querySelectorAll('#cardboardMarket .compact-market-item:not(.compact-market-landmark)')];
                return {
                    mode: viewport.dataset.tableMode,
                    geometry: { world: rect(world), market: rect(document.getElementById('cardboardCenter')),
                        owners: [...world.querySelectorAll(':scope > .cardboard-player')].map(panel => ({
                            owner: panel.dataset.playerIndex, rect: rect(panel),
                            cards: [...panel.querySelectorAll('.cardboard-card')].map(card => ({ name: card.dataset.cardName, rect: rect(card) })),
                        })),
                        facilities: facilities.map(item => ({ name: item.querySelector('.compact-market-buy').dataset.cardName,
                            rect: rect(item), native: { width: item.offsetWidth, height: item.offsetHeight } })),
                    },
                    metrics: facilities.map(item => ({ name: item.querySelector('.compact-market-buy').dataset.cardName,
                        priceFont: getComputedStyle(item.querySelector('.compact-market-price-cost') || (getComputedStyle(item.querySelector('.compact-market-price-full')).display === 'none' ? item.querySelector('.compact-market-price-short') : item.querySelector('.compact-market-price-full'))).fontSize,
                        artHeight: item.querySelector('.compact-market-art').offsetHeight,
                        nameFont: getComputedStyle(item.querySelector('.compact-market-name')).fontSize,
                        stockText: item.querySelector('.compact-market-stock').textContent,
                        priceText: item.querySelector('.compact-market-price-full').textContent,
                    })),
                };
            }, rectKeys);
            expect(data.mode).toBe('overview');
            expect(data.geometry.facilities).toHaveLength(38);
            expect(data.geometry.facilities.every(item => item.native.width === 160 && item.native.height === 132)).toBe(true);
            expect(data.metrics.every(item => item.artHeight === 50 && item.nameFont === '13px' &&
                item.priceFont === (variant === 'before' ? '10px' : '14px')), JSON.stringify(data.metrics)).toBe(true);
            const canonical = await snapshot();
            expect(canonical).toEqual(beforeFit);
            if (variant === 'before') {
                expect(served.style).toBeGreaterThan(0);
                expect(served.renderer).toBeGreaterThan(0);
            }
            await page.screenshot({ path: testInfo.outputPath(`market-${variant}-${viewport.width}.png`) });
            return { ...data, canonical, served };
        } finally {
            await context.close();
        }
    };
    try {
        for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
            { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
            const before = await capture('before', viewport);
            const after = await capture('after', viewport);
            report.pairs.push({ viewport, before, after });
            expect(after.canonical, `${viewport.width}pxの正本`).toEqual(before.canonical);
            expect(after.geometry, `${viewport.width}pxの卓・所有カード・全市場施設の配置`).toEqual(before.geometry);
        }
    } finally {
        await fs.writeFile(testInfo.outputPath('market-footer-comparison.json'), JSON.stringify(report, null, 2));
    }
});
