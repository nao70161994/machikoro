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
        // Keep the turn context consistent with the controlled seat order.
        state.game.log = [];
        state.game.addLog(LOG_TYPES.SYSTEM, `👤 ${state.game.currentPlayer().name}のターン`);
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, { count, controlledCards });
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(count);
    await expect(page.locator('#cardboardTableViewport')).toHaveAttribute('data-table-scale', /[0-9]/);
    if (!await page.locator('#cardboardEventDetails').evaluate(element => element.open)) await page.locator('#cardboardEventDetails > summary').click();
}
const state = page => page.evaluate(() => GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
async function selectTheme(page, theme) {
    await page.evaluate(theme => {
        const select = document.getElementById('gameDesignThemeSelect');
        select.value = theme;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-design', theme);
    if (theme === 'cardboard' && !await page.locator('#cardboardEventDetails').evaluate(element => element.open)) {
        await page.locator('#cardboardEventDetails > summary').click();
    }
}

async function camera(page, command) {
    await page.locator(`[data-cardboard-camera="${command}"]`).click();
}
async function focusSeat(page, index) {
    await page.locator(`#cardboardRoster [data-cardboard-player-index="${index}"]`).click();
}
async function intrinsicCards(page, index) {
    return page.locator(`#cardboardSeats [data-player-index="${index}"] .cardboard-card`).evaluateAll(cards => cards.map(card => ({
        width: card.offsetWidth, height: card.offsetHeight,
        artHeight: card.querySelector('.cardboard-art').offsetHeight,
        name: card.querySelector('.cardboard-name').textContent,
        dice: card.querySelector('.cardboard-dice').textContent,
        count: card.querySelector('.cardboard-count').textContent,
        clipped: card.scrollHeight > card.clientHeight + 1,
    })));
}
for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }, { width: 1440, height: 936 }]) {
    test(`カード盤面は4ビュー切替でも同一状態と共有市場を保つ ${viewport.width}`, async ({ page }, testInfo) => {
        await prepare(page, viewport);
        const before = await state(page);
        for (const theme of ['plaza', 'sunset', 'classic', 'cardboard']) {
            await selectTheme(page, theme);
            expect(await state(page)).toEqual(before);
            await expect(page.locator('#buildMenu')).toHaveCount(1);
        }
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
        await expect(page.locator('#cardboardSeats > #cardboardCenter')).toHaveCount(1);
        await expect(page.locator('#cardboardSeats .cardboard-town-vignette')).toHaveCount(0);
        for (let index = 0; index < 4; index++) {
            const cards = await intrinsicCards(page, index);
            expect(cards.length).toBeGreaterThan(0);
            expect(cards.every(card => card.width >= 96 && card.artHeight >= 54 && card.name && card.dice && card.count && !card.clipped)).toBe(true);
        }
        const accents = await page.locator('#cardboardSeats > .cardboard-player').evaluateAll(players => players.map(player => getComputedStyle(player).borderTopColor));
        expect(new Set(accents).size, JSON.stringify(accents)).toBe(4);
        await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"] .cardboard-count')).toHaveText('所有 ×4');
        await camera(page, 'overview');
        expect(await page.locator('#cardboardTableViewport').evaluate(viewport => {
            const bounds = viewport.getBoundingClientRect();
            return [...viewport.querySelectorAll('.cardboard-player, #cardboardCenter')].every(element => {
                const box = element.getBoundingClientRect();
                return box.left >= bounds.left - 2 && box.right <= bounds.right + 2 && box.top >= bounds.top - 2 && box.bottom <= bounds.bottom + 2;
            });
        })).toBe(true);
        await focusSeat(page, 0);
        await page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]').click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await expect(page.locator('#cardDetailModal')).toContainText('麦畑');
        await expect(page.locator('#cardDetailModal .card-detail-art .sunset-facility-art')).toBeVisible();
        await page.locator('body').evaluate(body => body.classList.add('accessibility-high-contrast'));
        await expect(page.locator('#cardDetailModal .modal-content')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
        await page.locator('body').evaluate(body => body.classList.remove('accessibility-high-contrast'));
        await page.keyboard.press('Escape');
        expect(await state(page)).toEqual(before);
        await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.rollDice(3); render(); acceptHotseatHandoff(); });
        await expect(page.locator('#cardboardDiceReceipt')).toContainText('出目 3');
        await expect(page.locator('#cardboardDiceReceipt > .cardboard-transfer-summary')).toBeVisible();
        await expect(page.locator('#turnStatusAnnouncer')).toContainText('出目');
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
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

test('844×390のカード卓は自分の施設とランドマークへ移動できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 }, 2, false);
    const before = await state(page);
    await camera(page, 'self');
    const viewport = page.locator('#cardboardTableViewport');
    await expect(viewport).toHaveCSS('overflow-x', 'auto');
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(2);
    const card = page.locator('#cardboardSeats [data-player-index="0"] .cardboard-card').first();
    await card.click();
    await expect(page.locator('#cardDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await state(page)).toEqual(before);
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
    await camera(page, 'self');
    await expect(menu).not.toHaveAttribute('open', '');
});

test('1440pxの共通カード卓は全席を保持して選んだ施設へ移動できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 1440, height: 900 }, 2);
    const before = await state(page);
    await expect(page.locator('#cardboardRoster .cardboard-roster-seat')).toHaveCount(2);
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(2);
    await focusSeat(page, 1);
    await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toHaveAttribute('data-player-index', '1');
    const card = page.locator('#cardboardSeats [data-player-index="1"] .cardboard-card').first();
    await card.click();
    await expect(page.locator('#cardDetailModal')).toContainText('カフェ');
    await page.keyboard.press('Escape');
    await expect(card).toBeFocused();
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

test('844pxの終盤24種類は盤面上へ全て配置され末尾へ移動できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 }, 4, false);
    await page.evaluate(n => { GameRuntimeState.runtime.snapshot().game.players[0].cards = CARDS.slice(0, n).map(card => createCardByName(card.name)); render(); }, 24);
    const before = await state(page);
    const cards = page.locator('#cardboardSeats [data-player-index="0"] .cardboard-card');
    await expect(cards).toHaveCount(24);
    const intrinsic = await intrinsicCards(page, 0);
    expect(intrinsic.every(card => card.width >= 96 && card.artHeight >= 54 && !card.clipped)).toBe(true);
    await focusSeat(page, 0);
    await cards.first().click();
    await expect(page.locator('#cardDetailModal')).toContainText(intrinsic[0].name);
    await page.keyboard.press('Escape');
    await cards.last().click();
    await expect(page.locator('#cardDetailModal')).toContainText(intrinsic[intrinsic.length - 1].name);
    await page.keyboard.press('Escape');
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
    expect(await state(page)).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('late-844-last-card.png'), animations: 'disabled' });
});

