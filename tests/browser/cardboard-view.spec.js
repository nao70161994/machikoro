const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function prepare(page, viewport, count = 4, controlledCards = true) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { if (!localStorage.getItem('machikoroDesignTheme')) localStorage.setItem('machikoroDesignTheme', 'cardboard'); });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(({ count, controlledCards }) => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: index ? 'cpu' : 'human', difficulty: 'normal', name: `街${index + 1}` })));
        const state = GameRuntimeState.runtime.snapshot();
        // This fixture replaces the shuffled CPU session with controlled human
        // seats. Give presentation controllers the new session identity too.
        GameRuntimeState.runtime.setCpuPlayers(Array.from({ length: count }, () => null));
        cancelCpuSchedule('cardboard-view');
        state.game.currentPlayerIndex = 0;
        state.game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            if (controlledCards) player.cards = Array.from({ length: index ? 2 : 4 }, () => createCardByName(index ? 'カフェ' : '麦畑'));
            player.coins = 30;
        });
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, { count, controlledCards });
}
const state = page => page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
async function selectTheme(page, theme) {
    await page.evaluate(theme => {
        const select = document.getElementById('gameDesignThemeSelect');
        select.value = theme;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-design', theme);
}

test('同じ出目で連鎖した施設カードを発動順に強調する', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await prepare(page, { width: 844, height: 390 }, 4, false);
    const sequence = await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = [createCardByName('パン屋')];
        game.players[1].cards = [createCardByName('カフェ')];
        game.players[2].cards = [createCardByName('カフェ')];
        game.players[3].cards = [createCardByName('カフェ')];
        render();
        acceptHotseatHandoff();
        game.rollDice(3);
        render();
        const selectors = [
            '#cardboardSeats [data-player-index="3"] [data-card-name="カフェ"]',
            '#cardboardSeats [data-player-index="2"] [data-card-name="カフェ"]',
            '#cardboardSeats [data-player-index="1"] [data-card-name="カフェ"]',
            '#cardboardSeats [data-player-index="0"] [data-card-name="パン屋"]',
        ];
        return {
            rolling: document.getElementById('cardboardBoard').classList.contains('cardboard-new-roll'),
            transferSummary: document.querySelector('#cardboardDiceReceipt .cardboard-transfer-summary-inline')?.textContent || '',
            cards: selectors.map(selector => {
                const card = document.querySelector(selector);
                return { active: card.classList.contains('cardboard-card-activated'),
                    order: card.dataset.cardboardActivationOrder, delay: getComputedStyle(card).animationDelay,
                    animation: getComputedStyle(card).animationName };
            }),
        };
    });
    await page.waitForTimeout(120);
    const screenshot = testInfo.outputPath('cardboard-chain-activation.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('施設連鎖の発動順演出', { path: screenshot, contentType: 'image/png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const portraitScreenshot = testInfo.outputPath('cardboard-chain-activation-portrait.png');
    await page.screenshot({ path: portraitScreenshot });
    await testInfo.attach('施設連鎖の縦持ちレシート配置', { path: portraitScreenshot, contentType: 'image/png' });
    expect(sequence.rolling).toBe(true);
    expect(sequence.transferSummary).toContain('街1→街4 1');
    expect(sequence.cards.every(card => card.active)).toBe(true);
    expect(sequence.cards.map(card => card.order)).toEqual(['0', '1', '2', '3']);
    expect(sequence.cards.map(card => card.delay)).toEqual(['0s', '0.1s', '0.2s', '0.3s']);
    expect(sequence.cards.every(card => card.animation === 'cardboard-activation-chain')).toBe(true);
    await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
});

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`カード盤面は4ビュー切替でも同一状態と共有市場を保つ ${viewport.width}`, async ({ page }, testInfo) => {
        await prepare(page, viewport);
        const before = await state(page);
        for (const theme of ['plaza', 'sunset', 'classic', 'cardboard']) {
            await selectTheme(page, theme);
            expect(await state(page)).toEqual(before);
        }
        const expectedSeats = viewport.width < 761 && viewport.height > viewport.width ? 2 : 4;
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(expectedSeats);
        await expect(page.locator('#cardboardMarket #buildMenu')).toHaveCount(0);
        await expect(page.locator('#buildMenu')).toHaveCount(1);
        await expect(page.locator('#cardboardMarket [data-action="buildLandmark"]')).not.toHaveCount(0);
        await expect(page.locator('#cardboardSeats [data-player-index="0"] .cardboard-count')).toHaveText('所有 ×4');
        await page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]').click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await expect(page.locator('#cardDetailModal')).toContainText('駅');
        await page.keyboard.press('Escape');
        await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.rollDice(3); render(); acceptHotseatHandoff(); });
        await expect(page.locator('#cardboardDiceReceipt')).toContainText('出目 3');
        await expect(page.locator('#gameLogContainer')).not.toHaveClass(/plaza-panel-open/);
        if (viewport.width === 844) {
            await expect(page.locator('#cardboardDiceReceipt .plaza-receipt-details')).toBeVisible();
            const receiptSummary = await page.locator('#cardboardDiceReceipt .plaza-receipt-details > summary').boundingBox();
            expect(receiptSummary.width).toBeGreaterThanOrEqual(44);
            expect(receiptSummary.height).toBeGreaterThanOrEqual(44);
            const landscapeCardArt = await page.locator('#cardboardSeats [data-seat-position="top"], #cardboardSeats [data-seat-position="bottom"]')
                .evaluateAll(panels => panels.flatMap(panel => [...panel.querySelectorAll('.cardboard-card')].map(card => {
                    const art = card.querySelector('.cardboard-art');
                    return { visible: getComputedStyle(art).display !== 'none', height: art.getBoundingClientRect().height,
                        hasEvent: Boolean(card.querySelector('.cardboard-dormant, .cardboard-activation')) };
                })));
            expect(landscapeCardArt.length).toBeGreaterThan(0);
            expect(landscapeCardArt.every(card => card.visible)).toBe(true);
            expect(landscapeCardArt.some(card => card.height >= 28)).toBe(true);
            expect(landscapeCardArt.filter(card => card.hasEvent).every(card => card.height >= 24), JSON.stringify(landscapeCardArt)).toBe(true);
            const visibleMarketArt = await page.locator('#cardboardMarket .compact-market-art').first().evaluate(art => {
                const center = document.getElementById('cardboardCenter').getBoundingClientRect();
                const bounds = art.getBoundingClientRect();
                return Math.max(0, Math.min(center.bottom, bounds.bottom) - Math.max(center.top, bounds.top));
            });
            expect(visibleMarketArt).toBeGreaterThanOrEqual(20);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const screenshot = testInfo.outputPath(`cardboard-${viewport.width}.png`);
        await page.screenshot({ path: screenshot });
        await testInfo.attach(`cardboard-${viewport.width}`, { path: screenshot, contentType: 'image/png' });
    });
}

