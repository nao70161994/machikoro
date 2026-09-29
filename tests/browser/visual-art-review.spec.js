const { test, expect } = require('@playwright/test');

async function prepareSunset(page) {
    await page.route('https://pagead2.googlesyndication.com/**', route => route.abort());
    await page.goto('/');
    await page.locator('#designThemeSelect').selectOption('sunset');
    await expect(page.locator('.title-brand-mark')).toBeVisible();
}

test('夕暮れのルール説明は専用UI記号とランドマークアートを使う', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.evaluate(() => showRules());
    const modal = page.locator('#rulesModal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal-heading-icon')).toHaveCount(8);
    await expect(modal.locator('.landmark-item-art')).toHaveCount(6);
    await expect(modal.locator('.landmark-item-emoji')).toHaveCount(6);

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await modal.evaluate(element => {
            const icons = [...element.querySelectorAll('.modal-heading-icon, .landmark-item-art')];
            return {
                width: element.clientWidth,
                scrollWidth: element.scrollWidth,
                hiddenEmojiCount: [...element.querySelectorAll('.modal-heading-emoji, .landmark-item-emoji')]
                    .filter(item => getComputedStyle(item).display === 'none').length,
                visibleIconCount: icons.filter(icon => {
                    const rect = icon.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }).length,
                iconBounds: icons.map(icon => {
                    const rect = icon.getBoundingClientRect();
                    return { left: rect.left, right: rect.right };
                }),
            };
        });
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
        expect(layout.hiddenEmojiCount).toBeGreaterThanOrEqual(14);
        expect(layout.visibleIconCount).toBe(14);
        expect(layout.iconBounds.every(icon => icon.left >= 0 && icon.right <= width)).toBe(true);
        const screenshotPath = testInfo.outputPath(`sunset-rules-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-rules-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }

    await page.evaluate(() => closeRules());
    await page.evaluate(() => showCardSelect());
    const selectionModal = page.locator('#cardSelectModal');
    await expect(selectionModal).toBeVisible();
    await expect(selectionModal.locator('#cardSelectModalTitle use')).toHaveAttribute(
        'href', 'icons/interface-ui.svg#cards'
    );
    expect(await selectionModal.locator('#cardSelectModalTitle .modal-heading-emoji').evaluate(element =>
        getComputedStyle(element).display
    )).toBe('none');

    await page.evaluate(() => closeCardSelect());
    await page.locator('#designThemeSelect').selectOption('classic');
    await page.evaluate(() => showRules());
    const classicRules = page.locator('#rulesModal');
    await expect(classicRules).toBeVisible();
    expect(await classicRules.locator('.modal-heading-icon').first().evaluate(element =>
        getComputedStyle(element).display
    )).toBe('none');
    expect(await classicRules.locator('.modal-heading-emoji').first().evaluate(element =>
        getComputedStyle(element).display
    )).not.toBe('none');
});

test('クイック開始から2人のCPU戦へ進める', async ({ page }) => {
    await prepareSunset(page);
    await expect(page.locator('#tabLocal')).toHaveText('この端末');
    await expect(page.locator('#tabOnline')).toHaveText('オンライン');
    await expect(page.locator('.setup-quick-play')).toContainText('CPUとすぐ遊ぶ');
    await expect(page.locator('#customGameSetup')).toHaveJSProperty('open', false);
    await expect(page.locator('#playerCount')).toBeHidden();
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const settings = await page.evaluate(() => GameSetupState.runtime.snapshot());
    expect(settings.selectedCount).toBe(2);
    expect(settings.playerSettings[0].type).toBe('human');
    expect(settings.playerSettings[1]).toMatchObject({ type: 'cpu', difficulty: 'normal' });
});

test('必要なら詳細設定を開いて人数を変え、その設定で開始できる', async ({ page }) => {
    await prepareSunset(page);
    const customSetup = page.locator('#customGameSetup');
    const setupSummary = page.locator('#customGameSetup > summary');
    await expect(setupSummary).toContainText('家族・友人と遊ぶ');
    await expect(setupSummary).toContainText('同じ端末で対戦');
    await expect(customSetup).toHaveJSProperty('open', false);
    await page.locator('#customGameSetup > summary').click();
    await expect(customSetup.locator('#playerCount')).toBeVisible();
    await page.locator('[data-ui-action="changeCount"][data-delta="1"]').click();
    await expect(page.locator('#playerCount')).toHaveText('3人');
    await page.locator('#btnStart').click();
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.locator('#confirmOkBtn').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const settings = await page.evaluate(() => GameSetupState.runtime.snapshot());
    expect(settings.selectedCount).toBe(3);
});

test('オンラインの作成・参加導線をスマホとデスクトップで記録する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('#tabOnline').click();
    await expect(page.locator('#tabContentOnline')).toBeVisible();

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await page.evaluate(() => ({
            viewportWidth: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            nameWidth: document.querySelector('#playerNameInput').getBoundingClientRect().width,
            createHeight: document.querySelector('#onlineCreateSubmitButton').getBoundingClientRect().height,
            readinessOpen: document.querySelector('.online-readiness').open,
        }));
        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.nameWidth).toBeGreaterThan(0);
        expect(layout.createHeight).toBeGreaterThanOrEqual(44);
        expect(layout.readinessOpen).toBe(false);
        const createPath = testInfo.outputPath(`sunset-online-create-${width}.png`);
        await page.screenshot({ path: createPath, fullPage: true, scale: 'css', animations: 'disabled' });
        await testInfo.attach(`sunset-online-create-${width}.png`, { path: createPath, contentType: 'image/png' });

        await page.locator('#onlineTabJoin').click();
        const joinButton = page.locator('#onlineJoinSubmitButton');
        await expect(joinButton).toBeVisible();
        expect(await joinButton.evaluate(element => element.getBoundingClientRect().height))
            .toBeGreaterThanOrEqual(44);
        const joinPath = testInfo.outputPath(`sunset-online-join-${width}.png`);
        await page.screenshot({ path: joinPath, fullPage: true, scale: 'css', animations: 'disabled' });
        await testInfo.attach(`sunset-online-join-${width}.png`, { path: joinPath, contentType: 'image/png' });
        await page.locator('#onlineTabCreate').click();
    }
});

test('夕暮れ市場は出目・名称を主役にし価格を明確なチップで示す', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('#logSummary')).not.toContainText('👤');
    await expect(page.locator('#log')).not.toContainText('👤');
    await expect(page.locator('.player-box.active .player-landmarks .landmark-badge:not(.built)')).toHaveCount(0);

    for (const width of [320, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const cards = await page.locator('#buildMenu .card-btn').evaluateAll(elements => elements.map(card => {
            const styles = selector => getComputedStyle(card.querySelector(selector));
            const cost = card.querySelector('.card-cost');
            const costStyle = getComputedStyle(cost);
            const cardBounds = card.getBoundingClientRect();
            const costBounds = cost.getBoundingClientRect();
            return {
                cardFits: card.scrollWidth <= card.clientWidth && cardBounds.left >= 0 && cardBounds.right <= document.documentElement.clientWidth,
                diceSize: parseFloat(styles('.card-dice-num').fontSize),
                nameSize: parseFloat(styles('.card-name').fontSize),
                effectSize: parseFloat(styles('.card-effect').fontSize),
                categorySize: parseFloat(styles('.card-category-tag').fontSize),
                costHasBadge: costStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && costStyle.borderRadius !== '0px',
                costFits: costBounds.left >= cardBounds.left && costBounds.right <= cardBounds.right,
            };
        }));

        expect(cards.length).toBeGreaterThan(0);
        expect(cards.every(card => card.cardFits && card.costFits && card.costHasBadge)).toBe(true);
        expect(cards.every(card => card.diceSize > card.categorySize && card.nameSize > card.effectSize && card.effectSize > card.categorySize)).toBe(true);
        if (width === 390) {
            const screenshotPath = testInfo.outputPath('sunset-card-hierarchy-390.png');
            await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
            await testInfo.attach('sunset-card-hierarchy-390.png', { path: screenshotPath, contentType: 'image/png' });
        }
    }
});

test('夕暮れのカード詳細は専用記号を使いスマホとデスクトップで記録する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const detailButton = page.locator('#buildMenu .card-detail-btn').first();
    await detailButton.click();
    const modal = page.locator('#cardDetailModal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.card-detail-coin')).toHaveCount(1);
    await expect(modal.locator('.card-detail-dice')).toHaveCount(1);
    await expect(modal).not.toContainText(/[💰🎲]/u);
    await expect(modal.locator('.modal-header h2')).toHaveCSS('color', 'rgb(255, 225, 166)');

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const dimensions = await modal.locator('.modal-content').evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, width: bounds.width };
        });
        expect(dimensions.left).toBeGreaterThanOrEqual(0);
        expect(dimensions.right).toBeLessThanOrEqual(width);
        expect(dimensions.width).toBeGreaterThan(0);
        const screenshotPath = testInfo.outputPath(`sunset-card-detail-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-card-detail-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }
});

