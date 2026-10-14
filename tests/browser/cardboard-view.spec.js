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
        if (viewport.width <= 390 && viewport.height > 480) {
            await page.evaluate(() => {
                GameRuntimeState.runtime.snapshot().game.players[0].cards.push(createCardByName('パン屋'));
                render();
            });
        }
        const before = await state(page);
        await expect(page.locator('#cardboardChoiceJump')).toBeHidden();
        if (viewport.width <= 390) {
            const rosterLayout = await page.locator('#cardboardRoster .cardboard-roster').evaluate(roster => {
                const bounds = roster.getBoundingClientRect();
                const seats = [...roster.querySelectorAll('button')].map(button => {
                    const rect = button.getBoundingClientRect();
                    return { top: rect.top, bottom: rect.bottom };
                });
                return { fits: roster.scrollHeight <= roster.clientHeight && seats.every(rect =>
                    rect.top >= bounds.top && rect.bottom <= bounds.bottom),
                    top: bounds.top, bottom: bounds.bottom, scrollHeight: roster.scrollHeight,
                    clientHeight: roster.clientHeight, seats };
            });
            expect(rosterLayout, JSON.stringify(rosterLayout)).toMatchObject({ fits: true });
        }
        for (const theme of ['plaza', 'sunset', 'classic', 'cardboard']) {
            await selectTheme(page, theme);
            expect(await state(page)).toEqual(before);
            const unavailableAction = theme === 'cardboard'
                ? page.locator('#cardboardMarket .compact-market-buy:disabled').first()
                : page.locator('#gameScreen #buildMenu button:disabled').first();
            await expect(unavailableAction).toHaveCSS('opacity', theme === 'cardboard' ? '1' : '0.8');
            if (theme === 'cardboard') {
                await expect(unavailableAction).toHaveCSS('filter', 'none');
                await expect(unavailableAction.locator('.compact-market-name')).toHaveCSS('color', viewport.width === 844 ? 'rgb(24, 52, 71)' : 'rgb(255, 255, 255)');
                await expect(unavailableAction.locator('..')).toHaveClass(/compact-market-unavailable/);
            }
        }
        await expect(page.locator('#cardboardMoreMenu > summary')).toBeVisible();
        await page.locator('#cardboardMoreMenu > summary').click();
        const designSummary = page.locator('#cardboardMoreMenuContent .game-design-switcher > summary');
        await expect(designSummary).toBeVisible();
        await designSummary.click();
        await expect(page.locator('#cardboardMoreMenuContent #gameDesignThemeSelect')).toBeVisible();
        await designSummary.click();
        await page.locator('#cardboardMoreMenu > summary').click();
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(1);
        const scenery = page.locator('#cardboardSeats .cardboard-town-vignette');
        if (viewport.width >= 1000 && viewport.height >= 760) {
            await expect(scenery).toBeVisible();
            await expect(scenery).toHaveAttribute('aria-hidden', 'true');
            expect(await scenery.locator('.town-building').count()).toBeLessThanOrEqual(4);
            await expect(scenery.locator('button, a, [tabindex]')).toHaveCount(0);
            await expect(scenery.locator('.town-backdrop')).toBeHidden();
            await expect(scenery.locator('.town-growth-scenery')).toBeHidden();
        } else {
            await expect(scenery).toHaveCount(0);
        }

        await expect(page.locator('#cardboardMarket #buildMenu')).toHaveCount(0);
        await expect(page.locator('#buildMenu')).toHaveCount(1);
        await expect(page.locator('#cardboardCompareToggle')).toHaveAttribute('aria-haspopup', 'dialog');
        await expect(page.locator('#cardboardCompareToggle')).toHaveAttribute('aria-label', '全員の施設カードを比較');
        await expect(page.locator('#cardboardMarket [data-action="buildLandmark"]')).not.toHaveCount(0);
        await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"] .cardboard-count')).toHaveText('所有 ×4');
        await expect(page.locator('#cardboardSeats .cardboard-player-selected > .cardboard-landmark-heading .cardboard-landmark-scroll-hint'))
            .toHaveText('横にスクロール →');
        const seatAccents = await page.locator('#cardboardRoster .cardboard-roster-seat').evaluateAll(players =>
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
            const marketHeading = await page.locator('#cardboardMarket .compact-market').evaluate(element => ({
                pseudoContent: getComputedStyle(element, '::before').content,
                pseudoWhiteSpace: getComputedStyle(element, '::before').whiteSpace,
                headingBounds: (() => {
                    const heading = element.querySelector('.compact-market-header h2');
                    return { width: heading.getBoundingClientRect().width, height: heading.getBoundingClientRect().height };
                })(),
            }));
            expect(marketHeading.pseudoContent).toContain('中央市場 · 横送り ↔');
            expect(marketHeading.pseudoWhiteSpace).toBe('nowrap');
            expect(marketHeading.headingBounds.width).toBeLessThanOrEqual(1);
            const landscapeMarketCard = page.locator('#cardboardMarket .compact-market-item:not(.compact-market-landmark)').first();
            expect((await landscapeMarketCard.boundingBox()).height).toBeGreaterThanOrEqual(150);
            expect((await landscapeMarketCard.locator('.compact-market-art').boundingBox()).height).toBeGreaterThanOrEqual(60);
            expect(await landscapeMarketCard.locator('.compact-market-price').evaluate(element =>
                parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11);
            await expect(landscapeMarketCard.locator('.compact-market-kind')).toBeVisible();
            await expect(landscapeMarketCard.locator('.compact-market-stock')).toBeVisible();
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
                // Exercise the install-only controller path. An unrelated SW
                // update notice may legitimately keep pwa-banner-open true.
                setPwaBannerVisible('pwaUpdateBanner', false);
                setPwaBannerVisible('pwaInstallBanner', true);
            });
            await expect(page.locator('#pwaInstallBanner')).toHaveCSS('display', 'none');
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
        if (viewport.width >= 1200) {
            const marketHeading = await page.locator('#cardboardMarket .compact-market').evaluate(element => {
                const heading = element.querySelector('.compact-market-header h2');
                const textRange = document.createRange();
                textRange.selectNodeContents(heading);
                const textBounds = textRange.getBoundingClientRect();
                const expandBounds = element.querySelector('.compact-market-expand').getBoundingClientRect();
                return { lines: textRange.getClientRects().length, textRight: textBounds.right,
                    expandLeft: expandBounds.left, expandWidth: expandBounds.width };
            });
            expect(marketHeading.lines).toBe(1);
            expect(marketHeading.textRight).toBeLessThanOrEqual(marketHeading.expandLeft);
            expect(marketHeading.expandWidth).toBeLessThan(120);
        }
        if (viewport.height > 480) {
            const ownedArt = await page.locator('#cardboardSeats .cardboard-player-self .cardboard-card .cardboard-art').first().boundingBox();
            expect(ownedArt.height).toBeGreaterThanOrEqual(54);
        }
        if (viewport.width <= 390 && viewport.height > 480) {
            const portraitRoster = page.locator('#cardboardRoster .cardboard-roster');
            expect(await portraitRoster.evaluate(element => getComputedStyle(element).flexWrap)).toBe('nowrap');
            expect(await portraitRoster.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
            const portraitCard = await page.locator('#cardboardSeats .cardboard-player-self .cardboard-card').first().evaluate(card => {
                const bounds = card.getBoundingClientRect();
                const cards = card.parentElement;
                return { width: bounds.width, artHeight: card.querySelector('.cardboard-art').getBoundingClientRect().height,
                    scrolls: cards.scrollWidth > cards.clientWidth || cards.scrollHeight > cards.clientHeight };
            });
            expect(portraitCard.width).toBeGreaterThanOrEqual(176);
            expect(portraitCard.artHeight).toBeGreaterThanOrEqual(96);
            expect(portraitCard.scrolls).toBe(true);
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
        if (viewport.width === 844) {
            await expect(page.locator('#cardboardDiceReceipt .plaza-receipt-featured')).toBeVisible();
            await expect(page.locator('#cardboardDiceReceipt .plaza-receipt-featured')).toHaveCSS('overflow-x', 'auto');
        }
        await expect(page.locator('#cardboardDiceReceipt > .cardboard-transfer-summary')).toBeVisible();
        await expect(page.locator('#cardboardDiceReceipt > .cardboard-transfer-summary')).toHaveCSS('position', 'static');
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
            const landscapeCardArt = await page.locator('#cardboardSeats .cardboard-player-selected')
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
            if (viewport.width === 844 && viewport.height === 390) {
                const selectedCard = page.locator('#cardboardSeats .cardboard-player-selected .cardboard-card').first();
                expect((await selectedCard.locator('.cardboard-art').boundingBox()).height).toBeGreaterThanOrEqual(76);
                expect(await selectedCard.locator('.cardboard-name').evaluate(element =>
                    parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
            }
            const sideCardArt = await page.locator('#cardboardSeats .cardboard-player-selected .cardboard-art').first().boundingBox();
            expect(sideCardArt.height).toBeGreaterThanOrEqual(28);
            const sideCardNameSize = await page.locator('#cardboardSeats .cardboard-player-selected .cardboard-name').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
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

test('コイン移動ラベルは狭い画面でも盤面からはみ出さない', async ({ page }) => {
    await prepare(page, { width: 320, height: 568 }, 2, false);
    const bounds = await page.evaluate(() => {
        const badge = document.createElement('span');
        badge.className = 'cardboard-transfer';
        badge.textContent = 'とても長い施設名のテスト表示 · → 12コイン';
        document.getElementById('cardboardBoard').appendChild(badge);
        const computed = getComputedStyle(badge);
        const rect = badge.getBoundingClientRect();
        const board = document.getElementById('cardboardBoard').getBoundingClientRect();
        return { maxWidth: parseFloat(computed.maxWidth), width: rect.width, boardWidth: board.width };
    });
    expect(bounds.maxWidth).toBeLessThanOrEqual(296);
    expect(bounds.width).toBeLessThanOrEqual(bounds.boardWidth);
});

test('844×390の手番HUDは長いプレイヤー名を省略せず表示する', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 }, 2, false);
    const name = '参加者プレイヤーA';
    await page.evaluate(name => {
        GameRuntimeState.runtime.snapshot().game.players[0].name = name;
        render();
    }, name);
    const turnName = page.locator('#status .cardboard-turn-status-name');
    await expect(turnName).toContainText(name);
    const dimensions = await turnName.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(page.locator('#status .cardboard-turn-status-coins')).toHaveText('🪙 30コイン');
});

test('844×390で街の末尾が隠れると縦スクロールをランドマーク位置で案内する', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 }, 2, false);
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.players[0].cards = ['麦畑', 'パン屋'].map(createCardByName);
        render();
    });
    const selected = page.locator('#cardboardSeats .cardboard-player-selected');
    await expect(selected).toHaveAttribute('data-vertical-overflow', 'true');
    await expect(selected).toHaveAttribute('role', 'region');
    await expect(selected).toHaveAttribute('aria-label', /上下にスクロールできます/);
    const hint = await selected.locator('.cardboard-landmark-heading').evaluate(element =>
        getComputedStyle(element, '::after').content);
    expect(hint).toBe('"縦にスクロール ↓"');
    await selected.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const landmarkVisibility = await selected.evaluate(element => {
        const panel = element.getBoundingClientRect();
        const landmarks = element.querySelector('.cardboard-landmarks').getBoundingClientRect();
        return { panelBottom: panel.bottom, landmarksBottom: landmarks.bottom };
    });
    expect(landmarkVisibility.landmarksBottom).toBeLessThanOrEqual(landmarkVisibility.panelBottom + 1);
});

