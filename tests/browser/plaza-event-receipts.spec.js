const { test, expect } = require('@playwright/test');

async function prepare(page, viewport, count = 4) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(count => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({
            type: index ? 'cpu' : 'human', difficulty: 'normal', name: `街${index + 1}`,
        })));
        const state = GameRuntimeState.runtime.snapshot();
        state.cpuPlayers.fill(null);
        cancelCpuSchedule('plaza-receipt-review');
        const game = state.game;
        game.currentPlayerIndex = 0;
        game.phase = GAME_PHASES.ROLL;
        game.log = [];
        game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            player.cards = Array.from({ length: index ? 2 : 6 }, () => createCardByName('森林'));
            player.coins = 30;
        });
        game.players[1].landmarks[LANDMARK_NAMES.STATION] = true;
        game.players[1].landmarks[LANDMARK_NAMES.HARBOR] = true;
        setTutorialEnabled(false);
        setSoundVolume(0);
        render();
        acceptHotseatHandoff();
    }, count);
    await expect(page.locator('#turnAnnouncer')).toBeHidden();
}

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`ログを閉じたまま出目・複数発動・建設・目標達成が読める ${viewport.width}`, async ({ page }) => {
        await prepare(page, viewport);
        await page.evaluate(() => {
            GameRuntimeState.runtime.snapshot().game.rollDice(5);
            render();
            acceptHotseatHandoff();
        });
        await page.evaluate(() => {
            document.getElementById('pwaUpdateBanner').style.display = 'flex';
            document.body.classList.add('pwa-banner-open');
            PlazaField.sync();
        });
        const receipt = page.locator('#plazaDiceReceipt');
        await expect(receipt.locator('.plaza-receipt-dice')).toHaveText('出目 5');
        await expect(receipt.locator('.plaza-receipt-featured')).toContainText('森林 発動6回 +6コイン');
        await expect(receipt.locator('.plaza-receipt-totals')).toContainText('街1 +6');
        await expect(receipt.locator('.plaza-receipt-totals')).toContainText('街4 +2');
        await expect(page.locator('#gameLogContainer')).not.toHaveClass(/plaza-panel-open/);
        if (viewport.width === 844) await page.locator('[data-field-panel="events"]').click();
        await receipt.locator('summary').click();
        await expect(receipt.locator('.plaza-receipt-activations')).toContainText('街1：森林 +6コイン');
        await receipt.locator('summary').focus();
        await page.evaluate(() => render());
        await expect(receipt.locator('details')).toHaveAttribute('open', '');
        await expect(receipt.locator('summary')).toBeFocused();
        await receipt.locator('summary').click();
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.buildCard(createCardByName('森林'));
            render();
            acceptHotseatHandoff();
        });
        await expect(page.locator('#plazaBuildReceipt')).toContainText('森林を建設');
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.builtThisTurn = false;
            game.buildLandmark(LANDMARK_NAMES.STATION);
            render();
            acceptHotseatHandoff();
        });
        await expect(page.locator('#plazaBuildReceipt')).toContainText('駅が完成');
        await expect(page.locator('#plazaBuildReceipt')).toContainText('サイコロを1個か2個か選べる');
        await page.locator('[data-built-town-index="0"]').click();
        await expect(page.locator('#crashScreen')).toBeHidden();
        await test.info().attach(`receipt-${viewport.width}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
}

for (const count of [4, 10]) {
    test(`HUD詳細と読み取り専用の試算は対局更新で条件を保つ ${count}人`, async ({ page }) => {
        await prepare(page, { width: 390, height: 844 }, count);
        await page.locator('#plazaPlayerHud button[data-player-index="1"]').click();
        await expect(page.locator('#plazaPlayerInsights')).toBeVisible();
        await expect(page.locator('#plazaPlayerInsightsBody')).toContainText('森林 ×2');
        await expect(page.locator('[data-income-target]')).toHaveValue('1');
        await page.locator('.plaza-income-disclosure > summary').click();
        await page.locator('[data-income-roller]').selectOption('1');
        await page.locator('[data-income-dice]').selectOption('2');
        await page.locator('[data-income-harbor]').check();
        const before = await page.evaluate(() => JSON.stringify(GameSnapshot.serializeGameState(GameRuntimeState.runtime.snapshot().game)));
        await page.locator('[data-income-calculate]').click();
        await expect(page.locator('[data-income-result] tbody tr')).toHaveCount(11);
        await expect(page.locator('[data-income-result]')).toContainText('出目の確率を含む平均');
        expect(await page.evaluate(() => JSON.stringify(GameSnapshot.serializeGameState(GameRuntimeState.runtime.snapshot().game)))).toBe(before);
        await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot();
            const cloned = CPUSimulation.cloneGame(state.game, {
                createGame: count => new GameManager(count), cloneCard: card => createCardByName(card.name),
                defaultLandmarks: () => Player.landmarkNames(),
            });
            cloned.players[0].coins++;
            GameRuntimeState.runtime.setGame(cloned);
            render();
            acceptHotseatHandoff();
        });
        await expect(page.locator('#plazaPlayerInsights')).toBeVisible();
        await expect(page.locator('[data-income-target]')).toHaveValue('1');
        await expect(page.locator('[data-income-roller]')).toHaveValue('1');
        await expect(page.locator('[data-income-dice]')).toHaveValue('2');
        await expect(page.locator('[data-income-harbor]')).toBeChecked();
        await expect(page.locator('[data-income-result]')).toBeEmpty();
        await page.locator('#plazaPlayerInsightsClose').press('Escape');
        await expect(page.locator('#plazaPlayerInsights')).toBeHidden();
        await expect(page.locator('#plazaPlayerHud button[data-player-index="1"]')).toBeFocused();
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}


test('支払い・電波塔の振り直し・追加手番をログ外の結果で追える', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach((player, index) => { player.cards = [createCardByName(index ? 'カフェ' : '麦畑')]; });
        game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
        game.rollDice(3);
        game.skipReroll();
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('.plaza-receipt-totals')).toContainText('街1 -3');
    await page.locator('.plaza-receipt-details > summary').click();
    await expect(page.locator('.plaza-receipt-activations')).toContainText('街1 → 街2');
    await page.locator('.plaza-receipt-details > summary').click();
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.phase = GAME_PHASES.REROLL_CONFIRM;
        game.rerollDice(1);
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('.plaza-receipt-dice')).toHaveText('出目 1（振り直し）');
    await expect(page.locator('.plaza-receipt-totals')).toContainText('街1 +1');
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.phase = GAME_PHASES.ROLL;
        game.players[0].landmarks[LANDMARK_NAMES.STATION] = true;
        game.players[0].landmarks[LANDMARK_NAMES.AMUSEMENT_PARK] = true;
        game.rollDice();
        game.selectDiceCount(true, 1, 1);
        game.nextTurn();
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('.plaza-important-extra-turn').first()).toContainText('もう一度ターン');
    await expect(page.locator('#gameLogContainer')).not.toHaveClass(/plaza-panel-open/);
    await expect(page.locator('#crashScreen')).toBeHidden();
});

test('テーマ離脱と勝利境界で建設の表示と演出を清掃する', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.phase = GAME_PHASES.BUILD;
        game.buildCard(createCardByName('森林'));
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#plazaBuildReceipt')).toContainText('森林を建設');
    await page.evaluate(() => { document.getElementById('gameScreen').style.display = 'none'; });
    await expect(page.locator('#plazaBuildReceipt')).toBeEmpty();
    await expect(page.locator('.plaza-wallet-purchase, .plaza-market-purchased')).toHaveCount(0);
    await page.evaluate(() => {
        document.getElementById('gameScreen').style.display = 'block';
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#plazaBuildReceipt')).toBeEmpty();
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.builtThisTurn = false;
        game.buildLandmark(LANDMARK_NAMES.STATION);
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#plazaBuildReceipt')).toContainText('駅が完成');
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        Player.landmarkNames().forEach(name => { game.players[0].landmarks[name] = true; });
        render();
    });
    await expect(page.locator('.winner-screen')).toBeVisible();
    await expect(page.locator('#plazaBuildReceipt')).toBeEmpty();
    await expect(page.locator('#crashScreen')).toBeHidden();
});

for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`10人の全体ビューは市場と全街を重ねず横にも使う ${viewport.width}`, async ({ page }) => {
        await prepare(page, viewport, 10);
        await page.locator('[data-field-target="all"]').click();
        const measured = await page.evaluate(() => {
            const world = document.getElementById('plazaWorld');
            const boxes = Array.from({ length: 10 }, (_, index) => document.getElementById(`playerBox${index}`));
            boxes.push(document.getElementById('buildMenu'));
            return { width: world.offsetWidth, height: world.offsetHeight,
                boxes: boxes.map(item => ({ left: item.offsetLeft, top: item.offsetTop,
                    width: item.offsetWidth, height: item.offsetHeight })) };
        });
        expect(measured.width).toBeGreaterThan(measured.height);
        for (let index = 0; index < measured.boxes.length; index++) {
            const a = measured.boxes[index];
            expect(a.left + a.width).toBeLessThanOrEqual(measured.width);
            expect(a.top + a.height).toBeLessThanOrEqual(measured.height);
            for (const b of measured.boxes.slice(index + 1)) {
                expect(a.left + a.width <= b.left || b.left + b.width <= a.left ||
                    a.top + a.height <= b.top || b.top + b.height <= a.top).toBe(true);
            }
        }
        await page.locator('[data-field-target="market"]').click();
        await expect(page.locator('#buildMenu')).toBeInViewport();
        await page.locator('[data-field-target="self"]').click();
        await expect(page.locator('#playerBox0')).toBeInViewport();
        await test.info().attach(`overview-10-${viewport.width}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
}

