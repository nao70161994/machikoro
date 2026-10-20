const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block', video: 'off' });
const viewports = [
    { width: 320, height: 844 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 },
];

test.beforeEach(async ({ page }) => {
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ body: '' }));
    await page.addInitScript(() => {
        localStorage.setItem('machikoroDesignTheme', 'cardboard');
        localStorage.setItem('machikoroTutorialEnabled', 'false');
    });
});

test('Socket.IOが応答しなくてもローカルゲームを開始できる', async ({ page }) => {
    await page.route('**/socket.io/socket.io.js*', () => {});
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof startGameNow === 'function');
    await page.evaluate(() => {
        startGameNow(2, [{ type: 'human', name: '街1' }, { type: 'human', name: '街2' }]);
        acceptHotseatHandoff();
    });
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('#btnRoll')).toBeEnabled();
});

for (const viewport of viewports) {
    test(`市場詳細の閲覧と復帰・夕暮れの手番表示 ${viewport.width}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/');
        await page.evaluate(() => {
            startGameNow(4, Array.from({ length: 4 }, (_, i) => ({ type: 'human', name: `街${i + 1}` })));
            cancelCpuSchedule('repository-review');
            GameRuntimeState.runtime.setCpuPlayers([null, null, null, null]);
            setTutorialEnabled(false);
            acceptHotseatHandoff();
            CardBoardField.openMarket();
        });
        const info = page.locator('#cardboardMarketDialog .compact-market-detail').first();
        const name = await info.getAttribute('data-card-name');
        await info.click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await expect(page.locator('#cardDetailTitle')).toContainText(name);
        await page.screenshot({ path: testInfo.outputPath(`market-detail-${viewport.width}.png`) });
        await page.locator('[data-ui-action="closeCardDetail"]').click();
        await expect(page.locator('#cardDetailModal')).toBeHidden();
        await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
        await expect(info).toBeFocused();
        await info.click();
        await expect(page.locator('#cardDetailModal')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#cardDetailModal')).toBeHidden();
        await expect(page.locator('#cardboardMarketDialog')).toBeVisible();
        await expect(info).toBeFocused();
        await page.locator('#cardboardMarketClose').click();
        await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
        expect(await page.locator('#gameScreen').evaluate(element => element.inert)).toBe(false);
        await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = 3;
            state.game.players[3].name = '現在のプレイヤー四';
            state.game.players[3].coins = 37;
            const select = document.getElementById('gameDesignThemeSelect');
            select.value = 'sunset';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            render();
            acceptHotseatHandoff();
        });
        await expect(page.locator('#status')).toContainText('現在のプレイヤー四のターン');
        await expect(page.locator('#status')).toContainText('37コイン');
        await expect(page.locator('#turnAnnouncer')).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath(`sunset-turn-${viewport.width}.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    });
}

test('通信復旧後のルーム作成操作がSocket.IOを再取得する', async ({ page }) => {
    let restored = false;
    let requests = 0;
    await page.route('**/socket.io/socket.io.js*', route => {
        requests++;
        return restored ? route.continue() : route.abort();
    });
    await page.goto('/');
    await page.evaluate(() => window.__machikoroCheckOnlineDelivery());
    expect(await page.evaluate(() => typeof io)).toBe('undefined');
    const failedRequests = requests;
    restored = true;
    await page.locator('#tabOnline').click();
    await page.locator('#playerNameInput').fill('再試行');
    await page.locator('#onlineCreateSubmitButton').click();
    await expect(page.locator('#onlineWaitingPanel .room-id-display')).toHaveText(/^[A-Z0-9]{6}$/);
    expect(requests).toBeGreaterThan(failedRequests);
});

test('市場詳細中のDOM更新は同じランドマークへ戻り手番交代を妨げない', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        startGameNow(2, [{ type: 'human', name: '街1' }, { type: 'human', name: '街2' }]);
        setTutorialEnabled(false);
        acceptHotseatHandoff();
        CardBoardField.openMarket();
    });
    await page.locator('#cardboardMarketDialog .compact-market-goal-disclosure > summary').click();
    const landmark = page.locator('#cardboardMarketDialog [data-action="showLandmarkDetail"]').nth(1);
    const name = await landmark.getAttribute('data-landmark-name');
    await landmark.click();
    await page.evaluate(() => {
        const market = document.getElementById('cardboardMarket');
        market.innerHTML = market.innerHTML;
    });
    await page.locator('[data-ui-action="closeCardDetail"]').click();
    await expect(page.locator(`#cardboardMarketDialog [data-action="showLandmarkDetail"][data-landmark-name="${name}"]`)).toBeFocused();
    await landmark.click();
    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayerIndex = 1;
        game.turnCount++;
        render();
    });
    await page.locator('[data-ui-action="closeCardDetail"]').click();
    await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
    await expect(page.locator('#hotseatHandoffOverlay')).toBeVisible();
    await page.locator('[data-ui-action="acceptHotseatHandoff"]').click();
    await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
    await expect(page.locator('#btnRoll')).toBeEnabled();
});

