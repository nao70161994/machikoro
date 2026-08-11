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

test('320pxから480pxで2人・10人設定の開始CTAがPWAとfocusを隠さない', async ({ page }) => {
    await prepare(page);

    async function expectStickyCta(selector, focusSelector, width, height = 844) {
        await page.setViewportSize({ width, height });
        const focusTarget = page.locator(focusSelector);
        await focusTarget.focus();
        const layout = await page.locator(selector).evaluate((element, targetSelector) => {
            const bounds = element.getBoundingClientRect();
            const targetBounds = document.querySelector(targetSelector).getBoundingClientRect();
            const bannerBounds = document.getElementById('pwaUpdateBanner').getBoundingClientRect();
            return {
                ctaTop: bounds.top,
                ctaBottom: bounds.bottom,
                ctaLeft: bounds.left,
                ctaRight: bounds.right,
                targetBottom: targetBounds.bottom,
                bannerTop: bannerBounds.top,
                viewportWidth: document.documentElement.clientWidth,
                viewportHeight: window.innerHeight,
                position: getComputedStyle(element).position,
            };
        }, focusSelector);
        expect(layout.position).toBe('sticky');
        expect(layout.ctaLeft).toBeGreaterThanOrEqual(0);
        expect(layout.ctaRight).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.ctaBottom).toBeLessThanOrEqual(layout.viewportHeight);
        expect(layout.ctaBottom).toBeLessThanOrEqual(layout.bannerTop);
        expect(layout.targetBottom).toBeLessThanOrEqual(layout.ctaTop);
    }

    await page.evaluate(() => {
        document.body.classList.add('pwa-banner-open');
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });
    await page.waitForTimeout(400);
    for (const width of [320, 360, 390, 480]) {
        await expectStickyCta('#btnStart', '#tutorialLevel', width);
    }

    const increasePlayerCount = page.locator('[data-ui-action="changeCount"][data-delta="1"]');
    for (let count = 2; count < 10; count++) await increasePlayerCount.click();
    for (const width of [320, 360, 390, 480]) {
        await expectStickyCta('#btnStart', '#tutorialLevel', width);
    }
    await expectStickyCta('#btnStart', '#tutorialLevel', 390, 500);

    await page.locator('#tabOnline').click();
    for (const width of [320, 360, 390, 480]) {
        await expectStickyCta('#onlineCreateSubmitButton', '#onlineCpuSpeed', width);
    }
    const increaseOnlinePlayerCount = page.locator('[data-ui-action="changeOnlineCount"][data-delta="1"]');
    for (let count = 2; count < 10; count++) await increaseOnlinePlayerCount.click();
    for (const width of [320, 360, 390, 480]) {
        await expectStickyCta('#onlineCreateSubmitButton', '#onlineCpuSpeed', width);
    }
    await expectStickyCta('#onlineCreateSubmitButton', '#onlineCpuSpeed', 390, 500);
});

test('320pxから480pxでpending中の長文toastが選択肢を隠さない', async ({ page }) => {
    await prepare(page);
    await page.locator('#btnStart').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        const runtime = GameRuntimeState.runtime.snapshot();
        const currentGame = runtime.game;
        const humanIndex = runtime.cpuPlayers.findIndex(cpu => !cpu);
        currentGame.currentPlayerIndex = humanIndex >= 0 ? humanIndex : 0;
        currentGame.phase = GAME_PHASES.PENDING;
        currentGame.pendingTV = 1;
        render();
        showNotice('長い通知です。'.repeat(40));
        document.body.classList.add('pwa-banner-open');
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });
    await page.waitForTimeout(400);

    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await page.evaluate(() => {
            const toast = document.getElementById('noticeToast');
            const pending = document.querySelector('.pending-modal-inner');
            const close = toast.querySelector('.notice-toast-close');
            const toastBounds = toast.getBoundingClientRect();
            const pendingBounds = pending.getBoundingClientRect();
            const closeBounds = close.getBoundingClientRect();
            return {
                bodyClass: document.body.classList.contains('pending-surface-visible'),
                toastTop: toastBounds.top,
                toastBottom: toastBounds.bottom,
                toastLeft: toastBounds.left,
                toastRight: toastBounds.right,
                pendingTop: pendingBounds.top,
                closeTop: closeBounds.top,
                closeBottom: closeBounds.bottom,
                viewportWidth: document.documentElement.clientWidth,
                overflowY: getComputedStyle(toast).overflowY,
            };
        });
        expect(layout.bodyClass).toBe(true);
        expect(layout.toastTop).toBeGreaterThanOrEqual(11);
        expect(layout.toastBottom).toBeLessThanOrEqual(layout.pendingTop);
        expect(layout.toastLeft).toBeGreaterThanOrEqual(0);
        expect(layout.toastRight).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.closeTop).toBeGreaterThanOrEqual(layout.toastTop);
        expect(layout.closeBottom).toBeLessThanOrEqual(layout.toastBottom);
        expect(layout.overflowY).toBe('auto');
    }
});