test('2人戦のカード盤面はPC・縦持ち・横持ちで街と市場を優先して見せる', async ({ page }, testInfo) => {
    const viewports = [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'portrait', width: 390, height: 844 },
        { name: 'landscape', width: 844, height: 390 },
    ];
    await prepare(page, viewports[0], 2);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.phase = GAME_PHASES.BUILD;
        render();
    });
    await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
    for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.evaluate(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        });
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(2);
        await expect(page.locator('#cardboardMarket')).toBeVisible();
        const layout = await page.evaluate(() => {
            const rect = element => {
                const box = element.getBoundingClientRect();
                return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
            };
            const players = [...document.querySelectorAll('#cardboardSeats > .cardboard-player')];
            const art = [...document.querySelectorAll('#cardboardSeats .cardboard-art')];
            return {
                players: players.map(rect), market: rect(document.getElementById('cardboardMarket')),
                selfTop: rect(document.querySelector('#cardboardSeats .cardboard-player-self')).top,
                selectedTop: rect(document.querySelector('#cardboardSeats .cardboard-player-selected')).top,
                artHeights: art.map(element => element.getBoundingClientRect().height),
                viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            };
        });
        expect(layout.players).toHaveLength(2);
        expect(layout.artHeights.some(height => height >= 22), JSON.stringify(layout)).toBe(true);
        expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth + 1);
        await expect(page.locator('#cardboardSeats [data-player-index="1"]')).toHaveClass(/cardboard-player-selected/);
        if (viewport.name === 'portrait') {
            expect(layout.selfTop).toBeLessThan(layout.selectedTop);
            expect(layout.selectedTop).toBeLessThan(layout.market.top);
        }
        const screenshot = testInfo.outputPath(`cardboard-2p-${viewport.name}.png`);
        await page.screenshot({ path: screenshot, fullPage: viewport.name === 'portrait' });
        await testInfo.attach(`2人戦 ${viewport.name}`, { path: screenshot, contentType: 'image/png' });
        await page.locator('#btnBuildShortcut').click();
        const marketCard = await page.locator('#cardboardMarket .compact-market-item').first().boundingBox();
        expect(marketCard, `${viewport.name}: market card should be brought into view`).not.toBeNull();
        expect(marketCard.y, `${viewport.name}: market card should be brought into view`).toBeGreaterThanOrEqual(0);
        expect(marketCard.y + marketCard.height, `${viewport.name}: market card should fit in the viewport`)
            .toBeLessThanOrEqual(viewport.height);
        const marketScreenshot = testInfo.outputPath(`cardboard-2p-${viewport.name}-market-focus.png`);
        await page.screenshot({ path: marketScreenshot });
        await testInfo.attach(`2人戦 ${viewport.name} 市場へ移動`, { path: marketScreenshot, contentType: 'image/png' });
    }
});

