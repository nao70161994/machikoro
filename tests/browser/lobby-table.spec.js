const { test, expect } = require('@playwright/test');

for (const width of [320, 390, 844, 1440]) {
    test(`待機テーブルの2〜10席は長い名前と管理操作でも重ならない ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'plaza'));
        await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
        await page.goto('/');
        await page.locator('#tabOnline').click();
        await expect(page.locator('#tabContentOnline')).toBeVisible();
        for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
            await page.evaluate(count => {
                const names = Array.from({ length: count }, (_, index) => index === count - 1
                    ? '待機中...' : index === 2 ? 'CPU（普通）'
                    : `参加者${index + 1}・長い名前の街を育てる仲間`);
                const participants = names.flatMap((name, index) => name === '待機中...' || name === 'CPU（普通）' ? [] : [{
                    index, name, connected: index !== 1, ready: index !== 0,
                    ...(index === 1 ? { reservedUntil: 61000 } : {}),
                }]);
                document.getElementById('onlineWaitingPanel').innerHTML = OnlineRoomShare.buildWaitingHtml('ABC123', names, {
                    isHost: true, myPlayerIndex: 0, hostPlayerIndex: 0, participants, now: 1000,
                });
            }, count);
            const seats = page.locator('#onlineWaitingPanel .room-seat');
            await expect(seats).toHaveCount(count);
            const tableLayout = page.locator('#onlineWaitingPanel .room-table-layout');
            if (count > 4) await expect(tableLayout).toHaveClass(/room-table-layout-roster/);
            else await expect(tableLayout).not.toHaveClass(/room-table-layout-roster/);
            if (width === 320) {
                expect(await page.locator('.room-seat-list').evaluate(list =>
                    getComputedStyle(list).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1);
            }
            expect(await seats.evaluateAll(items => items.map(item => Number(item.dataset.seatIndex))))
                .toEqual(Array.from({ length: count }, (_, index) => index));
            await expect(page.locator('.room-seat[data-seat-self="true"] .room-seat-roles')).toHaveText('ホストあなた');
            await expect(page.locator('.room-ready-btn')).toHaveText('準備完了にする');
            await expect(page.locator('.room-ready-btn')).toHaveAttribute('aria-pressed', 'false');
            await expect(page.locator('.room-seat[data-seat-state="empty"] .room-seat-name')).toHaveText('空いている席');
            if (count >= 3) {
                await expect(page.locator('.room-seat[data-seat-index="1"] .room-seat-state')).toHaveText('再接続待ち');
                await expect(page.locator('.room-seat[data-seat-index="1"] .room-seat-remove')).toHaveAttribute('data-player-index', '1');
                await expect(page.locator('.room-seat[data-seat-index="1"] .room-seat-remove')).toHaveAttribute('aria-label', /再接続待ち.*待機室から外す/);
            }
            if (count >= 4) await expect(page.locator('.room-seat[data-seat-index="2"] .room-seat-state')).toHaveText('CPU');
            await expect.poll(() => page.evaluate(() => {
                const table = document.querySelector('.room-table-layout').getBoundingClientRect();
                const seats = [...document.querySelectorAll('.room-table-layout .room-seat')];
                const rects = [...seats, document.querySelector('.room-game-table')]
                    .map(item => item.getBoundingClientRect());
                const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                const violations = [];
                rects.forEach((rect, index) => {
                    if (rect.width <= 0 || rect.height <= 0 || rect.left < table.left || rect.right > table.right ||
                            rect.top < table.top || rect.bottom > table.bottom) violations.push(`outside:${index}`);
                    rects.slice(index + 1).forEach((other, offset) => {
                        if (overlaps(rect, other)) violations.push(`overlap:${index}/${index + offset + 1}`);
                    });
                });
                for (const button of document.querySelectorAll('.room-ready-btn, .room-seat-remove')) {
                    const rect = button.getBoundingClientRect();
                    if (rect.width < 44 || rect.height < 44) violations.push(`touch:${button.className}`);
                }
                if (document.documentElement.scrollWidth > innerWidth) violations.push('horizontal-overflow');
                return violations;
            })).toEqual([]);
        }
        await expect(page.locator('#crashScreen')).toBeHidden();
    });
}

test('にぎわい広場の320×568待機室ではルーム操作と参加席を早めに見せる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.goto('/');
    await page.locator('#tabOnline').click();
    await page.evaluate(() => {
        const players = ['街A', '街B', '街C', '街D'];
        const participants = players.map((name, index) => ({ index, name, connected: true, ready: index !== 0 }));
        document.getElementById('onlineWaitingPanel').innerHTML = OnlineRoomShare.buildWaitingHtml('ABC123', players, {
            isHost: true, myPlayerIndex: 0, hostPlayerIndex: 0, participants,
        });
    });

    const idRow = page.locator('#onlineWaitingPanel .room-share-row');
    await expect(page.locator('#onlineWaitingPanel .room-id-copy-btn')).toBeVisible();
    await expect(page.locator('#onlineWaitingPanel .room-seat')).toHaveCount(4);
    expect(await idRow.evaluate(element => getComputedStyle(element).flexDirection)).toBe('row');
    expect((await page.locator('#onlineWaitingPanel .room-seat').first().boundingBox()).y).toBeLessThan(480);
    expect((await page.locator('#onlineWaitingPanel .room-game-table-art').boundingBox()).width).toBeLessThanOrEqual(128);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({ path: testInfo.outputPath('cardboard-lobby-320x568.png'), fullPage: false });
});

test('にぎわい広場待機室は高コントラストで席状態と操作を識別できる', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#tabOnline').click();
    await page.evaluate(() => {
        document.documentElement.dataset.design = 'cardboard';
        document.body.classList.add('accessibility-high-contrast');
        document.getElementById('onlineWaitingPanel').innerHTML = OnlineRoomShare.buildWaitingHtml('ABC123', [
            '街A', '待機中...'], { isHost: true, myPlayerIndex: 0, hostPlayerIndex: 0,
                participants: [{ index: 0, name: '街A', connected: true, ready: true }] });
    });
    const ready = page.locator('#onlineWaitingPanel .room-ready-btn');
    const role = page.locator('#onlineWaitingPanel .room-seat-roles > span').first();
    const state = page.locator('#onlineWaitingPanel .room-seat[data-seat-state="ready"] .room-seat-state');
    await expect(ready).toBeVisible();
    await expect.poll(() => ready.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(0, 0, 0)');
    await expect.poll(() => role.evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 230, 109)');
    await expect.poll(() => state.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(0, 0, 0)');
    await expect(page.locator('#onlineWaitingPanel .room-game-table-art')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
