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

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }, { width: 1440, height: 936 }]) {
    test(`カード盤面は4ビュー切替でも同一状態と共有市場を保つ ${viewport.width}`, async ({ page }, testInfo) => {
        await prepare(page, viewport);
        const before = await state(page);
        for (const theme of ['plaza', 'sunset', 'classic', 'cardboard']) {
            await selectTheme(page, theme);
            expect(await state(page)).toEqual(before);
            const unavailableAction = page.locator('#gameScreen :is(#buildMenu, #cardboardMarket) button:disabled').first();
            await expect(unavailableAction).toHaveCSS('opacity', '0.8');
        }
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
        await expect(page.locator('#cardboardMarket #buildMenu')).toHaveCount(0);
        await expect(page.locator('#buildMenu')).toHaveCount(1);
        await expect(page.locator('#cardboardCompareToggle')).toHaveAttribute('aria-haspopup', 'dialog');
        await expect(page.locator('#cardboardCompareToggle')).toHaveAttribute('aria-label', '全員の施設カードを比較');
        await expect(page.locator('#cardboardMarket [data-action="buildLandmark"]')).not.toHaveCount(0);
        await expect(page.locator('#cardboardSeats [data-player-index="0"] .cardboard-count')).toHaveText('所有 ×4');
        const seatAccents = await page.locator('#cardboardSeats .cardboard-player').evaluateAll(players =>
            players.map(player => getComputedStyle(player).borderInlineStartColor));
        expect(new Set(seatAccents).size).toBe(4);
        const rosterAccents = await page.locator('#cardboardRoster .cardboard-roster-seat').evaluateAll(seats =>
            Object.fromEntries(seats.map(seat => [seat.dataset.cardboardPlayerIndex,
                getComputedStyle(seat).borderInlineStartColor])));
        for (const [index, accent] of await page.locator('#cardboardSeats .cardboard-player').evaluateAll(players =>
            players.map(player => [player.dataset.playerIndex, getComputedStyle(player).borderInlineStartColor]))) {
            expect(rosterAccents[index]).toBe(accent);
        }
        const landmarkDisclosure = page.locator('#cardboardMarket .compact-market-goal-disclosure');
        await landmarkDisclosure.evaluate(element => { element.open = true; });
        const marketLandmarkArt = page.locator('#cardboardMarket .compact-market-landmark .compact-market-art').first();
        await expect(marketLandmarkArt).toBeVisible();
        expect((await marketLandmarkArt.boundingBox()).height).toBeGreaterThanOrEqual(34);
        await landmarkDisclosure.evaluate(element => { element.open = false; });
        const marketFacility = page.locator('#cardboardMarket .compact-market-item:not(.compact-market-landmark)').first();
        const marketArt = await marketFacility.locator('.compact-market-art').boundingBox();
        const marketWidth = await marketFacility.evaluate(element => element.getBoundingClientRect().width);
        expect(marketWidth).toBeGreaterThanOrEqual(96);
        expect(marketArt.height).toBeGreaterThanOrEqual(54);
        if (viewport.width === 844) {
            for (const [selector, label, accessibleName] of [
                ['.game-design-switcher > summary', '画面', '表示テーマを変更'],
                ['.game-guide-settings > summary', 'ヒント', 'チュートリアルの表示と詳しさを設定'],
                ['.game-support-settings > summary', 'データ', '対局データと問題報告の操作'],
            ]) {
                const control = page.locator(`#cardboardControls ${selector}`);
                await expect(control).toHaveAttribute('aria-label', accessibleName);
                expect(await control.evaluate(element => getComputedStyle(element, '::after').content)).toContain(label);
            }
            await page.evaluate(() => {
                document.getElementById('pwaInstallBanner').style.display = 'block';
                document.body.classList.add('pwa-banner-open');
            });
            await expect.poll(() => page.locator('body').evaluate(element => element.classList.contains('pwa-banner-open'))).toBe(false);
            expect((await page.locator('#cardboardBoard').boundingBox()).height).toBeGreaterThanOrEqual(320);
            expect((await page.locator('#cardboardBoard .cardboard-player-selected').boundingBox()).width).toBeGreaterThan(260);
            const turnMarker = page.locator('#cardboardSeats .cardboard-player-current:is([data-seat-position="top"], [data-seat-position="bottom"]) .cardboard-turn-marker');
            await expect(turnMarker).toBeVisible();
            expect(await turnMarker.evaluate(element => getComputedStyle(element, '::before').content)).toContain('手番');
            expect((await turnMarker.boundingBox()).width).toBeGreaterThanOrEqual(20);
            const expandMarket = page.locator('#cardboardMarket .compact-market-expand');
            await expect(expandMarket).toBeVisible();
            const expandBounds = await expandMarket.boundingBox();
            expect(expandBounds.width).toBeGreaterThanOrEqual(44);
            expect(expandBounds.height).toBeGreaterThanOrEqual(44);
        }
        if (viewport.height > 480) {
            const ownedArt = await page.locator('#cardboardSeats .cardboard-player-self .cardboard-card .cardboard-art').first().boundingBox();
            expect(ownedArt.height).toBeGreaterThanOrEqual(54);
        }
        await page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]').click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await expect(page.locator('#cardDetailModal')).toContainText('駅');
        await expect(page.locator('#cardDetailModal .card-detail-art .sunset-facility-art')).toBeVisible();
        await page.locator('body').evaluate(body => body.classList.add('accessibility-high-contrast'));
        await expect(page.locator('#cardDetailModal .modal-content')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
        await page.locator('body').evaluate(body => body.classList.remove('accessibility-high-contrast'));
        await page.keyboard.press('Escape');
        await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.rollDice(3); render(); acceptHotseatHandoff(); });
        await expect(page.locator('#cardboardDiceReceipt')).toContainText('出目 3');
        await expect(page.locator('#turnStatusAnnouncer')).toContainText('出目');
        await expect(page.locator('#gameLogContainer')).not.toHaveClass(/plaza-panel-open/);
        if (viewport.width === 844) {
            await expect(page.locator('#cardboardDiceReceipt .plaza-receipt-details')).toBeVisible();
            const receiptSummary = await page.locator('#cardboardDiceReceipt .plaza-receipt-details > summary').boundingBox();
            expect(receiptSummary.width).toBeGreaterThanOrEqual(44);
            expect(receiptSummary.height).toBeGreaterThanOrEqual(44);
            const marketViewport = await page.locator('#cardboardMarket .compact-market-facilities').boundingBox();
            expect(marketViewport.height).toBeGreaterThanOrEqual(62);
            const marketShelf = await page.locator('#cardboardMarket .compact-market-facilities').evaluate(element => ({
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                overflowX: getComputedStyle(element).overflowX,
                overflowY: getComputedStyle(element).overflowY,
                itemCount: element.querySelectorAll('.compact-market-item:not(.compact-market-landmark)').length,
            }));
            expect(marketShelf.scrollWidth).toBeGreaterThan(marketShelf.clientWidth);
            expect(marketShelf.overflowX).toBe('auto');
            expect(marketShelf.overflowY).toBe('hidden');
            expect(marketShelf.itemCount).toBeGreaterThan(10);
            const landscapeCardArt = await page.locator('#cardboardSeats [data-seat-position="top"], #cardboardSeats [data-seat-position="bottom"]')
                .evaluateAll(panels => panels.flatMap(panel => [...panel.querySelectorAll('.cardboard-card')].map(card => {
                    const art = card.querySelector('.cardboard-art');
                    return { visible: getComputedStyle(art).display !== 'none', height: art.getBoundingClientRect().height,
                        nameFontSize: parseFloat(getComputedStyle(card.querySelector('.cardboard-name')).fontSize),
                        hasEvent: Boolean(card.querySelector('.cardboard-dormant, .cardboard-activation')) };
                })));
            expect(landscapeCardArt.length).toBeGreaterThan(0);
            expect(landscapeCardArt.every(card => card.visible)).toBe(true);
            expect(landscapeCardArt.every(card => card.nameFontSize >= 11)).toBe(true);
            expect(landscapeCardArt.some(card => card.height >= 28)).toBe(true);
            expect(landscapeCardArt.filter(card => card.hasEvent).every(card => card.height >= 24), JSON.stringify(landscapeCardArt)).toBe(true);
            const sideCardArt = await page.locator('#cardboardSeats .cardboard-player:is([data-seat-position="left"], [data-seat-position="right"]) .cardboard-art').first().boundingBox();
            expect(sideCardArt.height).toBeGreaterThanOrEqual(28);
            const sideCardNameSize = await page.locator('#cardboardSeats .cardboard-player:is([data-seat-position="left"], [data-seat-position="right"]) .cardboard-name').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
            expect(sideCardNameSize).toBeGreaterThanOrEqual(12);
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

test('1440pxのカード盤面は選択した街と全席ロスターを主役にする', async ({ page }) => {
    await prepare(page, { width: 1440, height: 900 }, 2, true);
    await selectTheme(page, 'cardboard');
    await expect(page.locator('#cardboardBoard')).toHaveClass(/cardboard-focus-view/);
    const onlineGeometry = await page.evaluate(() => {
        const panel = document.getElementById('gameConnectivityPanel');
        const hiddenDisplay = getComputedStyle(panel).display;
        panel.style.display = 'grid';
        const activity = document.getElementById('gameActivityStatus');
        activity.style.display = 'flex';
        document.getElementById('gameActivityStatusLabel').textContent = '対局を同期中';
        const bounds = element => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; };
        return { hiddenDisplay, panel: bounds(panel), board: bounds(document.getElementById('cardboardBoard')) };
    });
    expect(onlineGeometry.hiddenDisplay).toBe('none');
    expect(onlineGeometry.board.top).toBeGreaterThanOrEqual(onlineGeometry.panel.bottom - 1);
    expect(onlineGeometry.board.bottom).toBeLessThanOrEqual(900);
    await expect(page.locator('#cardboardRoster')).toBeVisible();
    await expect(page.locator('#cardboardRoster .cardboard-roster-seat')).toHaveCount(2);
    const selected = page.locator('#cardboardSeats .cardboard-player-selected');
    await expect(selected).toHaveAttribute('data-player-index', '0');
    expect((await selected.locator('.cardboard-card .cardboard-art').first().boundingBox()).height).toBeGreaterThanOrEqual(80);
    const before = await state(page);
    await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
    await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toHaveAttribute('data-player-index', '1');
    expect(await state(page)).toEqual(before);
});

test('10人のカード盤面は自分・手番・選択相手を読める大きさで表示する', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    await expect(page.locator('#cardboardRoster button')).toHaveCount(10);
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(3);
    await expect(page.locator('#cardboardSeats [data-player-index="1"]')).toBeVisible();
    await expect(page.locator('#cardboardSeats [data-player-index="2"]')).toBeVisible();
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toHaveCSS('outline-color', 'rgb(23, 102, 189)');
    await expect(page.locator('#cardboardRoster .cardboard-roster-trend')).toHaveCount(10);
    await expect(page.locator('#cardboardRoster [aria-current="true"] .cardboard-roster-turn-badge')).toHaveText('手番');
    const focusedCard = page.locator('#cardboardSeats .cardboard-card').first();
    await focusedCard.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(focusedCard).toBeFocused();
    await expect(focusedCard).toHaveCSS('outline-color', 'rgb(255, 230, 109)');
    await expect(page.locator('#cardboardRoster .cardboard-roster-self .cardboard-roster-self-badge')).toHaveText('あなた');
    const chips = page.locator('#cardboardRoster button').first().locator('.cardboard-color-count');
    await expect(chips).toHaveCount(4);
    await page.locator('#cardboardRoster [data-cardboard-player-index="9"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="9"]')).toBeVisible();
    expect(await page.locator('#cardboardSeats > .cardboard-player').count()).toBeLessThanOrEqual(3);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toBeVisible();
    const before = await state(page);
    await page.setViewportSize({ width: 844, height: 390 });
    const landscapeBoard = page.locator('#cardboardBoard');
    const landscapeTown = page.locator('#cardboardSeats .cardboard-player-selected');
    expect((await landscapeBoard.boundingBox()).height).toBeGreaterThanOrEqual(320);
    expect((await landscapeTown.boundingBox()).height).toBeGreaterThan(180);
    expect((await landscapeTown.boundingBox()).bottom).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await state(page)).toEqual(before);
});

