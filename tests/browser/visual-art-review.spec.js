const { test, expect } = require('@playwright/test');

async function prepareSunset(page) {
    await page.route('https://pagead2.googlesyndication.com/**', route => route.abort());
    await page.goto('/');
    await page.locator('#designThemeSelect').selectOption('sunset');
    await expect(page.locator('.title-brand-mark')).toBeVisible();
}

async function showInterfaceIconReview(page) {
    await page.evaluate(() => {
        const bucket = (totalGames, cardStats = {}, landmarkStats = {}) => ({
            totalGames, wins: 1, totalTurns: 24, totalFinalCoins: 18,
            totalFinalFacilities: 5, totalFinalLandmarks: 2, cardStats, landmarkStats,
        });
        const sample = { winWith: 2, loseWith: 1 };
        const stats = {
            all: bucket(3, { 麦畑: sample }, { 駅: sample }),
            local: bucket(0), online: bucket(0), players: {}, cpuTypes: {}, playerCounts: {},
            marketRules: { standard: bucket(0), 'ten-type': bucket(0) },
            combinations: {
                local: { standard: bucket(0), 'ten-type': bucket(0) },
                online: { standard: bucket(0), 'ten-type': bucket(0) },
            },
        };
        const escape = value => String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        })[character]);
        const statsContent = document.createElement('div');
        statsContent.innerHTML = UiStatsView.buildStatsHtml(stats, 'all', '', escape);
        const review = document.createElement('main');
        review.id = 'interface-icon-review';
        review.innerHTML = `${UiBuildMenu.buildMarketStatusHtml(
            { mode: 'ten-type', deck: ['A', 'B'], revealedCardCount: 8, totalsComplete: true },
            { A: 1, B: 1 }
        )}${UiWinner.buildMarketReview({
            mode: 'ten-type', deck: ['A', 'B'], refillSequence: 2,
            revealedCardCount: 8, totalsComplete: true,
        }, escape)}`;
        for (const element of statsContent.querySelectorAll('.stats-section-title, [data-action="clearStats"]')) {
            review.append(element.cloneNode(true));
        }
        review.style.cssText = 'position:fixed;inset:16px;z-index:2147483647;box-sizing:border-box;max-width:760px;margin:auto;padding:20px 24px;overflow:auto;border:1px solid #71828a;border-radius:16px;background:#203746;color:#f8ebd1;box-shadow:0 18px 44px #0009';
        document.body.append(review);
    });
}

