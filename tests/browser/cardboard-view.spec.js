const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

// Every case owns its browser context and game. Let CI shard these independent
// cases across workers instead of assigning this entire long file to one job.
test.describe.configure({ mode: 'parallel' });

// Video and per-action trace snapshots can stall WebKit's rendering frames
// beyond these real 480ms animations. Keep source traces, failure screenshots,
// and explicit frame/geometry diagnostics without recording every repaint.
test.use({
    // Ordinary table fixtures are independent of asynchronous SW updates;
    // explicit banner cases and the PWA suite keep notification coverage.
    serviceWorkers: 'block',
    video: 'off',
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true },
});

async function prepare(page, viewport, count = 4, controlledCards = true) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { if (!localStorage.getItem('machikoroDesignTheme')) localStorage.setItem('machikoroDesignTheme', 'cardboard'); });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(({ count, controlledCards }) => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        const state = GameRuntimeState.runtime.snapshot();
        // Use actual human settings as well as a controlled human roster;
        // clearing CPU objects alone leaves shuffled CPU presentation settings.
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
    const button = page.locator(`[data-cardboard-camera="${command}"]`);
    if (!await button.isVisible()) await page.locator('#cardboardMoreMenu > summary').click();
    await button.click();
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
        await expect(page.locator('svg[data-local-facility-art="ready"]')).toHaveCount(1);
        await expect.poll(() => page.locator('#cardboardSeats .cardboard-card .cardboard-art use').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => node.getAttribute('href').startsWith('#facility-local-')))).toBe(true);
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
        const artRetained = await page.evaluate(() => {
            const owned = document.querySelector('#cardboardSeats [data-player-index="1"] .cardboard-card .cardboard-art svg');
            const market = document.querySelector('#cardboardMarket [data-card-name="麦畑"] .compact-market-art svg');
            GameRuntimeState.runtime.snapshot().game.rollDice(3);
            render(); acceptHotseatHandoff();
            return Boolean(owned && market) &&
                owned === document.querySelector('#cardboardSeats [data-player-index="1"] .cardboard-card .cardboard-art svg') &&
                market === document.querySelector('#cardboardMarket [data-card-name="麦畑"] .compact-market-art svg');
        });
        expect(artRetained).toBe(true);
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

for (const width of [390, 1440]) test(`12の出目では建設候補を市場内の見える位置へ送る ${width}px`, async ({ page }) => {
    await prepare(page, { width, height: 900 }, 2, false);
    const initiallyBelow = await page.locator('#cardboardMarket .compact-market-facilities').evaluate(shelf => {
        const target = [...shelf.querySelectorAll('.compact-market-item')].find(item => item.textContent.includes('マグロ漁船'));
        return target.getBoundingClientRect().bottom > shelf.getBoundingClientRect().bottom + 1;
    });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = [];
        game.players[0].landmarks[LANDMARK_NAMES.STATION] = true;
        game.rollDice();
        game.selectDiceCount(true, 6, 6);
        render();
    });
    const market = page.locator('#cardboardMarket .compact-market-facilities');
    const match = market.locator('.compact-market-roll-match').first();
    await expect(match).toBeVisible();
    const readGeometry = () => match.evaluate(item => {
        const element = item.closest('.compact-market-facilities');
        const shelf = element.getBoundingClientRect();
        const card = item.getBoundingClientRect();
        const clippedBy = [];
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const style = getComputedStyle(ancestor);
            const bounds = ancestor.getBoundingClientRect();
            if (/auto|scroll|hidden|clip/.test(style.overflowX) &&
                (card.left < bounds.left - 1 || card.right > bounds.right + 1)) clippedBy.push(`${ancestor.id || ancestor.className}:x`);
            if (/auto|scroll|hidden|clip/.test(style.overflowY) &&
                (card.top < bounds.top - 1 || card.bottom > bounds.bottom + 1)) clippedBy.push(`${ancestor.id || ancestor.className}:y`);
        }
        return { scrollTop: element.scrollTop, overflows: element.scrollHeight > element.clientHeight + 1,
            shelfTop: shelf.top, shelfBottom: shelf.bottom, cardTop: card.top, cardBottom: card.bottom,
            clippedBy, inViewport: card.left >= 0 && card.right <= innerWidth + 1 && card.top >= 0 && card.bottom <= innerHeight + 1 };
    });
    // Market layout and its reveal run on successive animation frames.
    await expect.poll(async () => {
        const current = await readGeometry();
        return current.cardTop >= current.shelfTop - 1 && current.cardBottom <= current.shelfBottom + 1 &&
            (!initiallyBelow || current.scrollTop > 0);
    }).toBe(true);
    const geometry = await readGeometry();
    // A desktop shelf can already show this card. Overflow alone (including
    // a highlighted card's outline) does not mean the target needs movement.
    if (initiallyBelow) expect(geometry.scrollTop).toBeGreaterThan(0);
    else expect(geometry.scrollTop).toBeGreaterThanOrEqual(0);
    expect(geometry.cardTop).toBeGreaterThanOrEqual(geometry.shelfTop);
    expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.shelfBottom);
    expect(geometry.clippedBy).toEqual([]);
    expect(geometry.inViewport).toBe(true);
});

test('4人戦の施設発動は全体盤面と補助カード詳細の同じ街で確認できる', async ({ page }, testInfo) => {
    await prepare(page, { width: 320, height: 844 }, 4, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => { player.cards = []; });
        game.players[3].cards = [createCardByName('カフェ')];
        render();
        window.rolledFacilityArt = document.querySelector('#cardboardSeats [data-player-index="3"] .cardboard-card .cardboard-art svg');
        game.rollDice(3);
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
    const activated = page.locator('#cardboardSeats [data-player-index="3"] .cardboard-card-activated');
    await expect(activated).toHaveCount(1);
    expect(await page.evaluate(() => window.rolledFacilityArt === document.querySelector('#cardboardSeats [data-player-index="3"] .cardboard-card .cardboard-art svg'))).toBe(true);
    await page.locator('#cardboardEventDetails').evaluate(element => { element.open = false; });
    await focusSeat(page, 3);
    await page.screenshot({path:testInfo.outputPath('art-stable-roll.png')});
    await expect(page.locator('#cardboardSeats [data-player-index="3"]')).toContainText('カフェ');
    await page.evaluate(() => {
        window.unchangedFacilityArt = document.querySelector('#cardboardSeats [data-player-index="3"] .cardboard-card .cardboard-art svg');
        GameRuntimeState.runtime.snapshot().game.players[3].coins += 1;
        render();
    });
    expect(await page.evaluate(() => window.unchangedFacilityArt === document.querySelector('#cardboardSeats [data-player-index="3"] .cardboard-card .cardboard-art svg'))).toBe(true);
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
    await page.locator('#cardboardMoreMenu > summary').click();
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
    await expect(page.getByRole('region', { name: '出目と発動結果', includeHidden: true })).toHaveAttribute('aria-live', 'off');
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

const marketRoundTripCases = 10;
const marketRoundTripThemes = ['plaza', 'cardboard'];
for (let roundTripBatch = 1; roundTripBatch <= marketRoundTripCases; roundTripBatch++) {
    test(`専用市場との高速往復は正本とランドマーク操作のフォーカスを維持する (${roundTripBatch}/${marketRoundTripCases})`, async ({ page }) => {
        await prepare(page, { width: 1440, height: 936 });
        await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD; render(); acceptHotseatHandoff(); });
        const before = await state(page);
        await page.evaluate(() => { window.sharedMarketBeforeRoundTrips = document.getElementById('buildMenu'); });
        const landmarkName = await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            const player = game.currentPlayer();
            return Object.keys(player.landmarks).find(name => game.enabledLandmarks.has(name) &&
                !player.landmarks[name] && Player.landmarkCost(name) <= player.coins);
        });
        expect(landmarkName).toBeTruthy();
        // A compact overview deliberately hides the landmark list. Exercise the
        // real native market, then verify focus returns to its visible launcher.
        // Theme detach closes disclosures, so a hidden landmark is not a valid
        // focus target across that separate presentation transition.
        await camera(page, 'market');
        const launcher = page.locator('#cardboardMarket .compact-market-expand');
        await launcher.click();
        const dialog = page.locator('#cardboardMarketDialog');
        await expect(dialog).toBeVisible();
        await dialog.locator('.compact-market-goal-disclosure > summary').click();
        const landmark = dialog.locator('[data-action="buildLandmark"]:enabled').first();
        await expect(landmark).toBeVisible();
        const currentName = await landmark.getAttribute('data-landmark-name');
        expect(currentName).toBe(landmarkName);
        await landmark.focus();
        await expect(landmark).toBeFocused();
        await page.locator('#cardboardMarketClose').click();
        await expect(dialog).toBeHidden();
        await expect(launcher).toBeVisible();
        await expect(launcher).toBeFocused();
        // Ten isolated round trips retain all twenty theme changes without
        // making five complete UI journeys share one 45-second deadline.
        // Do not focus a closed goal disclosure after the mode has detached.
        const transitions = await page.evaluate(themes => {
            const snapshots = [];
            const select = document.getElementById('gameDesignThemeSelect');
            for (const theme of themes) {
                select.value = theme;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                if (document.querySelectorAll('#buildMenu').length !== 1 ||
                    document.getElementById('buildMenu') !== window.sharedMarketBeforeRoundTrips) {
                    throw new Error('view transition replaced or duplicated the shared market');
                }
                snapshots.push(GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
            }
            return snapshots;
        }, marketRoundTripThemes);
        for (const snapshot of transitions) expect(snapshot).toEqual(before);
        expect(await state(page)).toEqual(before);
    });
}