test('施設比較は多人数の所有状況を横断して読めてゲーム状態を変えない', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.players[1].name = '長いプレイヤー名'.repeat(8);
        render();
    });
    const before = await state(page);
    const toggle = page.locator('#cardboardCompareToggle');
    const comparison = page.getByRole('dialog', { name: '全員の所有施設' });
    await toggle.click();
    await expect(comparison).toBeVisible();
    const overlayBounds = await comparison.boundingBox();
    expect(overlayBounds.width).toBe(390);
    expect(overlayBounds.height).toBe(844);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#plazaComparisonHeading')).toBeFocused();
    await expect(comparison.locator('table thead th')).toHaveCount(11);
    await expect(comparison.locator('table thead th[aria-current="true"]')).toHaveClass(/is-turn/);
    await expect(comparison.locator('table thead th.is-self')).toContainText('あなた');
    await expect(comparison.locator('table thead th').nth(2).locator('.plaza-comparison-player-name')).toContainText('長いプレイヤー名');
    expect((await comparison.locator('table thead th').nth(2).locator('.plaza-comparison-player-name').boundingBox()).width).toBeLessThanOrEqual(120);
    await expect(comparison.locator('table tbody')).toContainText('カフェ');
    const unownedCard = await page.evaluate(() => {
        const owned = new Set(GameRuntimeState.runtime.snapshot().game.players.flatMap(player => player.cards.map(card => card.name)));
        return [...getEnabledCardSelection()].find(name => !owned.has(name));
    });
    expect(unownedCard).toBeTruthy();
    const unownedCounts = await page.locator('#plazaComparisonBody tbody tr').evaluateAll((rows, name) => {
        const row = rows.find(element => element.querySelector('th[scope="row"]')?.textContent.includes(name));
        return row ? [...row.querySelectorAll('td')].slice(0, 10).map(cell => cell.textContent.trim()) : [];
    }, unownedCard);
    expect(unownedCounts).toEqual(Array(10).fill('0'));
    expect(await page.locator('#plazaComparisonBody').evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.locator('#plazaComparisonClose')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#plazaComparisonClose')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(comparison).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await toggle.click();
    await expect(comparison).toBeVisible();
    await comparison.click({ position: { x: 1, y: 1 } });
    await expect(comparison).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(await state(page)).toEqual(before);
    await toggle.click();
    await selectTheme(page, 'plaza');
    await expect(comparison).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/plaza-comparison-open/);
    await expect(page.locator('#plazaCameraTools [data-field-panel="comparison"]')).toBeFocused();
    expect(await state(page)).toEqual(before);
    await selectTheme(page, 'cardboard');
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

