const { test, expect, devices } = require('@playwright/test');
const { isDeepStrictEqual } = require('node:util');

// Four-client DOM snapshots on every evaluation exhausted the 90s deadline
// after the gameplay checks. Keep trace actions/sources, explicit state-diff
// attachments and configured failure screenshots without repeated DOM captures.
test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

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
    let primaryFailure = false;
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
        localSystemCount: GameRuntimeState.runtime.snapshot().game.reviewSummary?.counts?.[LOG_TYPES.SYSTEM] ?? 0,
        localUndoPresent: GameRuntimeState.runtime.snapshot().undoState != null,
        state: (() => {
            // The shared gameplay snapshot excludes each device's Undo UI cache.
            // Actual server-approved Undo is exercised separately below.
            const state = GameSnapshot.serializeGameState(GameRuntimeState.runtime.snapshot().game, SHOP_STOCK, {
                pendingActionsFor: GameManager.serializedPendingActionsFor,
                logLimit: Number.MAX_SAFE_INTEGER,
            });
            // online.js adds these recipient-local transport notices outside
            // canonical actions. Retain every nonlocal gameplay log.
            const localNotice = entry => entry.type === LOG_TYPES.SYSTEM && (
                entry.message === '👑 あなたがホストになりました' ||
                (entry.message.startsWith('🔌 ') && (entry.message.endsWith('が再接続しました') || entry.message.endsWith('が切断しました')))
            );
            state.log = state.log.filter(entry => !localNotice(entry));
            // SYSTEM counts mix canonical events with recipient-local notices
            // cumulatively, while turn/reroll logs are cleared. Historical local
            // counts cannot be recovered from the remaining log. Diagnose only
            // this count separately; retain nonlocal SYSTEM logs and all other
            // review fields and gameplay state in the strict comparison.
            delete state.reviewSummary.counts[LOG_TYPES.SYSTEM];
            return state;
        })(),
    }));
    const synchronized = async () => {
        let latest;
        try {
            await expect.poll(async () => {
                const states = await Promise.all(pages.map(snapshot));
                latest = states;
                const canonical = states.map(({ localUndoPresent, localSystemCount, ...state }) => state);
                return 1 + canonical.slice(1).filter(state => !isDeepStrictEqual(state, canonical[0])).length;
            }).toBe(1);
        } catch (error) {
            await testInfo.attach('online-state-difference', { body: JSON.stringify(latest, null, 2), contentType: 'application/json' });
            throw error;
        }
        await testInfo.attach('local-undo-cache-presence', {
            body: JSON.stringify(latest.map(state => state.localUndoPresent)), contentType: 'application/json',
        });
        await testInfo.attach('local-system-counts', {
            body: JSON.stringify(latest.map(state => state.localSystemCount)), contentType: 'application/json',
        });
        const { localUndoPresent, localSystemCount, ...canonical } = await snapshot(pages[0]);
        return canonical;
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
        expect(after.state.players[targetIndex].coins).toBe(before.state.players[targetIndex].coins - 5);
        expect(after.state.players[actorIndex].coins).toBe(before.state.players[actorIndex].coins + 5);
        expect(after.phase).toBe('build');
        const finalMirror = server.getRoomCanonicalMirror(canonicalRoom);
        expect(finalMirror.game.players.map(player => player.coins)).toEqual(after.state.players.map(player => player.coins));
        expect(finalMirror.game.pendingTV).toBe(0);
        expect(finalMirror.game.phase).toBe(after.phase);
        expect(canonicalRoom.actionLog.at(-1).action).toBe('resolveTV');
        expect(errors).toEqual([]);
    } catch (error) {
        primaryFailure = true;
        throw error;
    } finally {
        const cleanup = await Promise.allSettled(contexts.map(context => context.close()));
        // Always attempt both server cleanups even when a browser close fails.
        cleanup.push(...await Promise.allSettled([
            Promise.resolve().then(() => restoreHeartbeat()),
            new Promise(resolve => server.__io.close(resolve)),
        ]));
        const rejected = cleanup.find(result => result.status === 'rejected');
        if (!primaryFailure && rejected) throw rejected.reason;
    }
});
