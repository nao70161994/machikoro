const { test, expect } = require('@playwright/test');

// Ordinary UI regression: SW update lifecycle has its own dedicated suite.
test.use({ serviceWorkers: 'block' });

async function prepare(page, viewport = { width: 390, height: 844 }, count = 4) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
    await page.goto('/');
    await page.evaluate(count => {
        startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
        GameRuntimeState.runtime.setCpuPlayers(Array(count).fill(null));
        cancelCpuSchedule('cardboard-market-regression');
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayerIndex = 0;
        game.phase = GAME_PHASES.BUILD;
        game.players.forEach((player, index) => {
            player.name = `街${index + 1}`;
            player.coins = 30;
            player.cards = ['麦畑', 'パン屋', 'カフェ'].map(createCardByName);
        });
        setTutorialEnabled(false);
        render();
        acceptHotseatHandoff();
    }, count);
}
const state = page => page.evaluate(() => {
    const runtime = GameRuntimeState.runtime.snapshot();
    return GameSnapshot.serializeGameState(runtime.game, SHOP_STOCK, {
        pendingActionsFor: GameManager.serializedPendingActionsFor,
        undoState: runtime.undoState, logLimit: Number.MAX_SAFE_INTEGER,
    });
});

for (const count of [5, 10]) {
    test(`横卓の${count}人戦でも自分・比較相手・主要操作を一画面に保つ`, async ({ page }, testInfo) => {
        await prepare(page, { width: 844, height: 390 }, count);
        await expect(page.locator('#cardboardRoster button')).toHaveCount(count);
        await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(3);
        await expect.poll(() => page.evaluate(() => {
            const targets = [...document.querySelectorAll('#cardboardSeats > .cardboard-player .cardboard-header'),
                document.querySelector('#cardboardMarket .compact-market-buy'), document.getElementById('btnSkip')];
            return targets.flatMap(element => {
                if (!element) return ['missing'];
                const r = element.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 &&
                    r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? [] :
                    [{ target: element.id || element.className, rect: r.toJSON() }];
            });
        })).toEqual([]);
        await page.locator(`#cardboardRoster [data-cardboard-player-index="${count - 1}"]`).click();
        await expect(page.locator(`#cardboardSeats [data-player-index="${count - 1}"]`)).toBeVisible();
        const screenshot = testInfo.outputPath(`card-table-${count}p-landscape.png`);
        await page.screenshot({ path: screenshot });
        await testInfo.attach('多人数の横卓', { path: screenshot, contentType: 'image/png' });
    });
}

test('専用市場の内部スクロールは所持金と在庫の再描画で先頭へ戻らない', async ({ page }) => {
    await prepare(page);
    const list = page.locator('#cardboardMarket .compact-market-facilities');
    await list.evaluate(element => { element.scrollTop = 120; });
    const before = await list.evaluate(element => element.scrollTop);
    expect(before).toBeGreaterThan(0);
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].coins++;
        SHOP_STOCK['麦畑'] = Math.max(0, SHOP_STOCK['麦畑'] - 1);
        render();
        acceptHotseatHandoff();
    });
    expect(await list.evaluate(element => element.scrollTop)).toBe(before);
});