test('短い縦画面でも盤面のその他メニューを画面内でスクロールできる', async ({ page }) => {
    await prepare(page, { width: 320, height: 568 }, 2, false);
    await page.locator('#cardboardMoreMenu > summary').click();
    const menu = page.locator('#cardboardMoreMenuContent');
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
    expect(await menu.evaluate(element => element.scrollHeight >= element.clientHeight)).toBe(true);
});

test('その他メニューはEscapeと盤面操作で閉じ、Escape時にフォーカスを戻す', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 2, false);
    const menu = page.locator('#cardboardMoreMenu');
    const summary = page.locator('#cardboardMoreMenu > summary');
    await summary.click();
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();

    await summary.click();
    await page.locator('#cardboardRoster .cardboard-roster-seat').last().click();
    await expect(menu).not.toHaveAttribute('open', '');
});

test('1440pxのカード盤面は選択した街と全席ロスターを主役にする', async ({ page }) => {
    await prepare(page, { width: 1440, height: 900 }, 2, true);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = [createCardByName('麦畑'), createCardByName('パン屋')];
        render();
    });
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
    expect((await selected.locator('.cardboard-card .cardboard-art').first().boundingBox()).height).toBeGreaterThanOrEqual(110);
    await expect(selected.locator('.cardboard-facility-scroll-hint')).toBeVisible();
    expect(await selected.locator('.cardboard-facility-scroll-hint').evaluate(element =>
        getComputedStyle(element, '::after').content
    )).toBe('"縦にスクロール ↓"');
    const before = await state(page);
    await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
    await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toHaveAttribute('data-player-index', '1');
    expect(await state(page)).toEqual(before);
});