test('夕暮れの市場・統計・勝利画面は共通SVG記号を使いクラシックは絵文字を保つ', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await showInterfaceIconReview(page);
    const review = page.locator('#interface-icon-review');
    await expect(review).toBeVisible();
    await expect(review.locator('.stats-heading-icon use')).toHaveCount(3);
    await expect(review.locator('.market-status-icon use')).toHaveAttribute('href', 'icons/interface-ui.svg#market');
    await expect(review.locator('.winner-market-heading-icon use')).toHaveAttribute('href', 'icons/interface-ui.svg#market');
    const sunsetState = await review.evaluate(element => ({
        visibleIcons: [...element.querySelectorAll('svg')].filter(icon => getComputedStyle(icon).display !== 'none').length,
        visibleEmoji: [...element.querySelectorAll('.market-status-emoji, .stats-heading-emoji, .stats-reset-emoji, .winner-market-heading-emoji')]
            .filter(emoji => getComputedStyle(emoji).display !== 'none').length,
        warningWhiteSpace: getComputedStyle(element.querySelector('.market-rule-status strong')).whiteSpace,
    }));
    expect(sunsetState).toEqual({ visibleIcons: 6, visibleEmoji: 0, warningWhiteSpace: 'nowrap' });
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const screenshotPath = testInfo.outputPath(`sunset-interface-icons-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-interface-icons-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }

    await review.evaluate(element => element.remove());
    await page.locator('#designThemeSelect').selectOption('classic');
    await showInterfaceIconReview(page);
    const classicReview = page.locator('#interface-icon-review');
    expect(await classicReview.locator('.market-status-icon').evaluate(element => getComputedStyle(element).display)).toBe('none');
    expect(await classicReview.locator('.market-status-emoji').evaluate(element => getComputedStyle(element).display)).not.toBe('none');
});

test('高コントラストの夕暮れ対局でも操作アイコンを専用SVGに統一する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => document.body.classList.add('accessibility-high-contrast'));

    const iconState = await page.evaluate(() => ({
        rollIcon: getComputedStyle(document.querySelector('#btnRoll .dice-roll-icon')).display,
        rollFallback: getComputedStyle(document.querySelector('#btnRoll .dice-roll-emoji')).display,
        controlIcons: [...document.querySelectorAll('.game-control-icon')]
            .every(icon => getComputedStyle(icon).display !== 'none'),
        controlFallbacks: [...document.querySelectorAll('.game-control-emoji')]
            .filter(icon => getComputedStyle(icon).display !== 'none').length,
        iconColor: getComputedStyle(document.querySelector('#btnRestart .game-control-icon')).color,
    }));
    expect(iconState).toEqual({
        rollIcon: 'block',
        rollFallback: 'none',
        controlIcons: true,
        controlFallbacks: 0,
        iconColor: 'rgb(255, 255, 255)',
    });

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const screenshotPath = testInfo.outputPath(`sunset-high-contrast-controls-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-high-contrast-controls-${width}.png`, {
            path: screenshotPath,
            contentType: 'image/png',
        });
    }
});

test('夕暮れの復旧・端末受け渡しUIは共通SVG警告と端末記号を使う', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.evaluate(() => {
        document.getElementById('crashMessage').textContent = '一時的なエラーです。保存データは保持されています。';
        document.getElementById('crashScreen').style.display = 'flex';
    });
    const crash = page.locator('#crashScreen');
    await expect(crash).toBeVisible();
    const crashIconState = await crash.evaluate(element => ({
        icon: getComputedStyle(element.querySelector('.crash-icon-svg')).display,
        fallback: getComputedStyle(element.querySelector('.crash-icon-emoji')).display,
        actionIcon: getComputedStyle(element.querySelector('.crash-action-svg')).display,
        actionFallback: getComputedStyle(element.querySelector('.crash-action-emoji')).display,
    }));
    expect(crashIconState).toEqual({ icon: 'inline-block', fallback: 'none', actionIcon: 'inline-block', actionFallback: 'none' });
    await expect(crash.locator('.crash-icon-svg use')).toHaveAttribute('href', 'icons/interface-ui.svg#warning');
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const screenshotPath = testInfo.outputPath(`sunset-recovery-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-recovery-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }

    await crash.evaluate(element => { element.style.display = 'none'; });
    const handoff = page.locator('#hotseatHandoffOverlay');
    await handoff.evaluate(element => { element.style.display = 'flex'; });
    const handoffIconState = await handoff.evaluate(element => ({
        icon: getComputedStyle(element.querySelector('.hotseat-handoff-svg')).display,
        fallback: getComputedStyle(element.querySelector('.hotseat-handoff-emoji')).display,
    }));
    expect(handoffIconState.icon).not.toBe('none');
    expect(handoffIconState.fallback).toBe('none');
    await expect(handoff.locator('.hotseat-handoff-svg use')).toHaveAttribute('href', 'icons/interface-ui.svg#phone');
    const handoffShot = testInfo.outputPath('sunset-hotseat-handoff-390.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: handoffShot, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-hotseat-handoff-390.png', { path: handoffShot, contentType: 'image/png' });

    await page.evaluate(() => {
        document.body.classList.add('accessibility-high-contrast');
    });
    expect(await handoff.locator('.hotseat-handoff-svg').evaluate(element => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
    await handoff.evaluate(element => { element.style.display = 'none'; });
    await page.locator('#designThemeSelect').selectOption('classic');
    await page.evaluate(() => { document.getElementById('crashScreen').style.display = 'flex'; });
    expect(await crash.locator('.crash-icon-svg').evaluate(element => getComputedStyle(element).display)).toBe('none');
    expect(await crash.locator('.crash-icon-emoji').evaluate(element => getComputedStyle(element).display)).not.toBe('none');
});

test('夕暮れのルール説明は専用UI記号とランドマークアートを使う', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.evaluate(() => showRules());
    const modal = page.locator('#rulesModal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal-heading-icon')).toHaveCount(8);
    await expect(modal.locator('.landmark-item-art')).toHaveCount(6);
    await expect(modal.locator('.landmark-item-emoji')).toHaveCount(6);

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await modal.evaluate(element => {
            const icons = [...element.querySelectorAll('.modal-heading-icon, .landmark-item-art')];
            return {
                width: element.clientWidth,
                scrollWidth: element.scrollWidth,
                hiddenEmojiCount: [...element.querySelectorAll('.modal-heading-emoji, .landmark-item-emoji')]
                    .filter(item => getComputedStyle(item).display === 'none').length,
                visibleIconCount: icons.filter(icon => {
                    const rect = icon.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }).length,
                iconBounds: icons.map(icon => {
                    const rect = icon.getBoundingClientRect();
                    return { left: rect.left, right: rect.right };
                }),
            };
        });
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
        expect(layout.hiddenEmojiCount).toBeGreaterThanOrEqual(14);
        expect(layout.visibleIconCount).toBe(14);
        expect(layout.iconBounds.every(icon => icon.left >= 0 && icon.right <= width)).toBe(true);
        const screenshotPath = testInfo.outputPath(`sunset-rules-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-rules-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }

    await page.evaluate(() => closeRules());
    await page.evaluate(() => showCardSelect());
    const selectionModal = page.locator('#cardSelectModal');
    await expect(selectionModal).toBeVisible();
    await expect(selectionModal.locator('#cardSelectModalTitle use')).toHaveAttribute(
        'href', 'icons/interface-ui.svg#cards'
    );
    expect(await selectionModal.locator('#cardSelectModalTitle .modal-heading-emoji').evaluate(element =>
        getComputedStyle(element).display
    )).toBe('none');
    await expect(selectionModal.locator('.card-set-title')).toHaveCount(4);
    await expect(selectionModal.locator('.card-set-title .modal-heading-icon use')).toHaveCount(4);
    const cardSetIcons = await selectionModal.evaluate(element => ({
        hiddenEmojiCount: [...element.querySelectorAll('.card-set-title .modal-heading-emoji')]
            .filter(icon => getComputedStyle(icon).display === 'none').length,
        visibleIconCount: [...element.querySelectorAll('.card-set-title .modal-heading-icon')]
            .filter(icon => getComputedStyle(icon).display !== 'none').length,
    }));
    expect(cardSetIcons.hiddenEmojiCount).toBe(4);
    expect(cardSetIcons.visibleIconCount).toBe(4);
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const iconBounds = await selectionModal.locator('.card-set-title .modal-heading-icon').evaluateAll(icons =>
            icons.map(icon => {
                const bounds = icon.getBoundingClientRect();
                return { left: bounds.left, right: bounds.right };
            })
        );
        expect(iconBounds.every(icon => icon.left >= 0 && icon.right <= width)).toBe(true);
        const screenshotPath = testInfo.outputPath(`sunset-card-sets-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-card-sets-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }

    await page.evaluate(() => closeCardSelect());
    await page.locator('#designThemeSelect').selectOption('classic');
    await page.evaluate(() => showRules());
    const classicRules = page.locator('#rulesModal');
    await expect(classicRules).toBeVisible();
    expect(await classicRules.locator('.modal-heading-icon').first().evaluate(element =>
        getComputedStyle(element).display
    )).toBe('none');
    expect(await classicRules.locator('.modal-heading-emoji').first().evaluate(element =>
        getComputedStyle(element).display
    )).not.toBe('none');
});

test('クイック開始から2人のCPU戦へ進める', async ({ page }) => {
    await prepareSunset(page);
    await expect(page.locator('#tabLocal')).toHaveText('この端末');
    await expect(page.locator('#tabOnline')).toHaveText('オンライン');
    await expect(page.locator('.setup-quick-play')).toContainText('CPUとすぐ遊ぶ');
    await expect(page.locator('#customGameSetup')).toHaveJSProperty('open', false);
    await expect(page.locator('#playerCount')).toBeHidden();
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const settings = await page.evaluate(() => GameSetupState.runtime.snapshot());
    expect(settings.selectedCount).toBe(2);
    expect(settings.playerSettings[0].type).toBe('human');
    expect(settings.playerSettings[1]).toMatchObject({ type: 'cpu', difficulty: 'normal' });
});