test('にぎわい広場の高コントラストは市場・所有カード・手番を識別できる', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await expect(page.getByRole('region', { name: '出目と発動結果' })).toHaveAttribute('aria-live', 'off');
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.phase = GAME_PHASES.BUILD;
        game.players[0].coins = 0;
        render();
        document.getElementById('cardboardDiceReceipt').innerHTML = '<span class="plaza-receipt-transfer" data-flow="incoming"><strong>森林</strong> 席2 → 席1 <b>+3コイン</b></span>';
        document.body.classList.add('accessibility-high-contrast');
    });
    const surfaces = await page.locator([
        '#cardboardCenter', '#cardboardRoster .cardboard-roster-seat',
        '#cardboardSeats .cardboard-card', '#cardboardMarket .compact-market-item',
        '#cardboardActionSlot .buttons button',
    ].join(',')).evaluateAll(elements => elements.map(element => ({
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color,
    })));
    expect(surfaces.length).toBeGreaterThanOrEqual(5);
    expect(surfaces.every(surface => surface.background === 'rgb(0, 0, 0)')).toBe(true);
    expect(surfaces.every(surface => surface.color === 'rgb(255, 255, 255)')).toBe(true);
    await expect(page.locator('#cardboardDiceReceipt .plaza-receipt-transfer'))
        .toHaveCSS('background-color', 'rgb(0, 0, 0)');
    const disabledMarketStyle = await page.locator('#cardboardMarket .compact-market-item:has(.compact-market-buy:disabled)').first()
        .evaluate(element => getComputedStyle(element).borderTopStyle);
    expect(disabledMarketStyle).toBe('dashed');
    await expect(page.locator('#cardboardRoster [aria-current="true"] .cardboard-roster-turn-badge')).toHaveText('手番');
});

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

