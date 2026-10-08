const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

for (const scenario of [
    { name: 'スタジアム', dice: [6], net: 3, endpoint: '街2' },
    { name: 'テレビ局', dice: [6], net: 2, endpoint: '街2' },
    { name: '出版社', dice: [3, 4], net: 3, endpoint: '街2' },
    { name: '公園', dice: [6, 5], net: -21, endpoint: '分配プール' },
]) {
    test(`確定した${scenario.name}の実収支と発動をカード盤面へ表示する`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 844, height: 390 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        const result = await page.evaluate(scenario => {
            startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
            GameRuntimeState.runtime.setCpuPlayers(Array(4).fill(null));
            cancelCpuSchedule('cardboard-purple-results');
            const game = GameRuntimeState.runtime.snapshot().game;
            game.currentPlayerIndex = 0;
            game.phase = GAME_PHASES.ROLL;
            game.players.forEach((player, index) => {
                player.name = `街${index + 1}`;
                player.coins = [30, 0, 1, 4][index];
                player.cards = index === 0 ? [createCardByName(scenario.name)] : [];
                player.dormantCards = [];
                Object.keys(player.landmarks).forEach(name => { player.landmarks[name] = false; });
                if (scenario.name === '出版社' && index !== 0) player.cards = ['パン屋', 'カフェ'].map(createCardByName);
            });
            if (scenario.name === 'テレビ局') game.players[1].coins = 2;
            if (scenario.dice.length === 2) game.players[0].landmarks[LANDMARK_NAMES.STATION] = true;
            setTutorialEnabled(false);
            render();
            acceptHotseatHandoff();
            const before = game.players.map(player => player.coins);
            if (scenario.dice.length === 2) {
                game.rollDice();
                game.selectDiceCount(true, ...scenario.dice);
            } else game.rollDice(scenario.dice[0]);
            render();
            if (scenario.name === 'テレビ局') {
                game.resolveTV(1);
                render();
            }
            acceptHotseatHandoff();
            return { before, after: game.players.map(player => player.coins),
                transfers: document.querySelector('.cardboard-transfer-summary')?.textContent || '' };
        }, scenario);
        expect(result.after[0] - result.before[0]).toBe(scenario.net);
        expect(result.transfers).toContain(scenario.endpoint);
        const card = page.locator(`#cardboardSeats [data-player-index="0"] [data-card-name="${scenario.name}"]`);
        await expect(card).toHaveAttribute('data-cardboard-activation-net', String(scenario.net));
        await expect(card).toHaveAttribute('data-cardboard-activation-count', '1');
        await expect(card).toHaveClass(/cardboard-card-activated/);
        await expect(page.locator('.cardboard-transfers')).toHaveCount(0);
        if (scenario.name === '公園') {
            const diceBounds = await card.locator('.cardboard-dice').evaluate(element => {
                const range = document.createRange();
                range.selectNodeContents(element);
                const text = range.getBoundingClientRect();
                const box = element.getBoundingClientRect();
                const badge = getComputedStyle(element, '::after');
                return { textBottom: text.bottom, badgeTop: box.bottom - parseFloat(badge.bottom) - parseFloat(badge.lineHeight) };
            });
            expect(diceBounds.textBottom).toBeLessThanOrEqual(diceBounds.badgeTop);
            await page.locator('#cardboardDiceReceipt summary').click();
            await expect(page.locator('#cardboardDiceReceipt .plaza-receipt-details')).toContainText('分配プール');
        }
        const path = testInfo.outputPath(`purple-${scenario.name}.png`);
        await page.screenshot({ path });
        await testInfo.attach('確定紫施設の盤面', { path, contentType: 'image/png' });
        const snapshot = () => page.evaluate(() => GameSnapshot.serializeGameState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, {
            pendingActionsFor: GameManager.serializedPendingActionsFor, logLimit: Number.MAX_SAFE_INTEGER,
        }));
        const beforeSwitch = await snapshot();
        for (const theme of ['plaza', 'cardboard']) {
            await page.evaluate(theme => {
                const select = document.getElementById('gameDesignThemeSelect');
                select.value = theme;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }, theme);
        }
        expect(await snapshot()).toEqual(beforeSwitch);
        await expect(page.locator('.cardboard-transfers')).toHaveCount(0);
    });
}