test('320pxの施設交換は手順を読めて施設アートを2列で選べる', async ({ page }, testInfo) => {
    await prepare(page, { width: 320, height: 844 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.phase = GAME_PHASES.PENDING;
        game.pendingBusiness = 1;
        game.pendingActionQueue = [{ action: 'resolveBusiness', field: 'pendingBusiness' }];
        game.players[0].cards = ['麦畑', 'パン屋', 'カフェ', 'コンビニ'].map(createCardByName);
        render();
    });
    const help = page.locator('#pendingModal .bc-step-help').first();
    await expect(help).toHaveCSS('color', 'rgb(74, 93, 80)');
    const choices = page.locator('#pendingModal .bc-chip-group').first();
    await expect(choices.locator('.bc-chip')).toHaveCount(4);
    await expect(choices.locator('.sunset-facility-art').first()).toBeVisible();
    const cards = await choices.locator('.bc-chip').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON()));
    expect(Math.abs(cards[0].top - cards[1].top)).toBeLessThanOrEqual(1);
    expect(cards[1].left).toBeGreaterThan(cards[0].left);
    await page.screenshot({ path: testInfo.outputPath('business-320.png'), animations: 'disabled' });
});

test('844pxの終盤カード棚は24種類を一列で横送りできる', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 }, 4, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.slice(0, 24).map(card => createCardByName(card.name));
        render();
    });
    const before = await state(page);
    const shelf = page.locator('#cardboardSeats .cardboard-player-selected .cardboard-cards');
    await expect(shelf.locator('.cardboard-card')).toHaveCount(24);
    const geometry = await shelf.evaluate(element => ({
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
        overflowX: getComputedStyle(element).overflowX,
    }));
    expect(geometry.overflowX).toBe('auto');
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
    await shelf.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => shelf.evaluate(element => {
        const shelfBounds = element.getBoundingClientRect();
        const lastBounds = element.lastElementChild.getBoundingClientRect();
        return lastBounds.left >= shelfBounds.left - 1 && lastBounds.right <= shelfBounds.right + 1;
    })).toBe(true);
    expect(await state(page)).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('late-844-last-card.png'), animations: 'disabled' });
});

