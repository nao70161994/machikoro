const { test, expect } = require('@playwright/test');

async function prepare(page, viewport, count = 4, controlledCards = true) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { if (!localStorage.getItem('machikoroDesignTheme')) localStorage.setItem('machikoroDesignTheme', 'cardboard'); });
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(({ count, controlledCards }) => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: index ? 'cpu' : 'human', difficulty: 'normal', name: `街${index + 1}` })));
        const state = GameRuntimeState.runtime.snapshot();
        state.cpuPlayers.fill(null);
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

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`カード盤面は4ビュー切替でも同一状態と共有市場を保つ ${viewport.width}`, async ({ page }, testInfo) => {
        await prepare(page, viewport);
        const before = await state(page);
        for (const theme of ['plaza', 'sunset', 'classic', 'cardboard']) {
            await selectTheme(page, theme);
            expect(await state(page)).toEqual(before);
        }
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(4);
        await expect(page.locator('#cardboardMarket #buildMenu')).toHaveCount(1);
        await expect(page.locator('#cardboardGoalsBody [data-action="buildLandmark"]')).not.toHaveCount(0);
        await expect(page.locator('#cardboardSeats [data-player-index="0"] .cardboard-count')).toHaveText('所有 ×4');
        await page.locator('#cardboardSeats [data-player-index="0"] [data-landmark-name="駅"]').click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await expect(page.locator('#cardDetailModal')).toContainText('駅');
        await page.keyboard.press('Escape');
        await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.rollDice(3); render(); acceptHotseatHandoff(); });
        await expect(page.locator('#cardboardDiceReceipt')).toContainText('出目 3');
        await expect(page.locator('#gameLogContainer')).not.toHaveClass(/plaza-panel-open/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await testInfo.attach(`cardboard-${viewport.width}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
}

test('10人のカード盤面は自分・手番・選択相手を読める大きさで表示する', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    await expect(page.locator('#cardboardRoster button')).toHaveCount(10);
    await page.locator('#cardboardRoster [data-cardboard-player-index="9"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="9"]')).toBeVisible();
    expect(await page.locator('#cardboardSeats > .cardboard-player').count()).toBeLessThanOrEqual(3);
    await expect(page.locator('#cardboardSeats [data-player-index="0"]')).toBeVisible();
    const before = await state(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await state(page)).toEqual(before);
});

test('購入とUndo・保存再開はカード盤面と既存ビューで共通の状態を使う', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 4, false);
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.phase = GAME_PHASES.BUILD; render(); acceptHotseatHandoff(); });
    const before = await state(page);
    await page.locator('#buildMenu [data-action="buildCard"][data-card-name="麦畑"]').click();
    await expect(page.locator('#cardboardSeats [data-player-index="0"] [data-card-name="麦畑"] .cardboard-count')).toHaveText('所有 ×2');
    const built = await state(page);
    await selectTheme(page, 'plaza');
    expect(await state(page)).toEqual(built);
    await selectTheme(page, 'cardboard');
    await page.locator('#buildMenu .undo-btn').click();
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

test('所有施設をスクロール中の収支更新でも表示位置を保つ', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].cards = CARDS.map(card => createCardByName(card.name));
        render();
        const cards = document.querySelector('#cardboardSeats [data-player-index="0"] .cardboard-cards');
        cards.scrollTop = 200;
    });
    const scroll = () => page.locator('#cardboardSeats [data-player-index="0"] .cardboard-cards').evaluate(element => element.scrollTop);
    const before = await scroll();
    expect(before).toBeGreaterThan(0);
    await page.evaluate(() => { GameRuntimeState.runtime.snapshot().game.players[0].coins++; render(); });
    expect(await scroll()).toBe(before);
});

test('新しい出目だけを強調し表示切替で過去の演出を再生しない', async ({ page }) => {
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
    expect(await panel.locator('.cardboard-cards').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
});