test('1440pxの終盤12種類は一覧を保ち先頭から末尾へ移動できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 1440, height: 900 }, 2, false);
    await page.evaluate(n => { GameRuntimeState.runtime.snapshot().game.players[0].cards = CARDS.slice(0, n).map(card => createCardByName(card.name)); render(); }, 12);
    const before = await state(page);
    const cards = page.locator('#cardboardSeats [data-player-index="0"] .cardboard-card');
    await expect(cards).toHaveCount(12);
    const intrinsic = await intrinsicCards(page, 0);
    expect(intrinsic.every(card => card.width >= 96 && card.artHeight >= 54 && !card.clipped)).toBe(true);
    await focusSeat(page, 0);
    await cards.first().click();
    await expect(page.locator('#cardDetailModal')).toContainText(intrinsic[0].name);
    await page.keyboard.press('Escape');
    await cards.last().click();
    await expect(page.locator('#cardDetailModal')).toContainText(intrinsic[intrinsic.length - 1].name);
    await page.keyboard.press('Escape');
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(2);
    expect(await state(page)).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('late-1440-last-card.png'), animations: 'disabled' });
});

test('1440pxの少数施設も多人数卓でカードとして識別できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 1440, height: 936 }, 10, false);
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[0].cards = ['麦畑', 'パン屋'].map(createCardByName); render(); });
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(10);
    const cards = await intrinsicCards(page, 0);
    expect(cards.map(card => card.name)).toEqual(expect.arrayContaining(['麦畑', 'パン屋']));
    await focusSeat(page, 0);
    await page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="パン屋"]').click();
    await expect(page.locator('#cardDetailModal')).toContainText('パン屋');
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