test('1440pxの終盤カード棚は先頭カードからスクロールできる', async ({ page }) => {
    await prepare(page, { width: 1440, height: 900 }, 2, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.slice(0, 12).map(card => createCardByName(card.name));
        render();
    });
    const shelf = page.locator('#cardboardSeats .cardboard-player[data-player-index="0"] .cardboard-cards');
    await expect(shelf.locator('.cardboard-card')).toHaveCount(12);
    const geometry = await shelf.evaluate(element => {
        const shelfBounds = element.getBoundingClientRect();
        const firstCardBounds = element.querySelector('.cardboard-card').getBoundingClientRect();
        return {
            shelfTop: shelfBounds.top,
            shelfBottom: shelfBounds.bottom,
            firstTop: firstCardBounds.top,
            firstBottom: firstCardBounds.bottom,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            scrollTop: element.scrollTop,
        };
    });
    expect(geometry.firstTop).toBeGreaterThanOrEqual(geometry.shelfTop);
    expect(geometry.firstTop - geometry.shelfTop).toBeLessThanOrEqual(4);
    expect(geometry.firstBottom).toBeLessThanOrEqual(geometry.shelfBottom);
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.scrollTop).toBe(0);
    expect(geometry.firstBottom - geometry.firstTop).toBeGreaterThanOrEqual(260);
    const art = await shelf.locator('.cardboard-card .cardboard-art').first().boundingBox();
    expect(art.height).toBeGreaterThanOrEqual(150);
});

test('1440pxの少数施設棚はカード群を街の中央へ見せる', async ({ page }) => {
    await prepare(page, { width: 1440, height: 936 }, 10, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = ['麦畑', 'パン屋'].map(createCardByName);
        render();
    });
    const shelf = page.locator('#cardboardSeats .cardboard-player-selected .cardboard-cards');
    const cards = shelf.locator('.cardboard-card');
    await expect(cards).toHaveCount(2);
    const alignment = await shelf.evaluate(element => {
        const shelfBounds = element.getBoundingClientRect();
        const first = element.querySelector('.cardboard-card').getBoundingClientRect();
        const last = element.querySelector('.cardboard-card:last-child').getBoundingClientRect();
        const cardsCenter = (first.top + last.bottom) / 2;
        const shelfCenter = (shelfBounds.top + shelfBounds.bottom) / 2;
        return { delta: Math.abs(cardsCenter - shelfCenter), shelfHeight: element.clientHeight,
            cardsHeight: last.bottom - first.top };
    });
    expect(alignment.shelfHeight).toBeGreaterThan(alignment.cardsHeight + 48);
    expect(alignment.delta).toBeLessThanOrEqual(12);
});

test('12の出目では建設候補を市場内の見える位置へ送る', async ({ page }) => {
    await prepare(page, { width: 1440, height: 900 }, 2, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = [];
        game.rollDice(12);
        render();
    });
    const market = page.locator('#cardboardMarket .compact-market-facilities');
    const match = market.locator('.compact-market-roll-match').first();
    await expect(match).toBeVisible();
    const geometry = await match.evaluate(item => {
        const element = item.closest('.compact-market-facilities');
        const shelf = element.getBoundingClientRect();
        const card = item.getBoundingClientRect();
        return { scrollTop: element.scrollTop, shelfTop: shelf.top, shelfBottom: shelf.bottom,
            cardTop: card.top, cardBottom: card.bottom };
    });
    expect(geometry.scrollTop).toBeGreaterThan(0);
    expect(geometry.cardTop).toBeGreaterThanOrEqual(geometry.shelfTop);
    expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.shelfBottom);
});

test('4人戦の施設発動時は相手の詳細とロスター席を同時に追える', async ({ page }) => {
    await prepare(page, { width: 320, height: 844 }, 4, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => { player.cards = []; });
        game.players[3].cards = [createCardByName('カフェ')];
        game.rollDice(3);
        render();
        acceptHotseatHandoff();
    });
    const selected = page.locator('#cardboardSeats .cardboard-player-selected');
    await expect(selected).toHaveAttribute('data-player-index', '3');
    await expect(selected.locator('.cardboard-card-activated')).toHaveCount(1);
    await expect(page.locator('#cardboardRoster [data-cardboard-player-index="3"]')).toHaveAttribute('aria-pressed', 'true');
    const rosterState = await page.locator('#cardboardRoster .cardboard-roster').evaluate(element => ({
        scrollLeft: element.scrollLeft,
        selected: element.querySelector('[data-cardboard-player-index="3"]').getBoundingClientRect(),
        rail: element.getBoundingClientRect(),
    }));
    expect(rosterState.scrollLeft).toBeGreaterThan(0);
    expect(rosterState.selected.left).toBeGreaterThanOrEqual(rosterState.rail.left - 1);
    expect(rosterState.selected.right).toBeLessThanOrEqual(rosterState.rail.right + 1);
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.players[3].coins += 1;
        render();
    });
    await expect(page.locator('#cardboardRoster [data-cardboard-player-index="3"]')).toHaveAttribute('aria-pressed', 'true');
    const afterUnrelatedRender = await page.locator('#cardboardRoster .cardboard-roster').evaluate(element => ({
        scrollLeft: element.scrollLeft,
        selected: element.querySelector('[data-cardboard-player-index="3"]').getBoundingClientRect(),
        rail: element.getBoundingClientRect(),
    }));
    expect(afterUnrelatedRender.scrollLeft).toBeGreaterThan(0);
    expect(afterUnrelatedRender.selected.left).toBeGreaterThanOrEqual(afterUnrelatedRender.rail.left - 1);
    expect(afterUnrelatedRender.selected.right).toBeLessThanOrEqual(afterUnrelatedRender.rail.right + 1);
});

