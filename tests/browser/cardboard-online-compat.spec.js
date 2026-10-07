const { test, expect, devices } = require('@playwright/test');

// Real Socket.IO room and server-generated dice, following plaza-online and
// mobile-webkit's saved online reconnect path. No game/action state is injected.
test('4テーマ混在オンラインは途中切替と再接続でも同じ正本を保持する', async ({ browser, baseURL }) => {
    test.setTimeout(90000);
    const contexts = [];
    const pages = [];
    const errors = [];
    const themes = ['cardboard', 'classic', 'sunset', 'plaza'];
    const snapshot = page => page.evaluate(() => ({
        phase: GameRuntimeState.runtime.snapshot().game.phase,
        currentPlayerIndex: GameRuntimeState.runtime.snapshot().game.currentPlayerIndex,
        turnCount: GameRuntimeState.runtime.snapshot().game.turnCount,
        dice: GameRuntimeState.runtime.snapshot().game.lastDiceResult,
        room: onlineSessionSnapshot().myRoomId,
        seq: _lastAppliedOnlineActionSeq(),
        state: GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER),
    }));
    const synchronized = async () => {
        await expect.poll(async () => {
            const states = await Promise.all(pages.map(snapshot));
            return new Set(states.map(state => JSON.stringify(state))).size;
        }).toBe(1);
        return snapshot(pages[0]);
    };
    const selectTheme = async (page, theme) => {
        await page.evaluate(value => {
            const select = document.getElementById('designThemeSelect');
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, theme);
        await expect(page.locator('html')).toHaveAttribute('data-design', theme);
    };
    try {
        for (let index = 0; index < themes.length; index += 1) {
            const context = await browser.newContext({ ...devices['iPhone 13'], baseURL, serviceWorkers: 'block' });
            contexts.push(context);
            const page = await context.newPage();
            pages.push(page);
            page.on('pageerror', error => errors.push(error.message));
            await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
            await page.goto('/');
            await selectTheme(page, themes[index]);
            await page.locator('#tabOnline').click();
            await page.locator('#playerNameInput').fill(`混在${index + 1}`);
        }
        const host = pages[0];
        await host.locator('#onlineAdvancedSettings > summary').click();
        for (let index = 0; index < 2; index += 1) {
            await host.locator('[data-ui-action="changeOnlineCount"][data-delta="1"]').click();
        }
        await host.locator('#onlineAdvancedSettings > summary').click();
        await host.locator('#onlineCreateSubmitButton').click();
        const room = (await host.locator('#onlineWaitingPanel .room-id-display').textContent()).trim();
        expect(room).toMatch(/^[A-Z0-9]{6}$/);
        for (const guest of pages.slice(1)) {
            await guest.locator('#onlineTabJoin').click();
            await guest.locator('#roomIdInput').fill(room);
            await guest.locator('#onlineJoinSubmitButton').click();
        }
        for (const page of pages) await page.locator('[data-ui-action="setOnlineLobbyReady"][data-ready="true"]').click();
        for (const page of pages) {
            await expect(page.locator('#gameScreen')).toBeVisible();
            await expect(page.locator('#players > .player-box')).toHaveCount(4);
        }
        const initial = await synchronized();
        let active;
        for (const page of pages) {
            if (await page.locator('#btnRoll').isVisible() && await page.locator('#btnRoll').isEnabled()) active = page;
        }
        expect(active).toBeTruthy();
        await active.locator('#btnRoll').click();
        for (const page of pages) {
            await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.phase)).toBe('build');
        }
        let rolled = await synchronized();
        expect(rolled.seq).toBeGreaterThan(initial.seq);
        const beforeBuild = rolled;
        await active.locator('#btnBuildShortcut').click();
        const wheat = active.locator('#buildMenu [data-action="buildCard"][data-card-name="麦畑"]');
        await expect(wheat).toBeEnabled();
        await wheat.click();
        for (const page of pages) {
            await expect.poll(async () => (await snapshot(page)).seq).toBeGreaterThan(beforeBuild.seq);
        }
        const built = await synchronized();
        const actorIndex = beforeBuild.currentPlayerIndex;
        expect(built.state.builtThisTurn).toBe(true);
        expect(built.state.playerCoins[actorIndex]).toBe(beforeBuild.state.playerCoins[actorIndex] - 1);
        expect(built.state.playerCardNames[actorIndex].filter(name => name === '麦畑').length)
            .toBe(beforeBuild.state.playerCardNames[actorIndex].filter(name => name === '麦畑').length + 1);
        await active.locator('#buildMenu [data-action="undoBuild"]').click();
        await expect(active.locator('#confirmModal')).toBeVisible();
        await active.locator('#confirmOkBtn').click();
        for (const page of pages) {
            await expect.poll(async () => (await snapshot(page)).seq).toBeGreaterThan(built.seq);
        }
        rolled = await synchronized();
        // The server restores the authoritative build snapshot; the Undo message
        // and monotonically increasing action sequence are intentional changes.
        const withoutHistory = state => {
            const { log, reviewSummary, ...rest } = state;
            return rest;
        };
        expect(withoutHistory(rolled.state)).toEqual(withoutHistory(beforeBuild.state));
        expect(rolled.phase).toBe(beforeBuild.phase);
        expect(rolled.currentPlayerIndex).toBe(beforeBuild.currentPlayerIndex);
        expect(rolled.turnCount).toBe(beforeBuild.turnCount);
        expect(rolled.dice).toBe(beforeBuild.dice);
        // Changing each local presentation must neither emit actions nor mutate state.
        for (let index = 0; index < pages.length; index += 1) {
            await selectTheme(pages[index], themes[(index + 1) % themes.length]);
        }
        expect(await synchronized()).toEqual(rolled);
        // Restore cardboard before reload and prove its preference and room state survive.
        await selectTheme(host, 'cardboard');
        await host.reload();
        await expect(host.locator('#onlineResumeSection')).toBeVisible();
        await host.locator('[data-ui-action="reconnectOnline"]').click();
        await expect(host.locator('#gameScreen')).toBeVisible();
        await expect(host.locator('html')).toHaveAttribute('data-design', 'cardboard');
        expect(await synchronized()).toEqual(rolled);
        // Rediscover the owning client after reconnect; the original Page may be host.
        active = undefined;
        for (const page of pages) {
            if (await page.locator('#btnSkip').isVisible() && await page.locator('#btnSkip').isEnabled()) active = page;
        }
        expect(active).toBeTruthy();
        await active.locator('#btnSkip').click();
        await expect(active.locator('#confirmModal')).toBeVisible();
        await active.locator('#confirmOkBtn').click();
        for (const page of pages) {
            await expect.poll(async () => (await snapshot(page)).seq).toBeGreaterThan(rolled.seq);
        }
        await synchronized();
        expect(errors).toEqual([]);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});
