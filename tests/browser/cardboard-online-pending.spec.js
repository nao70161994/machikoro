const { test, expect, devices } = require('@playwright/test');
const { isDeepStrictEqual } = require('node:util');

// Test-only canonical fixture is distributed exclusively through real rejoin snapshots.
test('4テーマのTV選択は正本snapshot復元後に同じ承認actionを適用する', async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(90000);
    const server = require('../../server');
    const { configureSocketE2EHeartbeat } = require('../helpers/socket-e2e');
    const restoreHeartbeat = configureSocketE2EHeartbeat(server.__io);
    const httpServer = server.__io.httpServer;
    await new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(0, '127.0.0.1', resolve);
    });
    baseURL = `http://127.0.0.1:${httpServer.address().port}`;
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
        state: (() => {
            const state = GameSnapshot.serializeUndoState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, Number.MAX_SAFE_INTEGER);
            // online.js adds these recipient-local transport notices outside
            // canonical actions (including SYSTEM review counts). Retain all
            // gameplay logs and every other reviewSummary field for comparison.
            const localNotice = entry => entry.type === LOG_TYPES.SYSTEM && (
                entry.message === '👑 あなたがホストになりました' ||
                (entry.message.startsWith('🔌 ') && (entry.message.endsWith('が再接続しました') || entry.message.endsWith('が切断しました')))
            );
            const noticeCount = state.log.filter(localNotice).length;
            state.log = state.log.filter(entry => !localNotice(entry));
            if (noticeCount && state.reviewSummary.counts[LOG_TYPES.SYSTEM] !== undefined) {
                state.reviewSummary.counts[LOG_TYPES.SYSTEM] -= noticeCount;
                if (state.reviewSummary.counts[LOG_TYPES.SYSTEM] === 0) delete state.reviewSummary.counts[LOG_TYPES.SYSTEM];
            }
            return state;
        })(),
    }));
    const synchronized = async () => {
        let latest;
        try {
            await expect.poll(async () => {
                const states = await Promise.all(pages.map(snapshot));
                latest = states;
                return 1 + states.slice(1).filter(state => !isDeepStrictEqual(state, states[0])).length;
            }).toBe(1);
        } catch (error) {
            await testInfo.attach('online-state-difference', { body: JSON.stringify(latest, null, 2), contentType: 'application/json' });
            throw error;
        }
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
        await synchronized();
        const canonicalRoom = server.__rooms[room];
        const mirror = server.getRoomCanonicalMirror(canonicalRoom);
        const runtime = server.loadGameRuntime();
        const actorIndex = mirror.game.currentPlayerIndex;
        const targetIndex = (actorIndex + 1) % 4;
        mirror.game.currentPlayer().cards.push(runtime.createCardByName('テレビ局'));
        mirror.game.players[targetIndex].coins = 10;
        mirror.game.phase = runtime.GAME_PHASES.PENDING;
        mirror.game.pendingTV = 1;
        mirror.game.pendingActionQueue = [{ action: 'resolveTV', field: 'pendingTV' }];
        canonicalRoom.stateSnapshot = server.serializeMirrorState(
            mirror.game, mirror.shopStock, mirror.lastUndoState, canonicalRoom.actionSeq
        );
        canonicalRoom.actionLog = [];
        server.markRoomCanonicalMirrorCurrent(canonicalRoom);
        // Every browser receives the same server snapshot through its saved token.
        for (let index = 0; index < pages.length; index += 1) {
            const page = pages[index];
            await page.reload();
            await expect(page.locator('#onlineResumeSection')).toBeVisible();
            await page.locator('[data-ui-action="reconnectOnline"]').click();
            await expect(page.locator('#gameScreen')).toBeVisible();
            await expect(page.locator('html')).toHaveAttribute('data-design', themes[index]);
            await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.pendingTV)).toBe(1);
        }
        const before = await synchronized();
        let actor;
        for (const page of pages) {
            if (await page.evaluate(() => onlineSessionSnapshot().myPlayerIndex === GameRuntimeState.runtime.snapshot().game.currentPlayerIndex)) actor = page;
        }
        expect(actor).toBeTruthy();
        await actor.locator(`#pendingModal [data-action="resolveTV"][data-target-index="${targetIndex}"]`).click();
        for (const page of pages) {
            await expect.poll(async () => (await snapshot(page)).seq).toBe(before.seq + 1);
            await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.pendingTV)).toBe(0);
        }
        const after = await synchronized();
        expect(after.state.playerCoins[targetIndex]).toBe(before.state.playerCoins[targetIndex] - 5);
        expect(after.state.playerCoins[actorIndex]).toBe(before.state.playerCoins[actorIndex] + 5);
        expect(after.phase).toBe('build');
        const finalMirror = server.getRoomCanonicalMirror(canonicalRoom);
        expect(finalMirror.game.players.map(player => player.coins)).toEqual(after.state.playerCoins);
        expect(finalMirror.game.pendingTV).toBe(0);
        expect(finalMirror.game.phase).toBe(after.phase);
        expect(canonicalRoom.actionLog.at(-1).action).toBe('resolveTV');
        expect(errors).toEqual([]);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
        restoreHeartbeat();
        await new Promise(resolve => server.__io.close(resolve));
    }
});
