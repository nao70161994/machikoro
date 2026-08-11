const { test, expect } = require('@playwright/test');

const MOBILE_CONTEXT = Object.freeze({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
});
function collectRuntimeErrors(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('pagead2.googlesyndication.com')) {
            errors.push(message.text());
        }
    });
    return errors;
}

async function prepare(page) {
    await page.route('https://pagead2.googlesyndication.com/**', route => route.abort());
    await page.goto('/');
}

async function expectPlayerSelectTapTargets(page, containerSelector, expectedCount) {
    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const heights = await page.locator(`${containerSelector} .player-setting-select`)
            .evaluateAll(selects => selects.map(select => select.getBoundingClientRect().height));
        expect(heights).toHaveLength(expectedCount);
        expect(heights.every(height => height >= 44)).toBe(true);
    }
}

async function expectPlayerSelectContained(page, containerSelector, expectedCount, options = {}) {
    const rowSelector = options.rowSelector || '.player-setting-row';
    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const layouts = await page.locator(`${containerSelector} ${rowSelector}`)
            .evaluateAll(rows => rows.map(row => {
                const select = row.querySelector('.player-setting-select');
                const rowBounds = row.getBoundingClientRect();
                const selectBounds = select.getBoundingClientRect();
                return {
                    flexDirection: getComputedStyle(row).flexDirection,
                    contained: selectBounds.left >= rowBounds.left && selectBounds.right <= rowBounds.right,
                    withinViewport: selectBounds.left >= 0 && selectBounds.right <= document.documentElement.clientWidth,
                };
            }));
        expect(layouts).toHaveLength(expectedCount);
        expect(layouts.every(layout => layout.contained && layout.withinViewport)).toBe(true);
        const expectedDirection = (options.alwaysColumn || width <= 389) ? 'column' : 'row';
        expect(layouts.every(layout => layout.flexDirection === expectedDirection)).toBe(true);
    }
}

test('mobile WebKitでapp shellとService Workerが実動作する', async ({ page }) => {
    const errors = collectRuntimeErrors(page);
    await prepare(page);
    await expect(page.locator('#titleScreen')).toBeVisible();
    await page.locator('#tabOnline').click();
    await expect(page.locator('#tabContentOnline')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return !!registration;
    })).toBe(true);
    expect(errors).toEqual([]);
});

test('320pxから480pxでlocal/onlineの2人・10人設定が枠内に収まる', async ({ page }) => {
    await prepare(page);

    await expectPlayerSelectContained(page, '#playerSettings', 2);
    const increasePlayerCount = page.locator('[data-ui-action="changeCount"][data-delta="1"]');
    for (let count = 2; count < 10; count++) await increasePlayerCount.click();
    await expect(page.locator('#playerCount')).toHaveText('10');
    await expectPlayerSelectContained(page, '#playerSettings', 10);

    await page.locator('#tabOnline').click();
    const onlineLayout = { rowSelector: '.player-setting', alwaysColumn: true };
    await expectPlayerSelectContained(page, '#onlinePlayerSettings', 2, onlineLayout);
    const increaseOnlinePlayerCount = page.locator('[data-ui-action="changeOnlineCount"][data-delta="1"]');
    for (let count = 2; count < 10; count++) await increaseOnlinePlayerCount.click();
    await expect(page.locator('#onlinePlayerCount')).toHaveText('10');
    await expectPlayerSelectContained(page, '#onlinePlayerSettings', 10, onlineLayout);
});