test('夕暮れのターン案内は人間とCPUを専用SVGで表示する', async ({ page }) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const announcement = await page.evaluate(() => {
        showTurnAnnouncer('CPU <One>', true, 1);
        const text = document.getElementById('turnAnnouncerText');
        return {
            icon: text.querySelector('use')?.getAttribute('href'),
            text: text.textContent,
            html: text.innerHTML,
            status: document.getElementById('turnStatusAnnouncer').textContent,
        };
    });
    expect(announcement).toEqual({
        icon: 'icons/interface-ui.svg#cpu',
        text: 'CPU <One> のターン',
        html: expect.stringContaining('&lt;One&gt;'),
        status: 'プレイヤー2、CPU、CPU <One> のターン',
    });
});

test('夕暮れのガイド設定は共通SVGアイコンでスマホとデスクトップに揃える', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.locator('.game-guide-settings').evaluate(element => { element.open = true; });

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const settings = page.locator('.game-guide-settings');
        await expect(settings.locator('#btnTutorialToggle .tutorial-toggle-icon use'))
            .toHaveAttribute('href', 'icons/interface-ui.svg#book');
        await expect(settings.locator('#btnTutorialLevel .tutorial-toggle-icon use'))
            .toHaveAttribute('href', 'icons/interface-ui.svg#target');
        await expect(settings.locator('.tutorial-toggle-emoji')).toHaveCount(2);
        await expect(settings.locator('.tutorial-toggle-emoji').first()).toBeHidden();
        await expect(settings.locator('#btnTutorialToggle .tutorial-toggle-label')).toHaveText('ガイド ON');
        await expect(settings.locator('#btnTutorialLevel .tutorial-toggle-label')).toHaveText('初心者');
        await settings.locator('#btnTutorialToggle').click();
        await expect(settings.locator('#btnTutorialToggle .tutorial-toggle-label')).toHaveText('ガイド OFF');
        await settings.locator('#btnTutorialToggle').click();
        await expect(settings.locator('#btnTutorialToggle .tutorial-toggle-label')).toHaveText('ガイド ON');
        const screenshot = testInfo.outputPath(`sunset-guide-controls-${width}.png`);
        await settings.screenshot({ path: screenshot, animations: 'disabled' });
        await testInfo.attach(`sunset-guide-controls-${width}.png`, {
            path: screenshot,
            contentType: 'image/png',
        });
    }
});

test('スマホの夕暮れ対局はログ要約を残して詳細を折りたたみ必要時に開ける', async ({ page }, testInfo) => {
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await prepareSunset(page);
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();

        const container = page.locator('#gameLogContainer');
        const header = container.locator('.log-header');
        const detailLog = container.locator('#log');
        await expect(container.locator('#logSummary')).toBeVisible();
        if (width <= 480) {
            await expect(header).toHaveAttribute('aria-expanded', 'false');
            await expect(detailLog).toBeHidden();
            const screenshot = testInfo.outputPath('sunset-mobile-compact-log.png');
            await container.screenshot({ path: screenshot, animations: 'disabled' });
            await testInfo.attach('sunset-mobile-compact-log.png', {
                path: screenshot,
                contentType: 'image/png',
            });
            await header.click();
            await expect(header).toHaveAttribute('aria-expanded', 'true');
            await expect(detailLog).toBeVisible();
        } else {
            await expect(header).toHaveAttribute('aria-expanded', 'true');
            await expect(detailLog).toBeVisible();
        }
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.addLog(LOG_TYPES.BUILD, '🏗️ パン屋を建設！');
            renderLog();
        });
        await expect(detailLog.locator('.log-item-with-icon').last()).toContainText('パン屋を建設！');
        await expect(detailLog.locator('.log-item-with-icon').last().locator('svg use'))
            .toHaveAttribute('href', 'icons/interface-ui.svg#build');
        const visibleEmojiCount = await detailLog.locator('.log-item-with-icon').last().evaluate(element =>
            /[🏗️]/u.test(element.textContent)
        );
        expect(visibleEmojiCount).toBe(false);
        const logScreenshot = testInfo.outputPath(`sunset-log-svg-${width}.png`);
        await container.screenshot({ path: logScreenshot, animations: 'disabled' });
        await testInfo.attach(`sunset-log-svg-${width}.png`, {
            path: logScreenshot,
            contentType: 'image/png',
        });
    }
});

test('CPUの手番でも自分の街を先頭に見せ、極小画面でも街の図版を読める大きさにする', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const seats = await page.evaluate(() => {
        cancelCpuSchedule('self-town-priority-review');
        const state = GameRuntimeState.runtime.snapshot();
        const selfIndex = state.cpuPlayers.findIndex(cpu => !cpu);
        const cpuIndex = state.cpuPlayers.findIndex(Boolean);
        state.game.currentPlayerIndex = cpuIndex;
        render();
        return { selfIndex, cpuIndex };
    });
    expect(seats.selfIndex).toBeGreaterThanOrEqual(0);
    expect(seats.cpuIndex).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#players > .player-box-self'))
        .toHaveAttribute('id', `playerBox${seats.selfIndex}`);
    await expect(page.locator(`#playerBox${seats.selfIndex}`)).toHaveJSProperty('tagName', 'DIV');
    await expect.poll(() => page.locator(`#playerBox${seats.selfIndex}`).evaluate(element =>
        getComputedStyle(element).order
    )).toBe('-1');
    await expect(page.locator(`#playerBox${seats.selfIndex} .player-self-badge`)).toHaveText('あなた');
    await expect(page.locator(`#playerBox${seats.selfIndex} .sunset-town`)).toBeVisible();
    await expect(page.locator(`#playerBox${seats.cpuIndex}`)).toHaveClass(/player-box-compact/);
    await expect(page.locator(`#playerBox${seats.cpuIndex}`)).toHaveClass(/active/);

    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const selfBox = page.locator(`#playerBox${seats.selfIndex}`);
        const townArt = selfBox.locator('.town-building .sunset-facility-art').first();
        await expect(townArt).toBeVisible();
        const dimensions = await townArt.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return { width: bounds.width, height: bounds.height };
        });
        if (width <= 360) expect(dimensions).toEqual({ width: 64, height: 46 });
        else if (width <= 480) expect(dimensions).toEqual({ width: 80, height: 56 });
        else expect(dimensions).toEqual({ width: 108, height: 72 });
        const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(pageWidth).toBeLessThanOrEqual(width);
        const screenshot = testInfo.outputPath(`sunset-self-town-${width}.png`);
        await selfBox.scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const screenshotBounds = await selfBox.boundingBox();
        expect(screenshotBounds).not.toBeNull();
        await page.screenshot({ path: screenshot, clip: screenshotBounds, animations: 'disabled' });
        await testInfo.attach(`sunset-self-town-${width}.png`, { path: screenshot, contentType: 'image/png' });
    }
});

