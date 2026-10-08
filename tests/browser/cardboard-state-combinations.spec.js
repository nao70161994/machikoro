const { test, expect } = require('@playwright/test');

// Real SW lifecycle is covered by the PWA suites; these cases exercise UI state.
test.use({ serviceWorkers: 'block' });

async function prepare(page, scenario) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(scenario => {
        startGameNow(4, Array.from({ length: 4 }, (_, index) => ({
            type: index ? 'cpu' : 'human', difficulty: 'normal', name: `街${index + 1}`,
        })));
        const runtime = GameRuntimeState.runtime;
        const state = runtime.snapshot();
        state.cpuPlayers.fill(null);
        cancelCpuSchedule('cardboard-state-combinations');
        const game = state.game;
        game.currentPlayerIndex = 0;
        game.phase = GAME_PHASES.ROLL;
        game.log = [];
        game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            player.cards = [createCardByName('麦畑')];
            player.coins = 30;
        });
        const player = game.players[0];
        player.landmarks[LANDMARK_NAMES.STATION] = scenario !== 'TV';
        player.landmarks[LANDMARK_NAMES.RADIO_TOWER] = scenario === 'REROLL_CONFIRM';
        player.landmarks[LANDMARK_NAMES.HARBOR] = scenario === 'HARBOR_CHOICE';
        if (scenario === 'TV') player.cards.push(createCardByName('テレビ局'));
        runtime.setUndoState(GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER));
        if (scenario === 'TV') game.rollDice(6);
        else {
            game.rollDice();
            if (scenario === 'REROLL_CONFIRM') game.selectDiceCount(true, 5, 1);
            if (scenario === 'HARBOR_CHOICE') game.selectDiceCount(true, 5, 5);
        }
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, scenario);
    await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
}
const snapshot = page => page.evaluate(() => {
    const runtime = GameRuntimeState.runtime.snapshot();
    return GameSnapshot.serializeGameState(runtime.game, SHOP_STOCK, {
        pendingActionsFor: GameManager.serializedPendingActionsFor,
        undoState: runtime.undoState,
        logLimit: Number.MAX_SAFE_INTEGER,
    });
});
async function switchTheme(page, theme) {
    await page.evaluate(theme => {
        const select = document.getElementById('gameDesignThemeSelect');
        select.value = theme;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-design', theme);
}

for (const scenario of ['SELECT_DICE', 'REROLL_CONFIRM', 'HARBOR_CHOICE', 'TV']) {
    test(`カード盤面の4ビュー往復は${scenario}の選択・undo・市場を変えない`, async ({ page }) => {
        await prepare(page, scenario);
        const before = await snapshot(page);
        expect(before.phase).toBe(await page.evaluate(key => GAME_PHASES[key === 'TV' ? 'PENDING' : key], scenario));
        expect(before.undoState).not.toBeNull();
        if (scenario === 'TV') expect(before.pendingActions.length).toBeGreaterThan(0);
        for (const theme of ['classic', 'sunset', 'plaza', 'cardboard']) {
            await switchTheme(page, theme);
            expect(await snapshot(page)).toEqual(before);
            if (scenario === 'REROLL_CONFIRM') await expect(page.locator('#diceChoose')).toContainText(/5\s*\+\s*🎲?1（合計6）/u);
        }
        const action = {
            SELECT_DICE: '#diceChoose [data-use-two="false"]',
            REROLL_CONFIRM: '#diceChoose [data-action="skipReroll"]',
            HARBOR_CHOICE: '#diceChoose [data-action="resolveHarbor"][data-use-bonus="false"]',
            TV: '[data-action="resolveTV"][data-target-index="1"]',
        }[scenario];
        await expect(page.locator(action)).toBeEnabled();
        await page.locator(action).click();
        // Dice selection commits after the shared roll animation finishes.
        await expect.poll(async () => (await snapshot(page)).phase).toBe('build');
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

test('動きを減らす設定でガイドからログへ切り替え更新通知があってもTV対象を選べる', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepare(page, 'TV');
    await page.evaluate(() => {
        setTutorialEnabled(true);
        render();
        acceptHotseatHandoff();
        setLogCollapsed(false);
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });
    await expect(page.locator('#tutorialBox')).toBeHidden();
    await expect(page.locator('#gameLogContainer')).toBeVisible();
    await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/pwa-banner-open/);
    const before = await snapshot(page);
    const target = page.locator('[data-action="resolveTV"][data-target-index="1"]');
    await target.click();
    await expect.poll(async () => (await snapshot(page)).pendingTV).toBe(0);
    const after = await snapshot(page);
    expect(after.pendingTV).toBe(0);
    expect(after.players[0].coins).toBe(before.players[0].coins + 5);
    expect(after.players[1].coins).toBe(before.players[1].coins - 5);
    await expect(page.locator('#crashScreen')).toBeHidden();
});

test('市場を閲覧中に振り直しへ進んだら選択肢が見える位置へ戻る', async ({ page }) => {
    await prepare(page, 'SELECT_DICE');
    await page.evaluate(() => {
        document.getElementById('cardboardMarket').scrollIntoView({ block: 'start' });
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].landmarks[LANDMARK_NAMES.STATION] = false;
        game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
        game.phase = GAME_PHASES.ROLL;
        game.rollDice(3);
        render();
    });
    await expect.poll(() => page.locator('#diceChoose').evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.height > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight;
    })).toBe(true);
    await expect(page.locator('#diceChoose [data-action="skipReroll"]')).toBeEnabled();
});