test('中央市場を拡大してカードを比較し、閉じると起動操作へ戻る', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 2);
    const before = await state(page);
    const open = page.locator('#cardboardMarket .compact-market-expand');
    await open.click();
    const dialog = page.locator('#cardboardMarketDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
    expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(390);
    expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(844);
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.locator('#cardboardMarket')).toBeVisible();
    await expect(dialog.locator('.compact-market-detail').first()).toBeFocused();
    const art = dialog.locator('.compact-market-art').first();
    await expect(art).toBeVisible();
    expect(await art.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(50);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(open).toBeFocused();
    expect(await state(page)).toEqual(before);
    await open.click();
    await selectTheme(page, 'plaza');
    await expect(dialog).toBeHidden();
    expect(await state(page)).toEqual(before);
    await selectTheme(page, 'cardboard');
});

test('カード詳細を閉じると描画更新後の同じカードへフォーカスを戻す', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 2);
    const source = page.locator('#cardboardSeats .cardboard-player[data-player-index="0"] [data-action="showCardDetail"][data-card-name="麦畑"]');
    await source.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cardDetailModal')).toBeVisible();
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.players[0].coins += 1;
        render();
    });
    await page.locator('#cardDetailModal [data-ui-action="closeCardDetail"]').click();
    await expect(page.locator('#cardDetailModal')).toBeHidden();
    await expect(source).toBeFocused();
});