test('4人戦の縦持ちは自分と選択相手を市場の前に切り替えて表示する', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 }, 4);
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(2);
    await page.locator('#cardboardRoster [data-cardboard-player-index="3"]').click();
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(2);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toBeVisible();
    await expect(page.locator('#cardboardSeats [data-player-index="3"]')).toHaveClass(/cardboard-player-selected/);
    const layout = await page.evaluate(() => ({
        self: document.querySelector('#cardboardSeats .cardboard-player-self').getBoundingClientRect().top,
        selected: document.querySelector('#cardboardSeats .cardboard-player-selected').getBoundingClientRect().top,
        market: document.getElementById('cardboardMarket').getBoundingClientRect().top,
        hiddenOpponent: document.querySelector('#cardboardSeats [data-player-index="1"]') === null,
    }));
    expect(layout.self).toBeLessThan(layout.selected);
    expect(layout.selected).toBeLessThan(layout.market);
    expect(layout.hiddenOpponent).toBe(true);
    const screenshot = testInfo.outputPath('cardboard-4p-portrait-selected-city.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('4人戦の縦持ちで選んだ街と市場', { path: screenshot, contentType: 'image/png' });
});

test('ゲーム中に隠れたインストール案内はカード盤面の高さを使わない', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 }, 4);
    await page.evaluate(() => {
        document.getElementById('pwaInstallBanner').style.display = 'block';
        document.getElementById('pwaUpdateBanner').style.display = 'none';
        document.body.classList.add('pwa-banner-open');
    });
    await expect(page.locator('#pwaInstallBanner')).toBeHidden();
    const installState = await page.evaluate(() => ({
        maxHeight: getComputedStyle(document.getElementById('gameScreen')).maxHeight,
        overflow: getComputedStyle(document.getElementById('gameScreen')).overflow,
        gameBottom: document.getElementById('gameScreen').getBoundingClientRect().bottom,
        boardBottom: document.getElementById('cardboardBoard').getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
    }));
    expect(installState.maxHeight).toBe('none');
    expect(installState.overflow).toBe('visible');
    expect(installState.boardBottom).toBeLessThanOrEqual(installState.viewportHeight);
    expect(installState.gameBottom).toBeGreaterThanOrEqual(installState.boardBottom);
    const screenshot = testInfo.outputPath('cardboard-install-banner-hidden-landscape.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('案内が隠れた横持ち盤面', { path: screenshot, contentType: 'image/png' });

    await page.evaluate(() => {
        document.getElementById('pwaInstallBanner').style.display = 'none';
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });
    const updateMaxHeight = await page.locator('#gameScreen').evaluate(element => getComputedStyle(element).maxHeight);
    expect(updateMaxHeight).not.toBe('none');
});

