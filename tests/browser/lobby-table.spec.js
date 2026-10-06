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
