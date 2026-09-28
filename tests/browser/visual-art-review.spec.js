const { test, expect } = require('@playwright/test');

async function prepareSunset(page) {
    await page.route('https://pagead2.googlesyndication.com/**', route => route.abort());
    await page.goto('/');
    await page.locator('#designThemeSelect').selectOption('sunset');
    await expect(page.locator('.title-brand-mark')).toBeVisible();
}

test('クイック開始から2人のCPU戦へ進める', async ({ page }) => {
    await prepareSunset(page);
    await expect(page.locator('.setup-quick-play')).toContainText('CPUとすぐ遊ぶ');
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const settings = await page.evaluate(() => GameSetupState.runtime.snapshot());
    expect(settings.selectedCount).toBe(2);
    expect(settings.playerSettings[0].type).toBe('human');
    expect(settings.playerSettings[1]).toMatchObject({ type: 'cpu', difficulty: 'normal' });
});

test('夕暮れタイトルと全施設・ランドマークを390pxと1440pxで描画して記録する', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await prepareSunset(page);

    for (const width of [390, 1440]) {
        await page.evaluate(() => document.getElementById('visual-art-review')?.remove());
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(async () => {
            await document.fonts.ready;
            return true;
        });
        const titleLayout = await page.evaluate(() => {
            const title = document.querySelector('.title-header').getBoundingClientRect();
            const brand = document.querySelector('.title-brand-lockup').getBoundingClientRect();
            const hero = document.querySelector('.sunset-hero img').getBoundingClientRect();
            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                titleWidth: title.width,
                brandRight: brand.right,
                heroLeft: hero.left,
            };
        });
        expect(titleLayout.viewportWidth).toBe(width);
        expect(titleLayout.documentWidth).toBeLessThanOrEqual(width + 1);
        // The mobile title intentionally sits inside the page's 16px gutters,
        // while the desktop hero has a larger editorial maximum width.
        expect(titleLayout.titleWidth).toBeGreaterThanOrEqual(Math.min(width * 0.8, 900));
        if (width >= 760) expect(titleLayout.brandRight).toBeLessThan(titleLayout.heroLeft);
        const titleScreenshotPath = testInfo.outputPath(`sunset-title-${width}.png`);
        await page.screenshot({
            path: titleScreenshotPath,
            fullPage: true,
            scale: 'css',
            animations: 'disabled',
        });
        await testInfo.attach(`sunset-title-${width}.png`, {
            path: titleScreenshotPath,
            contentType: 'image/png',
        });

        const gallery = await page.evaluate(() => {
            const cards = CARDS.map(card => renderBuildCardButton(card, 6, true));
            const names = CARDS.map(card => card.name);
            const landmarks = Player.landmarkNames().map(name => ({
                name,
                html: renderLandmarkBuildButton(name, false, Player.landmarkCost(name), false),
            }));
            return { cards, names, landmarks };
        });
        expect(gallery.cards).toHaveLength(38);
        expect(new Set(gallery.names).size).toBe(38);
        expect(gallery.landmarks).toHaveLength(6);

        const columns = width <= 480 ? 2 : 5;
        const pageSize = width <= 480 ? 6 : 15;
        const pages = [
            ...Array.from({ length: Math.ceil(gallery.cards.length / pageSize) }, (_, index) => ({
                label: `market-${index + 1}`,
                cards: gallery.cards.slice(index * pageSize, (index + 1) * pageSize),
            })),
            { label: 'landmarks', cards: gallery.landmarks.map(card => card.html) },
        ];
        for (const galleryPage of pages) {
            await page.evaluate(({ cards, columns, label }) => {
                let overlay = document.getElementById('visual-art-review');
                if (!overlay) {
                    overlay = document.createElement('main');
                    overlay.id = 'visual-art-review';
                    document.body.append(overlay);
                }
                overlay.innerHTML = `<style>
                    #visual-art-review{position:fixed;inset:0;z-index:2147483646;box-sizing:border-box;width:100vw;height:100vh;overflow:hidden;padding:8px 10px;background:#132538;color:#f8ebd1;display:flex;flex-direction:column;font-family:system-ui,sans-serif}
                    #visual-art-review .review-heading{display:flex;justify-content:space-between;gap:8px;margin:0 0 6px;font-size:13px;line-height:18px;flex:0 0 auto}
                    #visual-art-review .review-grid{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:4px 7px;align-content:start;min-height:0}
                    #visual-art-review .card-wrapper{width:100%;min-width:0;margin:0}
                    #visual-art-review .card-btn{width:100%;min-width:0}
                    #visual-art-review .card-body{padding:4px 7px 7px}
                    #visual-art-review .card-name{font-size:13px}
                    #visual-art-review .card-effect{font-size:11px;line-height:1.25}
                    #visual-art-review .card-meta-row{min-height:24px}
                    #visual-art-review .card-detail-btn{min-height:24px;padding:2px 7px;font-size:10px}
                </style><header class="review-heading"><strong>市場アートレビュー</strong><span>${label}</span></header><section class="review-grid">${cards.join('')}</section>`;
            }, { cards: galleryPage.cards, columns, label: galleryPage.label });

            const cardBounds = await page.locator('#visual-art-review .card-wrapper').evaluateAll(elements =>
                elements.map(element => {
                    const card = element.getBoundingClientRect();
                    const art = element.querySelector('.sunset-facility-art')?.getBoundingClientRect();
                    return {
                        left: card.left,
                        right: card.right,
                        top: card.top,
                        bottom: card.bottom,
                        artWidth: art?.width || 0,
                        artHeight: art?.height || 0,
                    };
                })
            );
            expect(cardBounds.length).toBeGreaterThan(0);
            expect(cardBounds.every(card => card.left >= 0 && card.right <= width && card.top >= 0 && card.bottom <= 844)).toBe(true);
            expect(cardBounds.every(card => card.artWidth > 0 && card.artHeight > 0)).toBe(true);
            const galleryScreenshotPath = testInfo.outputPath(`sunset-${width}-${galleryPage.label}.png`);
            await page.screenshot({
                path: galleryScreenshotPath,
                scale: 'css',
                animations: 'disabled',
            });
            await testInfo.attach(`sunset-${width}-${galleryPage.label}.png`, {
                path: galleryScreenshotPath,
                contentType: 'image/png',
            });
        }
    }

    await page.evaluate(() => document.getElementById('visual-art-review')?.remove());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#btnStart').click();
    await page.locator('#confirmOkBtn').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        if (width === 390) {
            const mobileOrder = await page.evaluate(() => ({
                display: getComputedStyle(document.querySelector('#gameScreen')).display,
                playerTop: document.querySelector('.player-area').getBoundingClientRect().top,
                actionTop: document.querySelector('.game-action-panel').getBoundingClientRect().top,
                buildTop: document.querySelector('#buildMenu').getBoundingClientRect().top,
                tutorialTop: document.querySelector('#tutorialBox').getBoundingClientRect().top,
                actionBottom: document.querySelector('.game-action-panel').getBoundingClientRect().bottom,
                compactPlayers: document.querySelectorAll('.player-box-compact').length,
                viewportHeight: window.innerHeight,
            }));
            expect(mobileOrder.display).toBe('grid');
            expect(mobileOrder.playerTop).toBeLessThan(mobileOrder.actionTop);
            expect(mobileOrder.actionTop).toBeLessThan(mobileOrder.buildTop);
            expect(mobileOrder.buildTop).toBeLessThan(mobileOrder.tutorialTop);
            expect(mobileOrder.compactPlayers).toBeGreaterThan(0);
            expect(mobileOrder.actionBottom).toBeLessThanOrEqual(mobileOrder.viewportHeight);
        }
        const gameplayPath = testInfo.outputPath(`sunset-gameplay-${width}.png`);
        await page.screenshot({ path: gameplayPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-gameplay-${width}.png`, {
            path: gameplayPath,
            contentType: 'image/png',
        });
    }

    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        for (const name of game.enabledLandmarks) game.players[0].landmarks[name] = true;
        render();
    });
    await expect(page.locator('.winner-screen')).toBeVisible();
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const resultPath = testInfo.outputPath(`sunset-result-${width}.png`);
        await page.screenshot({ path: resultPath, fullPage: true, animations: 'disabled' });
        await testInfo.attach(`sunset-result-${width}.png`, {
            path: resultPath,
            contentType: 'image/png',
        });
    }
});