test('4人戦の後半は施設が増えてもカード列をスクロールして読める', async ({ page }, testInfo) => {
    const viewports = [
        { name: 'desktop', width: 1440, height: 936 },
        { name: 'landscape', width: 844, height: 390 },
        { name: 'portrait', width: 390, height: 844 },
    ];
    await prepare(page, viewports[0], 4, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        const cardNames = CARDS.slice(0, 12).map(card => card.name);
        const landmarks = Array.from(getEnabledLandmarkSelection()).slice(0, 5);
        game.turnCount = 48;
        game.phase = GAME_PHASES.BUILD;
        game.players.forEach((player, index) => {
            player.coins = 28 + index * 7;
            player.cards = Array.from({ length: 12 }, (_, cardIndex) =>
                createCardByName(cardNames[(cardIndex + index * 3) % cardNames.length]));
            landmarks.forEach(name => { player.landmarks[name] = true; });
        });
        render();
    });
    for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const layout = await page.evaluate(() => {
            const panels = [...document.querySelectorAll('#cardboardSeats > .cardboard-player')];
            const cards = panels.map(panel => {
                const list = panel.querySelector('.cardboard-cards');
                const style = getComputedStyle(list);
                return {
                    seat: panel.dataset.seatPosition,
                    count: panel.querySelectorAll('.cardboard-card').length,
                    clientWidth: list.clientWidth, scrollWidth: list.scrollWidth,
                    clientHeight: list.clientHeight, scrollHeight: list.scrollHeight,
                    scrollbar: style.scrollbarWidth,
                    artHeights: [...list.querySelectorAll('.cardboard-art')].map(art => art.getBoundingClientRect().height),
                };
            });
            return { cards, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
        });
        expect(layout.cards).toHaveLength(4);
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.cards.every(cards => cards.count >= 8), JSON.stringify(layout)).toBe(true);
        expect(layout.cards.flatMap(cards => cards.artHeights).every(height => height >= 20), JSON.stringify(layout)).toBe(true);
        if (viewport.width >= 761) {
            const horizontalLists = layout.cards.filter(cards => ['top', 'bottom'].includes(cards.seat));
            expect(horizontalLists.every(cards => cards.scrollWidth > cards.clientWidth), JSON.stringify(layout)).toBe(true);
            expect(horizontalLists.every(cards => cards.scrollbar === 'thin'), JSON.stringify(layout)).toBe(true);
        } else {
            expect(layout.cards.every(cards => cards.scrollWidth > cards.clientWidth || cards.scrollHeight > cards.clientHeight), JSON.stringify(layout)).toBe(true);
        }
        const screenshot = testInfo.outputPath(`cardboard-late-4p-${viewport.name}.png`);
        await page.screenshot({ path: screenshot, fullPage: viewport.name === 'portrait' });
        await testInfo.attach(`4人後半 ${viewport.name}`, { path: screenshot, contentType: 'image/png' });
    }
});

test('10人のカード盤面は自分・手番・選択相手を読める大きさで表示する', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    await expect(page.locator('#cardboardRoster button')).toHaveCount(10);
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(3);
    await expect(page.locator('#cardboardSeats [data-player-index="1"]')).toBeVisible();
    await expect(page.locator('#cardboardSeats [data-player-index="2"]')).toBeVisible();
    await expect(page.locator('#cardboardRoster .cardboard-roster-trend')).toHaveCount(10);
    const chips = page.locator('#cardboardRoster button').first().locator('.cardboard-color-count');
    await expect(chips).toHaveCount(4);
    await page.locator('#cardboardRoster [data-cardboard-player-index="9"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="9"]')).toBeVisible();
    await expect(page.locator('#cardboardSeats [data-player-index="9"]')).toHaveClass(/cardboard-player-selected/);
    expect(await page.locator('#cardboardSeats > .cardboard-player').count()).toBeLessThanOrEqual(3);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toBeVisible();
    await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    });
    const portraitOrder = await page.evaluate(() => ({
        self: document.querySelector('#cardboardSeats .cardboard-player-self').getBoundingClientRect().top,
        selected: document.querySelector('#cardboardSeats .cardboard-player-selected').getBoundingClientRect().top,
        market: document.getElementById('cardboardCenter').getBoundingClientRect().top,
    }));
    expect(portraitOrder.self).toBeLessThan(portraitOrder.selected);
    expect(portraitOrder.selected).toBeLessThan(portraitOrder.market);
    const portraitScreenshot = testInfo.outputPath('cardboard-10p-portrait.png');
    await page.screenshot({ path: portraitScreenshot });
    await testInfo.attach('10人戦の縦持ちカード盤面', { path: portraitScreenshot, contentType: 'image/png' });
    const before = await state(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    });
    const landscapeScreenshot = testInfo.outputPath('cardboard-10p-landscape.png');
    await page.screenshot({ path: landscapeScreenshot });
    await testInfo.attach('10人戦の横持ちカード盤面', { path: landscapeScreenshot, contentType: 'image/png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await state(page)).toEqual(before);
});