test('購入とUndo・保存再開はカード盤面と既存ビューで共通の状態を使う', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 4, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.filter(card => card.name !== '麦畑').map(card => createCardByName(card.name));
        game.players[0].coins = 30;
        game.phase = GAME_PHASES.BUILD;
        render();
        acceptHotseatHandoff();
    });
    const before = await state(page);
    await page.locator('#cardboardMarket .compact-market-expand').click();
    const marketDialog = page.locator('#cardboardMarketDialog');
    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect(marketDialog).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('cardboardMarketDialog').contains(document.activeElement))).toBe(true);
    const newCard = page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]');
    await expect(newCard.locator('.cardboard-count')).toHaveText('所有 ×1');
    await expect(newCard).toHaveClass(/cardboard-card-newly-built/);
    expect(await newCard.evaluate(card => card.closest('.cardboard-cards').scrollLeft)).toBeGreaterThan(0);
    expect(await newCard.evaluate(card => {
        const list = card.closest('.cardboard-cards').getBoundingClientRect();
        const bounds = card.getBoundingClientRect();
        return bounds.left >= list.left - 1 && bounds.right <= list.right + 1;
    })).toBe(true);
    const built = await state(page);
    await page.locator('#cardboardMarketClose').click();
    await expect(marketDialog).toBeHidden();
    await selectTheme(page, 'plaza');
    await expect(page.locator('#gameDesignThemeSelect')).toBeFocused();
    expect(await state(page)).toEqual(built);
    await selectTheme(page, 'cardboard');
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]')).not.toHaveClass(/cardboard-card-newly-built/);
    await page.locator('#cardboardMarket .undo-btn').click();
    await page.locator('#confirmOkBtn').click();
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]')).toHaveCount(0);
    expect(await state(page)).toEqual(before);
    await page.evaluate(() => document.body.classList.add('accessibility-reduced-motion'));
    await page.locator('#cardboardMarket .compact-market-expand').click();
    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect(newCard).toHaveClass(/cardboard-card-newly-built/);
    await expect(newCard).toHaveCSS('animation-name', 'none');
    await expect(newCard).toHaveCSS('outline-color', 'rgb(23, 102, 189)');
    await page.locator('#cardboardMarketClose').click();
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
    await expect(station.locator('.cardboard-art')).toBeVisible();
    expect(await station.locator('.cardboard-art').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(0);
    await page.locator('#cardboardMarket .compact-market-goal-disclosure').evaluate(element => { element.open = true; });
    await page.locator('#cardboardMarket [data-action="buildLandmark"][data-landmark-name="駅"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).toHaveClass(/cardboard-landmark-built/);
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).toHaveClass(/cardboard-landmark-newly-built/);
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).not.toHaveClass(/cardboard-landmark-newly-built/, { timeout: 1800 });
    await selectTheme(page, 'plaza');
    await selectTheme(page, 'cardboard');
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).not.toHaveClass(/cardboard-landmark-newly-built/);
});

test('OSの動き低減中もランドマーク完成を静的に強調する', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD; render(); });
    await selectTheme(page, 'cardboard');
    await page.locator('#cardboardMarket .compact-market-goal-disclosure').evaluate(element => { element.open = true; });
    await page.locator('#cardboardMarket [data-action="buildLandmark"][data-landmark-name="駅"]').click();
    const station = page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]');
    await expect(station).toHaveClass(/cardboard-landmark-newly-built/);
    await expect(station).toHaveCSS('animation-name', 'none');
    await expect(station).toHaveCSS('outline-color', 'rgb(180, 122, 9)');
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
    await page.evaluate(() => document.body.classList.add('accessibility-high-contrast'));
    await expect(page.locator('.winner-screen')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('.winner-screen')).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.winner-title')).toHaveCSS('color', 'rgb(255, 230, 109)');
    await expect(page.locator('.winner-stats-row').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
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
    await expect(page.locator('#cardboardBoard .cardboard-card-activated').first()).toHaveCSS('animation-name', 'cardboard-card-activate');
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
    await expect(panel.locator('.cardboard-cards')).toHaveCSS('scroll-snap-type', 'x proximity');
    await panel.locator('.cardboard-cards').evaluate(element => { element.scrollLeft = 200; });
    expect(await panel.locator('.cardboard-cards').evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});
