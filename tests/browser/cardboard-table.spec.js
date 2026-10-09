const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

for (const width of [844, 1440]) {
    for (const count of [2, 3, 4]) {
        test(`卓上盤面で全員の所有カードと中央市場を同時に比較できる ${width}px ${count}人`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: width === 844 ? 390 : 936 });
            await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
            await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto('/');
            expect(errors).toEqual([]);
            await page.evaluate(count => {
                if (typeof _pwaInstallController !== 'undefined') _pwaInstallController.dismissInstall();
                startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
                cancelCpuSchedule('cardboard-table');
                GameRuntimeState.runtime.setCpuPlayers(Array(count).fill(null));
                const game = GameRuntimeState.runtime.snapshot().game;
                game.currentPlayerIndex = 0;
                game.phase = GAME_PHASES.BUILD;
                game.players.forEach(player => {
                    player.coins = 30;
                    player.cards = ['麦畑', 'パン屋', 'カフェ'].map(createCardByName);
                });
                setTutorialEnabled(false);
                render();
                acceptHotseatHandoff();
            }, count);
            await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(width === 844 ? Math.min(count, 2) : count);
            await expect(page.locator('#cardboardMarket .compact-market-buy').first()).toBeVisible();
            await expect(page.locator('#cardboardMarket #buildMenu')).toHaveCount(0);
            if (width === 844) {
                await expect(page.locator('#cardboardRoster [data-cardboard-player-index]')).toHaveCount(count);
                await expect(page.locator('#cardboardRoster')).toBeVisible();
                const focus = await page.evaluate(() => {
                    const game = GameRuntimeState.runtime.snapshot().game;
                    const before = GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER);
                    const self = Number(document.querySelector('#cardboardSeats .cardboard-player-self').dataset.playerIndex);
                    const selected = (self + game.players.length - 1) % game.players.length;
                    document.querySelector(`#cardboardRoster [data-cardboard-player-index="${selected}"]`).click();
                    const seats = [...document.querySelectorAll('#cardboardSeats > .cardboard-player')];
                    return {
                        seats: seats.map(seat => Number(seat.dataset.playerIndex)),
                        selected: seats.find(seat => seat.classList.contains('cardboard-player-selected'))?.dataset.playerIndex,
                        self,
                        selectedIndex: selected,
                        stateUnchanged: JSON.stringify(before) === JSON.stringify(GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER)),
                        cardArtwork: [...document.querySelectorAll('#cardboardSeats .cardboard-card .cardboard-art')]
                            .every(art => art.getBoundingClientRect().height >= 16),
                        marketArtwork: document.querySelector('#cardboardMarket .compact-market-art')?.getBoundingClientRect().width,
                        page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
                    };
                });
                expect(focus.seats.sort((a, b) => a - b)).toEqual([focus.self, focus.selectedIndex].sort((a, b) => a - b));
                if (focus.selectedIndex !== focus.self) expect(focus.selected).toBe(String(focus.selectedIndex));
                expect(focus.stateUnchanged).toBe(true);
                expect(focus.cardArtwork).toBe(true);
                expect(focus.marketArtwork).toBeGreaterThanOrEqual(40);
                expect(focus.page[0]).toBeLessThanOrEqual(845);
                expect(focus.page[1]).toBeLessThanOrEqual(391);
                expect(await page.locator('#cardboardSeats .cardboard-card .cardboard-dice').evaluateAll(dice =>
                    dice.every(element => {
                        const label = element.getAttribute('data-category-label');
                        const style = getComputedStyle(element, '::after');
                        return label && style.content.includes(label) && parseFloat(style.fontSize) >= 11;
                    })
                )).toBe(true);
            }
            await expect.poll(() => page.evaluate(() => {
                const violations = [];
                if (document.documentElement.scrollHeight > innerHeight + 1) {
                    violations.push(`page height ${document.documentElement.scrollHeight}/${innerHeight}`);
                    for (const id of ['status', 'cardboardBoard', 'gameScreen']) {
                        const element = document.getElementById(id), css = getComputedStyle(element);
                        violations.push(`${id}: ${JSON.stringify(element.getBoundingClientRect().toJSON())} margin=${css.margin} padding=${css.padding} gap=${css.gap}`);
                    }
                    for (const element of document.querySelectorAll('body > *, #gameScreen > *')) {
                        const r = element.getBoundingClientRect();
                        if (r.width && r.height && r.bottom > innerHeight + 1) violations.push(`overflow ${element.id || element.className}: bottom ${r.bottom}`);
                    }
                }
                const inspect = (element, label) => {
                    if (!element) { violations.push(`${label}: missing`); return; }
                    const r = element.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 &&
                        r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1)) {
                        violations.push(`${label}: ${JSON.stringify(r.toJSON())}`);
                    }
                    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                        const style = getComputedStyle(parent), p = parent.getBoundingClientRect();
                        if (style.display === 'contents') continue;
                        if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (r.top < p.top - 1 || r.bottom > p.bottom + 1)) {
                            violations.push(`${label}: vertically clipped by ${parent.id || parent.className}`);
                        }
                        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (r.left < p.left - 1 || r.right > p.right + 1)) {
                            violations.push(`${label}: horizontally clipped by ${parent.id || parent.className}`);
                        }
                    }
                };
                [...document.querySelectorAll('#cardboardSeats > .cardboard-player')].forEach(panel => {
                    inspect(panel.querySelector('.cardboard-header'), `seat ${panel.dataset.playerIndex} HUD`);
                    [...panel.querySelectorAll('.cardboard-card')].slice(0, 3).forEach((card, index) => inspect(card, `seat ${panel.dataset.playerIndex} card ${index + 1}`));
                });
                inspect(document.querySelector('#cardboardMarket .compact-market-buy'), 'market card');
                inspect(document.querySelector('#cardboardActionSlot'), 'action slot');
                return violations;
            })).toEqual([]);
            const path = testInfo.outputPath(`table-${width}-${count}p.png`);
            await page.screenshot({ path });
            await testInfo.attach('卓の実画面', { path, contentType: 'image/png' });
            await expect(page.locator('#crashScreen')).toBeHidden();
        });
    }
}