test('必要なら詳細設定を開いて人数を変え、その設定で開始できる', async ({ page }) => {
    await prepareSunset(page);
    const customSetup = page.locator('#customGameSetup');
    const setupSummary = page.locator('#customGameSetup > summary');
    await expect(setupSummary).toContainText('家族・友人と遊ぶ');
    await expect(setupSummary).toContainText('同じ端末で対戦');
    await expect(customSetup).toHaveJSProperty('open', false);
    await page.locator('#customGameSetup > summary').click();
    await expect(customSetup.locator('#playerCount')).toBeVisible();
    await page.locator('[data-ui-action="changeCount"][data-delta="1"]').click();
    await expect(page.locator('#playerCount')).toHaveText('3人');
    await page.locator('#btnStart').click();
    await expect(page.locator('#confirmModal')).toBeVisible();
    await page.locator('#confirmOkBtn').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const settings = await page.evaluate(() => GameSetupState.runtime.snapshot());
    expect(settings.selectedCount).toBe(3);
});

test('オンラインの作成・参加導線をスマホとデスクトップで記録する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('#tabOnline').click();
    await expect(page.locator('#tabContentOnline')).toBeVisible();

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const layout = await page.evaluate(() => ({
            viewportWidth: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            nameWidth: document.querySelector('#playerNameInput').getBoundingClientRect().width,
            createHeight: document.querySelector('#onlineCreateSubmitButton').getBoundingClientRect().height,
            readinessOpen: document.querySelector('.online-readiness').open,
        }));
        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.nameWidth).toBeGreaterThan(0);
        expect(layout.createHeight).toBeGreaterThanOrEqual(44);
        expect(layout.readinessOpen).toBe(false);
        const createPath = testInfo.outputPath(`sunset-online-create-${width}.png`);
        await page.screenshot({ path: createPath, fullPage: true, scale: 'css', animations: 'disabled' });
        await testInfo.attach(`sunset-online-create-${width}.png`, { path: createPath, contentType: 'image/png' });

        await page.locator('#onlineTabJoin').click();
        const joinButton = page.locator('#onlineJoinSubmitButton');
        await expect(joinButton).toBeVisible();
        expect(await joinButton.evaluate(element => element.getBoundingClientRect().height))
            .toBeGreaterThanOrEqual(44);
        const joinPath = testInfo.outputPath(`sunset-online-join-${width}.png`);
        await page.screenshot({ path: joinPath, fullPage: true, scale: 'css', animations: 'disabled' });
        await testInfo.attach(`sunset-online-join-${width}.png`, { path: joinPath, contentType: 'image/png' });
        await page.locator('#onlineTabCreate').click();
    }
});

test('夕暮れ市場は出目・名称を主役にし価格を明確なチップで示す', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('#logSummary')).not.toContainText('👤');
    await expect(page.locator('#log')).not.toContainText('👤');
    await expect(page.locator('.player-box.active .player-landmarks .landmark-badge:not(.built)')).toHaveCount(0);
    const detailIcon = page.locator('#buildMenu .card-detail-btn .card-detail-icon').first();
    await expect(detailIcon).toBeVisible();
    await expect(detailIcon.locator('use')).toHaveAttribute('href', 'icons/interface-ui.svg#info');
    expect(await page.locator('#buildMenu .card-detail-btn .card-detail-emoji').first()
        .evaluate(element => getComputedStyle(element).display)).toBe('none');

    for (const width of [320, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const cards = await page.locator('#buildMenu .card-btn').evaluateAll(elements => elements.map(card => {
            const styles = selector => getComputedStyle(card.querySelector(selector));
            const cost = card.querySelector('.card-cost');
            const costStyle = getComputedStyle(cost);
            const cardBounds = card.getBoundingClientRect();
            const costBounds = cost.getBoundingClientRect();
            return {
                cardFits: card.scrollWidth <= card.clientWidth && cardBounds.left >= 0 && cardBounds.right <= document.documentElement.clientWidth,
                diceSize: parseFloat(styles('.card-dice-num').fontSize),
                nameSize: parseFloat(styles('.card-name').fontSize),
                effectSize: parseFloat(styles('.card-effect').fontSize),
                categorySize: parseFloat(styles('.card-category-tag').fontSize),
                costHasBadge: costStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && costStyle.borderRadius !== '0px',
                costFits: costBounds.left >= cardBounds.left && costBounds.right <= cardBounds.right,
            };
        }));

        expect(cards.length).toBeGreaterThan(0);
        expect(cards.every(card => card.cardFits && card.costFits && card.costHasBadge)).toBe(true);
        expect(cards.every(card => card.diceSize > card.categorySize && card.nameSize > card.effectSize && card.effectSize > card.categorySize)).toBe(true);
        if (width === 390) {
            const screenshotPath = testInfo.outputPath('sunset-card-hierarchy-390.png');
            const firstCard = page.locator('#buildMenu .card-wrapper').first();
            await firstCard.scrollIntoViewIfNeeded();
            await firstCard.screenshot({ path: screenshotPath, animations: 'disabled' });
            await testInfo.attach('sunset-card-hierarchy-390.png', { path: screenshotPath, contentType: 'image/png' });
        }
    }
});