test('320pxから480pxでlocal/onlineのプレイヤー種別が十分なtap領域を持つ', async ({ page }) => {
    await prepare(page);

    await expectPlayerSelectTapTargets(page, '#playerSettings', 2);
    const increasePlayerCount = page.locator('[data-ui-action="changeCount"][data-delta="1"]');
    for (let count = 2; count < 10; count++) await increasePlayerCount.click();
    await expectPlayerSelectTapTargets(page, '#playerSettings', 10);

    await page.locator('#tabOnline').click();
    await expectPlayerSelectTapTargets(page, '#onlinePlayerSettings', 2);
    const increaseOnlinePlayerCount = page.locator('[data-ui-action="changeOnlineCount"][data-delta="1"]');
    for (let count = 2; count < 10; count++) await increaseOnlinePlayerCount.click();
    await expectPlayerSelectTapTargets(page, '#onlinePlayerSettings', 10);
});

test('320pxから480pxで長い手番名と終盤player情報が枠内に収まる', async ({ page }) => {
    await prepare(page);
    await page.evaluate(() => {
        const announcer = document.getElementById('turnAnnouncer');
        announcer.style.display = 'flex';
        document.getElementById('turnAnnouncerText').textContent =
            '👤 あいうえおかきくけこ のターン';
        const players = document.getElementById('players');
        players.innerHTML = [
            '<div class="player-box active">',
            '<div class="player-header">',
            '<div class="player-name-row">',
            '<span class="player-icon">👤</span>',
            '<span class="player-name">▶ あいうえおかきくけこ</span>',
            '</div>',
            '<div class="player-coin-row">',
            '<span class="player-coins">🪙 9999</span>',
            '<span class="it-badge">💻999</span>',
            '<span class="loan-badge">💳×6</span>',
            '</div>',
            '</div>',
            '</div>',
        ].join('');
        document.getElementById('gameScreen').style.display = 'block';
    });

    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await page.evaluate(() => {
            const viewportWidth = document.documentElement.clientWidth;
            const announcer = document.querySelector('.turn-announcer-content');
            const playerBox = document.querySelector('.player-box');
            const playerHeader = document.querySelector('.player-header');
            const bounds = element => element.getBoundingClientRect();
            const isContained = element => {
                const rect = bounds(element);
                return rect.left >= 0 && rect.right <= viewportWidth &&
                    element.scrollWidth <= element.clientWidth;
            };
            return {
                announcerContained: isContained(announcer),
                playerBoxContained: isContained(playerBox),
                playerHeaderContained: isContained(playerHeader),
                headerWrapped: bounds(playerHeader).height > 26,
            };
        });
        expect(layout.announcerContained).toBe(true);
        expect(layout.playerBoxContained).toBe(true);
        expect(layout.playerHeaderContained).toBe(true);
        if (width === 320) expect(layout.headerWrapped).toBe(true);
    }
});

test('320pxから480pxで建設カードの判断情報が欠けずに収まる', async ({ page }) => {
    await prepare(page);
    await page.locator('#btnStart').click();
    await expect(page.locator('#gameScreen')).toBeVisible();

    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const cards = await page.locator('#buildMenu .card-btn').evaluateAll(elements => elements.map(card => {
            const bounds = card.getBoundingClientRect();
            const styles = selector => getComputedStyle(card.querySelector(selector));
            return {
                withinViewport: bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth,
                contentFits: card.scrollWidth <= card.clientWidth && card.scrollHeight <= card.clientHeight,
                diceFontSize: styles('.card-dice-num').fontSize,
                categoryFontSize: styles('.card-category-tag').fontSize,
                nameFontSize: styles('.card-name').fontSize,
                costFontSize: styles('.card-cost').fontSize,
                effectFontSize: styles('.card-effect').fontSize,
                effectLineHeight: styles('.card-effect').lineHeight,
            };
        }));
        expect(cards.length).toBeGreaterThan(0);
        expect(cards.every(card => card.withinViewport && card.contentFits)).toBe(true);
        expect(cards.every(card => card.diceFontSize === '13px')).toBe(true);
        expect(cards.every(card => card.categoryFontSize === '10px')).toBe(true);
        expect(cards.every(card => card.nameFontSize === '13px')).toBe(true);
        expect(cards.every(card => card.costFontSize === '13px')).toBe(true);
        expect(cards.every(card => card.effectFontSize === '11px')).toBe(true);
        expect(cards.every(card => Math.abs(parseFloat(card.effectLineHeight) - 15.95) < 0.1)).toBe(true);
    }
});