test('にぎわい広場の横持ちイベント中に盤面と市場を操作できる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.evaluate(() => {
        if (typeof _pwaInstallController !== 'undefined') _pwaInstallController.dismissInstall();
        startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        cancelCpuSchedule('cardboard-live-roll');
        GameRuntimeState.runtime.setCpuPlayers(Array(4).fill(null));
        setTutorialEnabled(false);
        acceptHotseatHandoff();
    });
    await page.locator('#btnRoll').click();
    await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.phase)).toBe('build');
    await expect(page.locator('#cardboardDiceReceipt')).toContainText('出目');
    const eventLayout = await page.evaluate(() => {
        const market = document.querySelector('.compact-market-facilities');
        const firstCard = market.querySelector('.compact-market-buy');
        const marketRect = market.getBoundingClientRect();
        const cardRect = firstCard.getBoundingClientRect();
        return {
            page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
            marketScrollable: market.scrollHeight > market.clientHeight,
            firstMarketCardVisible: cardRect.width > 0 && cardRect.height > 0 &&
                cardRect.top >= marketRect.top - 1 && cardRect.bottom <= marketRect.bottom + 1,
            rollReceipt: document.querySelector('#cardboardDiceReceipt').innerText.trim(),
        };
    });
    expect(eventLayout.page[0]).toBeLessThanOrEqual(845);
    expect(eventLayout.page[1]).toBeLessThanOrEqual(391);
    expect(eventLayout.firstMarketCardVisible).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('cardboard-landscape-roll-event.png') });
    await testInfo.attach('出目イベント中の盤面', {
        path: testInfo.outputPath('cardboard-landscape-roll-event.png'), contentType: 'image/png',
    });
    expect(errors).toEqual([]);
});

test('10人戦終盤の施設密度でも自分の街と市場を選択できる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        if (typeof _pwaInstallController !== 'undefined') _pwaInstallController.dismissInstall();
        const names = ['麦畑', 'パン屋', 'カフェ', 'コンビニ', 'コーン畑', '森林', '鉱山', 'チーズ工場', '家具工場', 'リンゴ園'];
        startGameNow(10, Array.from({ length: 10 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        cancelCpuSchedule('cardboard-late-density');
        GameRuntimeState.runtime.setCpuPlayers(Array(10).fill(null));
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayerIndex = 0;
        game.phase = GAME_PHASES.BUILD;
        game.players.forEach((player, index) => {
            player.coins = 60;
            player.cards = names.map(createCardByName);
            if (index < 3) Object.keys(player.landmarks).slice(0, 5).forEach(name => { player.landmarks[name] = true; });
        });
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#cardboardRoster [data-cardboard-player-index]')).toHaveCount(10);
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(2);
    await expect(page.locator('#playerNavigation')).toBeHidden();
    const stressLayout = await page.evaluate(() => {
        const city = document.querySelector('#cardboardSeats .cardboard-player-self');
        const cards = city.querySelector('.cardboard-cards');
        const market = document.querySelector('#cardboardMarket .compact-market-buy');
        return {
            overflow: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
            cityCards: city.querySelectorAll('.cardboard-card').length,
            cityScrolls: cards.scrollWidth > cards.clientWidth || cards.scrollHeight > cards.clientHeight,
            art: [...city.querySelectorAll('.cardboard-card .cardboard-art')].slice(0, 3)
                .map(element => element.getBoundingClientRect().height),
            marketVisible: market.getBoundingClientRect().width > 0 && market.getBoundingClientRect().height > 0,
            rosterScrolls: document.querySelector('.cardboard-roster').scrollWidth > document.querySelector('.cardboard-roster').clientWidth,
        };
    });
    expect(stressLayout.overflow).toEqual([false, false]);
    expect(stressLayout.cityCards).toBe(10);
    expect(stressLayout.cityScrolls).toBe(true);
    expect(stressLayout.art.every(height => height >= 16)).toBe(true);
    expect(stressLayout.marketVisible).toBe(true);
    expect(stressLayout.rosterScrolls).toBe(true);
    const beforeBrowse = await page.evaluate(() => GameSnapshot.serializeUndoState(
        GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER
    ));
    await page.locator('#cardboardRoster [data-cardboard-player-index="9"]').click();
    await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toHaveAttribute('data-player-index', '9');
    expect(await page.evaluate(() => JSON.stringify(GameSnapshot.serializeUndoState(
        GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER
    )))).toBe(JSON.stringify(beforeBrowse));
    await page.screenshot({ path: testInfo.outputPath('cardboard-landscape-10p-endgame.png') });
    await testInfo.attach('10人戦終盤の高密度盤面', {
        path: testInfo.outputPath('cardboard-landscape-10p-endgame.png'), contentType: 'image/png',
    });
});