test('専用市場と旧市場は各1つで4ビュー往復とログ開閉が正本を変えない', async ({ page }) => {
    await prepare(page);
    await page.evaluate(() => { setTutorialEnabled(true); render(); acceptHotseatHandoff(); });
    const before = await state(page);
    const logButton = page.locator('#cardboardLogToggle');
    await logButton.click();
    await expect(logButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#gameLogContainer')).toBeVisible();
    expect(await page.evaluate(() => {
        const guide = document.getElementById('tutorialBox'), log = document.getElementById('gameLogContainer');
        if (getComputedStyle(guide).display === 'none') return true;
        const a = guide.getBoundingClientRect(), b = log.getBoundingClientRect();
        return a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left;
    })).toBe(true);
    await logButton.click();
    await expect(page.locator('#gameLogContainer')).toBeHidden();
    await expect(logButton).toHaveAttribute('aria-expanded', 'false');
    for (const theme of ['classic', 'sunset', 'plaza', 'cardboard']) {
        await page.evaluate(theme => {
            const select = document.getElementById('gameDesignThemeSelect');
            select.value = theme;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, theme);
        await expect(page.locator('html')).toHaveAttribute('data-design', theme);
        await expect(page.locator('#buildMenu')).toHaveCount(1);
        await expect(page.locator('#cardboardMarket')).toHaveCount(1);
        await expect(page.locator('#cardboardMarket #buildMenu')).toHaveCount(0);
        expect(await state(page)).toEqual(before);
    }
    await expect(page.locator('#cardboardMarket .compact-market-buy').first()).toBeVisible();
});

test('市場の絞込・目標・ガイド・ログは補助パネルを重ねずに開く', async ({ page }) => {
    await prepare(page, { width: 844, height: 390 });
    await page.evaluate(() => { setTutorialEnabled(true); render(); acceptHotseatHandoff(); });
    const filter = page.locator('#cardboardMarket .compact-market-filter-disclosure');
    const goals = page.locator('#cardboardMarket .compact-market-goal-disclosure');
    const guide = page.locator('#tutorialBox .plaza-guide-disclosure');
    await filter.locator('summary').click();
    await expect(filter).toHaveAttribute('open', '');
    await goals.locator('summary').click();
    await expect(goals).toHaveAttribute('open', '');
    await expect(filter).not.toHaveAttribute('open', '');
    await guide.locator('summary').click();
    await expect(guide).toHaveAttribute('open', '');
    await expect(goals).not.toHaveAttribute('open', '');
    await page.locator('#cardboardLogToggle').click();
    await expect(page.locator('#gameLogContainer')).toBeVisible();
    await expect(guide).not.toHaveAttribute('open', '');
    // The open log intentionally covers the market. Keyboard activation
    // verifies the reverse exclusion without clicking through that overlay.
    await filter.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(filter).toHaveAttribute('open', '');
    await expect(page.locator('#gameLogContainer')).toBeHidden();
});

test('横卓の発動収支と休業枚数は上席でもカード内に収まる', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players.forEach(player => {
            player.cards = [createCardByName('カフェ'), createCardByName('カフェ')];
            player.dormantCards = [player.cards[0]];
        });
        game.phase = GAME_PHASES.ROLL;
        game.rollDice(3);
        // Dice resolution wakes dormant facilities. Exercise the renderer's
        // combined state explicitly after recording a real confirmed income.
        game.players.forEach(player => { player.dormantCards = [player.cards[0]]; });
        render();
        acceptHotseatHandoff();
    });
    const top = page.locator('#cardboardSeats [data-seat-position="top"] .cardboard-card');
    await expect(top.locator('.cardboard-activation')).toContainText('コイン');
    await expect(top.locator('.cardboard-dormant')).toContainText('休業 1枚');
    expect(await top.evaluate(card => {
        const box = card.getBoundingClientRect();
        return [...card.querySelectorAll('.cardboard-dice, .cardboard-name, .cardboard-count, .cardboard-dormant, .cardboard-activation')].flatMap(element => {
            const rect = element.getBoundingClientRect();
            return rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1 &&
                element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1 ? [] :
                [{ className: element.className, card: box.toJSON(), rect: rect.toJSON(),
                    scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
                    scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }];
        });
    })).toEqual([]);
    const screenshot = testInfo.outputPath('card-table-income-dormant-landscape.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('発動と休業の横卓', { path: screenshot, contentType: 'image/png' });
    await expect(page.locator('.cardboard-transfers')).toHaveCount(0);
    const settled = testInfo.outputPath('card-table-income-dormant-settled.png');
    await page.screenshot({ path: settled });
    await testInfo.attach('収支演出終了後の全席', { path: settled, contentType: 'image/png' });
});

test('横持ちの実出目と振り直し操作・市場・各席HUDが祖先でクリップされない', async ({ page }, testInfo) => {
    await prepare(page, { width: 844, height: 390 });
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.players[0].landmarks[LANDMARK_NAMES.STATION] = true;
        game.players[0].landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
        game.phase = GAME_PHASES.ROLL;
        game.rollDice();
        game.selectDiceCount(true, 5, 1);
        render();
        acceptHotseatHandoff();
    });
    await expect(page.locator('#diceChoose')).toContainText(/5\s*\+\s*🎲?1（合計6）/u);
    await expect(page.locator('#diceChoose [data-action="skipReroll"]')).toBeEnabled();
    // Match the table regression's viewport AND clipping-ancestor contract.
    await expect.poll(() => page.evaluate(() => {
        const violations = [];
        const targets = [...document.querySelectorAll('#cardboardSeats > .cardboard-player .cardboard-header'),
            document.querySelector('#cardboardMarket .compact-market-buy'), document.getElementById('diceChoose')];
        for (const element of targets) {
            if (!element) { violations.push('missing'); continue; }
            const r = element.getBoundingClientRect();
            const label = element.className || element.id;
            if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1)) violations.push(`${label}: viewport`);
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent), p = parent.getBoundingClientRect();
                if (style.display === 'contents') continue;
                if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (r.top < p.top - 1 || r.bottom > p.bottom + 1)) violations.push(`${label}: vertical ${parent.id}`);
                if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (r.left < p.left - 1 || r.right > p.right + 1)) violations.push(`${label}: horizontal ${parent.id}`);
            }
        }
        if (document.documentElement.scrollHeight > innerHeight + 1) violations.push('page overflow');
        return violations;
    })).toEqual([]);
    const screenshot = testInfo.outputPath('card-table-reroll-landscape.png');
    await page.screenshot({ path: screenshot });
    await testInfo.attach('振り直し選択中の卓', { path: screenshot, contentType: 'image/png' });
    await expect(page.locator('#crashScreen')).toBeHidden();
});