test('320pxから480pxで長い通常modalのheaderとcloseがscroll中も到達可能', async ({ page }) => {
    await prepare(page);
    await page.evaluate(() => {
        document.body.classList.add('pwa-banner-open');
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });

    const modalCases = [
        { open: '[data-ui-action="showRules"]', modal: '#rulesModal', close: '[data-ui-action="closeRules"]' },
        { open: '[data-ui-action="showCardSelect"]', modal: '#cardSelectModal', close: '[data-action="closeCardSelect"]' },
    ];
    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        for (const modalCase of modalCases) {
            await page.locator(modalCase.open).click();
            const modal = page.locator(modalCase.modal);
            await expect(modal).toBeVisible();

            for (const position of ['middle', 'end']) {
                const layout = await modal.evaluate((element, requestedPosition) => {
                    const maxScrollTop = element.scrollHeight - element.clientHeight;
                    element.scrollTop = requestedPosition === 'middle'
                        ? maxScrollTop / 2
                        : maxScrollTop;
                    const header = element.querySelector('.modal-header');
                    const close = header.querySelector('button');
                    const content = element.querySelector('.modal-content');
                    const pwa = document.getElementById('pwaUpdateBanner');
                    const headerBounds = header.getBoundingClientRect();
                    const closeBounds = close.getBoundingClientRect();
                    const contentBounds = content.getBoundingClientRect();
                    return {
                        scrollTop: element.scrollTop,
                        headerTop: headerBounds.top,
                        headerBottom: headerBounds.bottom,
                        closeWidth: closeBounds.width,
                        closeHeight: closeBounds.height,
                        closeTop: closeBounds.top,
                        closeBottom: closeBounds.bottom,
                        contentLeft: contentBounds.left,
                        contentRight: contentBounds.right,
                        viewportWidth: document.documentElement.clientWidth,
                        viewportHeight: window.innerHeight,
                        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                        contentOverflow: content.scrollWidth - content.clientWidth,
                        scrollPaddingTop: parseFloat(getComputedStyle(element).scrollPaddingTop),
                        modalZ: Number(getComputedStyle(element).zIndex),
                        pwaZ: Number(getComputedStyle(pwa).zIndex),
                    };
                }, position);
                expect(layout.scrollTop).toBeGreaterThan(0);
                expect(layout.headerTop).toBeGreaterThanOrEqual(15);
                expect(layout.headerBottom).toBeLessThanOrEqual(layout.viewportHeight);
                expect(layout.closeWidth).toBeGreaterThanOrEqual(44);
                expect(layout.closeHeight).toBeGreaterThanOrEqual(44);
                expect(layout.closeTop).toBeGreaterThanOrEqual(layout.headerTop);
                expect(layout.closeBottom).toBeLessThanOrEqual(layout.headerBottom);
                expect(layout.contentLeft).toBeGreaterThanOrEqual(0);
                expect(layout.contentRight).toBeLessThanOrEqual(layout.viewportWidth);
                expect(layout.pageOverflow).toBeLessThanOrEqual(0);
                expect(layout.contentOverflow).toBeLessThanOrEqual(0);
                expect(layout.scrollPaddingTop).toBeGreaterThan(layout.headerBottom);
                expect(layout.modalZ).toBeGreaterThan(layout.pwaZ);
            }

            await modal.locator(modalCase.close).first().click();
            await expect(modal).toBeHidden();
        }
    }
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

test('320pxから480pxで建設filterがカード範囲だけを安全に追従する', async ({ page }) => {
    await prepare(page);
    await page.locator('#btnStart').click();
    await expect(page.locator('#gameScreen')).toBeVisible();

    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const middleCard = page.locator('.build-card-section .card-wrapper').nth(12);
        await middleCard.evaluate(element => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, Math.max(0, top - 180));
        });
        const stickyLayout = await page.evaluate(() => {
            const filter = document.querySelector('.build-card-section .card-filter-bar');
            const card = document.querySelectorAll('.build-card-section .card-wrapper')[12];
            const filterBounds = filter.getBoundingClientRect();
            const cardBounds = card.getBoundingClientRect();
            return {
                filterTop: filterBounds.top,
                filterBottom: filterBounds.bottom,
                cardTop: cardBounds.top,
                withinViewport: filterBounds.left >= 0 &&
                    filterBounds.right <= document.documentElement.clientWidth,
                contentFits: filter.scrollWidth <= filter.clientWidth,
            };
        });
        expect(stickyLayout.filterTop).toBeGreaterThanOrEqual(7);
        expect(stickyLayout.filterTop).toBeLessThanOrEqual(17);
        expect(stickyLayout.filterBottom - stickyLayout.filterTop).toBeLessThanOrEqual(50);
        expect(stickyLayout.filterBottom).toBeLessThanOrEqual(stickyLayout.cardTop);
        expect(stickyLayout.withinViewport && stickyLayout.contentFits).toBe(true);

        await middleCard.locator('.card-btn').evaluate(element => element.scrollIntoView({ block: 'start' }));
        const focusClearance = await page.evaluate(() => {
            const filterBounds = document.querySelector('.build-card-section .card-filter-bar').getBoundingClientRect();
            const cardBounds = document.querySelectorAll('.build-card-section .card-wrapper')[12]
                .querySelector('.card-btn').getBoundingClientRect();
            return { filterBottom: filterBounds.bottom, cardTop: cardBounds.top };
        });
        expect(focusClearance.cardTop).toBeGreaterThanOrEqual(focusClearance.filterBottom + 8);

        await page.locator('#buildMenu .build-section:not(.build-card-section)').evaluate(element => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            window.scrollTo(0, Math.max(0, top - 8));
        });
        const boundaryLayout = await page.evaluate(() => {
            const filterBounds = document.querySelector('.build-card-section .card-filter-bar').getBoundingClientRect();
            const landmarkBounds = document.querySelector('#buildMenu .build-section:not(.build-card-section)').getBoundingClientRect();
            return {
                filterBottom: filterBounds.bottom,
                landmarkTop: landmarkBounds.top,
            };
        });
        expect(boundaryLayout.filterBottom).toBeLessThanOrEqual(boundaryLayout.landmarkTop + 1);
    }
});