test('市場の即時再表示は古いcloseイベントで共有DOMとフォーカスを失わない', async ({ page }) => {
    await prepare(page, { width: 1440, height: 936 });
    const before = await state(page);
    const reopened = await page.evaluate(async () => {
        const dialog = document.getElementById('cardboardMarketDialog');
        const shared = document.getElementById('cardboardMarket');
        const buildMenu = document.getElementById('buildMenu');
        shared.querySelector('.compact-market-expand').focus({ preventScroll: true });
        // Await the actual queued native event, rather than guessing when a
        // timeout or a rendering frame will deliver it after the second open.
        const closed = new Promise(resolve => dialog.addEventListener('close', () => resolve(), { once: true }));
        CardBoardField.openMarket();
        CardBoardField.closeMarket();
        CardBoardField.openMarket();
        await closed;
        return {
            modal: dialog.open && dialog.matches(':modal'),
            shared: document.getElementById('cardboardMarket') === shared && document.getElementById('buildMenu') === buildMenu,
            inside: dialog.contains(shared),
            focused: dialog.contains(document.activeElement),
        };
    });
    expect(reopened).toEqual({ modal: true, shared: true, inside: true, focused: true });
    expect(await state(page)).toEqual(before);
    await page.locator('#cardboardMarketClose').click();
    await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
    await expect(page.locator('#cardboardMarket .compact-market-expand')).toBeFocused();
});