test('画面外の赤施設への支払いと残高不足はログ無しで追える', async ({ page }) => {
    await prepare(page, { width: 390, height: 844 }, 10);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach((player, index) => {
            player.cards = Array.from({ length: index ? 3 : 1 }, () => createCardByName(index ? 'カフェ' : 'パン屋'));
            player.coins = index ? 30 : 5;
        });
        render();
        game.rollDice(3);
        render();
        acceptHotseatHandoff();
    });
    const receipt = page.locator('#plazaDiceReceipt');
    await expect(receipt.locator('.plaza-receipt-dice')).toHaveText('出目 3');
    await expect(receipt.locator('.plaza-receipt-totals')).toContainText('街1 -4');
    await expect(receipt.locator('.plaza-receipt-totals')).toContainText('街10 +3');
    await expect(receipt.locator('.plaza-receipt-totals')).toContainText('街9 +2');
    await receipt.locator('summary').click();
    await expect(receipt.locator('.plaza-receipt-activations')).toContainText('街1 → 街10');
    await expect(receipt.locator('.plaza-receipt-activations')).toContainText('街1 → 街2');
    await expect(receipt.locator('.plaza-receipt-activations')).not.toContainText(' → ：');
    await expect(receipt.locator('.plaza-receipt-activations')).toContainText('カフェ');
    await expect(page.locator('#gameLogContainer')).not.toHaveClass(/plaza-panel-open/);
});