test('10人のカード盤面は自分・手番・選択相手を読める大きさで表示する', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    await expect(page.locator('#cardboardRoster button')).toHaveCount(10);
    expect(await page.locator('#cardboardRoster').evaluate(element => getComputedStyle(element, '::before').content))
        .toBe('"他の席を見るには横へ →"');
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(1);
    await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toBeVisible();
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toHaveCSS('outline-color', 'rgb(208, 164, 47)');
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toHaveCSS('border-inline-start-color', 'rgb(23, 102, 189)');
    await expect(page.locator('#cardboardRoster .cardboard-roster-trend')).toHaveCount(10);
    await expect(page.locator('#cardboardRoster [aria-current="true"] .cardboard-roster-turn-badge')).toHaveText('手番');
    const focusedCard = page.locator('#cardboardSeats .cardboard-card').first();
    await focusedCard.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(focusedCard).toBeFocused();
    await expect(focusedCard).toHaveCSS('outline-color', 'rgb(7, 91, 158)');
    await expect(focusedCard).toHaveCSS('outline-style', 'solid');
    await expect(focusedCard).toHaveCSS('outline-width', '3px');
    await expect(page.locator('#cardboardRoster .cardboard-roster-self .cardboard-roster-self-badge')).toHaveText('あなた');
    await expect(page.locator('#cardboardRoster .cardboard-roster').first()).toHaveAttribute('aria-label',
        '表示するプレイヤー。席が隠れている場合は横にスクロールして選べます。キーボードでは左右矢印、Home、Endで席を移動できます。選ぶと街のカードを大きく表示');
    const chips = page.locator('#cardboardRoster button').first().locator('.cardboard-color-count');
    await expect(chips).toHaveCount(4);
    await page.locator('#cardboardRoster [data-cardboard-player-index="9"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="9"]')).toBeVisible();
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(1);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toBeHidden();
    await page.locator('#cardboardRoster [data-cardboard-player-index="0"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toBeVisible();
    await page.locator('#cardboardRoster [data-cardboard-player-index="9"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="9"]')).toBeVisible();
    const before = await state(page);
    await page.setViewportSize({ width: 844, height: 390 });
    const landscapeBoard = page.locator('#cardboardBoard');
    const landscapeTown = page.locator('#cardboardSeats .cardboard-player-selected');
    expect((await landscapeBoard.boundingBox()).height).toBeGreaterThanOrEqual(320);
    expect((await landscapeTown.boundingBox()).height).toBeGreaterThan(180);
    const landscapeTownBounds = await landscapeTown.boundingBox();
    expect(landscapeTownBounds.y + landscapeTownBounds.height).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await state(page)).toEqual(before);
});

test('1440pxの多人数席レールは長いプレイヤー名を折り返して読める', async ({ page }) => {
    await prepare(page, { width: 1440, height: 936 }, 10, false);
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.players.forEach((player, index) => {
            player.name = `参加者プレイヤーの長い街の名前${index + 1}`;
        });
        render();
    });
    const seat = page.locator('#cardboardRoster .cardboard-roster-seat').first();
    const name = seat.locator('.cardboard-roster-name');
    await expect(seat.locator('.cardboard-roster-trend')).toBeHidden();
    const dimensions = await name.evaluate(element => ({
        lineClamp: getComputedStyle(element).webkitLineClamp,
        lineHeight: parseFloat(getComputedStyle(element).lineHeight),
        clientHeight: element.clientHeight,
        seatHeight: element.closest('.cardboard-roster-seat').getBoundingClientRect().height,
        fullName: element.closest('.cardboard-roster-seat').title,
    }));
    const separation = await page.evaluate(() => {
        const rail = document.getElementById('cardboardRoster').getBoundingClientRect();
        const selected = document.querySelector('#cardboardSeats .cardboard-player-selected').getBoundingClientRect();
        return { railBottom: rail.bottom, selectedTop: selected.top };
    });
    expect(dimensions.lineClamp).toBe('2');
    expect(dimensions.clientHeight).toBeLessThanOrEqual(dimensions.lineHeight * 2 + 1);
    expect(dimensions.fullName).toContain('参加者プレイヤーの長い街の名前1');
    expect(dimensions.seatHeight).toBeGreaterThanOrEqual(80);
    expect(separation.railBottom).toBeLessThanOrEqual(separation.selectedTop - 8);
});