// Retain the original same-page five-cycle stress contract separately from
// the ten detailed isolated cases above. Batch observations, not UI actions.
test('同じ対局で市場と表示モードを5連続往復して共有DOMとフォーカスを保つ', async ({ page }) => {
    await prepare(page, { width: 1440, height: 936 });
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD;
        render();
        acceptHotseatHandoff();
        window.sharedMarketBeforeRoundTrips = document.getElementById('buildMenu');
    });
    const before = await state(page);
    let expectedLandmark;
    for (let cycle = 0; cycle < 5; cycle++) {
        await camera(page, 'market');
        await page.locator('#cardboardMarket .compact-market-expand').click();
        const dialog = page.locator('#cardboardMarketDialog');
        await dialog.locator('.compact-market-goal-disclosure > summary').click();
        const opened = await dialog.evaluate(element => {
            const landmark = element.querySelector('[data-action="buildLandmark"]:enabled');
            landmark?.focus();
            const bounds = landmark?.getBoundingClientRect();
            return {
                open: element.open && element.matches(':modal'),
                goalOpen: element.querySelector('.compact-market-goal-disclosure').open,
                name: landmark?.getAttribute('data-landmark-name'),
                enabled: !!landmark && !landmark.disabled,
                visible: !!bounds && bounds.width > 0 && bounds.height > 0 && getComputedStyle(landmark).visibility !== 'hidden',
                focused: !!landmark && document.activeElement === landmark,
            };
        });
        if (cycle === 0) expectedLandmark = opened.name;
        expect(expectedLandmark).toBeTruthy();
        expect(opened, `市場往復 ${cycle + 1}/5 の拡大市場`).toEqual({ open: true, goalOpen: true, name: expectedLandmark, enabled: true, visible: true, focused: true });
        await page.locator('#cardboardMarketClose').click();
        // Closing restores launcher focus asynchronously after dialog teardown.
        // Preserve the original retrying focus contract before batch observation.
        await expect(page.locator('#cardboardMarket .compact-market-expand'), `市場往復 ${cycle + 1}/5 の起動ボタンへフォーカス復帰`).toBeFocused();
        const closed = await page.evaluate(themes => {
            const dialog = document.getElementById('cardboardMarketDialog');
            const launcher = document.querySelector('#cardboardMarket .compact-market-expand');
            const bounds = launcher.getBoundingClientRect();
            const closed = !dialog.open;
            const focused = document.activeElement === launcher;
            const visible = bounds.width > 0 && bounds.height > 0 && getComputedStyle(launcher).visibility !== 'hidden';
            const transitions = [];
            const select = document.getElementById('gameDesignThemeSelect');
            for (const theme of themes) {
                select.value = theme;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                transitions.push({
                    theme: document.documentElement.dataset.design,
                    shared: document.querySelectorAll('#buildMenu').length === 1 &&
                        document.getElementById('buildMenu') === window.sharedMarketBeforeRoundTrips,
                    snapshot: GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER),
                });
            }
            return { closed, focused, visible, transitions };
        }, marketRoundTripThemes);
        expect({ closed: closed.closed, focused: closed.focused, visible: closed.visible }, `市場往復 ${cycle + 1}/5 の閉じる操作`).toEqual({ closed: true, focused: true, visible: true });
        expect(closed.transitions.map(item => ({ theme: item.theme, shared: item.shared })), `市場往復 ${cycle + 1}/5 のテーマ変更`)
            .toEqual(marketRoundTripThemes.map(theme => ({ theme, shared: true })));
        for (const transition of closed.transitions) expect(transition.snapshot, `市場往復 ${cycle + 1}/5 の ${transition.theme} 正本`).toEqual(before);
    }
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
    // A purchase cue must remain pending while the native market covers it.
    await page.waitForTimeout(1400);
    await expect(page.locator('#cardboardSeats .cardboard-card-newly-built')).toHaveCount(0);
    await page.evaluate(() => {
        window.buildCueAfterMarketClose = false;
        const observer = new MutationObserver(() => {
            if (document.querySelector('#cardboardSeats [data-card-name="麦畑"].cardboard-card-newly-built')) {
                window.buildCueAfterMarketClose = true;
                observer.disconnect();
            }
        });
        observer.observe(document.getElementById('cardboardSeats'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.locator('#cardboardMarketClose').click();
    await expect.poll(() => page.evaluate(() => window.buildCueAfterMarketClose)).toBe(true);
    await expect.poll(() => page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]').evaluate(card => {
        const bounds = card.getBoundingClientRect();
        const viewport = document.getElementById('cardboardTableViewport').getBoundingClientRect();
        return bounds.width >= 96 && bounds.left >= viewport.left && bounds.right <= viewport.right &&
            bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
    })).toBe(true);
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
        window.__observedBuildFlight = null;
        window.__observedBuildNotice = null;
        let observedFlight = null;
        const observer = new MutationObserver(() => {
            const notice = document.getElementById('cardboardBuildNotice');
            if (notice) window.__observedBuildNotice = {
                visible: notice.getClientRects().length > 0 && getComputedStyle(notice).visibility !== 'hidden',
                text: notice.textContent, art: notice.querySelectorAll('svg').length,
                pointerEvents: getComputedStyle(notice).pointerEvents,
                animation: getComputedStyle(notice).animationName,
            };
            const flight = document.getElementById('cardboardBuildFlight');
            const animation = flight?.getAnimations()[0];
            if (flight && animation && flight !== observedFlight) {
                observedFlight = flight;
                window.__observedBuildFlight = {
                    name: flight.dataset.cardName, text: flight.textContent,
                    hidden: flight.getAttribute('aria-hidden'), pointerEvents: getComputedStyle(flight).pointerEvents,
                    duration: animation.effect.getTiming().duration,
                    keyframes: animation.effect.getKeyframes().map(frame => frame.transform),
                    art: flight.querySelectorAll('svg').length,
                    artVisible: Array.from(flight.querySelectorAll('svg')).every(svg => {
                        const rect = svg.getBoundingClientRect();
                        return getComputedStyle(svg).display !== 'none' && rect.width > 0 && rect.height > 0;
                    }),
                };
            }
            const card = document.querySelector('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"].cardboard-card-newly-built');
            if (card) window.__observedBuildCue = {
                animation: getComputedStyle(card).animationName,
                outline: getComputedStyle(card).outlineColor,
            };
        });
        observer.observe(document.getElementById('cardboardBoard'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect(marketDialog).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('cardboardMarketDialog').contains(document.activeElement))).toBe(true);
    const newCard = page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]');
    await expect(newCard.locator('.cardboard-count')).toHaveText('所有 ×1');
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
    await expect.poll(() => newCard.evaluate(card => {
        const list = card.closest('.cardboard-cards').getBoundingClientRect();
        const bounds = card.getBoundingClientRect();
        return bounds.left >= list.left - 1 && bounds.right <= list.right + 1;
    })).toBe(true);
    const built = await state(page);
    await page.keyboard.press('Escape');
    await expect(marketDialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__observedBuildCue?.animation)).toBe('cardboard-card-arrival');
    await expect.poll(() => page.evaluate(() => window.__observedBuildFlight?.name)).toBe('麦畑');
    const flight = await page.evaluate(() => window.__observedBuildFlight);
    expect(flight.hidden).toBe('true');
    expect(flight.pointerEvents).toBe('none');
    expect(flight.duration).toBe(480);
    expect(flight.art).toBe(1);
    expect(flight.artVisible).toBe(true);
    expect(flight.text).toContain('麦畑');
    expect(flight.keyframes.length).toBeGreaterThanOrEqual(2);
    expect(flight.keyframes[0]).not.toBe(flight.keyframes.at(-1));
    const buildNotice = page.locator('#cardboardBuildNotice');
    // Record short-lived layers in the same browser microtask. A slow remote
    // WebKit can finish later flight assertions after this 1200ms notice ends.
    const notice = await page.evaluate(() => window.__observedBuildNotice);
    expect(notice.visible).toBe(true);
    expect(notice.text).toContain('街1が建設');
    expect(notice.text).toContain('麦畑');
    expect(notice.text).toContain('建設費 1コイン');
    expect(notice.art).toBe(1);
    expect(notice.pointerEvents).toBe('none');
    await selectTheme(page, 'plaza');
    await expect(buildNotice).toHaveCount(0);
    await expect(page.locator('#gameDesignThemeSelect')).toBeFocused();
    expect(await state(page)).toEqual(built);
    await selectTheme(page, 'cardboard');
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]')).not.toHaveClass(/cardboard-card-newly-built/);
    await page.locator('#cardboardMarket .undo-btn').click();
    await page.locator('#confirmOkBtn').click();
    await expect(buildNotice).toHaveCount(0);
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"]')).toHaveCount(0);
    expect(await state(page)).toEqual(before);
    await page.evaluate(() => document.body.classList.add('accessibility-reduced-motion'));
    await page.evaluate(() => { window.__observedBuildCue = null; window.__observedBuildFlight = null; window.__observedBuildNotice = null; });
    await camera(page, 'market');
    await page.locator('#cardboardMarket .compact-market-expand').click();
    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
    await page.locator('#cardboardMarketClose').click();
    await expect.poll(() => page.evaluate(() => window.__observedBuildCue)).toEqual({
        animation: 'none', outline: 'rgb(23, 102, 189)',
    });
    expect(await page.evaluate(() => window.__observedBuildNotice)).toMatchObject({ visible: true, animation: 'none' });
    expect(await page.evaluate(() => window.__observedBuildFlight)).toBeNull();
    await expect(page.locator('#cardboardBuildFlight')).toHaveCount(0);
    await page.locator('#cardboardMarket .undo-btn').click();
    await page.locator('#confirmOkBtn').click();
    await expect(buildNotice).toHaveCount(0);
    expect(await state(page)).toEqual(before);
    // A visible result caption represents an ongoing event layer. A rapid
    // purchase may update the real card, but must not add another focal layer.
    await page.evaluate(() => {
        document.body.classList.remove('accessibility-reduced-motion');
        window.__observedBuildFlight = null;
        const caption = document.createElement('div');
        caption.id = 'activeConstructionGuardFixture';
        caption.className = 'cardboard-activation-tag';
        caption.textContent = '発動を確認中';
        caption.style.cssText = 'position:fixed;left:20px;top:120px;width:160px;height:40px;display:block;visibility:visible';
        document.getElementById('cardboardBoard').appendChild(caption);
    });
    await camera(page, 'market');
    await page.locator('#cardboardMarket .compact-market-expand').click();
    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
    await page.locator('#cardboardMarketClose').click();
    await expect(newCard.locator('.cardboard-count')).toHaveText('所有 ×1');
    await page.evaluate(() => new Promise(resolve => {
        let frames = 0;
        const tick = () => ++frames >= 6 ? resolve() : requestAnimationFrame(tick);
        requestAnimationFrame(tick);
    }));
    await expect(page.locator('#activeConstructionGuardFixture')).toBeVisible();
    await expect(buildNotice).toHaveCount(0);
    await expect(page.locator('#cardboardBuildFlight')).toHaveCount(0);
    expect(await page.evaluate(() => window.__observedBuildFlight)).toBeNull();
    await page.locator('#activeConstructionGuardFixture').evaluate(element => element.remove());
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
    await page.evaluate(() => {
        window.reducedLandmarkCue = null;
        const observer = new MutationObserver(() => {
            const target = document.querySelector('#cardboardSeats [data-landmark-name="駅"].cardboard-landmark-newly-built');
            if (!target) return;
            const style = getComputedStyle(target);
            window.reducedLandmarkCue = { animation: style.animationName, outline: style.outlineColor };
            observer.disconnect();
        });
        observer.observe(document.getElementById('cardboardSeats'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.locator('#cardboardMarket [data-action="buildLandmark"][data-landmark-name="駅"]').click();
    const station = page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]');
    await expect(station).toHaveClass(/cardboard-landmark-built/);
    await expect.poll(() => page.evaluate(() => window.reducedLandmarkCue)).toEqual({ animation: 'none', outline: 'rgb(180, 122, 9)' });
});

for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
test(`にぎわい広場の勝利カードコレクション ${viewport.width}px`, async ({ page }) => {
    await prepare(page, viewport, 2, false);
    await page.evaluate(() => {
        const state = GameRuntimeState.runtime.snapshot();
        cancelCpuSchedule('cardboard-winner-layout');
        state.game.currentPlayerIndex = 0;
        state.game.players[0].cards = CARDS.slice(0, 18).flatMap(card => [card, card]);
        for (const name of getEnabledLandmarkSelection()) state.game.players[0].landmarks[name] = true;
        showTurnAnnouncer(state.game.players[0].name, false, 0);
        render();
    });
    await expect(page.locator('.winner-screen')).toBeVisible();
    await expect(page.locator('#turnAnnouncer')).toBeHidden();
    await expect(page.locator('.winner-stats-row').first()).toHaveClass(/highlight/);
    await expect(page.locator('.winner-stats-row').first().locator('.winner-result-progress')).toContainText('施設 36枚');
    expect(await page.evaluate(() => turnAnnouncerTimerController.snapshot().timerAttached)).toBe(false);
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
    expect(geometry.screen.width, JSON.stringify(geometry)).toBeGreaterThanOrEqual(Math.min(400, viewport.width - 48));
    expect(geometry.title.x).toBeGreaterThanOrEqual(0);
    expect(geometry.title.x + geometry.title.width).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.title.y, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.winner-title')).toBeFocused();
    const rematchBottom = await page.locator('#winnerRematchButton').evaluate(element => element.getBoundingClientRect().bottom);
    expect(rematchBottom).toBeLessThan(viewport.height);
    await expect(page.locator('.cardboard-winner-collection')).toBeVisible();
    await expect(page.locator('.cardboard-winner-collection .cardboard-card')).toHaveCount(18);
    if (viewport.width <= 390) {
        const firstRow = await page.locator('.cardboard-winner-collection .cardboard-card').evaluateAll(cards =>
            cards.slice(0, 2).map(card => ({ x: card.getBoundingClientRect().x, y: card.getBoundingClientRect().y })));
        expect(firstRow[1].x).toBeGreaterThan(firstRow[0].x);
        expect(Math.abs(firstRow[1].y - firstRow[0].y)).toBeLessThanOrEqual(1);
    }
    await expect(page.locator('.cardboard-winner-collection .cardboard-landmark-built')).toHaveCount(6);
    const landmarkNames = await page.locator('.cardboard-winner-collection .cardboard-landmark').evaluateAll(elements => elements.map(element => {
        const name = element.querySelector('.cardboard-name');
        const bounds = name.getBoundingClientRect();
        const words = [...name.querySelectorAll('.cardboard-name-word')].map(word => word.getBoundingClientRect());
        return { name: name.textContent, top: element.getBoundingClientRect().top,
            complete: name.textContent === element.getAttribute('data-landmark-name'),
            wordsFit: words.length > 0 && words.every(word => word.left >= bounds.left && word.right <= bounds.right + 1),
            mallWords: element.getAttribute('data-landmark-name') === 'ショッピングモール'
                ? [...name.querySelectorAll('.cardboard-name-word')].map(word => word.textContent) : null };
    }));
    expect(landmarkNames.every(name => name.complete && name.wordsFit), JSON.stringify(landmarkNames)).toBe(true);
    expect(landmarkNames.find(name => name.mallWords).mallWords).toEqual(['ショッピング', 'モール']);
    if (viewport.width === 1440) expect(new Set(landmarkNames.map(name => Math.round(name.top))).size).toBe(1);

    await expect(page.locator('.cardboard-winner-collection .town-street')).toHaveCount(0);
    const owned = page.locator('.cardboard-winner-collection [data-card-name="麦畑"]');
    await owned.click();
    await expect(page.locator('#cardDetailModal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(owned).toBeFocused();
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
    if (process.env.CARDBOARD_REVIEW_ARTIFACT_DIR) {
        const artifactDir = path.resolve(process.env.CARDBOARD_REVIEW_ARTIFACT_DIR);
        await fs.mkdir(artifactDir, { recursive: true });
        await fs.writeFile(path.join(artifactDir, `cardboard-winner-${viewport.width}.png`), screenshot);
        await fs.writeFile(path.join(artifactDir, `cardboard-winner-${viewport.width}-geometry.json`), JSON.stringify(geometry, null, 2));
    }
    await page.evaluate(() => document.body.classList.add('accessibility-high-contrast'));
    await expect(page.locator('.winner-screen')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('.winner-screen')).toHaveCSS('border-top-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.winner-title')).toHaveCSS('color', 'rgb(255, 230, 109)');
    await expect(page.locator('.winner-stats-row.highlight')).toHaveCSS('color', 'rgb(255, 230, 109)');
    await expect(page.locator('.winner-stats-row:not(.highlight)').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
});
}

test('10人CPU対局で自分の席が未確定でも現在手番のカード盤面を表示する', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const before = await state(page);
    const owners = await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        CardBoardField.render({ game, selfIndex: -1, escapeHtml, enabledLandmarks: Player.landmarkNames(), session: 'cpu-boundary', display: LOG_TYPE_DISPLAY });
        return game.players.map(player => [...new Set(player.cards.map(card => card.name))]);
    });
    // An observer has no personal seat. Keep the real actor selected without
    // labelling that player as the observer themselves.
    await expect(page.locator('#cardboardSeats .cardboard-player-self')).toHaveCount(0);
    await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(10);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toHaveClass(/cardboard-player-selected/);
    for (let index = 0; index < owners.length; index++) {
        const cards = await intrinsicCards(page, index);
        expect(cards.map(card => card.name).sort()).toEqual(owners[index].sort());
    }
    expect(await state(page)).toEqual(before);
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
    await expect(resultSummary.locator('.cardboard-event-preview-name').first()).toHaveText('森林');
    await expect(resultSummary.locator('.cardboard-event-preview-owner').first()).toContainText('銀行→席1');
    await expect(resultSummary.locator('.cardboard-event-preview-owner').first()).toContainText('+6コイン');
    await expect(resultSummary.locator('.cardboard-event-preview-art svg').first()).toBeHidden();
    await page.locator('#diceResult .dice-face').first().evaluate(element => element.classList.add('rolling'));
    await expect(resultSummary.locator('.cardboard-result-detail')).toHaveCSS('visibility', 'hidden');
    await page.locator('#diceResult .dice-face').first().evaluate(element => element.classList.remove('rolling'));
    await expect(resultSummary.locator('.cardboard-result-detail')).toBeHidden();
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
        await page.locator('#cardboardEventDetails').evaluate(element => { element.open = false; });
        await page.screenshot({ path: testInfo.outputPath(`activation-preview-${viewport.width}.png`) });
        await page.locator('#cardboardEventDetails').evaluate(element => { element.open = true; });
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


for (const width of [320, 390, 1440]) test(`完成したランドマークの絵と目標を狭幅でも一緒に確認できる ${width}px`, async ({ page }, testInfo) => {
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
    await page.locator('#cardboardMarketDialog .compact-market-goal-disclosure > summary').click();
    await page.locator('#cardboardMarketDialog [data-action="buildLandmark"][data-landmark-name="ショッピングモール"]').click();
    await page.keyboard.press('Escape');
    // Market goals close other auxiliary panels. Reopen the confirmed
    // result through its live control before inspecting its details.
    await page.locator('#cardboardEventDetails > summary').click();
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
});


test('施設カードの拡大縮小と全体復帰は正本を変えず全席を保つ', async ({ page }, testInfo) => {
    for (const width of [320, 844, 1440]) {
        await prepare(page, { width, height: width === 844 ? 390 : 900 }, 4);
        const before = await state(page);
        const viewport = page.locator('#cardboardTableViewport');
        await camera(page, 'overview');
        const fitScale = Number(await viewport.getAttribute('data-table-scale'));
        await camera(page, 'readable');
        const readableScale = Number(await viewport.getAttribute('data-table-scale'));
        expect(readableScale).toBeGreaterThanOrEqual(0.95);
        expect(readableScale).toBeLessThanOrEqual(1.6);
        const readableCard = page.locator('#cardboardSeats [data-player-index="0"] .cardboard-card').first();
        expect((await readableCard.boundingBox()).width).toBeGreaterThanOrEqual(160 * 0.95 - 1);
        await camera(page, 'in');
        const enlargedScale = Number(await viewport.getAttribute('data-table-scale'));
        expect(enlargedScale).toBeGreaterThan(readableScale);
        expect(enlargedScale).toBeLessThanOrEqual(1.8);
        await camera(page, 'out');
        expect(Number(await viewport.getAttribute('data-table-scale'))).toBeLessThan(enlargedScale);
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
        await expect(stage.locator('.rolling')).toHaveCSS('animation-name', 'cardboard-die-toss');
        await expect(stage.locator('.rolling')).toHaveCSS('animation-duration', '0.6s');
        await page.evaluate(() => document.body.classList.add('accessibility-reduced-motion'));
        await expect(stage.locator('.rolling')).toHaveCSS('animation-name', 'none');
        await page.evaluate(() => document.body.classList.remove('accessibility-reduced-motion'));
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
        await page.evaluate(() => updateDiceDisplay([5, 6]));
        expect(await stage.locator('.dice-face').evaluateAll(elements => elements.every(element => {
            const rect = element.getBoundingClientRect();
            return rect.width >= 30 && rect.height >= 30 && Math.abs(rect.width - rect.height) <= 2;
        })), '確定した2個のサイコロを正方形で表示する').toBe(true);
        expect(await state(page)).toEqual(before);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
});

test('振り直し確認後に確定した施設だけを新しく強調する', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 }, 2, false);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => { player.cards = []; });
        game.players[0].cards = [createCardByName('麦畑')];
        game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
        game.rollDice(1);
        render();
    });
    await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.phase === GAME_PHASES.REROLL_CONFIRM)).toBe(true);
    await expect(page.locator('#cardboardSeats .cardboard-card-activated')).toHaveCount(0);
    await page.evaluate(() => {
        window.lateActivationObserved = false;
        const observer = new MutationObserver(() => {
            if (document.querySelector('#cardboardSeats [data-card-name="麦畑"].cardboard-card-additional-activation')) {
                window.lateActivationObserved = true;
                observer.disconnect();
            }
        });
        observer.observe(document.getElementById('cardboardSeats'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        GameRuntimeState.runtime.snapshot().game.skipReroll();
        render();
    });
    await expect.poll(() => page.evaluate(() => window.lateActivationObserved)).toBe(true);
    await expect(page.locator('#cardboardSeats .cardboard-card-activated')).toHaveCount(1);
    await page.evaluate(() => render());
    await expect(page.locator('#cardboardSeats .cardboard-card-additional-activation')).toHaveCount(0);
});