test('夕暮れの駅選択は専用施設アートとダイス記号で表示する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const diceChoice = page.locator('#visualDiceChoice');
    await page.evaluate(() => {
        const container = document.createElement('div');
        container.id = 'visualDiceChoice';
        container.style.cssText = 'position:fixed;top:35%;left:50%;transform:translateX(-50%);width:min(480px,calc(100vw - 20px));z-index:99999;';
        container.innerHTML = UiDiceChoice.buildHtml({
            phase: GAME_PHASES.SELECT_DICE,
            lastDiceResult: 0,
            allowedActions: new Set(['selectDice']),
            disabledAttr: () => '',
            phases: GAME_PHASES,
            useSunsetIcons: true,
        });
        document.body.appendChild(container);
    });
    await expect(diceChoice).toContainText('駅：何個振りますか？');
    await expect(diceChoice.locator('.dice-choice-facility-mark use')).toHaveAttribute('href', 'icons/facility-art.svg#station');
    await expect(diceChoice.locator('.dice-choice-die-mark')).toHaveCount(3);
    await expect(diceChoice.locator('.dice-choice-double .dice-choice-label small')).toHaveText('合計を使う');
    await expect(diceChoice).not.toContainText(/[🚉🎲]/u);

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await diceChoice.scrollIntoViewIfNeeded();
        const doubleButton = diceChoice.locator('.dice-choice-double');
        const buttonFits = await doubleButton.evaluate((button) => button.scrollWidth <= button.clientWidth);
        expect(buttonFits, `double-dice label should fit at ${width}px`).toBe(true);
        const screenshotPath = testInfo.outputPath(`sunset-station-choice-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-station-choice-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }
});

test('夕暮れの施設効果パネルは施設アートと統一色で表示する', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        const fixture = document.createElement('div');
        fixture.id = 'visualPendingModal';
        fixture.className = 'pending-modal';
        fixture.style.display = 'flex';
        const inner = document.createElement('div');
        inner.className = 'pending-modal-inner';
        const menu = document.createElement('div');
        menu.innerHTML = UiPendingMenu.buildPendingTvHtml({
            currentPlayerIndex: 0,
            players: [{ name: 'プレイヤー1', coins: 3 }, { name: 'プレイヤー2', coins: 8 }],
        }, value => String(value), undefined, undefined, true);
        inner.appendChild(menu);
        fixture.appendChild(inner);
        document.body.appendChild(fixture);
    });

    const modal = page.locator('#visualPendingModal');
    await expect(modal.locator('.pending-facility-mark use')).toHaveAttribute('href', 'icons/facility-art.svg#tv-station');
    await expect(modal).not.toContainText('📺');
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const bounds = await modal.locator('.pending-modal-inner').evaluate(element => {
            const rect = element.getBoundingClientRect();
            const hint = element.querySelector('.pending-inspect-hint');
            return {
                left: rect.left,
                right: rect.right,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                borderColor: getComputedStyle(element).borderTopColor,
                hintColor: getComputedStyle(hint).color,
                hintHeight: hint.getBoundingClientRect().height,
                headingHeight: element.querySelector('.pending-heading').getBoundingClientRect().height,
            };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(-1);
        expect(bounds.right).toBeLessThanOrEqual(width + 1);
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
        expect(bounds.borderColor).toBe('rgb(209, 166, 78)');
        expect(bounds.hintColor).toBe('rgb(201, 213, 216)');
        if (width === 390) expect(bounds.hintHeight).toBeLessThanOrEqual(64);
        if (width === 1440) expect(bounds.headingHeight).toBeLessThanOrEqual(30);
        const screenshotPath = testInfo.outputPath(`sunset-tv-pending-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-tv-pending-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }
});