test('1024pxの多人数盤面はコンパクトな席レールと街の間隔を保つ', async ({ page }) => {
    await prepare(page, { width: 1024, height: 768 }, 10, false);
    const separation = await page.evaluate(() => {
        const rail = document.getElementById('cardboardRoster').getBoundingClientRect();
        const selected = document.querySelector('#cardboardSeats .cardboard-player-selected').getBoundingClientRect();
        return { railBottom: rail.bottom, selectedTop: selected.top };
    });
    expect(separation.railBottom).toBeLessThanOrEqual(separation.selectedTop - 8);
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
        contrast: (() => {
            const luminance = color => {
                const channel = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255)
                    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
                return channel[0] * 0.2126 + channel[1] * 0.7152 + channel[2] * 0.0722;
            };
            const foreground = luminance(getComputedStyle(element).color);
            const background = luminance(getComputedStyle(element).backgroundColor);
            return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        })(),
    })));
    expect(surfaces.length).toBeGreaterThanOrEqual(5);
    expect(surfaces.every(surface => surface.background === 'rgb(0, 0, 0)')).toBe(true);
    expect(Math.min(...surfaces.map(surface => surface.contrast))).toBeGreaterThanOrEqual(7);
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

test('横持ちの建設操作は拡大市場を開き購入後は見える操作へフォーカスを戻す', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 });
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD;
        render();
    });
    const shortcut = page.locator('#btnBuildShortcut');
    await expect(shortcut).toBeVisible();
    await expect(shortcut).toHaveAttribute('aria-controls', 'cardboardMarketDialog');
    await expect(shortcut).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(page.locator('#btnRoll')).toBeHidden();
    await shortcut.click();
    const dialog = page.locator('#cardboardMarketDialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.compact-market-goal-disclosure > summary').click();
    await expect(dialog.locator('.compact-market-goal-disclosure')).toHaveAttribute('open', '');
    await dialog.locator('[data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect(page.locator('.cardboard-player-selected [data-card-name="麦畑"] .cardboard-count')).toHaveText('所有 ×5');
    await expect(shortcut).toBeHidden();
    await page.locator('#cardboardMarketClose').click();
    await expect(page.locator('#cardboardMarket details[open]')).toHaveCount(0);
    await expect(page.locator('#cardboardMarket .compact-market-expand')).toBeFocused();
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
        const enabled = getEnabledCardSelection();
        game.players[0].cards = CARDS.filter(card => card.name !== '麦畑' && enabled.has(card.name)).map(card => createCardByName(card.name));
        // Endgame fixture: facilities beyond the free initial bakery must
        // consume market stock, just as real purchases do, to remain resumable.
        for (const card of game.players[0].cards) {
            if (card.name !== 'パン屋') SHOP_STOCK[card.name]--;
        }
        game.players[0].coins = 30;
        game.phase = GAME_PHASES.BUILD;
        render();
        acceptHotseatHandoff();
    });
    const before = await state(page);
    await page.locator('#cardboardMarket .compact-market-expand').click();
    const marketDialog = page.locator('#cardboardMarketDialog');
    await page.evaluate(() => {
        window.__observedBuildCue = null;
        const observer = new MutationObserver(() => {
            const card = document.querySelector('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"].cardboard-card-newly-built');
            if (card) window.__observedBuildCue = {
                animation: getComputedStyle(card).animationName,
                outline: getComputedStyle(card).outlineColor,
            };
        });
        observer.observe(document.getElementById('cardboardSeats'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect(marketDialog).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('cardboardMarketDialog').contains(document.activeElement))).toBe(true);
    const newCard = page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]');
    await expect(newCard.locator('.cardboard-count')).toHaveText('所有 ×1');
    await expect.poll(() => page.evaluate(() => window.__observedBuildCue?.animation)).toBe('cardboard-card-arrival');
    expect(await newCard.evaluate(card => card.closest('.cardboard-cards').scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => newCard.evaluate(card => {
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
    await page.evaluate(() => { window.__observedBuildCue = null; });
    await page.locator('#cardboardMarket .compact-market-expand').click();
    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect.poll(() => page.evaluate(() => window.__observedBuildCue)).toEqual({
        animation: 'none', outline: 'rgb(23, 102, 189)',
    });
    await page.locator('#cardboardMarketClose').click();
    await page.locator('#cardboardMarket .undo-btn').click();
    await page.locator('#confirmOkBtn').click();
    expect(await state(page)).toEqual(before);
    const saved = await page.evaluate(() => {
        saveGameState();
        const decoded = getLocalSaveRepository().read(isValidSavedGameState, 0);
        return { ok: decoded.ok, reason: decoded.reason };
    });
    expect(saved, JSON.stringify(saved)).toEqual({ ok: true, reason: undefined });
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
    // Observe the real DOM mutation before the click. A slow host may return
    // from click after the short animation has already ended.
    await page.evaluate(() => {
        window.landmarkCueObserved = false;
        const observer = new MutationObserver(records => {
            if (records.some(record => record.target.matches?.('[data-landmark-name="駅"].cardboard-landmark-newly-built') ||
                record.type === 'childList' && Array.from(record.addedNodes).some(node =>
                    node.matches?.('[data-landmark-name="駅"].cardboard-landmark-newly-built') ||
                    node.querySelector?.('[data-landmark-name="駅"].cardboard-landmark-newly-built')))) {
                window.landmarkCueObserved = true;
                observer.disconnect();
            }
        });
        observer.observe(document.getElementById('cardboardSeats'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.locator('#cardboardMarket [data-action="buildLandmark"][data-landmark-name="駅"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]')).toHaveClass(/cardboard-landmark-built/);
    await expect.poll(() => page.evaluate(() => window.landmarkCueObserved)).toBe(true);
    const receipt = page.locator('#cardboardDiceReceipt .cardboard-build-receipt[data-kind="landmark"]');
    await expect(receipt.locator('.cardboard-build-receipt-progress strong')).toHaveText('1/6');
    expect(await receipt.evaluate(element => element.getBoundingClientRect().height)).toBe(44);
    expect(await receipt.evaluate(element => {
        const build = element.getBoundingClientRect();
        const details = document.querySelector('#cardboardDiceReceipt .plaza-receipt-details > summary').getBoundingClientRect();
        return build.right <= details.left;
    })).toBe(true);

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

test('席の往復は1街だけを描画して棚位置を復元し、消えるカードのフォーカスを移す', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.slice(0, 16).map(card => createCardByName(card.name));
        render();
    });
    const before = await state(page);
    const shelf = page.locator('.cardboard-player-selected .cardboard-cards');
    await shelf.evaluate(element => { element.scrollLeft = 800; });
    await expect.poll(() => shelf.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const offset = await shelf.evaluate(element => element.scrollLeft);
    await page.locator('#cardboardRoster [data-cardboard-player-index="1"]').click();
    await expect(page.locator('#cardboardSeats .cardboard-player')).toHaveCount(1);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toHaveCount(0);
    await page.locator('#cardboardRoster [data-cardboard-player-index="0"]').click();
    await expect.poll(async () => Math.abs(await shelf.evaluate(element => element.scrollLeft) - offset)).toBeLessThanOrEqual(1);
    await shelf.locator('.cardboard-card').first().focus();
    await page.evaluate(() => {
        // Programmatic activation retains the card focus until the panel is
        // removed, unlike a pointer click which first focuses the roster.
        document.querySelector('#cardboardRoster [data-cardboard-player-index="1"]').click();
    });
    await expect(page.locator('#cardboardRoster [data-cardboard-player-index="1"]')).toBeFocused();
    await page.locator('#cardboardRoster [data-cardboard-player-index="0"]').click();
    expect(await state(page)).toEqual(before);
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
    const focusedShelf = page.locator('#cardboardSeats [data-player-index="0"] .cardboard-cards');
    await expect(page.locator('#cardboardSeats [data-player-index="0"] .cardboard-facility-scroll-hint')).toBeVisible();
    expect(await focusedShelf.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await focusedShelf.evaluate(element => element.firstElementChild.getBoundingClientRect().width)).toBeGreaterThanOrEqual(176);
    expect((await focusedShelf.locator('.cardboard-art').first().boundingBox()).height).toBeGreaterThanOrEqual(96);
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

test('確定した大収益を縦横PCで読めて再描画では演出を増やさない', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayer().cards = Array.from({ length: 6 }, () => createCardByName('森林'));
        game.phase = GAME_PHASES.ROLL;
        game.log = [];
        const crypto = window.crypto;
        const original = crypto.getRandomValues.bind(crypto);
        let nextRoll = true;
        Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value(buffer) {
            if (nextRoll) { buffer[0] = 4; nextRoll = false; return buffer; }
            return original(buffer);
        } });
        render();
        acceptHotseatHandoff();
    });
    await page.locator('#btnRoll').click();
    const income = page.locator('#cardboardDiceReceipt .cardboard-income-spotlight');
    await expect(income).toHaveCount(1);
    await expect(income.locator('.cardboard-income-amount')).toHaveText('+6コイン');
    await expect(income).toHaveAttribute('aria-label', '街1、施設の収支プラス6コイン');
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => income.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const amount = element.querySelector('.cardboard-income-amount').getBoundingClientRect();
            return rect.width > 0 && amount.left >= rect.left && amount.right <= rect.right &&
                amount.top >= rect.top && amount.bottom <= rect.bottom && rect.left >= 0 && rect.right <= innerWidth;
        })).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`cardboard-income-${viewport.width}.png`) });
        if (viewport.width === 844) {
            const town = page.locator('#cardboardSeats .cardboard-player-selected');
            await expect(town.locator('.cardboard-facility-scroll-hint')).toBeVisible();
            await town.locator('.cardboard-card .cardboard-effect').first().scrollIntoViewIfNeeded();
            expect(await town.evaluate(panel => {
                const bounds = panel.getBoundingClientRect();
                const effect = panel.querySelector('.cardboard-card .cardboard-effect').getBoundingClientRect();
                return effect.top >= bounds.top && effect.bottom <= bounds.bottom;
            })).toBe(true);
            await page.screenshot({ path: testInfo.outputPath('cardboard-income-844-scrolled.png') });
        }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => render());
    await expect(income).toHaveCount(1);
    await expect(income).toHaveCSS('animation-name', 'none');
    await selectTheme(page, 'classic');
    await selectTheme(page, 'cardboard');
    await expect(income).toHaveCount(1);
    await expect(income.locator('.cardboard-income-amount')).toHaveText('+6コイン');
    await expect(page.locator('.cardboard-transfers')).toHaveCount(0);
});