test('建設可の絞り込みでもサイコロ前と購入後は市場を見渡せる', async ({ page }, testInfo) => {
    const expectBrowseShelf = async () => {
        await expect.poll(() => page.locator('#cardboardMarket').evaluate(market => {
            const note = market.querySelector('.compact-market-browse-note');
            const shelf = market.querySelector('.compact-market-facilities');
            const cards = [...shelf.querySelectorAll('.compact-market-item')];
            const failures = [];
            if (!note || shelf.contains(note)) failures.push('browse guidance occupies a card slot');
            if (!cards.length) failures.push('facility cards missing');
            if (!note || !cards.length) return failures;
            const clip = shelf.getBoundingClientRect();
            const first = cards[0].getBoundingClientRect();
            const scale = clip.width / shelf.offsetWidth;
            if ((first.top - clip.top) / scale > 4) failures.push('blank row precedes facility cards');
            if (note.offsetHeight >= cards[0].offsetHeight) failures.push('guidance retains a facility-sized row');
            const style = getComputedStyle(shelf);
            const columns = (style.gridTemplateColumns.match(/[\d.]+px/g) || []).length;
            const rows = Number(style.getPropertyValue('--table-market-rows')) || 2;
            const expected = Math.min(cards.length, columns * rows);
            const visible = cards.filter(card => {
                const bounds = card.getBoundingClientRect();
                return bounds.top >= clip.top - 1 && bounds.bottom <= clip.bottom + 1;
            }).length;
            if (visible < expected) failures.push(`only ${visible}/${expected} configured facility slots visible`);
            return failures;
        })).toEqual([]);
    };
    await prepare(page, {width:844,height:390}, 2);
    await camera(page, 'market');
    await page.locator('#cardboardMarket .compact-market-filter-disclosure > summary').click();
    await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
    await page.locator('#cardboardMarket [data-card-filter="affordable"]').click();
    await expect(page.locator('#cardboardMarketDialog .compact-market-browse-note')).toBeVisible();
    await page.locator('#cardboardMarketClose').click();
    await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
    await expect(page.locator('#cardboardMarket .compact-market-filter-disclosure')).not.toHaveAttribute('open');
    const cards = page.locator('#cardboardMarket [data-action="buildCard"]');
    await expect(page.locator('#cardboardMarket .compact-market-browse-note')).toBeVisible();
    await expectBrowseShelf();
    expect(await cards.count()).toBeGreaterThan(0);
    expect(await cards.evaluateAll(nodes => nodes.every(node => node.disabled))).toBe(true);
    await page.evaluate(() => {
        window.marketFacilityArt = document.querySelector('#cardboardMarket [data-action="buildCard"][data-card-name="麦畑"] svg');
        GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD; render();
    });
    expect(await page.evaluate(() => window.marketFacilityArt === document.querySelector('#cardboardMarket [data-action="buildCard"][data-card-name="麦畑"] svg'))).toBe(true);
    await expect(page.locator('#cardboardMarket .compact-market-browse-note')).toHaveCount(0);
    expect(await cards.count()).toBeGreaterThan(0);
    expect(await cards.evaluateAll(nodes => nodes.every(node => !node.disabled))).toBe(true);
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.builtThisTurn = true; render(); });
    await expect(page.locator('#cardboardMarket .compact-market-browse-note')).toBeVisible();
    await expectBrowseShelf();
    expect(await cards.count()).toBeGreaterThan(0);
    expect(await cards.evaluateAll(nodes => nodes.every(node => node.disabled))).toBe(true);
    const canonical = await state(page);
    for (const viewport of [{width:320,height:720}, {width:390,height:844},
        {width:844,height:390}, {width:1440,height:900}]) {
        await page.setViewportSize(viewport);
        await camera(page, 'overview');
        await expect(page.locator('#cardboardMarket .compact-market-browse-note')).toBeVisible();
        await expectBrowseShelf();
        expect(await state(page)).toEqual(canonical);
        await page.screenshot({ path: testInfo.outputPath(`browse-note-${viewport.width}.png`) });
    }
});