test('4人戦の施設発動は全体盤面と補助カード詳細の同じ街で確認できる', async ({ page }) => {
    await prepare(page, { width: 320, height: 844 }, 4, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => { player.cards = []; });
        game.players[3].cards = [createCardByName('カフェ')];
        game.rollDice(3);
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
    const activated = page.locator('#cardboardSeats [data-player-index="3"] .cardboard-card-activated');
    await expect(activated).toHaveCount(1);
    await expect(page.locator('#cardboardSeats [data-player-index="3"]')).toContainText('カフェ');
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.players[3].coins += 1;
        render();
    });
    await expect(activated).toHaveCount(1);
    await expect(page.locator('#cardboardSeats [data-player-index="3"]')).toContainText('カフェ');
});

test('10人の所有カードを保持して全席へカメラを移動できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    const before = await state(page);
    for (const index of [9, 0, 9]) {
        await focusSeat(page, index);
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(10);
        await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toHaveAttribute('data-player-index', String(index));
        await expect(page.locator(`#cardboardSeats [data-player-index="${index}"] .cardboard-card`)).toHaveCount(1);
    }
    const focusedCard = page.locator('#cardboardSeats [data-player-index="9"] .cardboard-card').first();
    await focusedCard.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(focusedCard).toBeFocused();
    await expect(focusedCard).toHaveCSS('outline-style', 'solid');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(10);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await state(page)).toEqual(before);
});

for (const width of [1024, 1440]) {
    test(`${width}pxの多人数盤面は全員の街と完全なプレイヤー名を保持する`, async ({ page }) => {
        await prepare(page, { width, height: 936 }, 10, false);
        await page.evaluate(() => {
            GameRuntimeState.runtime.snapshot().game.players.forEach((player, index) => {
                player.name = `参加者プレイヤーの長い街の名前${index + 1}`;
            });
            render();
        });
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(10);
        for (let index = 0; index < 10; index++) {
            const city = page.locator(`#cardboardSeats [data-player-index="${index}"]`);
            await expect(page.locator(`#cardboardRoster [data-cardboard-player-index="${index}"] .cardboard-roster-name`)).toHaveText(`参加者プレイヤーの長い街の名前${index + 1}`);
            await expect(city.locator('.cardboard-player-heading')).toHaveAttribute('title', `席${index + 1}・参加者プレイヤーの長い街の名前${index + 1}`);
            expect((await city.boundingBox()).width).toBeGreaterThan(0);
        }
    });
}

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
        await expect(page.locator('#cardboardRoster button').first()).toContainText('目標');
        expect(await cards.evaluateAll(elements => elements.every(element => element.querySelector('.cardboard-count').textContent.includes('×1')))).toBe(true);
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
    await camera(page, 'market');
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
    await camera(page, 'market');
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
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
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
    await camera(page, 'market');
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
    await expect(station).toBeHidden();
    await camera(page, 'market');
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
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"] .cardboard-art')).toBeVisible();
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
    await camera(page, 'market');
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

test('席の往復は全員のカードを保持してカメラだけを動かす', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[0].cards = CARDS.slice(0, 16).map(card => createCardByName(card.name)); render(); });
    const before = await state(page);
    const counts = () => page.locator('#cardboardSeats > .cardboard-player').evaluateAll(players => players.map(player => player.querySelectorAll('.cardboard-card').length));
    const original = await counts();
    for (const index of [1, 0, 1, 0]) {
        await focusSeat(page, index);
        expect(await counts()).toEqual(original);
        await expect(page.locator('#cardboardSeats .cardboard-player-selected')).toHaveAttribute('data-player-index', String(index));
    }
    expect(await state(page)).toEqual(before);
});