test('完成したランドマークの絵と目標を狭幅でも一緒に確認できる', async ({ page }, testInfo) => {
    for (const width of [320, 390, 1440]) {
        await prepare(page, { width, height: width === 1440 ? 936 : 844 }, 2, false);
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.phase = GAME_PHASES.BUILD;
            for (const name of getEnabledLandmarkSelection()) {
                game.currentPlayer().landmarks[name] = ![LANDMARK_NAMES.SHOPPING_MALL, LANDMARK_NAMES.AIRPORT].includes(name);
            }
            render();
        });
        await page.locator('#cardboardMarket .compact-market-expand').click();
        await page.locator('#cardboardMarketDialog .compact-market-goal-disclosure').evaluate(element => { element.open = true; });
        await page.locator('#cardboardMarketDialog [data-action="buildLandmark"][data-landmark-name="ショッピングモール"]').click();
        await page.keyboard.press('Escape');
        const receipt = page.locator('#cardboardDiceReceipt .cardboard-build-receipt[data-kind="landmark"]');
        await expect(receipt).toBeVisible();
        await expect(receipt.locator('.cardboard-build-receipt-name')).toHaveText('ショッピングモール');
        await expect(receipt.locator('.cardboard-build-receipt-progress strong')).toHaveText('5/6');
        await receipt.scrollIntoViewIfNeeded();
        expect(await receipt.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const names = element.querySelector('.cardboard-build-receipt-name').getBoundingClientRect();
            const progress = element.querySelector('.cardboard-build-receipt-progress').getBoundingClientRect();
            return [names, progress].every(box => box.left >= bounds.left && box.right <= bounds.right &&
                box.top >= bounds.top && box.bottom <= bounds.bottom) && bounds.left >= 0 && bounds.right <= innerWidth;
        })).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`landmark-progress-${width}.png`) });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('#cardboardSeats .cardboard-card').first().click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(receipt.locator('.cardboard-build-receipt-progress strong')).toHaveText('5/6');
    }
});