test('新しいロールの発動帯は全所有者を順に示し再描画とテーマ復帰で再生しない', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => { player.cards = [createCardByName('森林')]; });
        game.phase = GAME_PHASES.ROLL;
        game.log = [];
        const original = crypto.getRandomValues.bind(crypto);
        let first = true;
        Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value(buffer) {
            if (first) { first = false; buffer[0] = 4; return buffer; }
            return original(buffer);
        } });
        render();
        acceptHotseatHandoff();
        document.getElementById('cardboardEventDetails').open = false;
        window.boardTagRecords = [];
        window.boardTagObserver = new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE || !node.classList.contains('cardboard-activation-tag')) continue;
                const rect = node.getBoundingClientRect();
                const viewport = document.getElementById('cardboardTableViewport').getBoundingClientRect();
                window.boardTagRecords.push({ text: node.textContent, pointerEvents: getComputedStyle(node).pointerEvents,
                    highlightedCards: document.querySelectorAll('#cardboardSeats .cardboard-card.cardboard-resolving').length,
                    highlightedOwners: document.querySelectorAll('.cardboard-roster-seat.cardboard-resolving').length,
                    contained: rect.left >= viewport.left - 1 && rect.right <= viewport.right + 1 &&
                        rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1 });
            }
        });
        window.boardTagObserver.observe(document.getElementById('cardboardBoard'), { childList: true });
        // Arm before rolling: Node assertions/screenshots must not consume
        // the 600ms flight before its real-frame evidence is measured.
        window.chainFlightSample = new Promise(resolve => {
            const deadline = performance.now() + 6500;
            const frames = [];
            const measure = rafTimestamp => {
                const element = document.querySelector('.cardboard-transfer[data-facility="森林"][data-step="3"]');
                const animation = element?.getAnimations()[0];
                if (animation) {
                    const elapsedMs = Number(animation.currentTime) - Number(animation.effect.getTiming().delay);
                    const timing = animation.effect.getComputedTiming();
                    const frame = { rafTimestamp, measuredAt:performance.now(), elapsedMs,
                        currentTime:animation.currentTime, startTime:animation.startTime, playState:animation.playState,
                        progress:timing.progress, localTime:timing.localTime, delay:timing.delay, duration:timing.duration,
                        opacity:Number(getComputedStyle(element).opacity) };
                    if (frames.length < 120) frames.push(frame);
                    if (elapsedMs >= 180) {
                        resolve({ ...frame, frames,
                            route: element.dataset.route, bounds: element.getBoundingClientRect().toJSON() });
                        return;
                    }
                }
                if (performance.now() >= deadline) resolve({ elapsedMs: Infinity, opacity: 0, frames, error: 'fourth flight never reached a live frame' });
                else requestAnimationFrame(measure);
            };
            requestAnimationFrame(measure);
        });
        document.getElementById('btnRoll').click();
    });
    // Capture the live 600ms caption before inspecting later chain steps.
    // No clock or production lifetime is changed: this is a real-time frame.
    const liveTag = page.locator('.cardboard-activation-tag');
    await expect(liveTag).toBeVisible();
    await expect(liveTag).toContainText('森林');
    await expect(liveTag.locator('.cardboard-activation-route')).toContainText('銀行 →');
    await expect(liveTag.locator('.cardboard-activation-amount')).toHaveCSS('white-space', 'nowrap');
    const flights = page.locator('.cardboard-transfer[data-facility="森林"]');
    await expect(flights).toHaveCount(4);
    expect(await flights.evaluateAll(elements => elements.map(element => {
        const timing = element.getAnimations()[0].effect.getTiming();
        return { step: Number(element.dataset.step), delay: timing.delay, duration: timing.duration };
    }))).toEqual([0, 1, 2, 3].map(step => ({ step, delay: 500 + step * 700, duration: 600 })));
    await expect(page.locator('#turnAnnouncer')).toBeHidden();
    const sample = await page.evaluate(() => window.chainFlightSample);
    await page.screenshot({ path: testInfo.outputPath('facility-chain-live-step-4.png') });
    require('fs').writeFileSync(testInfo.outputPath('facility-chain-flight-sample.json'), JSON.stringify(sample, null, 2));
    expect(sample.elapsedMs, JSON.stringify(sample)).toBeLessThan(500);
    expect(sample.opacity, JSON.stringify(sample)).toBeGreaterThan(0.5);
    const caption = page.locator('#cardboardEventDetails');
    await expect(caption).toHaveClass(/cardboard-preview-playing/);
    const cards = caption.locator('.cardboard-event-preview-card');
    await expect(cards).toHaveCount(4);
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveText('出目 5');
    const centralFaces = page.locator('#cardboardDiceConfirmation .cardboard-confirmation-faces .dice-face');
    await expect(centralFaces).toHaveCount(1);
    await expect(centralFaces.first()).toBeVisible();
    await expect(centralFaces.first().locator('.dot:not(.hidden)')).toHaveCount(5);
    await expect(centralFaces.first().locator('.dot.hidden')).toHaveCount(4);
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveCSS('pointer-events', 'none');
    await page.locator('#cardboardDiceConfirmation').evaluate(element => {
        window.confirmationElement = element;
        element.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 100; });
    });
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath('dice-final-confirmation.png') });
    await page.locator('#cardboardDiceConfirmation').evaluate(element => element.getAnimations().forEach(animation => { animation.currentTime = 500; }));
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveCSS('opacity', '0');
    await expect(cards.first().locator('.cardboard-event-preview-owner')).toHaveText(/^\+1コイン · 銀行→席[1-4]$/);
    await expect(cards.first()).toBeHidden();
    expect(await cards.evaluateAll(elements => elements.map(element => {
        const owner = document.querySelector(`#cardboardSeats .cardboard-player[data-player-index="${element.dataset.playerIndex}"]`);
        const card = owner.querySelector('.cardboard-card[data-card-name="森林"]');
        return { delay: parseFloat(getComputedStyle(card).animationDelay), name: getComputedStyle(card).animationName };
    }))).toEqual([0.5,1.2,1.9,2.6].map(delay => ({delay,name:'cardboard-card-activate'})));
    await page.evaluate(() => {
        window.captionCardAnimations = [...document.querySelectorAll('#cardboardSeats .cardboard-card-activated')].map(card => card.getAnimations().find(animation => animation.animationName === 'cardboard-card-activate'));
    });
    const before = await state(page);
    await expect.poll(() => page.evaluate(() => window.boardTagRecords.length)).toBe(4);
    const tagRecords = await page.evaluate(() => window.boardTagRecords);
    const owners = await cards.evaluateAll(elements => elements.map(element => {
        const index = Number(element.dataset.playerIndex);
        return GameRuntimeState.runtime.snapshot().game.players[index].name || `席${index + 1}`;
    }));
    expect(tagRecords.map(record => record.text)).toEqual(owners.map((owner, index) =>
        `森林${owner} · +1コイン銀行 → ${owner}施設発動 ${index + 1} / ${owners.length}`));
    expect(tagRecords.every(record => record.contained && record.pointerEvents === 'none')).toBe(true);
    expect(tagRecords.every(record => record.highlightedCards === 1 && record.highlightedOwners === 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('facility-chain-real-card-tags.png') });
    await page.evaluate(() => render());
    await expect(page.locator('.cardboard-activation-tag')).toHaveCount(0);
    await expect(page.locator('.cardboard-resolving')).toHaveCount(0);
    expect(await page.evaluate(() => window.boardTagRecords.length)).toBe(4);
    expect(await page.evaluate(() => document.getElementById('cardboardDiceConfirmation') === window.confirmationElement)).toBe(true);
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveCSS('opacity', '0');
    expect(await page.evaluate(() => [...document.querySelectorAll('#cardboardSeats .cardboard-card-activated')].every((card,index) => card.getAnimations().find(animation => animation.animationName === 'cardboard-card-activate') === window.captionCardAnimations[index]))).toBe(true);
    expect(await state(page)).toEqual(before);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('#cardboardSeats .cardboard-card-activated').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === 'none'))).toBe(true);
    await expect(cards.first()).toBeHidden();
    await expect(page.locator('.cardboard-activation-tag')).toHaveCount(0);
    // CSS reacts before the queued media-query change callback. Wait for the
    // actual cancellation before restoring the preference, then verify no replay.
    await expect(caption).not.toHaveClass(/cardboard-preview-playing/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(caption).not.toHaveClass(/cardboard-preview-playing/);
    await selectTheme(page, 'plaza');
    await selectTheme(page, 'cardboard');
    await expect(caption).not.toHaveClass(/cardboard-preview-playing/);
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveCount(0);
    await expect(page.locator('.cardboard-activation-tag')).toHaveCount(0);
    expect(await page.evaluate(() => window.boardTagRecords.length)).toBe(4);
    await page.evaluate(() => window.boardTagObserver.disconnect());
    expect(await state(page)).toEqual(before);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayer().landmarks[LANDMARK_NAMES.HARBOR] = true;
        game.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
        game.phase = GAME_PHASES.SELECT_DICE;
        game.selectDiceCount(true, 5, 5);
        render();
    });
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveText('5 + 5 = 10');
    await expect(centralFaces).toHaveCount(2);
    for (let index = 0; index < 2; index++) {
        await expect(centralFaces.nth(index)).toBeVisible();
        await expect(centralFaces.nth(index).locator('.dot:not(.hidden)')).toHaveCount(5);
        await expect(centralFaces.nth(index).locator('.dot.hidden')).toHaveCount(4);
    }
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.resolveHarbor(true); render(); });
    await expect(page.locator('#cardboardDiceConfirmation')).toHaveCount(0);
    await expect(caption.locator('.cardboard-result-heading')).toContainText('港10→12');
});