for (const width of [320, 390, 1440]) {
    test(`カテゴリ4色はカード面とラベル付きrosterで識別できる ${width}`, async ({ page }, testInfo) => {
        await prepare(page, { width, height: 936 }, 10);
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.players[0].cards = ['blue', 'green', 'red', 'purple'].map(color =>
                createCardByName(CARDS.find(card => card.color === color).name));
            render();
        });
        const cards = page.locator('#cardboardSeats [data-player-index="0"] .cardboard-card');
        await expect(cards).toHaveCount(4);
        const backgrounds = await cards.evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
        expect(new Set(backgrounds).size).toBe(4);
        const chips = page.locator('#cardboardRoster button').first().locator('.cardboard-color-count');
        await expect(chips).toHaveText(['青 1', '緑 1', '赤 1', '紫 1']);
        expect(await chips.evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
        expect(await cards.evaluateAll(elements => elements.every(element => element.textContent.includes('手番')))).toBe(true);
        await page.locator('#cardboardSeats [data-player-index="0"]').scrollIntoViewIfNeeded();
        const screenshot = testInfo.outputPath(`category-colors-${width}.png`);
        await page.screenshot({ path: screenshot });
        await testInfo.attach('category-colors', { path: screenshot, contentType: 'image/png' });
    });
}

test('専用市場との高速往復は正本とランドマーク操作のフォーカスを維持する', async ({ page }) => {
    await prepare(page, { width: 1440, height: 936 });
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD; render(); acceptHotseatHandoff(); });
    const before = await state(page);
    const result = await page.evaluate(() => {
        const market = document.getElementById('buildMenu');
        document.querySelector('#cardboardMarket .compact-market-goal-disclosure').open = true;
        const landmark = document.querySelector('#cardboardMarket [data-action="buildLandmark"]');
        landmark.focus();
        const checks = [{ singleMarket: true, sameFocus: document.activeElement === landmark,
            active: document.activeElement.outerHTML.slice(0, 300), initial: true }];
        for (let index = 0; index < 20; index++) {
            const select = document.getElementById('gameDesignThemeSelect');
            select.value = index % 2 ? 'cardboard' : 'plaza';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            checks.push({
                singleMarket: document.querySelectorAll('#buildMenu').length === 1 && document.getElementById('buildMenu') === market,
                sameFocus: document.activeElement?.dataset.action === 'buildLandmark' &&
                    document.activeElement?.dataset.landmarkName === landmark.dataset.landmarkName,
                active: document.activeElement.outerHTML.slice(0, 300),
                connected: document.activeElement.isConnected,
                disabled: document.activeElement.disabled,
            });
        }
        return checks;
    });
    expect(result.filter(check => !check.singleMarket || !check.sameFocus)).toEqual([]);
    expect(await state(page)).toEqual(before);
});

test('購入とUndo・保存再開はカード盤面と既存ビューで共通の状態を使う', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 4, false);
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD; render(); acceptHotseatHandoff(); });
    const before = await state(page);
    await page.locator('#cardboardMarket [data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"] .cardboard-count')).toHaveText('所有 ×2');
    const built = await state(page);
    await selectTheme(page, 'plaza');
    expect(await state(page)).toEqual(built);
    await selectTheme(page, 'cardboard');
    await page.locator('#cardboardMarket .undo-btn').click();
    await page.locator('#confirmOkBtn').click();
    expect(await state(page)).toEqual(before);
    await page.evaluate(() => saveGameState());
    await selectTheme(page, 'sunset');
    await page.reload();
    await page.locator('#btnResume').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-design', 'sunset');
    expect(await state(page)).toEqual(before);
    await selectTheme(page, 'cardboard');
    expect(await state(page)).toEqual(before);
});