test('育てた街は必要なときだけ開き状態を変えず盤面へ戻れる', async ({ page }, testInfo) => {
    for (const width of [320, 844, 1440]) {
        await prepare(page, { width, height: width === 844 ? 390 : 900 }, 4);
        await selectTheme(page, 'cardboard');
        const before = await state(page);
        const content = page.locator('#cardboardTownContent');
        await expect(content).toBeEmpty();
        const open = page.locator('.cardboard-player-selected [data-cardboard-town]');
        await open.click();
        const dialog = page.locator('#cardboardTownDialog');
        await expect(dialog).toBeVisible();
        await expect(page.locator('#cardboardTownClose')).toBeFocused();
        await expect(content.locator('.town-street')).toBeVisible();
        await expect(content.locator('.town-summary > span')).toHaveCSS('color', 'rgb(37, 71, 53)');
        expect(await content.locator('.sunset-facility-art').count()).toBeGreaterThan(0);
        const bounds = await dialog.boundingBox();
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(await page.locator('#cardboardTownHeading').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(60);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(Math.abs(bounds.x - (width - bounds.x - bounds.width))).toBeLessThan(2);
        expect(await content.locator('.town-street').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight - 12)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`town-preview-${width}.png`) });
        expect(await state(page)).toEqual(before);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(content).toBeEmpty();
        await expect(open).toBeFocused();
        expect(await state(page)).toEqual(before);
        await open.click();
        await page.locator('#cardboardTownClose').click();
        await expect(open).toBeFocused();
        await open.click();
        await selectTheme(page, 'classic');
        await expect(dialog).toBeHidden();
        await expect(content).toBeEmpty();
        expect(await state(page)).toEqual(before);
    }
});


test('街を眺めている間に相手が勝利しても結果を覆わない', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 }, 2);
    await page.locator('.cardboard-player-selected [data-cardboard-town]').click();
    await expect(page.locator('#cardboardTownDialog')).toBeVisible();
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        for (const name of getEnabledLandmarkSelection()) game.players[1].landmarks[name] = true;
        render();
    });
    await expect(page.locator('.winner-screen')).toBeVisible();
    await expect(page.locator('#cardboardTownDialog')).toBeHidden();
    await expect(page.locator('#cardboardTownContent')).toBeEmpty();
});