test('盤面のパン位置は収支更新で保ち4ビュー往復でも正本を維持する', async ({ page }, testInfo) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[0].cards = CARDS.map(card => createCardByName(card.name)); render(); });
    await camera(page, 'readable');
    const viewport = page.locator('#cardboardTableViewport');
    await viewport.evaluate(element => { element.scrollLeft = 200; element.scrollTop = 120; });
    const position = () => viewport.evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop, scale: element.dataset.tableScale }));
    const beforePosition = await position();
    expect(beforePosition.left + beforePosition.top).toBeGreaterThan(0);
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[0].coins++; render(); });
    await expect.poll(position).toEqual(beforePosition);
    const before = await state(page);
    for (const other of ['plaza', 'classic', 'sunset']) {
        await selectTheme(page, other);
        await selectTheme(page, 'cardboard');
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
        expect(await state(page)).toEqual(before);
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

test('PC上席の多種類カードも出目・絵・名前・枚数を保持して末尾を操作できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 1440, height: 936 });
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[1].cards = CARDS.map(card => createCardByName(card.name)); render(); });
    const cards = await intrinsicCards(page, 1);
    expect(cards.length).toBeGreaterThan(6);
    expect(cards.every(card => card.width >= 96 && card.artHeight >= 54 && card.dice && card.name && card.count && !card.clipped)).toBe(true);
    await focusSeat(page, 1);
    await page.locator('#cardboardSeats [data-player-index="1"] .cardboard-card').last().click();
    await expect(page.locator('#cardDetailModal')).toContainText(cards[cards.length - 1].name);
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
    const resultSummary = page.locator('#cardboardEventDetails > summary');
    await expect(resultSummary).toContainText('+6');
    await expect(resultSummary).toContainText('施設6回');
    await expect(page.locator('#cardboardCurrentResult')).toHaveCSS('pointer-events', 'none');
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => income.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const amount = element.querySelector('.cardboard-income-amount').getBoundingClientRect();
            return rect.width > 0 && amount.left >= rect.left && amount.right <= rect.right &&
                amount.top >= rect.top && amount.bottom <= rect.bottom && rect.left >= 0 && rect.right <= innerWidth;
        })).toBe(true);
        expect(await resultSummary.evaluate(summary => {
            const bounds = summary.getBoundingClientRect();
            const table = document.getElementById('cardboardTableViewport').getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= table.top + 1;
        }), '収益表示は固定HUD内に収まり所有カードを覆わない').toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`cardboard-income-${viewport.width}.png`) });
        if (viewport.width === 844) {
            await camera(page, 'self');
            await expect(page.locator('#cardboardSeats [data-player-index="0"] .cardboard-card-activated')).toHaveCount(1);
            await page.screenshot({ path: testInfo.outputPath('cardboard-income-844-focused.png') });
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
        await camera(page, 'market');
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


test('施設カードの拡大縮小と全体復帰は正本を変えず全席を保つ', async ({ page }, testInfo) => {
    for (const width of [320, 844, 1440]) {
        await prepare(page, { width, height: width === 844 ? 390 : 900 }, 4);
        const before = await state(page);
        const viewport = page.locator('#cardboardTableViewport');
        await camera(page, 'overview');
        const fitScale = Number(await viewport.getAttribute('data-table-scale'));
        await camera(page, 'readable');
        expect(Number(await viewport.getAttribute('data-table-scale'))).toBeCloseTo(0.95, 2);
        await camera(page, 'in');
        expect(Number(await viewport.getAttribute('data-table-scale'))).toBeGreaterThan(0.95);
        await camera(page, 'out');
        await camera(page, 'market');
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
        await camera(page, 'overview');
        expect(Number(await viewport.getAttribute('data-table-scale'))).toBeCloseTo(fitScale, 2);
        expect(await state(page)).toEqual(before);
        await page.screenshot({ path: testInfo.outputPath(`facility-table-${width}.png`) });
    }
});

test('拡大市場を見ている間に相手が勝利しても結果を覆わない', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 }, 2);
    await camera(page, 'market');
    await camera(page, 'market');
    await page.locator('#cardboardMarket .compact-market-expand').click();
    await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        for (const name of getEnabledLandmarkSelection()) game.players[1].landmarks[name] = true;
        render();
    });
    await expect(page.locator('.winner-screen')).toBeVisible();
    await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
});

test('ロール中のサイコロは大きく見え操作を遮らず確定後に戻る', async ({ page }) => {
    for (const width of [320, 844, 1440]) {
        const height = width === 844 ? 390 : 900;
        await prepare(page, { width, height }, 2);
        await selectTheme(page, 'cardboard');
        const before = await state(page);
        await page.evaluate(() => { showTurnAnnouncer('ダイス確認', false, 0); updateDiceDisplay([], true); });
        await expect(page.locator('#turnAnnouncer')).toBeHidden();
        const stage = page.locator('#diceResult');
        await expect(stage).toHaveCSS('opacity', '1');
        await expect(stage).toHaveCSS('pointer-events', 'none');
        const box = await stage.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThan(height - 70);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(stage.locator('.rolling')).toHaveCSS('animation-name', 'none');
        expect(await stage.locator('.dice-face').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(60);
        await page.evaluate(() => updateDiceDisplay([5]));
        await expect(stage.locator('.rolling')).toHaveCount(0);
        expect(await stage.locator('.dice-face').evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(60);
        expect(await state(page)).toEqual(before);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
});