test('夕暮れの建設Undoは専用の戻る図案を使い取り消し操作を保つ', async ({ page }) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.locator('#btnRoll').click();
    await expect(page.locator('#buildMenu .card-btn:not(:disabled)').first()).toBeVisible();
    await page.locator('#buildMenu .card-btn:not(:disabled)').first().click();

    const undoButton = page.locator('#buildMenu .undo-btn');
    await expect(undoButton).toBeVisible();
    const undoIcon = undoButton.locator('.undo-btn-icon');
    await expect(undoIcon).toBeVisible();
    await expect(undoIcon.locator('use')).toHaveAttribute('href', 'icons/interface-ui.svg#undo');
    expect(await undoButton.locator('.undo-btn-fallback-icon')
        .evaluate(element => getComputedStyle(element).display)).toBe('none');

    await undoButton.click();
    const confirmation = page.locator('#confirmModal');
    await expect(confirmation).toBeVisible();
    await page.locator('#confirmCancelBtn').click();
    await expect(confirmation).toBeHidden();
    await expect(undoButton).toBeVisible();

    await undoButton.click();
    await expect(confirmation).toBeVisible();
    await page.locator('#confirmOkBtn').click();
    await expect(confirmation).toBeHidden();
    await expect(page.locator('#buildMenu .undo-btn')).toHaveCount(0);
});

test('夕暮れのカード詳細は専用記号を使いスマホとデスクトップで記録する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const detailButton = page.locator('#buildMenu .card-detail-btn').first();
    await detailButton.click();
    const modal = page.locator('#cardDetailModal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.card-detail-coin')).toHaveCount(1);
    await expect(modal.locator('.card-detail-dice')).toHaveCount(1);
    const facilityArt = modal.locator('.card-detail-art .sunset-facility-art');
    await expect(facilityArt).toHaveCount(1);
    await expect(modal).not.toContainText(/[💰🎲]/u);
    await expect(modal.locator('.modal-header h2')).toHaveCSS('color', 'rgb(255, 225, 166)');

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const artBounds = await facilityArt.boundingBox();
        expect(artBounds).not.toBeNull();
        expect(artBounds.width).toBeGreaterThan(0);
        expect(artBounds.height).toBeGreaterThanOrEqual(112);
        const dimensions = await modal.locator('.modal-content').evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right, width: bounds.width };
        });
        expect(dimensions.left).toBeGreaterThanOrEqual(0);
        expect(dimensions.right).toBeLessThanOrEqual(width);
        expect(dimensions.width).toBeGreaterThan(0);
        const screenshotPath = testInfo.outputPath(`sunset-card-detail-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-card-detail-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }
});

test('夕暮れのランドマーク詳細も専用施設アートをスマホとデスクトップで記録する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.locator('#buildMenu [data-action="showLandmarkDetail"]').first().click();

    const modal = page.locator('#cardDetailModal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.card-detail-coin')).toHaveCount(1);
    await expect(modal.locator('.card-detail-dice')).toHaveCount(0);
    const facilityArt = modal.locator('.card-detail-art .sunset-facility-art');
    await expect(facilityArt).toHaveCount(1);
    await expect(modal).not.toContainText(/[💰🏛️]/u);

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const artBounds = await facilityArt.boundingBox();
        expect(artBounds).not.toBeNull();
        expect(artBounds.width).toBeGreaterThan(0);
        expect(artBounds.height).toBeGreaterThanOrEqual(112);
        const screenshotPath = testInfo.outputPath('sunset-landmark-detail-' + width + '.png');
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach('sunset-landmark-detail-' + width + '.png', {
            path: screenshotPath,
            contentType: 'image/png',
        });
    }

    await modal.locator('[data-ui-action="closeCardDetail"]').click();
    await expect(modal).toBeHidden();
});

test('夕暮れの駅選択は専用施設アートとダイス記号で表示する', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const diceChoice = page.locator('#visualDiceChoice');
    await page.evaluate(() => {
        const container = document.createElement('div');
        container.id = 'visualDiceChoice';
        container.style.cssText = 'position:fixed;top:35%;left:50%;transform:translateX(-50%);width:min(480px,calc(100vw - 20px));z-index:99999;';
        container.innerHTML = UiDiceChoice.buildHtml({
            phase: GAME_PHASES.SELECT_DICE,
            lastDiceResult: 0,
            allowedActions: new Set(['selectDice']),
            disabledAttr: () => '',
            phases: GAME_PHASES,
            useSunsetIcons: true,
        });
        document.body.appendChild(container);
    });
    await expect(diceChoice).toContainText('駅：何個振りますか？');
    await expect(diceChoice.locator('.dice-choice-facility-mark use')).toHaveAttribute('href', 'icons/facility-art.svg#station');
    await expect(diceChoice.locator('.dice-choice-die-mark')).toHaveCount(3);
    await expect(diceChoice.locator('.dice-choice-double .dice-choice-label small')).toHaveText('合計を使う');
    await expect(diceChoice).not.toContainText(/[🚉🎲]/u);

    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await diceChoice.scrollIntoViewIfNeeded();
        const doubleButton = diceChoice.locator('.dice-choice-double');
        const buttonFits = await doubleButton.evaluate((button) => button.scrollWidth <= button.clientWidth);
        expect(buttonFits, `double-dice label should fit at ${width}px`).toBe(true);
        const screenshotPath = testInfo.outputPath(`sunset-station-choice-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-station-choice-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }
});

test('夕暮れのコイン獲得表示はカードと共通のSVGコインを使う', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();

    const coinState = await page.evaluate(() => {
        showCoinAnimation(0, 3);
        const coins = document.querySelectorAll('#playerBox0 .coin-float');
        const coin = coins[coins.length - 1];
        return {
            label: coin?.getAttribute('aria-label'),
            icon: coin?.querySelector('svg use')?.getAttribute('href'),
            text: coin?.textContent,
        };
    });
    expect(coinState).toEqual({ label: '+3コイン', icon: 'icons/interface-ui.svg#coin', text: '+3' });
});