test('選択状態を復元中と復元直後は自動スクロールを再生しない', async ({ page }) => {
    await prepare(page, 'REROLL_CONFIRM');
    const before = await snapshot(page);
    const calls = await page.evaluate(async () => {
        const element = document.getElementById('diceChoose');
        const original = element.scrollIntoView;
        let count = 0;
        element.scrollIntoView = () => { count++; };
        try {
            CardBoardField.detach();
            const facts = {
                game: GameRuntimeState.runtime.snapshot().game, selfIndex: 0, escapeHtml,
                enabledLandmarks: getEnabledLandmarkSelection(), session: 'replay-scroll-boundary', display: LOG_TYPE_DISPLAY,
            };
            CardBoardField.render({ ...facts, replaying: true });
            await Promise.resolve();
            CardBoardField.render({ ...facts, replaying: false });
            await Promise.resolve();
            return count;
        } finally { element.scrollIntoView = original; }
    });
    expect(calls).toBe(0);
    expect(await snapshot(page)).toEqual(before);
});

test('選択中のビュー復帰はスクロールせずキーボードで選択へ戻れる', async ({ page }) => {
    await prepare(page, 'REROLL_CONFIRM');
    const before = await snapshot(page);
    const calls = await page.evaluate(async () => {
        const element = document.getElementById('diceChoose');
        const original = element.scrollIntoView;
        let count = 0;
        element.scrollIntoView = () => { count++; };
        try {
            CardBoardField.detach();
            CardBoardField.render({
                game: GameRuntimeState.runtime.snapshot().game, selfIndex: 0, escapeHtml,
                enabledLandmarks: getEnabledLandmarkSelection(), session: 'local-choice-restore',
                replaying: false, display: LOG_TYPE_DISPLAY,
            });
            await Promise.resolve();
            return count;
        } finally { element.scrollIntoView = original; }
    });
    expect(calls).toBe(0);
    expect(await snapshot(page)).toEqual(before);
    await page.evaluate(() => {
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });
    await expect(page.locator('body')).toHaveClass(/pwa-banner-open/);
    await page.locator('#cardboardChoiceJump').click();
    await page.locator('#cardboardChoiceJump').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#diceChoose button:not(:disabled)').first()).toBeFocused();
    await expect.poll(() => page.locator('#diceChoose').evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.height > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight;
    })).toBe(true);
});