test('320pxから480pxで建設shortcutが既存menuへ移動しPWA表示時も収まる', async ({ page }) => {
    await prepare(page);
    const increasePlayerCount = page.locator('[data-ui-action="changeCount"][data-delta="1"]');
    for (let count = 2; count < 10; count++) await increasePlayerCount.click();
    const playerTypes = page.locator('#playerSettings .player-setting-select');
    for (let index = 0; index < 10; index++) await playerTypes.nth(index).selectOption('human');
    await page.locator('#btnStart').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        const currentGame = GameRuntimeState.runtime.snapshot().game;
        currentGame.phase = GAME_PHASES.BUILD;
        currentGame.currentPlayerIndex = 0;
        currentGame.builtThisTurn = false;
        render();
        document.body.classList.add('pwa-banner-open');
        document.getElementById('pwaUpdateBanner').style.display = 'block';
    });

    for (const width of [320, 360, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const shortcut = page.locator('#btnBuildShortcut');
        await expect(shortcut).toBeVisible();
        const layout = await shortcut.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const banner = document.getElementById('pwaUpdateBanner').getBoundingClientRect();
            return {
                height: bounds.height,
                left: bounds.left,
                right: bounds.right,
                bottom: bounds.bottom,
                pwaTop: banner.top,
                viewportWidth: document.documentElement.clientWidth,
            };
        });
        expect(layout.height).toBeGreaterThanOrEqual(44);
        expect(layout.left).toBeGreaterThanOrEqual(0);
        expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.bottom).toBeLessThanOrEqual(layout.pwaTop);
        await shortcut.click();
        await expect(page.locator('#buildMenu')).toBeFocused();
        const buildTop = await page.locator('#buildMenu').evaluate(element => element.getBoundingClientRect().top);
        expect(buildTop).toBeGreaterThanOrEqual(0);
        expect(buildTop).toBeLessThan(80);
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