test('夕暮れのプレイヤー状態は積立とローンも共通SVGで表示する', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        const player = {
            name: '街の開発者', coins: 12, itVentureCoins: 3,
            landmarks: {}, cards: [{ name: '貸金業', effect: 'loan', color: 'green' }],
            isDormant() { return false; },
        };
        const html = UiPlayerDisplay.buildPlayerHtml(player, 0, {
            settings: [{ type: 'human' }], currentPlayerIndex: 0,
            enabledLandmarks: new Set(), loanEffect: 'loan', useSunsetIcons: true,
            getCoinMark: UiBuildMenu.renderCoinMark,
            renderPlayerKindIcon: UiPlayerDisplay.renderPlayerKindIcon,
            compareCardNames: (a, b) => a.localeCompare(b, 'ja'),
            escapeHtml: value => String(value).replace(/[&<>"']/g, character => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
            })[character]),
        });
        const preview = document.createElement('div');
        preview.id = 'player-status-icon-review';
        preview.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;width:min(420px,calc(100vw - 24px));pointer-events:none';
        preview.innerHTML = html;
        document.body.appendChild(preview);
    });
    const panel = page.locator('#player-status-icon-review .player-box');
    await expect(panel.locator('.it-badge')).toHaveAttribute('aria-label', 'ITベンチャー積立 3コイン');
    await expect(panel.locator('.it-badge use')).toHaveAttribute('href', 'icons/interface-ui.svg#startup');
    await expect(panel.locator('.loan-badge')).toHaveAttribute('aria-label', '貸金業ローン 1枚');
    await expect(panel.locator('.loan-badge use')).toHaveAttribute('href', 'icons/interface-ui.svg#loan');
    await expect(panel).not.toContainText('💻');
    await expect(panel).not.toContainText('💳');
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const screenshotPath = testInfo.outputPath(`sunset-player-status-icons-${width}.png`);
        await panel.screenshot({ path: screenshotPath, animations: 'disabled' });
        await testInfo.attach(`sunset-player-status-icons-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }
});

test('夕暮れの施設効果パネルは施設アートと統一色で表示する', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        const fixture = document.createElement('div');
        fixture.id = 'visualPendingModal';
        fixture.className = 'pending-modal';
        fixture.style.display = 'flex';
        const inner = document.createElement('div');
        inner.className = 'pending-modal-inner';
        const menu = document.createElement('div');
        menu.innerHTML = UiPendingMenu.buildPendingTvHtml({
            currentPlayerIndex: 0,
            players: [{ name: 'プレイヤー1', coins: 3 }, { name: 'プレイヤー2', coins: 8 }],
        }, value => String(value), undefined, undefined, true);
        inner.appendChild(menu);
        fixture.appendChild(inner);
        document.body.appendChild(fixture);
    });

    const modal = page.locator('#visualPendingModal');
    await expect(modal.locator('.pending-facility-mark use')).toHaveAttribute('href', 'icons/facility-art.svg#tv-station');
    await expect(modal).not.toContainText('📺');
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const bounds = await modal.locator('.pending-modal-inner').evaluate(element => {
            const rect = element.getBoundingClientRect();
            const hint = element.querySelector('.pending-inspect-hint');
            return {
                left: rect.left,
                right: rect.right,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                borderColor: getComputedStyle(element).borderTopColor,
                hintColor: getComputedStyle(hint).color,
                hintHeight: hint.getBoundingClientRect().height,
                headingHeight: element.querySelector('.pending-heading').getBoundingClientRect().height,
            };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(-1);
        expect(bounds.right).toBeLessThanOrEqual(width + 1);
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
        expect(bounds.borderColor).toBe('rgb(209, 166, 78)');
        expect(bounds.hintColor).toBe('rgb(201, 213, 216)');
        if (width === 390) expect(bounds.hintHeight).toBeLessThanOrEqual(64);
        if (width === 1440) expect(bounds.headingHeight).toBeLessThanOrEqual(30);
        const screenshotPath = testInfo.outputPath(`sunset-tv-pending-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-tv-pending-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }

    await modal.locator('.pending-modal-inner > div').evaluate(element => {
        element.innerHTML = UiPendingMenu.buildPendingBusinessHtml({
            currentPlayerIndex: 0,
            players: [
                {
                    name: 'プレイヤー1',
                    cards: [{ name: '麦畑' }, { name: 'パン屋' }],
                    getMinorCards() { return this.cards; },
                    isDormant(card) { return card.name === 'パン屋'; },
                },
                {
                    name: 'プレイヤー2',
                    cards: [{ name: '牧場' }],
                    getMinorCards() { return this.cards; },
                    isDormant() { return false; },
                },
            ],
            currentPlayer() { return this.players[this.currentPlayerIndex]; },
        }, value => String(value), undefined, undefined, true);
    });
    await expect(modal.locator('.bc-chip-dormant-icon use')).toHaveAttribute(
        'href', 'icons/interface-ui.svg#sleep'
    );
    await expect(modal).not.toContainText('💤');
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const chip = modal.locator('.bc-chip-dormant-icon');
        await expect(chip).toBeVisible();
        const box = await chip.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(14);
        expect(box.width).toBeLessThanOrEqual(16);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        const screenshotPath = testInfo.outputPath(`sunset-business-pending-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-business-pending-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }

    await modal.locator('.pending-modal-inner > div').evaluate(element => {
        element.innerHTML = UiPendingMenu.buildPendingItHtml({
            currentPlayer() { return { coins: 3, itVentureCoins: 2 }; },
        }, undefined, undefined, undefined, true);
    });
    await expect(modal.locator('.pending-coin-mark use')).toHaveAttribute(
        'href', 'icons/interface-ui.svg#coin'
    );
    await expect(modal).not.toContainText('🪙');
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const coin = modal.locator('.pending-coin-mark');
        const box = await coin.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(15);
        expect(box.width).toBeLessThanOrEqual(17);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        const screenshotPath = testInfo.outputPath(`sunset-it-pending-${width}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-it-pending-${width}.png`, { path: screenshotPath, contentType: 'image/png' });
    }
});

test('デスクトップでは街の建物アートを広く見せる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();

    const town = page.locator('.player-box.active .sunset-town');
    const firstBuilding = town.locator('.town-street > .town-building').first();
    await expect(firstBuilding).toBeVisible();
    await expect.poll(() => firstBuilding.evaluate(element =>
        element.getBoundingClientRect().width
    )).toBeGreaterThanOrEqual(108);
    const bounds = await firstBuilding.evaluate(element => {
        const card = element.getBoundingClientRect();
        const art = element.querySelector('.sunset-facility-art').getBoundingClientRect();
        return { width: card.width, artHeight: art.height, cardRight: card.right };
    });
    expect(bounds.width).toBeGreaterThanOrEqual(108);
    expect(bounds.artHeight).toBeGreaterThanOrEqual(72);
    expect(bounds.cardRight).toBeLessThanOrEqual(1440);
    const gameRegions = await page.evaluate(() => {
        const rect = selector => {
            const bounds = document.querySelector(selector).getBoundingClientRect();
            return { top: bounds.top, left: bounds.left, right: bounds.right, bottom: bounds.bottom };
        };
        return {
            game: rect('#gameScreen'),
            market: rect('#buildMenu'),
            log: rect('#gameLogContainer'),
            town: rect('.player-area'),
        };
    });
    expect(gameRegions.market.top).toBeLessThan(gameRegions.log.top);
    expect(gameRegions.market.right).toBeLessThan(gameRegions.town.left);
    expect(gameRegions.log.left).toBeLessThanOrEqual(gameRegions.game.left + 1);
    expect(gameRegions.log.right).toBeGreaterThanOrEqual(gameRegions.game.right - 1);
    expect(gameRegions.town.bottom).toBeLessThanOrEqual(gameRegions.log.top + 1);

    const screenshotPath = testInfo.outputPath('sunset-desktop-city-1440.png');
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-desktop-city-1440.png', { path: screenshotPath, contentType: 'image/png' });
});

test('夕暮れタイトルと全施設・ランドマークを390pxと1440pxで描画して記録する', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await prepareSunset(page);

    for (const width of [390, 1440]) {
        await page.evaluate(() => document.getElementById('visual-art-review')?.remove());
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(async () => {
            await document.fonts.ready;
            return true;
        });
        const titleLayout = await page.evaluate(() => {
            const title = document.querySelector('.title-header').getBoundingClientRect();
            const brand = document.querySelector('.title-brand-lockup').getBoundingClientRect();
            const hero = document.querySelector('.sunset-hero img').getBoundingClientRect();
            const localPanel = document.querySelector('#tabContentLocal').getBoundingClientRect();
            const about = document.querySelector('.title-about').getBoundingClientRect();
            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                titleWidth: title.width,
                brandRight: brand.right,
                heroLeft: hero.left,
                localToAboutGap: about.top - localPanel.bottom,
            };
        });
        expect(titleLayout.viewportWidth).toBe(width);
        expect(titleLayout.documentWidth).toBeLessThanOrEqual(width + 1);
        // The mobile title intentionally sits inside the page's 16px gutters,
        // while the desktop hero has a larger editorial maximum width.
        expect(titleLayout.titleWidth).toBeGreaterThanOrEqual(Math.min(width * 0.8, 900));
        if (width >= 760) expect(titleLayout.brandRight).toBeLessThan(titleLayout.heroLeft);
        else expect(titleLayout.localToAboutGap).toBeLessThanOrEqual(32);
        const titleScreenshotPath = testInfo.outputPath(`sunset-title-${width}.png`);
        await page.screenshot({
            path: titleScreenshotPath,
            fullPage: true,
            scale: 'css',
            animations: 'disabled',
        });
        await testInfo.attach(`sunset-title-${width}.png`, {
            path: titleScreenshotPath,
            contentType: 'image/png',
        });

        const gallery = await page.evaluate(() => {
            const cards = CARDS.map(card => renderBuildCardButton(card, 6, true));
            const names = CARDS.map(card => card.name);
            const landmarks = Player.landmarkNames().map(name => ({
                name,
                html: renderLandmarkBuildButton(name, false, Player.landmarkCost(name), false),
            }));
            return { cards, names, landmarks };
        });
        expect(gallery.cards).toHaveLength(38);
        expect(new Set(gallery.names).size).toBe(38);
        expect(gallery.landmarks).toHaveLength(6);

        const columns = width <= 480 ? 2 : 5;
        const pageSize = width <= 480 ? 6 : 15;
        const pages = [
            ...Array.from({ length: Math.ceil(gallery.cards.length / pageSize) }, (_, index) => ({
                label: `market-${index + 1}`,
                cards: gallery.cards.slice(index * pageSize, (index + 1) * pageSize),
            })),
            { label: 'landmarks', cards: gallery.landmarks.map(card => card.html) },
        ];
        for (const galleryPage of pages) {
            await page.evaluate(({ cards, columns, label }) => {
                let overlay = document.getElementById('visual-art-review');
                if (!overlay) {
                    overlay = document.createElement('main');
                    overlay.id = 'visual-art-review';
                    document.body.append(overlay);
                }
                overlay.innerHTML = `<style>
                    #visual-art-review{position:fixed;inset:0;z-index:2147483646;box-sizing:border-box;width:100vw;height:100vh;overflow:hidden;padding:8px 10px;background:#132538;color:#f8ebd1;display:flex;flex-direction:column;font-family:system-ui,sans-serif}
                    #visual-art-review .review-heading{display:flex;justify-content:space-between;gap:8px;margin:0 0 6px;font-size:13px;line-height:18px;flex:0 0 auto}
                    #visual-art-review .review-grid{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:4px 7px;align-content:start;min-height:0}
                    #visual-art-review .card-wrapper{width:100%;min-width:0;margin:0}
                    #visual-art-review .card-btn{width:100%;min-width:0}
                    #visual-art-review .card-body{padding:4px 7px 7px}
                    #visual-art-review .card-name{font-size:13px}
                    #visual-art-review .card-effect{font-size:11px;line-height:1.25}
                    #visual-art-review .card-meta-row{min-height:24px}
                    #visual-art-review .card-detail-btn{min-height:24px;padding:2px 7px;font-size:10px}
                </style><header class="review-heading"><strong>市場アートレビュー</strong><span>${label}</span></header><section class="review-grid">${cards.join('')}</section>`;
            }, { cards: galleryPage.cards, columns, label: galleryPage.label });

            const cardBounds = await page.locator('#visual-art-review .card-wrapper').evaluateAll(elements =>
                elements.map(element => {
                    const card = element.getBoundingClientRect();
                    const art = element.querySelector('.sunset-facility-art')?.getBoundingClientRect();
                    return {
                        left: card.left,
                        right: card.right,
                        top: card.top,
                        bottom: card.bottom,
                        artWidth: art?.width || 0,
                        artHeight: art?.height || 0,
                    };
                })
            );
            expect(cardBounds.length).toBeGreaterThan(0);
            expect(cardBounds.every(card => card.left >= 0 && card.right <= width && card.top >= 0 && card.bottom <= 844)).toBe(true);
            expect(cardBounds.every(card => card.artWidth > 0 && card.artHeight > 0)).toBe(true);
            const galleryScreenshotPath = testInfo.outputPath(`sunset-${width}-${galleryPage.label}.png`);
            await page.screenshot({
                path: galleryScreenshotPath,
                scale: 'css',
                animations: 'disabled',
            });
            await testInfo.attach(`sunset-${width}-${galleryPage.label}.png`, {
                path: galleryScreenshotPath,
                contentType: 'image/png',
            });
        }
    }

    await page.evaluate(() => document.getElementById('visual-art-review')?.remove());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#customGameSetup > summary').click();
    await page.locator('#btnStart').click();
    await page.locator('#confirmOkBtn').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.waitForTimeout(500);
    const updateBanner = page.locator('#pwaUpdateBanner');
    if (await updateBanner.isVisible()) {
        await updateBanner.locator('[data-ui-action="hidePwaUpdateBanner"]').click();
    }
    await expect(updateBanner).toBeHidden();
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        if (width === 390) {
            const mobileOrder = await page.evaluate(() => ({
                display: getComputedStyle(document.querySelector('#gameScreen')).display,
                buildIconVisible: document.querySelector('#buildMenu h3 .build-menu-heading-icon')
                    .getBoundingClientRect().width > 0,
                buildEmojiDisplay: getComputedStyle(document.querySelector('#buildMenu h3 .build-menu-heading-emoji')).display,
                playerTop: document.querySelector('.player-area').getBoundingClientRect().top,
                actionTop: document.querySelector('.game-action-panel').getBoundingClientRect().top,
                rollBottom: document.querySelector('#btnRoll').getBoundingClientRect().bottom,
                toolbarTop: document.querySelector('.game-action-toolbar').getBoundingClientRect().top,
                buildTop: document.querySelector('#buildMenu').getBoundingClientRect().top,
                timelineTop: document.querySelector('#turnTimeline').getBoundingClientRect().top,
                timelineBorderWidth: getComputedStyle(document.querySelector('#turnTimeline')).borderTopWidth,
                timelineBackground: getComputedStyle(document.querySelector('#turnTimeline')).backgroundColor,
                timelineStepBorderLeftWidth: getComputedStyle(document.querySelector('.turn-timeline-step')).borderLeftWidth,
                timelineStepBorderBottomWidth: getComputedStyle(document.querySelector('.turn-timeline-step')).borderBottomWidth,
                tutorialTop: document.querySelector('#tutorialBox').getBoundingClientRect().top,
                actionBottom: document.querySelector('.game-action-panel').getBoundingClientRect().bottom,
                compactPlayers: document.querySelectorAll('.player-box-compact').length,
                viewportHeight: window.innerHeight,
            }));
            expect(mobileOrder.display).toBe('grid');
            expect(mobileOrder.buildIconVisible).toBe(true);
            expect(mobileOrder.buildEmojiDisplay).toBe('none');
            expect(mobileOrder.playerTop).toBeLessThan(mobileOrder.actionTop);
            expect(mobileOrder.rollBottom).toBeLessThan(mobileOrder.toolbarTop);
            expect(mobileOrder.toolbarTop).toBeLessThan(mobileOrder.buildTop);
            expect(mobileOrder.actionTop).toBeLessThan(mobileOrder.buildTop);
            expect(mobileOrder.buildTop).toBeLessThan(mobileOrder.timelineTop);
            expect(mobileOrder.timelineTop).toBeLessThan(mobileOrder.tutorialTop);
            expect(mobileOrder.timelineBorderWidth).toBe('0px');
            expect(mobileOrder.timelineBackground).toBe('rgba(0, 0, 0, 0)');
            expect(mobileOrder.timelineStepBorderLeftWidth).toBe('0px');
            expect(mobileOrder.timelineStepBorderBottomWidth).toBe('2px');
            expect(mobileOrder.compactPlayers).toBeGreaterThan(0);
            expect(mobileOrder.actionBottom).toBeLessThanOrEqual(mobileOrder.viewportHeight);
        }
        const gameplayPath = testInfo.outputPath(`sunset-gameplay-${width}.png`);
        await page.screenshot({ path: gameplayPath, fullPage: false, animations: 'disabled' });
        await testInfo.attach(`sunset-gameplay-${width}.png`, {
            path: gameplayPath,
            contentType: 'image/png',
        });
    }

    const compactLog = page.locator('#gameLogContainer');
    await expect(compactLog.locator('#logSummary')).toBeVisible();
    if (await compactLog.locator('#log').isVisible()) {
        await page.evaluate(() => toggleLog());
    }
    await expect(compactLog.locator('#log')).toBeHidden();
    await expect(compactLog.locator('#logSummary')).not.toBeEmpty();
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const compactLogPath = testInfo.outputPath(`sunset-log-summary-${width}.png`);
        await compactLog.screenshot({ path: compactLogPath, animations: 'disabled' });
        await testInfo.attach(`sunset-log-summary-${width}.png`, {
            path: compactLogPath,
            contentType: 'image/png',
        });
    }

    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        for (const name of game.enabledLandmarks) game.players[0].landmarks[name] = true;
        render();
    });
    await expect(page.locator('.winner-screen')).toBeVisible();
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const resultPath = testInfo.outputPath(`sunset-result-${width}.png`);
        await page.screenshot({ path: resultPath, fullPage: true, animations: 'disabled' });
        await testInfo.attach(`sunset-result-${width}.png`, {
            path: resultPath,
            contentType: 'image/png',
        });
    }
});