test('ランドマーク完成は新しい建設だけを短く祝う', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 });
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD; render(); });
    await selectTheme(page, 'cardboard');
    const station = page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]');
    await expect(station).toHaveClass(/cardboard-landmark-unbuilt/);
    await page.locator('#cardboardMarket .compact-market-goal-disclosure').evaluate(element => { element.open = true; });
    await page.locator('#cardboardMarket [data-action="buildLandmark"][data-landmark-name="駅"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).toHaveClass(/cardboard-landmark-built/);
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).toHaveClass(/cardboard-landmark-newly-built/);
    await selectTheme(page, 'plaza');
    await selectTheme(page, 'cardboard');
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).not.toHaveClass(/cardboard-landmark-newly-built/);
});

test('にぎわい広場の勝利画面はPC幅で街と結果を中央に読める大きさで表示する', async ({ page }) => {
    await prepare(page, { width: 1440, height: 900 }, 2, false);
    await page.evaluate(() => {
        const state = GameRuntimeState.runtime.snapshot();
        cancelCpuSchedule('cardboard-winner-layout');
        state.game.currentPlayerIndex = 0;
        for (const name of getEnabledLandmarkSelection()) state.game.players[0].landmarks[name] = true;
        render();
    });
    await expect(page.locator('.winner-screen')).toBeVisible();
    const geometry = await page.evaluate(() => {
        const screen = document.querySelector('.winner-screen').getBoundingClientRect();
        const screenElement = document.querySelector('.winner-screen');
        const title = document.querySelector('.winner-title').getBoundingClientRect();
        const status = document.getElementById('status');
        const game = document.getElementById('gameScreen');
        const body = document.body;
        const rect = element => { const bounds = element.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; };
        return { screen: { x: screen.x, y: screen.y, width: screen.width,
                css: { width: getComputedStyle(screenElement).width, maxWidth: getComputedStyle(screenElement).maxWidth,
                    margin: getComputedStyle(screenElement).marginInline, alignSelf: getComputedStyle(screenElement).alignSelf } },
            title: { x: title.x, y: title.y, width: title.width },
            status: { ...rect(status), scrollTop: status.scrollTop, overflowY: getComputedStyle(status).overflowY },
            game: { ...rect(game), scrollTop: game.scrollTop, overflowY: getComputedStyle(game).overflowY },
            body: rect(body), scrollY,
            scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    });
    expect(geometry.screen.width, JSON.stringify(geometry)).toBeGreaterThanOrEqual(400);
    expect(geometry.title.x).toBeGreaterThanOrEqual(0);
    expect(geometry.title.x + geometry.title.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.title.y, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.winner-title')).toBeFocused();
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
    if (process.env.CARDBOARD_REVIEW_ARTIFACT_DIR) {
        const artifactDir = path.resolve(process.env.CARDBOARD_REVIEW_ARTIFACT_DIR);
        await fs.mkdir(artifactDir, { recursive: true });
        await fs.writeFile(path.join(artifactDir, 'cardboard-winner-desktop.png'), screenshot);
        await fs.writeFile(path.join(artifactDir, 'cardboard-winner-geometry.json'), JSON.stringify(geometry, null, 2));
    }
});

test('10人CPU対局で自分の席が未確定でも現在手番のカード盤面を表示する', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        CardBoardField.render({ game, selfIndex: -1, escapeHtml, enabledLandmarks: Player.landmarkNames(), session: 'cpu-boundary', display: LOG_TYPE_DISPLAY });
    });
    await expect(page.locator('#cardboardSeats .cardboard-player-self')).toHaveCount(1);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toHaveClass(/cardboard-player-self/);
    expect(errors).toEqual([]);
});