test('320pxから480pxで頻用補助操作のtap領域が重ならずに収まる', async ({ page }) => {
    await prepare(page);
    const titleButtons = page.locator('.title-buttons-row .rules-btn');

    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const titleTargets = await titleButtons.evaluateAll(elements => elements.map(element => {
            const bounds = element.getBoundingClientRect();
            return {
                height: bounds.height,
                left: bounds.left,
                right: bounds.right,
                viewportWidth: document.documentElement.clientWidth,
            };
        }));
        expect(titleTargets.every(target => target.height >= 44)).toBe(true);
        expect(titleTargets.every(target => target.left >= 0 && target.right <= target.viewportWidth)).toBe(true);
        expect(titleTargets[0].right).toBeLessThanOrEqual(titleTargets[1].left);
    }

    await page.locator('#btnStart').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const targets = await page.locator([
            '#buildMenu .card-filter-btn',
            '#buildMenu .card-detail-btn',
            '#players .card-badge',
            '.tutorial-toggle-btn',
        ].join(', ')).evaluateAll(elements => elements.map(element => {
            const bounds = element.getBoundingClientRect();
            return {
                className: element.className,
                height: bounds.height,
                left: bounds.left,
                right: bounds.right,
                viewportWidth: document.documentElement.clientWidth,
                contentFits: element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
            };
        }));
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.every(target => target.left >= 0 && target.right <= target.viewportWidth)).toBe(true);
        expect(targets.every(target => target.contentFits)).toBe(true);
        expect(targets.filter(target => target.className.includes('card-badge'))
            .every(target => target.height >= 32)).toBe(true);
        expect(targets.filter(target => !target.className.includes('card-badge'))
            .every(target => target.height >= 36)).toBe(true);
    }
});

test('mobile WebKitの2クライアントがonline開始後に再読込復帰できる', async ({ browser, baseURL }) => {
    const hostContext = await browser.newContext({
        ...MOBILE_CONTEXT,
        baseURL,
        serviceWorkers: 'allow',
    });
    const guestContext = await browser.newContext({
        ...MOBILE_CONTEXT,
        baseURL,
        serviceWorkers: 'allow',
    });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const hostErrors = collectRuntimeErrors(host);
    const guestErrors = collectRuntimeErrors(guest);
    try {
        await Promise.all([prepare(host), prepare(guest)]);
        await host.locator('#tabOnline').click();
        await host.locator('#playerNameInput').fill('WebKitHost');
        await host.locator('#onlineCreateSubmitButton').click();
        const roomId = (await host.locator('#onlineStatus .room-id-display').textContent()).trim();
        expect(roomId).toMatch(/^[A-Z0-9]{6}$/);
        await guest.locator('#tabOnline').click();
        await guest.locator('#onlineTabJoin').click();
        await guest.locator('#playerNameInput').fill('WebKitGuest');
        await guest.locator('#roomIdInput').fill(roomId);
        await guest.locator('#onlineJoinSubmitButton').click();
        await expect(host.locator('#gameScreen')).toBeVisible();
        await expect(guest.locator('#gameScreen')).toBeVisible();
        await expect.poll(() => host.evaluate(() => Object.keys(localStorage).some(key => key.includes('online')))).toBe(true);
        await host.reload();
        await expect(host.locator('#onlineResumeSection')).toBeVisible();
        await host.locator('[data-ui-action="reconnectOnline"]').click();
        await expect(host.locator('#gameScreen')).toBeVisible();
        expect(hostErrors).toEqual([]);
        expect(guestErrors).toEqual([]);
    } finally {
        await hostContext.close();
        await guestContext.close();
    }
});