test('中央市場の長い施設名をカード枠内で省略せず読める', async ({ page }, testInfo) => {
    await prepare(page, { width: 1440, height: 936 });
    const names = page.locator('#cardboardMarket .compact-market-item:not(.compact-market-landmark) .compact-market-name');
    expect(await names.count()).toBeGreaterThanOrEqual(16);
    await expect(names.filter({hasText:'フラワーショップ'})).toHaveCount(1);
    const overflow = await names.evaluateAll(elements => elements.filter(element => {
        const bounds = element.getBoundingClientRect();
        const parent = element.closest('.compact-market-buy').getBoundingClientRect();
        return bounds.left < parent.left - 1 || bounds.right > parent.right + 1 || element.scrollWidth > element.clientWidth + 1;
    }).map(element => ({name:element.textContent, width:element.getBoundingClientRect().width, parent:element.closest('.compact-market-buy').getBoundingClientRect().width, scroll:element.scrollWidth, client:element.clientWidth})));
    expect(overflow).toEqual([]);
    const visibleRows = await page.locator('#cardboardMarket .compact-market-facilities').evaluate(element => {
        const center = element.closest('#cardboardCenter');
        const columns = Number(center.dataset.marketColumns);
        const rows = Number(center.style.getPropertyValue('--table-market-rows'));
        const bounds = element.getBoundingClientRect();
        const cards = [...element.querySelectorAll('.compact-market-item')];
        const visible = cards.slice(0, columns * rows);
        return { columns, rows, count: visible.length,
            expectedCount: Math.min(cards.length, columns * rows),
            clipped: visible.filter(card => {
                const box = card.getBoundingClientRect();
                return box.left < bounds.left - 1 || box.right > bounds.right + 1 ||
                    box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1;
            }).map(card => card.textContent) };
    });
    expect(visibleRows.columns).toBeGreaterThan(0);
    expect(visibleRows.rows).toBeGreaterThan(0);
    expect(visibleRows.count).toBe(visibleRows.expectedCount);
    expect(visibleRows.count).toBeGreaterThan(0);
    expect(visibleRows.clipped, '現在の列数・行数で先頭可視行のカード全体が市場内に収まる').toEqual([]);
    await camera(page, 'market');
    await page.screenshot({ path: testInfo.outputPath('market-full-facility-names.png') });
});