test('同じ出目の内訳更新は開閉とフォーカスを保ち、次手番では閉じる', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.rollDice(3); render(); acceptHotseatHandoff(); });
    const summary = page.locator('#cardboardDiceReceipt summary');
    await summary.click();
    await summary.focus();
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.addLog(LOG_TYPES.SPECIAL, '内訳更新の回帰確認 +1コイン');
        render();
    });
    await expect(page.locator('#cardboardDiceReceipt details')).toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.nextTurn();
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#cardboardDiceReceipt details[open]')).toHaveCount(0);
});

test('所有施設と市場のスクロール位置は収支更新と4ビュー往復でも保つ', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.map(card => createCardByName(card.name));
        render();
        const cards = document.querySelector('#cardboardSeats [data-player-index="0"] .cardboard-cards');
        cards.scrollLeft = 200;
        document.querySelector('#cardboardMarket .compact-market-facilities').scrollTop = 120;
    });
    const scroll = () => page.locator('#cardboardSeats [data-player-index="0"] .cardboard-cards').evaluate(element => element.scrollLeft);
    const before = await scroll();
    expect(before).toBeGreaterThan(0);
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[0].coins++; render(); });
    expect(await scroll()).toBe(before);
    const marketScroll = () => page.locator('#cardboardMarket .compact-market-facilities').evaluate(element => element.scrollTop);
    const beforeMarket = await marketScroll();
    expect(beforeMarket).toBeGreaterThan(0);
    const snapshot = () => page.evaluate(() => GameSnapshot.serializeGameState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, {
        pendingActionsFor: GameManager.serializedPendingActionsFor, logLimit: Number.MAX_SAFE_INTEGER,
    }));
    const beforeSwitch = await snapshot();
    for (const other of ['plaza', 'classic', 'sunset']) {
        for (const theme of [other, 'cardboard']) {
            await page.evaluate(value => {
                const select = document.getElementById('gameDesignThemeSelect');
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }, theme);
        }
        expect(await scroll()).toBe(before);
        expect(await marketScroll()).toBe(beforeMarket);
        expect(await snapshot()).toEqual(beforeSwitch);
    }
});

test('新しい出目だけを強調し表示切替で過去の演出を再生しない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await prepare(page, { width: 390, height: 844 });
    await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
    const revealed = await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.rollDice(3);
        render();
        acceptHotseatHandoff();
        // Observe the short pulse in the same browser task that creates it;
        // a separate protocol request can arrive after its 900ms lifetime.
        return document.getElementById('cardboardBoard').classList.contains('cardboard-new-roll');
    });
    expect(revealed).toBe(true);
    expect(await page.locator('#diceResult.dice-result-arrival .dice-face:not(.rolling)').evaluateAll(elements =>
        elements.map(element => getComputedStyle(element).animationName)
    )).toEqual(['cardboard-dice-land']);
    const before = await state(page);
    await selectTheme(page, 'plaza');
    await selectTheme(page, 'cardboard');
    await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
    expect(await state(page)).toEqual(before);
    await page.waitForTimeout(1000);
    await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
});

test('PC上席の多種類カードも出目・絵・名前・枚数を潰さずスクロールできる', async ({ page }) => {
    await prepare(page, { width: 1440, height: 936 });
    await page.evaluate(() => {
        const index = Number(document.querySelector('#cardboardSeats [data-seat-position="top"]').dataset.playerIndex);
        GameRuntimeState.runtime.snapshot().game.players[index].cards = CARDS.map(card => createCardByName(card.name));
        render();
    });
    const panel = page.locator('#cardboardSeats [data-seat-position="top"]');
    expect(await panel.locator('.cardboard-card').count()).toBeGreaterThan(6);
    expect(await panel.locator('.cardboard-card').evaluateAll(cards => cards.every(card =>
        card.clientHeight >= 90 && card.scrollHeight <= card.clientHeight + 1 &&
        card.querySelector('.cardboard-dice').scrollWidth <= card.querySelector('.cardboard-dice').clientWidth + 1
    ))).toBe(true);
    expect(await panel.locator('.cardboard-cards').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await panel.locator('.cardboard-cards').evaluate(element => { element.scrollLeft = 200; });
    expect(await panel.locator('.cardboard-cards').evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});