test('CPU手番中に開いた市場より次の人間の引渡し画面を優先する', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    const nextHumanName = await page.evaluate(() => {
        startGameNow(3, [
            { type: 'human', name: '街1' },
            { type: 'cpu', difficulty: 'normal', name: 'CPU' },
            { type: 'human', name: '街3' },
        ]);
        cancelCpuSchedule('market-handoff-fixture');
        setTutorialEnabled(false);
        acceptHotseatHandoff();
        const state = GameRuntimeState.runtime.snapshot();
        const game = state.game;
        const cpuIndex = state.cpuPlayers.findIndex(player => player !== null);
        if (cpuIndex < 0) throw new Error('CPU seat missing');
        // Local matches shuffle seats; use the actual runtime mapping.
        game.currentPlayerIndex = cpuIndex;
        game.turnCount++;
        GameSetupState.runtime.setCpuSpeed(200);
        render();
        CardBoardField.openMarket();
        scheduleCpuTurn('market-handoff-regression');
        return game.players[(cpuIndex + 1) % game.players.length].name;
    });
    await expect(page.locator('#hotseatHandoffOverlay')).toBeVisible();
    await expect(page.locator('#cardboardMarketDialog')).toBeHidden();
    await expect(page.locator('#hotseatHandoffName')).toHaveText(nextHumanName);
    await page.screenshot({ path: testInfo.outputPath('market-cpu-human-handoff.png') });
    await page.locator('[data-ui-action="acceptHotseatHandoff"]').click();
    await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
    await expect(page.locator('#btnRoll')).toBeEnabled();
    expect(await page.locator('#gameScreen').evaluate(element => element.inert)).toBe(false);
});

for (const order of ['reconnect-create', 'create-reconnect', 'reconnect-join', 'join-reconnect']) {
    test(`Socket.IO待機中の最後のオンライン操作だけ送信する ${order}`, async ({ page }) => {
        const held = [];
        await page.route('**/socket.io/socket.io.js*', route => held.push(route));
        await page.addInitScript(() => {
            // A validated stored-session shape; the old room need not exist to
            // verify which mutually exclusive request reaches the transport.
            localStorage.setItem('onlineSession', JSON.stringify({
                roomId: 'ABCDEF', playerIndex: 0, originalPlayerIndex: 0,
                playerName: '再接続', reconnectToken: 'review-token', isRoomHost: true,
            }));
            window.__entryEmits = [];
            let transport;
            Object.defineProperty(window, 'io', {
                configurable: true,
                get: () => transport,
                set(factory) {
                    transport = (...args) => {
                        const socket = factory(...args);
                        const emit = socket.emit.bind(socket);
                        socket.emit = (...message) => {
                            window.__entryEmits.push(message[0]);
                            return emit(...message);
                        };
                        return socket;
                    };
                },
            });
        });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const choose = async action => {
            if (action === 'reconnect') {
                await page.locator('[data-ui-action="reconnectOnline"]').click();
            } else {
                await page.locator('#tabOnline').click();
                await page.locator('#playerNameInput').fill('新規');
                if (action === 'join') {
                    await page.locator('#onlineTabJoin').click();
                    await page.locator('#roomIdInput').fill('UVWXYZ');
                    await page.locator('#onlineJoinSubmitButton').click();
                } else await page.locator('#onlineCreateSubmitButton').click();
            }
        };
        for (const action of order.split('-')) await choose(action);
        await page.unroute('**/socket.io/socket.io.js*');
        await Promise.all(held.map(route => route.continue().catch(() => {})));
        const expected = order.endsWith('reconnect') ? 'rejoinRoom' : order.endsWith('join') ? 'joinRoom' : 'createRoom';
        await expect.poll(() => page.evaluate(() => window.__entryEmits.filter(name =>
            ['createRoom', 'joinRoom', 'rejoinRoom'].includes(name)))).toEqual([expected]);
        // Drain shared-loader callbacks before checking for a second request.
        await page.evaluate(async () => {
            await SocketIoDelivery.load({ document, getIo: () => typeof io === 'function' ? io : undefined });
            await new Promise(resolve => setTimeout(resolve, 0));
        });
        expect(await page.evaluate(() => window.__entryEmits.filter(name =>
            ['createRoom', 'joinRoom', 'rejoinRoom'].includes(name)))).toEqual([expected]);
    });
}