for (const viewport of [{width:320,height:844},{width:390,height:844},{width:844,height:390},{width:1440,height:936},
    {width:320,height:844,updateBanner:true}]) {
    test(`実ロール後の新規建設通知は4画面で読めて正本を変更しない ${viewport.width}px${viewport.updateBanner ? ' 更新通知あり' : ''}`, async ({ page }, testInfo) => {
        await prepare(page, viewport, 2, false);
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.players[0].cards = ['麦畑','牧場','パン屋','森林','花畑','フラワーショップ'].map(createCardByName);
            game.players[0].coins = 30;
            render();
        });
        if (viewport.updateBanner) {
            await page.evaluate(() => setPwaBannerVisible('pwaUpdateBanner', true));
            await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
        }
        await page.locator('#btnRoll').click();
        await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.phase)).toBe('build');
        await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
        await expect(page.locator('.cardboard-activation-tag')).toHaveCount(0);
        // A hidden stale caption is a presentation fixture, not an active
        // animation. It must not suppress a fresh construction acknowledgment.
        await page.evaluate(() => {
            const stale = document.createElement('div');
            stale.className = 'cardboard-activation-tag';
            stale.hidden = true;
            stale.style.display = 'none';
            document.getElementById('cardboardBoard').appendChild(stale);
        });
        await camera(page, 'market');
        await page.locator('#cardboardMarket .compact-market-expand').click();
        // Record both transient layers from before the purchase. Their actual
        // frame evidence survives slow screenshots without extending lifetimes.
        await page.evaluate(() => {
            let closedAt = null;
            const startedAt = performance.now();
            window.constructionTrace = { frames: [], mutations: [], cancellations: [], tasks: [], beforeClose: null };
            // Observe callback cost without changing scheduling or animation time.
            const requestFrame = window.requestAnimationFrame;
            window.requestAnimationFrame = function (callback) {
                const scheduledBy = closedAt !== null && window.constructionTrace.tasks.length < 120 ? new Error().stack : null;
                return requestFrame.call(window, function (timestamp) {
                    const begin = performance.now();
                    const keyBefore = document.getElementById('cardboardSeats')?.dataset.tableLayoutKey;
                    try { return callback.call(window, timestamp); }
                    finally {
                        if (closedAt !== null && window.constructionTrace.tasks.length < 120) {
                            window.constructionTrace.tasks.push({ afterClose:begin-closedAt,
                                duration:performance.now()-begin, callback:callback.name, scheduledBy,
                                keyBefore, keyAfter:document.getElementById('cardboardSeats')?.dataset.tableLayoutKey });
                        }
                    }
                });
            };
            // Distinguish a flight that finishes between paints from one cancelled
            // by a later camera/scroll update; retain the normal animation clock.
            const cancelAnimation = Animation.prototype.cancel;
            Animation.prototype.cancel = function () {
                if (this.effect?.target?.id === 'cardboardBuildFlight') {
                    window.constructionTrace.cancellations.push({ at:performance.now()-startedAt,
                        currentTime:this.currentTime, playState:this.playState, stack:new Error().stack });
                }
                return cancelAnimation.call(this);
            };
            window.constructionGuardSnapshot = () => {
                const viewport = document.getElementById('cardboardTableViewport');
                const card = document.querySelector('#cardboardSeats [data-player-index="0"] .cardboard-card[data-card-name="麦畑"]');
                const marketCard = document.querySelector('#cardboardMarket [data-action="buildCard"][data-card-name="麦畑"]')?.closest('.compact-market-item');
                const rect = element => element?.getBoundingClientRect().toJSON();
                return { at:performance.now()-startedAt, hidden:document.hidden,
                    reducedMotion:document.body.classList.contains('accessibility-reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches,
                    phase:GameRuntimeState.runtime.snapshot().game.phase,
                    viewport:rect(viewport), target:rect(card), origin:rect(marketCard), shelf:rect(marketCard?.closest('.compact-market-facilities')),
                    cameraAngle:viewport.dataset.tableAngle, ownerAngle:card?.closest('.cardboard-player')?.dataset.tableAngle,
                    suppressors:[...document.querySelectorAll('#cardboardBoard #diceResult .rolling, #cardboardDiceConfirmation, #cardboardBoard .cardboard-preview-playing, #cardboardBoard .cardboard-activation-tag')].map(element => ({
                        className:element.className, display:getComputedStyle(element).display, visibility:getComputedStyle(element).visibility,
                        rects:element.getClientRects().length })),
                    viewportSize:{width:innerWidth,height:innerHeight},
                    screen:visualViewport ? {left:visualViewport.offsetLeft,top:visualViewport.offsetTop,width:visualViewport.width,height:visualViewport.height} : null };
            };
            window.constructionTraceObserver = new MutationObserver(records => {
                for (const record of records) for (const [kind, nodes] of [['add',record.addedNodes],['remove',record.removedNodes]]) {
                    for (const node of nodes) if (node.id === 'cardboardBuildFlight' || node.id === 'cardboardBuildNotice') {
                        let sameScrollRetained = null;
                        if (kind === 'add' && node.id === 'cardboardBuildFlight') {
                            // A focus command can deliver its native scroll event
                            // after the new flight exists, without another move.
                            document.getElementById('cardboardTableViewport').dispatchEvent(new Event('scroll'));
                            sameScrollRetained = node.isConnected;
                        }
                        window.constructionTrace.mutations.push({ kind, id:node.id, at:performance.now()-startedAt, sameScrollRetained,
                            animations:node.getAnimations().map(animation => ({currentTime:animation.currentTime,playState:animation.playState,duration:animation.effect.getTiming().duration})) });
                    }
                }
            });
            window.constructionTraceObserver.observe(document.getElementById('cardboardBoard'), {childList:true});
            document.getElementById('cardboardMarketClose').addEventListener('click', () => {
                closedAt = performance.now();
                window.constructionTrace.beforeClose = window.constructionGuardSnapshot();
            }, { once: true, capture: true });
            const captureNotice = element => {
                const bounds = element.getBoundingClientRect();
                const table = document.getElementById('cardboardTableViewport').getBoundingClientRect();
                const receiptClosed = !document.getElementById('cardboardEventDetails').open;
                const svg = element.querySelector('svg');
                const svgBounds = svg.getBoundingClientRect();
                const artVisible = getComputedStyle(svg).display !== 'none' && svgBounds.width > 0 && svgBounds.height > 0;
                const screen = visualViewport;
                const pointerEvents = getComputedStyle(element).pointerEvents;
                const previousPointerEvents = element.style.pointerEvents;
                let paintedAboveExistingPanels;
                try {
                    // Include this non-interactive layer in hit testing without
                    // changing its stacking position or clicking through a panel.
                    element.style.pointerEvents = 'auto';
                    paintedAboveExistingPanels = ['strong', '.cardboard-build-notice-art'].every(selector => {
                        const target = element.querySelector(selector).getBoundingClientRect();
                        const top = document.elementsFromPoint(target.left + target.width / 2, target.top + target.height / 2)[0];
                        return top === element || element.contains(top);
                    });
                } finally {
                    element.style.pointerEvents = previousPointerEvents;
                }
                return { elapsedAfterClose:performance.now() - closedAt, opacity:Number(getComputedStyle(element).opacity),
                    text:element.textContent, art:element.querySelectorAll('svg').length,
                    pointerEvents, paintedAboveExistingPanels, receiptClosed, artVisible,
                    insideTable:bounds.left>=table.left && bounds.top>=table.top && bounds.right<=table.right && bounds.bottom<=table.bottom,
                    insideScreen:bounds.left>=(screen?.offsetLeft || 0) && bounds.top>=(screen?.offsetTop || 0) &&
                        bounds.right<=(screen?.offsetLeft || 0)+(screen?.width || innerWidth) &&
                        bounds.bottom<=(screen?.offsetTop || 0)+(screen?.height || innerHeight) };
            };
            window.constructionMovingFrame = new Promise(resolve => {
                const inspect = () => {
                    const flight = document.getElementById('cardboardBuildFlight');
                    const animation = flight?.getAnimations()[0];
                    const elapsed = Number(animation?.currentTime);
                    if (closedAt !== null && window.constructionTrace.frames.length < 120) {
                        window.constructionTrace.frames.push({afterClose:performance.now()-closedAt, flight:!!flight,
                            animations:flight?.getAnimations().map(value => ({currentTime:value.currentTime,playState:value.playState,duration:value.effect.getTiming().duration})) || []});
                    }
                    if (flight && animation && elapsed >= 60 && elapsed < 400) {
                        const bounds = flight.getBoundingClientRect();
                        resolve({ name:flight.dataset.cardName, elapsed, duration:animation.effect.getTiming().duration,
                            arrivalStarted:!!document.querySelector('#cardboardSeats .cardboard-card-newly-built'),
                            pointerEvents:getComputedStyle(flight).pointerEvents,
                            insideScreen:bounds.left>=0 && bounds.top>=0 && bounds.right<=innerWidth && bounds.bottom<=innerHeight });
                    } else if (closedAt !== null && performance.now() - closedAt >= 1500) {
                        resolve({ error: 'fresh purchase flight was not observed while moving' });
                    } else requestAnimationFrame(inspect);
                };
                requestAnimationFrame(inspect);
            });
            window.constructionNoticeFrame = new Promise(resolve => {
                const inspect = () => {
                    const element = document.getElementById('cardboardBuildNotice');
                    if (closedAt !== null && element && Number(getComputedStyle(element).opacity) >= 0.9) {
                        resolve(captureNotice(element));
                    } else if (closedAt !== null && performance.now() - closedAt >= 2500) {
                        resolve({ error: 'fresh construction notice never reached a painted frame' });
                    } else requestAnimationFrame(inspect);
                };
                requestAnimationFrame(inspect);
            });
        });
        await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
        const purchased = await state(page);
        await page.locator('#cardboardMarketClose').click();
        const moving = await page.evaluate(() => window.constructionMovingFrame);
        const flightDiagnostic = await page.evaluate(() => ({ ...window.constructionTrace, current:window.constructionGuardSnapshot() }));
        await fs.writeFile(testInfo.outputPath(`facility-flight-diagnostic-${viewport.width}.json`), JSON.stringify({moving,flightDiagnostic}, null, 2));
        expect(moving.name, JSON.stringify({moving,flightDiagnostic})).toBe('麦畑');
        expect(flightDiagnostic.mutations.filter(change => change.kind === 'add' && change.id === 'cardboardBuildFlight')
            .every(change => change.sameScrollRetained === true)).toBe(true);
        expect(moving.duration).toBe(480);
        expect(moving.arrivalStarted, '到着先の祝福はカードの飛行完了後に始まる').toBe(false);
        expect(moving.pointerEvents).toBe('none');
        expect(moving.insideScreen).toBe(true);
        await page.screenshot({path:testInfo.outputPath(`facility-flight-${viewport.width}.png`)});
        await expect(page.locator('#cardboardBuildFlight')).toHaveCount(0);
        const notice = await page.evaluate(() => window.constructionNoticeFrame);
        await page.screenshot({path:testInfo.outputPath(`facility-construction-${viewport.width}.png`)});
        expect(notice.text).toContain('街1が建設');
        expect(notice.text).toContain('麦畑');
        expect(notice.text).toContain('建設費 1コイン');
        expect(notice.art).toBe(1);
        expect(notice.artVisible).toBe(true);
        expect(notice.pointerEvents).toBe('none');
        expect(notice.paintedAboveExistingPanels).toBe(true);
        expect(notice.receiptClosed).toBe(true);
        expect(notice.insideTable).toBe(true);
        expect(notice.insideScreen).toBe(true);
        await fs.writeFile(testInfo.outputPath(`facility-construction-frame-${viewport.width}.json`), JSON.stringify({moving, notice}, null, 2));
        expect(await state(page)).toEqual(purchased);
        await page.evaluate(() => window.constructionTraceObserver.disconnect());
        await page.locator('.cardboard-activation-tag[hidden]').evaluateAll(elements => elements.forEach(element => element.remove()));
    });
}