test('デスクトップでは街の建物アートを広く見せる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();

    const town = page.locator('.player-box.active .sunset-town');
    const firstBuilding = town.locator('.town-street > .town-building').first();
    await expect(firstBuilding).toBeVisible();
    await expect.poll(() => firstBuilding.evaluate(element =>
        element.getBoundingClientRect().width
    )).toBeGreaterThanOrEqual(108);
    const bounds = await firstBuilding.evaluate(element => {
        const card = element.getBoundingClientRect();
        const art = element.querySelector('.sunset-facility-art').getBoundingClientRect();
        return { width: card.width, artHeight: art.height, cardRight: card.right };
    });
    expect(bounds.width).toBeGreaterThanOrEqual(108);
    expect(bounds.artHeight).toBeGreaterThanOrEqual(72);
    expect(bounds.cardRight).toBeLessThanOrEqual(1440);

    const screenshotPath = testInfo.outputPath('sunset-desktop-city-1440.png');
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-desktop-city-1440.png', { path: screenshotPath, contentType: 'image/png' });
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
            const localPanel = document.querySelector('#tabContentLocal').getBoundingClientRect();
            const about = document.querySelector('.title-about').getBoundingClientRect();
            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                titleWidth: title.width,
                brandRight: brand.right,
                heroLeft: hero.left,
                localToAboutGap: about.top - localPanel.bottom,
            };
        });
        expect(titleLayout.viewportWidth).toBe(width);
        expect(titleLayout.documentWidth).toBeLessThanOrEqual(width + 1);
        // The mobile title intentionally sits inside the page's 16px gutters,
        // while the desktop hero has a larger editorial maximum width.
        expect(titleLayout.titleWidth).toBeGreaterThanOrEqual(Math.min(width * 0.8, 900));
        if (width >= 760) expect(titleLayout.brandRight).toBeLessThan(titleLayout.heroLeft);
        else expect(titleLayout.localToAboutGap).toBeLessThanOrEqual(32);
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
    await page.locator('#customGameSetup > summary').click();
    await page.locator('#btnStart').click();
    await page.locator('#confirmOkBtn').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.waitForTimeout(500);
    const updateBanner = page.locator('#pwaUpdateBanner');
    if (await updateBanner.isVisible()) {
        await updateBanner.locator('[data-ui-action="hidePwaUpdateBanner"]').click();
    }
    await expect(updateBanner).toBeHidden();
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        if (width === 390) {
            const mobileOrder = await page.evaluate(() => ({
                display: getComputedStyle(document.querySelector('#gameScreen')).display,
                buildIconVisible: document.querySelector('#buildMenu h3 .build-menu-heading-icon')
                    .getBoundingClientRect().width > 0,
                buildEmojiDisplay: getComputedStyle(document.querySelector('#buildMenu h3 .build-menu-heading-emoji')).display,
                playerTop: document.querySelector('.player-area').getBoundingClientRect().top,
                actionTop: document.querySelector('.game-action-panel').getBoundingClientRect().top,
                rollBottom: document.querySelector('#btnRoll').getBoundingClientRect().bottom,
                toolbarTop: document.querySelector('.game-action-toolbar').getBoundingClientRect().top,
                buildTop: document.querySelector('#buildMenu').getBoundingClientRect().top,
                timelineTop: document.querySelector('#turnTimeline').getBoundingClientRect().top,
                tutorialTop: document.querySelector('#tutorialBox').getBoundingClientRect().top,
                actionBottom: document.querySelector('.game-action-panel').getBoundingClientRect().bottom,
                compactPlayers: document.querySelectorAll('.player-box-compact').length,
                viewportHeight: window.innerHeight,
            }));
            expect(mobileOrder.display).toBe('grid');
            expect(mobileOrder.buildIconVisible).toBe(true);
            expect(mobileOrder.buildEmojiDisplay).toBe('none');
            expect(mobileOrder.playerTop).toBeLessThan(mobileOrder.actionTop);
            expect(mobileOrder.rollBottom).toBeLessThan(mobileOrder.toolbarTop);
            expect(mobileOrder.toolbarTop).toBeLessThan(mobileOrder.buildTop);
            expect(mobileOrder.actionTop).toBeLessThan(mobileOrder.buildTop);
            expect(mobileOrder.buildTop).toBeLessThan(mobileOrder.timelineTop);
            expect(mobileOrder.timelineTop).toBeLessThan(mobileOrder.tutorialTop);
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
