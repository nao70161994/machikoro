const { test, expect } = require('@playwright/test');

async function prepare(page, width = 390) {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(4, Array.from({ length: 4 }, (_, index) => ({
            type: index === 0 ? 'human' : 'cpu', difficulty: 'normal', name: `街${index + 1}`,
        })));
        const state = GameRuntimeState.runtime.snapshot();
        state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
        state.cpuPlayers.fill(null);
        cancelCpuSchedule('plaza-experience-frozen');
        state.game.phase = GAME_PHASES.BUILD;
        state.game.currentPlayer().cards = Array.from({ length: 6 }, () => createCardByName('森林'));
        state.game.currentPlayer().coins = 30;
        state.game.log = [];
        render();
        acceptHotseatHandoff();
        PlazaField.focusTarget('self');
    });
    await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
}

test('縦持ちのガイドは序盤の説明を保ち後から開閉できる', async ({ page }) => {
    await prepare(page);
    await page.evaluate(() => {
        setTutorialEnabled(true);
        GameRuntimeState.runtime.snapshot().game.turnCount = 1;
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#tutorialBox .tutorial-body')).toBeVisible();
    await expect(page.locator('.plaza-guide-disclosure')).toHaveCount(0);
    await page.evaluate(() => {
        GameRuntimeState.runtime.snapshot().game.turnCount = 4;
        render();
        acceptHotseatHandoff();
    });
    const guide = page.locator('.plaza-guide-disclosure');
    await expect(guide).toHaveCount(1);
    await expect(guide).not.toHaveAttribute('open', '');
    await expect(guide.locator('.tutorial-body')).toBeHidden();
    expect(await guide.boundingBox().then(box => box.height)).toBeLessThanOrEqual(48);
    // The real update banner remains present while the guide opens and closes.
    await page.evaluate(() => {
        document.body.classList.add('pwa-banner-open');
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });
    await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
        const guide = document.getElementById('tutorialBox').getBoundingClientRect();
        const banner = document.getElementById('pwaUpdateBanner').getBoundingClientRect();
        return guide.bottom <= banner.top && guide.top >= 0;
    })).toBe(true);
    await guide.locator('summary').click();
    await expect(guide.locator('.tutorial-body')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
        const guide = document.getElementById('tutorialBox').getBoundingClientRect();
        const banner = document.getElementById('pwaUpdateBanner').getBoundingClientRect();
        return guide.bottom <= banner.top && guide.top >= 0;
    })).toBe(true);
    await page.evaluate(() => render());
    await expect(guide.locator('.tutorial-body')).toBeVisible();
    await guide.locator('summary').click();
    await expect(guide.locator('.tutorial-body')).toBeHidden();
    await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
    await expect(page.locator('#crashScreen')).toBeHidden();
});

for (const reduced of [false, true]) {
    test(`森林6枚の収入は一つにまとめ復元・Undoで再生しない motion=${reduced}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        await prepare(page);
        await expect.poll(() => page.evaluate(() => {
            const wallet = document.querySelector('#plazaPlayerHud .self .plaza-player-coins').getBoundingClientRect();
            return wallet.width > 0 && wallet.top >= 0;
        })).toBe(true);
        const result = await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot(), game = state.game;
            for (let index = 0; index < 6; index++) {
                game.currentPlayer().coins++;
                game.addLog(LOG_TYPES.GAIN, `🌾 ${game.currentPlayer().name}の森林発動 → +1コイン`);
            }
            render();
            acceptHotseatHandoff();
            const markers = Array.from(document.querySelectorAll('.plaza-coin-amount'), marker => ({
                text: marker.textContent, static: marker.classList.contains('plaza-coin-static'),
            }));
            const count = document.querySelectorAll('.plaza-coin-amount').length;
            render();
            acceptHotseatHandoff();
            const secondCount = document.querySelectorAll('.plaza-coin-amount').length;
            const coins = game.currentPlayer().coins;
            game.log.pop();
            animateTownCoinEvents(document.getElementById('players'), game, state.cpuPlayers, false);
            const afterUndo = document.querySelectorAll('.plaza-coin-amount').length;
            game.addLog(LOG_TYPES.GAIN, `🌾 ${game.currentPlayer().name}の森林発動 → +1コイン`);
            animateTownCoinEvents(document.getElementById('players'), game, state.cpuPlayers, true);
            animateTownCoinEvents(document.getElementById('players'), game, state.cpuPlayers, false);
            return { markers, count, secondCount, afterUndo,
                afterReplay: document.querySelectorAll('.plaza-coin-amount').length,
                coins, finalCoins: game.currentPlayer().coins };
        });
        expect(result.markers).toHaveLength(1);
        expect(result.markers[0].text).toBe('+6');
        if (reduced) expect(result.markers[0].static).toBe(true);
        expect(result.secondCount).toBe(result.count);
        expect(result.afterUndo).toBe(0);
        expect(result.afterReplay).toBe(0);
        expect(result.coins).toBe(36);
        expect(result.finalCoins).toBe(result.coins);
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

for (const width of [390, 1363]) {
    test(`赤施設の送金は受取と支払いを区別し画面離脱で片付ける ${width}px`, async ({ page }) => {
        await prepare(page, width);
        const result = await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot(), game = state.game;
            const receiverIndex = Number(document.querySelector('.plaza-hud-opponents button').dataset.playerIndex);
            const receiver = game.players[receiverIndex];
            receiver.cards = [createCardByName('寿司屋')];
            game.log = [];
            render();
            acceptHotseatHandoff();
            game.currentPlayer().coins -= 2;
            receiver.coins += 2;
            game.addLog(LOG_TYPES.LOSE, `💸 ${receiver.name}の寿司屋発動 → 2コイン獲得`);
            const coins = game.players.map(player => player.coins);
            render();
            return { coins, after: game.players.map(player => player.coins),
                markers: Array.from(document.querySelectorAll('.plaza-coin-amount'), marker => marker.textContent) };
        });
        expect(result.markers.sort()).toEqual(['+2', '-2']);
        expect(result.after).toEqual(result.coins);
        expect(await page.evaluate(async () => {
            document.getElementById('gameScreen').style.display = 'none';
            await Promise.resolve();
            return document.querySelectorAll('.plaza-coin-amount').length;
        })).toBe(0);
    });
}