test('相手正面を移動してから市場で購入しても元の視点へ戻れる', async ({ page }, testInfo) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await prepare(page, viewport, 2, false);
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.players[0].cards = ['麦畑', '牧場', 'パン屋', '森林', '花畑', 'フラワーショップ'].map(createCardByName);
            game.phase = GAME_PHASES.BUILD;
            render();
        });
        await focusSeat(page, 1);
        await camera(page, 'in');
        const surface = page.locator('#cardboardTableViewport');
        await surface.focus();
        await surface.press('ArrowRight');
        await surface.press('ArrowDown');
        const view = (anchorName = null) => surface.evaluate((element, name) => {
            const bounds = element.getBoundingClientRect();
            const center = { x: bounds.left + element.clientLeft + element.clientWidth / 2,
                y: bounds.top + element.clientTop + element.clientHeight / 2 };
            const cards = [...document.querySelectorAll('#cardboardSeats [data-player-index="1"] .cardboard-card')];
            const distance = card => {
                const rect = card.getBoundingClientRect();
                return (rect.left + rect.width / 2 - center.x) ** 2 + (rect.top + rect.height / 2 - center.y) ** 2;
            };
            const anchor = name ? cards.find(card => card.dataset.cardName === name)
                : cards.sort((a, b) => distance(a) - distance(b))[0];
            return { scale: element.dataset.tableScale, angle: element.dataset.tableAngle,
                left: element.scrollLeft, top: element.scrollTop,
                client: { left: element.clientLeft, top: element.clientTop, width: element.clientWidth, height: element.clientHeight },
                viewport: bounds.toJSON(), anchorName: anchor.dataset.cardName,
                anchor: anchor.getBoundingClientRect().toJSON(),
                layout: document.getElementById('cardboardSeats').dataset.tableLayoutKey };
        }, anchorName);
        const before = await view();
        expect(Number(before.angle)).not.toBe(0);
        // The market may be outside this rotated, panned viewport. Open its
        // production dialog API as a controlled camera fixture; purchase,
        // closing and returning still use ordinary UI clicks.
        await page.evaluate(() => CardBoardField.openMarket());
        await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
        const purchased = await state(page);
        await page.locator('#cardboardMarketClose').click();
        await expect(surface).toHaveAttribute('data-table-angle', '0');
        await camera(page, 'back');
        const after = await view(before.anchorName);
        await fs.writeFile(testInfo.outputPath(`purchase-return-${viewport.width}.json`), JSON.stringify({ before, after }, null, 2));
        expect(after.scale).toBe(before.scale);
        expect(after.angle).toBe(before.angle);
        for (const [axis, size, border] of [['x', 'width', 'left'], ['y', 'height', 'top']]) {
            const relative = (before.anchor[axis] + before.anchor[size] / 2 - before.viewport[axis] - before.client[border]) / before.client[size];
            const expected = Math.max(0, Math.min(1, relative)) * after.client[size];
            const actual = after.anchor[axis] + after.anchor[size] / 2 - after.viewport[axis] - after.client[border];
            expect(Math.abs(actual - expected), `${viewport.width}pxの${axis}読み位置を新viewportへ比例復元`).toBeLessThanOrEqual(1);
        }
        expect(await state(page)).toEqual(purchased);
        await page.screenshot({ path: testInfo.outputPath(`purchase-return-${viewport.width}.png`) });
    }
});
