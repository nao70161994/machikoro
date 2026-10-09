const { test, expect } = require('@playwright/test');
const { verifyWinnerNotices } = require('./helpers/winner-notices');

async function stubAds(page) {
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '',
    }));
}

async function prepareSunset(page) {
    await stubAds(page);
    await page.goto('/');
    await selectDesignTheme(page, 'sunset');
    await expect(page.locator('#designThemeCurrentLabel')).toHaveText('夕暮れの街');
    await expect(page.locator('.title-brand-mark')).toBeVisible();
}

async function selectDesignTheme(page, design) {
    const switcher = page.locator('#designSwitcher');
    const activeTab = await page.locator('.tab-btn[aria-selected="true"]').getAttribute('data-tab');
    const wasVisible = await switcher.isVisible();
    if (!wasVisible) await page.locator('#tabTournament').click();
    if (!await switcher.evaluate(element => element.open)) {
        await switcher.locator('summary').click();
    }
    await page.locator('#designThemeSelect').selectOption(design);
    await switcher.locator('summary').click();
    if (!wasVisible && activeTab && activeTab !== 'tournament') {
        await page.locator(`#tab${activeTab.charAt(0).toUpperCase()}${activeTab.slice(1)}`).click();
    }
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
    await selectDesignTheme(page, 'classic');
    await showInterfaceIconReview(page);
    const classicReview = page.locator('#interface-icon-review');
    expect(await classicReview.locator('.market-status-icon').evaluate(element => getComputedStyle(element).display)).toBe('none');
    expect(await classicReview.locator('.market-status-emoji').evaluate(element => getComputedStyle(element).display)).not.toBe('none');
});

test('初期画面は遊ぶ導線を優先し、その他からデザインを切り替えられる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubAds(page);
    await page.goto('/');
    const switcher = page.locator('#designSwitcher');
    const wordmark = page.locator('.title-wordmark');
    const wordmarkCopy = page.locator('.title-logo-copy');
    await expect(page.locator('.setup-quick-play')).toBeVisible();
    await expect(switcher).toBeHidden();
    await page.locator('#tabTournament').click();
    await expect(switcher).toBeVisible();
    await expect(switcher).not.toHaveAttribute('open', '');
    await expect(switcher.locator('summary')).toContainText('クラシック');
    const collapsedHeight = await switcher.evaluate(element => element.getBoundingClientRect().height);
    await switcher.locator('summary').click();
    await expect(page.locator('#designThemeSelect')).toBeVisible();
    await page.locator('#designThemeSelect').selectOption('sunset');
    await expect(page.locator('#designThemeCurrentLabel')).toHaveText('夕暮れの街');
    await expect(page.locator('html')).toHaveAttribute('data-design', 'sunset');
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toHaveAttribute('src', 'icons/dice-city-wordmark.svg');
    await expect(wordmarkCopy).toHaveText('DICE CITY');
    const expandedHeight = await switcher.evaluate(element => element.getBoundingClientRect().height);
    await switcher.locator('summary').click();
    await expect(page.locator('#designThemeSelect')).toBeHidden();
    const finalCollapsedHeight = await switcher.evaluate(element => element.getBoundingClientRect().height);
    expect(expandedHeight).toBeGreaterThan(finalCollapsedHeight);
    expect(finalCollapsedHeight).toBeLessThanOrEqual(collapsedHeight);
    const settingsScreenshot = testInfo.outputPath('sunset-title-other-settings-390.png');
    await page.screenshot({ path: settingsScreenshot, animations: 'disabled' });
    await testInfo.attach('sunset-title-other-settings-390.png', {
        path: settingsScreenshot,
        contentType: 'image/png',
    });
    await page.locator('#tabLocal').click();
    await expect(page.locator('.setup-quick-play')).toBeVisible();
    const screenshot = testInfo.outputPath('sunset-title-design-switch-collapsed-390.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach('sunset-title-design-switch-collapsed-390.png', {
        path: screenshot,
        contentType: 'image/png',
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopScreenshot = testInfo.outputPath('sunset-title-design-switch-collapsed-1440.png');
    await page.screenshot({ path: desktopScreenshot, animations: 'disabled' });
    await testInfo.attach('sunset-title-design-switch-collapsed-1440.png', {
        path: desktopScreenshot,
        contentType: 'image/png',
    });
    await page.locator('#tabTournament').click();
    await switcher.locator('summary').click();
    await page.locator('#designThemeSelect').selectOption('classic');
    await expect(wordmark).toBeHidden();
    await expect(wordmarkCopy).toBeVisible();
    await page.locator('#designThemeSelect').selectOption('sunset');
    await page.locator('body').evaluate(element => element.classList.add('accessibility-high-contrast'));
    await expect(wordmark).toBeHidden();
    await expect(wordmarkCopy).toBeVisible();
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
    await selectDesignTheme(page, 'classic');
    await page.evaluate(() => { document.getElementById('crashScreen').style.display = 'flex'; });
    expect(await crash.locator('.crash-icon-svg').evaluate(element => getComputedStyle(element).display)).toBe('none');
    expect(await crash.locator('.crash-icon-emoji').evaluate(element => getComputedStyle(element).display)).not.toBe('none');
});

test('端末受け渡しは両テーマと画面幅で背景操作とTab移動を遮断する', async ({ page }) => {
    await stubAds(page);
    for (const design of ['classic', 'sunset']) {
        for (const width of [390, 1440]) {
            await page.setViewportSize({ width, height: 844 });
            await page.goto('/');
            await selectDesignTheme(page, design);
            await page.evaluate(() => {
                applyHotseatHandoff({ visible: true, playerName: 'プレイヤー2' });
            });
            const button = page.locator('#hotseatHandoffButton');
            await expect(button).toBeFocused();
            expect(await page.locator('#titleScreen').evaluate(element => element.inert)).toBe(true);
            expect(await page.locator('#gameScreen').evaluate(element => element.inert)).toBe(true);
            await page.keyboard.press('Tab');
            await expect(button).toBeFocused();
            await page.keyboard.press('Shift+Tab');
            await expect(button).toBeFocused();
            await page.keyboard.press('Escape');
            await expect(page.locator('#hotseatHandoffOverlay')).toBeVisible();
            await page.keyboard.press('Enter');
            await expect(page.locator('#hotseatHandoffOverlay')).toBeHidden();
            expect(await page.locator('#titleScreen').evaluate(element => element.inert)).toBe(false);
            expect(await page.locator('#gameScreen').evaluate(element => element.inert)).toBe(false);
            await expect(page.locator('#titleHeading')).toBeFocused();
        }
    }
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
    await selectDesignTheme(page, 'classic');
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
    const boardAnimation = await page.locator('#gameScreen').evaluate(element => ({
        name: getComputedStyle(element).animationName,
        duration: getComputedStyle(element).animationDuration,
    }));
    expect(boardAnimation.name).toBe('sunset-board-arrive');
    const boardDuration = parseFloat(boardAnimation.duration);
    expect(boardDuration).toBeGreaterThan(0.2);
    expect(boardDuration).toBeLessThan(0.4);
    await page.evaluate(() => document.body.classList.add('accessibility-reduced-motion'));
    const reducedDuration = await page.locator('#gameScreen').evaluate(element =>
        parseFloat(getComputedStyle(element).animationDuration)
    );
    expect(reducedDuration).toBeLessThan(0.0001);
    const settings = await page.evaluate(() => GameSetupState.runtime.snapshot());
    expect(settings.selectedCount).toBe(2);
    expect(settings.playerSettings[0].type).toBe('human');
    expect(settings.playerSettings[1]).toMatchObject({ type: 'cpu', difficulty: 'normal' });
});

test('夕暮れオンライン作成は標準設定を先に見せ必要な設定だけ開ける', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('#tabOnline').click();
    const advanced = page.locator('#onlineAdvancedSettings');
    await expect(advanced).not.toHaveAttribute('open', '');
    await expect(page.locator('#onlineSetupCountSummary')).toHaveText('2人');
    await expect(page.locator('#onlineGameSelectionSummary')).toHaveText('カード38種・ランドマーク6種・通常市場');
    await expect(page.locator('#onlineCreateSubmitButton')).toBeVisible();
    const path = testInfo.outputPath('sunset-online-quick-390.png');
    await page.screenshot({ path, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-online-quick-390.png', { path, contentType: 'image/png' });

    await page.locator('#onlineAdvancedSettings > summary').click();
    await page.locator('[data-ui-action="changeOnlineCount"][data-delta="1"]').click();
    await expect(page.locator('#onlineSetupCountSummary')).toHaveText('3人');
    await page.locator('#onlineCreate [data-ui-action="showCardSelect"]').click();
    await expect(page.locator('#cardSelectModal')).toBeVisible();
});

test('夕暮れのダイスは街の配色をまとい出目の形と動き軽減を保つ', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await page.locator('#btnRoll').click();
    await expect(page.locator('#diceResult')).toHaveAttribute('style', /opacity: 1/);
    const die = page.locator('#diceResult .dice-face');
    await expect(die).toBeVisible();
    await expect(die).toHaveAttribute('aria-label', /^サイコロの出目/);
    const brandStyle = await die.evaluate(element => ({
        background: getComputedStyle(element).backgroundImage,
        borderColor: getComputedStyle(element).borderTopColor,
        borderRadius: getComputedStyle(element).borderTopLeftRadius,
        pipColor: getComputedStyle(element.querySelector('.dot:not(.hidden)')).backgroundColor,
        visiblePips: element.querySelectorAll('.dot:not(.hidden)').length,
    }));
    expect(brandStyle.background).toContain('linear-gradient');
    expect(brandStyle.borderColor).toBe('rgb(173, 129, 71)');
    expect(brandStyle.borderRadius).toBe('14px');
    expect(brandStyle.pipColor).toBe('rgb(38, 61, 80)');
    expect(brandStyle.visiblePips).toBeGreaterThanOrEqual(1);
    expect(brandStyle.visiblePips).toBeLessThanOrEqual(6);

    const dieScreenshotPath = testInfo.outputPath('sunset-brand-die-390.png');
    await page.screenshot({ path: dieScreenshotPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-brand-die-390.png', { path: dieScreenshotPath, contentType: 'image/png' });

    await page.locator('#diceResult').evaluate(element => element.classList.add('dice-result-arrival'));
    expect(await die.evaluate(element => getComputedStyle(element).animationName)).toBe('sunset-dice-land');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await die.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
});

test('夕暮れの建設と建設後のターン終了は重複確認なしで続けて操作できる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const starting = await page.evaluate(() => {
        cancelCpuSchedule('build-tempo-browser-review');
        window.scheduleCPU = () => false;
        const state = GameRuntimeState.runtime.snapshot();
        const humanIndex = state.cpuPlayers.findIndex(cpu => !cpu);
        const game = state.game;
        game.currentPlayerIndex = humanIndex;
        game.phase = GAME_PHASES.BUILD;
        game.builtThisTurn = false;
        game.currentPlayer().coins = 10;
        render();
        return { humanIndex, coins: game.currentPlayer().coins, turnCount: game.turnCount };
    });
    expect(starting.humanIndex).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#status')).toHaveText('あなたのターン');

    const town = page.locator(`#playerBox${starting.humanIndex} .sunset-town`);
    await expect(town.locator('.town-street')).toHaveAttribute('data-town-stage', 'quiet');
    expect(await town.locator('.town-skyline-lights').evaluate(element => getComputedStyle(element).opacity))
        .toBe('0');
    await expect(town.locator('.town-population')).toHaveAttribute('data-town-population', '0');
    const wheat = page.locator('#buildMenu [data-action="buildCard"][data-card-name="麦畑"]');
    await expect(wheat).toBeEnabled();
    await wheat.click();
    await expect(page.locator('#confirmModal')).toBeHidden();
    await expect(page.locator('#buildMenu .undo-btn')).toBeVisible();
    await expect(page.locator('#btnSkip')).toHaveText('建設完了・ターン終了');
    await expect(page.locator(`#playerBox${starting.humanIndex} [data-town-building="card:麦畑"]`)).toHaveCount(2);
    const newTownBuilding = page.locator(`#playerBox${starting.humanIndex} [data-town-building="card:麦畑"][data-town-copy="1"]`);
    await expect(newTownBuilding)
        .toHaveClass(/town-building-arrival/);
    await expect(town.locator('.town-street')).toHaveAttribute('data-town-stage', 'neighborhood');
    expect(await town.locator('.town-skyline-lights').evaluate(element => getComputedStyle(element).opacity))
        .toBe('0.42');
    await expect(town.locator('.town-population')).toHaveAttribute('data-town-population', '1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await newTownBuilding.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    expect(await town.locator('.town-street').evaluate(element =>
        parseFloat(getComputedStyle(element, '::after').transitionDuration)
    )).toBeLessThanOrEqual(0.000001);
    await page.locator('body').evaluate(element => element.classList.add('accessibility-high-contrast'));
    expect(await town.locator('.town-street').evaluate(element => getComputedStyle(element, '::after').display))
        .toBe('none');
    expect(await town.locator('.town-skyline-lights').evaluate(element => getComputedStyle(element).display))
        .toBe('none');
    await page.locator('body').evaluate(element => element.classList.remove('accessibility-high-contrast'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe('rgb(20, 35, 53)');
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => GameRuntimeState.runtime.snapshot().game.currentPlayer().coins))
        .toBe(starting.coins - 1);
    const afterBuild = testInfo.outputPath('sunset-after-build-390.png');
    await page.screenshot({ path: afterBuild, animations: 'disabled' });
    await testInfo.attach('sunset-after-build-390.png', {
        path: afterBuild,
        contentType: 'image/png',
    });

    await page.locator('#btnSkip').click();
    await expect(page.locator('#confirmModal')).toBeHidden();
    await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.turnCount))
        .toBeGreaterThan(starting.turnCount);
});

test('ビジネスセンターの施設交換は絵柄付きカードを狭い画面でも選べる', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const humanIndex = await page.evaluate(() => {
        cancelCpuSchedule('business-center-art-review');
        window.scheduleCPU = () => false;
        const state = GameRuntimeState.runtime.snapshot();
        const index = state.cpuPlayers.findIndex(cpu => !cpu);
        state.game.currentPlayerIndex = index;
        state.game.phase = GAME_PHASES.PENDING;
        state.game.pendingBusiness = 1;
        render();
        return index;
    });
    expect(humanIndex).toBeGreaterThanOrEqual(0);
    const modal = page.locator('#pendingModal');
    await expect(modal).toBeVisible();
    const candidateCards = modal.locator('[aria-labelledby="businessGiveHeading"] .bc-chip');
    await expect(candidateCards).toHaveCount(2);
    await expect(candidateCards.first().locator('.bc-chip-art svg')).toBeVisible();
    await expect(candidateCards.first().locator('.bc-chip-name')).not.toBeEmpty();
    const illustratedChoice = await candidateCards.first().evaluate(element => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        artHeight: element.querySelector('.bc-chip-art').getBoundingClientRect().height,
        borderRadius: getComputedStyle(element).borderRadius,
    }));
    expect(illustratedChoice.width).toBeGreaterThanOrEqual(90);
    expect(illustratedChoice.height).toBeGreaterThanOrEqual(100);
    expect(illustratedChoice.artHeight).toBeGreaterThanOrEqual(48);
    expect(illustratedChoice.borderRadius).not.toBe('20px');
    await candidateCards.nth(1).click();
    await expect(candidateCards.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(candidateCards.first()).toHaveAttribute('aria-pressed', 'false');
    expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

    await page.setViewportSize({ width: 320, height: 740 });
    const narrowModal = await modal.evaluate(element => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
    }));
    expect(narrowModal.scrollWidth).toBeLessThanOrEqual(narrowModal.width);
    expect(narrowModal.documentWidth).toBe(320);

    await page.setViewportSize({ width: 390, height: 844 });

    const mobilePath = testInfo.outputPath('sunset-business-center-cards-390.png');
    await page.screenshot({ path: mobilePath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-business-center-cards-390.png', { path: mobilePath, contentType: 'image/png' });

    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopPath = testInfo.outputPath('sunset-business-center-cards-1440.png');
    await page.screenshot({ path: desktopPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-business-center-cards-1440.png', { path: desktopPath, contentType: 'image/png' });
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
    test.setTimeout(90_000);
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
        const bakeryBuildLog = detailLog.locator('.log-item-with-icon').filter({ hasText: 'パン屋を建設！' }).last();
        await expect(bakeryBuildLog).toBeVisible();
        await expect(bakeryBuildLog).toContainText('パン屋を建設！');
        await expect(bakeryBuildLog.locator('svg use'))
            .toHaveAttribute('href', 'icons/interface-ui.svg#build');
        const visibleEmojiCount = await bakeryBuildLog.evaluate(element =>
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
        // Keep the CPU-turn presentation fixed while the three viewport
        // screenshots are captured; a live CPU turn can replace #players mid-scroll.
        window.scheduleCPU = () => false;
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

    // Desktop uses a different player-panel structure; its art is covered by
    // the dedicated 1440px layout review below.
    for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const selfBox = page.locator(`#playerBox${seats.selfIndex}`);
        const townArt = selfBox.locator('.town-building .sunset-facility-art').first();
        await expect(townArt).toBeVisible();
        const dimensions = await townArt.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const street = element.closest('.town-street').getBoundingClientRect();
            return { width: bounds.width, height: bounds.height, streetWidth: street.width,
                inside: bounds.left >= street.left && bounds.right <= street.right &&
                    bounds.top >= street.top && bounds.bottom <= street.bottom };
        });
        // District scenes keep four facility lots across the street rather
        // than stretching the old collection grid's fixed-size tiles.
        expect(dimensions.width).toBeGreaterThanOrEqual(50);
        expect(Math.abs(dimensions.width - dimensions.streetWidth * 0.23)).toBeLessThan(1);
        expect(Math.abs(dimensions.height * 2 - dimensions.width)).toBeLessThan(1);
        expect(dimensions.inside).toBe(true);
        const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(pageWidth).toBeLessThanOrEqual(width);
        const screenshot = testInfo.outputPath(`sunset-self-town-${width}.png`);
        await page.evaluate(id => document.getElementById(id)?.scrollIntoView({ block: 'center' }), `playerBox${seats.selfIndex}`);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: screenshot, animations: 'disabled' });
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

test('スマホの夕暮れタイトルは遊び方と開始導線を紹介文より先に見せる', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await expect(page.locator('#designSwitcher')).toBeHidden();
    for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const positions = await page.evaluate(() => {
            const bounds = selector => document.querySelector(selector).getBoundingClientRect();
            const modes = bounds('.tab-bar');
            const content = bounds('#tabContentLocal');
            const quickPlay = bounds('.setup-quick-play');
            const brand = bounds('.title-brand-lockup');
            const wordmark = bounds('.title-wordmark');
            const about = bounds('.title-about');
            const links = bounds('.legal-links');
            return {
                modesTop: modes.top,
                contentTop: content.top,
                quickPlayTop: quickPlay.top,
                quickPlayBottom: quickPlay.bottom,
                brandLeft: brand.left,
                brandRight: brand.right,
                wordmarkLeft: wordmark.left,
                wordmarkRight: wordmark.right,
                aboutTop: about.top,
                linksTop: links.top,
                viewportHeight: window.innerHeight,
            };
        });
        expect(positions.modesTop).toBeLessThan(positions.contentTop);
        expect(positions.quickPlayTop).toBeGreaterThanOrEqual(positions.contentTop);
        expect(positions.quickPlayBottom).toBeLessThan(positions.viewportHeight);
        expect(positions.quickPlayBottom).toBeLessThan(positions.aboutTop);
        expect(positions.aboutTop).toBeLessThan(positions.linksTop);
        expect(positions.brandLeft).toBeGreaterThanOrEqual(0);
        expect(positions.brandRight).toBeLessThanOrEqual(width);
        expect(positions.wordmarkLeft).toBeGreaterThanOrEqual(0);
        expect(positions.wordmarkRight).toBeLessThanOrEqual(width);
        if (width === 320) {
            const screenshotPath = testInfo.outputPath('sunset-title-320.png');
            await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
            await testInfo.attach('sunset-title-320.png', { path: screenshotPath, contentType: 'image/png' });
        }
    }
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
            nameBackground: getComputedStyle(document.querySelector('#playerNameInput')).backgroundColor,
            createHeight: document.querySelector('#onlineCreateSubmitButton').getBoundingClientRect().height,
            readinessOpen: document.querySelector('.online-readiness').open,
            cpuRangeAccent: getComputedStyle(document.querySelector('#onlineCpuSpeed')).accentColor,
        }));
        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.nameWidth).toBeGreaterThan(0);
        expect(layout.createHeight).toBeGreaterThanOrEqual(44);
        expect(layout.readinessOpen).toBe(false);
        expect(layout.nameBackground).toBe('rgb(20, 38, 56)');
        expect(layout.cpuRangeAccent).toBe('rgb(239, 196, 135)');
        const cpuSpeedDisclosure = page.locator('.online-cpu-speed-settings');
        await expect(cpuSpeedDisclosure.locator('summary')).toContainText('CPUの速さを調整');
        await expect(cpuSpeedDisclosure).not.toHaveAttribute('open', '');
        const createPath = testInfo.outputPath(`sunset-online-create-${width}.png`);
        await page.screenshot({ path: createPath, fullPage: true, scale: 'css', animations: 'disabled' });
        await testInfo.attach(`sunset-online-create-${width}.png`, { path: createPath, contentType: 'image/png' });
        const advancedSettings = page.locator('#onlineAdvancedSettings');
        await page.locator('#onlineAdvancedSettings > summary').click();
        await cpuSpeedDisclosure.locator('summary').click();
        await expect(page.locator('#onlineCpuSpeed')).toBeVisible();
        expect(await page.locator('#onlineCpuSpeed').evaluate(element => getComputedStyle(element).accentColor))
            .toBe('rgb(239, 196, 135)');
        expect(await page.locator('#onlineCpuSpeed').evaluate(element => element.getBoundingClientRect().height))
            .toBeGreaterThanOrEqual(44);
        await cpuSpeedDisclosure.locator('summary').click();

        await page.locator('#onlineTabJoin').click();
        const joinButton = page.locator('#onlineJoinSubmitButton');
        await expect(joinButton).toBeVisible();
        expect(await joinButton.evaluate(element => element.getBoundingClientRect().height))
            .toBeGreaterThanOrEqual(44);
        const joinPath = testInfo.outputPath(`sunset-online-join-${width}.png`);
        await page.screenshot({ path: joinPath, fullPage: true, scale: 'css', animations: 'disabled' });
        await testInfo.attach(`sunset-online-join-${width}.png`, { path: joinPath, contentType: 'image/png' });
        await page.locator('#onlineTabCreate').click();
        await expect(advancedSettings).toHaveAttribute('open', '');
        await page.locator('#onlineAdvancedSettings > summary').click();
    }
});

test('夕暮れ市場は出目・名称を主役にし価格を明確なチップで示す', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('#logSummary')).not.toContainText('👤');
    await expect(page.locator('#log')).not.toContainText('👤');
    await expect(page.locator('.player-box.active .player-landmarks .landmark-badge:not(.built)')).toHaveCount(0);
    await expect(page.locator('#buildMenu h3 .build-menu-heading-icon use'))
        .toHaveAttribute('href', 'icons/interface-ui.svg#market');
    const detailIcon = page.locator('#buildMenu .card-detail-btn .card-detail-icon').first();
    await expect(detailIcon).toBeVisible();
    await expect(detailIcon.locator('use')).toHaveAttribute('href', 'icons/interface-ui.svg#info');
    expect(await page.locator('#buildMenu .card-detail-btn .card-detail-emoji').first()
        .evaluate(element => getComputedStyle(element).display)).toBe('none');

    for (const width of [320, 390, 480]) {
        await page.setViewportSize({ width, height: 844 });
        const cards = await page.locator('#buildMenu .card-btn[data-card-name]').evaluateAll(elements => elements.map(card => {
            const styles = selector => getComputedStyle(card.querySelector(selector));
            const cost = card.querySelector('.card-cost');
            const costStyle = getComputedStyle(cost);
            const cardBounds = card.getBoundingClientRect();
            const costBounds = cost.getBoundingClientRect();
            const wrapper = card.closest('.card-wrapper');
            const wrapperBounds = wrapper.getBoundingClientRect();
            const stock = wrapper.querySelector('.card-stock');
            const stockBounds = stock.getBoundingClientRect();
            const detail = wrapper.querySelector('.card-detail-btn');
            const detailBounds = detail.getBoundingClientRect();
            return {
                cardFits: card.scrollWidth <= card.clientWidth && cardBounds.left >= 0 && cardBounds.right <= document.documentElement.clientWidth,
                diceSize: parseFloat(styles('.card-dice-num').fontSize),
                nameSize: parseFloat(styles('.card-name').fontSize),
                effectSize: parseFloat(styles('.card-effect').fontSize),
                categorySize: parseFloat(styles('.card-category-tag').fontSize),
                category: card.querySelector('.card-family-mark').dataset.category,
                affordMotion: getComputedStyle(card).animationName,
                costHasBadge: costStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && costStyle.borderRadius !== '0px',
                costFits: costBounds.left >= cardBounds.left && costBounds.right <= cardBounds.right,
                stockFitsOnCardArt: stockBounds.top >= wrapperBounds.top && stockBounds.bottom < cardBounds.bottom,
                detailTargetSize: detailBounds.width >= 44 && detailBounds.height >= 44,
                detailHasAccessibleName: detail.getAttribute('aria-label') !== null,
            };
        }));

        expect(cards.length).toBeGreaterThan(0);
        expect(cards.every(card => card.cardFits && card.costFits && card.costHasBadge &&
            card.stockFitsOnCardArt && card.detailTargetSize && card.detailHasAccessibleName)).toBe(true);
        expect(cards.every(card => card.diceSize > card.categorySize && card.nameSize > card.effectSize && card.effectSize > card.categorySize)).toBe(true);
        expect(cards.every(card => card.affordMotion === 'none')).toBe(true);
        expect(new Set(cards.map(card => card.category)).size).toBeGreaterThan(1);
        if (width === 390) {
            const screenshotPath = testInfo.outputPath('sunset-card-hierarchy-390.png');
            await page.locator('#buildMenu').scrollIntoViewIfNeeded();
            await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
            await testInfo.attach('sunset-card-hierarchy-390.png', { path: screenshotPath, contentType: 'image/png' });
        }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopMarket = page.locator('#buildMenu .build-card-section .card-grid');
    const desktopMarketStyle = await desktopMarket.evaluate(element => ({
        backgroundImage: getComputedStyle(element).backgroundImage,
        borderRadius: getComputedStyle(element).borderRadius,
        padding: getComputedStyle(element).padding,
    }));
    expect(desktopMarketStyle.backgroundImage).toContain('radial-gradient');
    expect(desktopMarketStyle.borderRadius).toBe('16px');
    const desktopMarketPath = testInfo.outputPath('sunset-central-market-1440.png');
    // WebKit can replace responsive game markup for a frame after the viewport
    // change above. Let that resize render settle before asking Playwright to scroll.
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await desktopMarket.scrollIntoViewIfNeeded();
    await page.screenshot({ path: desktopMarketPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-central-market-1440.png', {
        path: desktopMarketPath, contentType: 'image/png',
    });
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
            phase: 'selectDice',
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

test('駅と電波塔の振り直しは保存・再読み込み後も選択とログが完了する', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('#btnRoll')).toBeEnabled();

    await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        game.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
        game.currentPlayer().landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
    });

    await page.locator('#btnRoll').click();
    await expect(page.locator('.dice-choose [data-action="selectDiceCount"]')).toHaveCount(2);
    await expect(page.locator('#btnRoll')).toBeHidden();
    expect(await page.locator('.dice-choose button').evaluateAll(buttons =>
        buttons.every(button => button.getBoundingClientRect().height >= 44)
    )).toBe(true);
    await page.locator('.dice-choose [data-action="selectDiceCount"][data-use-two="true"]').click();
    await expect(page.locator('.dice-choose [data-action="rerollDice"]')).toBeVisible();
    await page.locator('.dice-choose [data-action="rerollDice"]').click();
    await expect(page.locator('.dice-choose [data-action="selectDiceCount"]')).toHaveCount(2);

    const pendingBeforeReload = await page.evaluate(() => {
        saveGameState();
        const saved = JSON.parse(localStorage.getItem('savedGame'));
        return saved.pendingRadioTowerReroll;
    });
    expect(pendingBeforeReload).toMatchObject({
        dice1: expect.any(Number),
        dice2: expect.any(Number),
        result: expect.any(Number),
    });
    expect(pendingBeforeReload.result).toBe(pendingBeforeReload.dice1 + pendingBeforeReload.dice2);

    await page.reload();
    await expect(page.locator('#resumeSection')).toBeVisible();
    await page.locator('#btnResume').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('.dice-choose [data-action="selectDiceCount"]')).toHaveCount(2);
    await expect(page.locator('#btnRoll')).toBeHidden();
    const restoredPending = await page.evaluate(() => {
        const game = GameRuntimeState.runtime.snapshot().game;
        return {
            pending: game.pendingRadioTowerReroll,
            phase: game.phase,
            usedReroll: game.usedReroll,
            lastDice1: game.lastDice1,
            lastDice2: game.lastDice2,
            lastDiceResult: game.lastDiceResult,
        };
    });
    expect(restoredPending).toEqual({
        pending: pendingBeforeReload,
        phase: 'selectDice',
        usedReroll: true,
        lastDice1: 0,
        lastDice2: 0,
        lastDiceResult: 0,
    });

    const screenshotPath = testInfo.outputPath('sunset-radio-tower-reroll-restored-390.png');
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-radio-tower-reroll-restored-390.png', {
        path: screenshotPath,
        contentType: 'image/png',
    });

    await page.locator('.dice-choose [data-action="selectDiceCount"][data-use-two="true"]').click();
    await expect.poll(() => page.evaluate(() => GameRuntimeState.runtime.snapshot().game.pendingRadioTowerReroll))
        .toBeNull();
    const rerollLog = await page.evaluate(() => GameRuntimeState.runtime.snapshot().game.log
        .find(entry => entry.message.startsWith('📡 電波塔で振り直し:'))?.message || '');
    expect(rerollLog).toMatch(/^📡 電波塔で振り直し: (?:[1-6](?:\+[1-6])?=)?\d+ → (?:[1-6](?:\+[1-6])?=)?\d+$/);
    expect(rerollLog).not.toMatch(/→ 0(?:\D|$)/);
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
            color: getComputedStyle(coin).color,
        };
    });
    expect(coinState).toEqual({
        label: '+3コイン',
        icon: 'icons/interface-ui.svg#coin',
        text: '+3',
        color: 'rgb(255, 227, 160)',
    });
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
    const exchangeButton = modal.locator('.bc-exchange-btn').first();
    await expect(exchangeButton).toHaveCSS('color', 'rgb(28, 45, 58)');
    expect(await exchangeButton.evaluate(element => getComputedStyle(element).backgroundImage))
        .toContain('linear-gradient');
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        if (width === 390) {
            await expect(modal.locator('.pending-heading > span'))
                .toHaveCSS('text-wrap', 'balance');
        }
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
    const selfTownScene = await page.locator('#players .player-box-self .sunset-town').evaluate(element => {
        const street = element.querySelector('.town-street');
        return {
            outerBorder: getComputedStyle(element).borderTopWidth,
            roadCount: street.querySelectorAll('.town-district-roads').length,
            layout: street.dataset.townLayout,
            scenicBackdrop: getComputedStyle(street).backgroundImage,
        };
    });
    expect(selfTownScene.outerBorder).toBe('0px');
    expect(selfTownScene.roadCount).toBe(1);
    expect(selfTownScene.layout).toBe('districts');
    expect(selfTownScene.scenicBackdrop).not.toBe('none');
    const bounds = await firstBuilding.evaluate(element => {
        const card = element.getBoundingClientRect();
        const art = element.querySelector('.sunset-facility-art').getBoundingClientRect();
        const street = element.closest('.town-street').getBoundingClientRect();
        return { width: card.width, artWidth: art.width, artHeight: art.height, streetWidth: street.width,
            inside: art.left >= street.left && art.right <= street.right &&
                art.top >= street.top && art.bottom <= street.bottom };
    });
    expect(bounds.width).toBeGreaterThanOrEqual(60);
    expect(Math.abs(bounds.width - bounds.streetWidth * 0.23)).toBeLessThan(1);
    expect(Math.abs(bounds.artWidth - bounds.width)).toBeLessThan(1);
    expect(Math.abs(bounds.artHeight * 2 - bounds.width)).toBeLessThan(1);
    expect(bounds.inside).toBe(true);
    const gameRegions = await page.evaluate(() => {
        const rect = selector => {
            const bounds = document.querySelector(selector).getBoundingClientRect();
            return { top: bounds.top, left: bounds.left, right: bounds.right, bottom: bounds.bottom };
        };
        const gameElement = document.querySelector('#gameScreen');
        const gameBounds = gameElement.getBoundingClientRect();
        const gameStyle = getComputedStyle(gameElement);
        return {
            game: {
                ...rect('#gameScreen'),
                contentLeft: gameBounds.left + parseFloat(gameStyle.paddingLeft),
                contentRight: gameBounds.right - parseFloat(gameStyle.paddingRight),
            },
            market: rect('#buildMenu'),
            log: rect('#gameLogContainer'),
            town: rect('.player-area'),
        };
    });
    expect(gameRegions.market.top).toBeLessThan(gameRegions.log.top);
    expect(gameRegions.town.right).toBeLessThan(gameRegions.market.left);
    expect(gameRegions.log.left).toBeLessThanOrEqual(gameRegions.game.contentLeft + 1);
    expect(gameRegions.log.right).toBeGreaterThanOrEqual(gameRegions.game.contentRight - 1);
    expect(gameRegions.town.bottom).toBeLessThanOrEqual(gameRegions.log.top + 1);
    const desktopLayout = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const action = rect('.game-action-panel');
        const market = rect('#buildMenu');
        const players = rect('.player-area');
        const columns = getComputedStyle(document.querySelector('#buildMenu .card-grid'))
            .gridTemplateColumns.split(' ').length;
        const names = [...document.querySelectorAll('#buildMenu .build-card-section .card-name')]
            .filter(element => [...element.textContent.trim()].length <= 4);
        const shortNamesFit = names.every(element => {
            const style = getComputedStyle(element);
            return element.getBoundingClientRect().height <= parseFloat(style.lineHeight) * 1.2;
        });
        return {
            townBesideBoard: players.right <= action.left && players.right <= market.left,
            actionAboveMarket: action.bottom <= market.top,
            actionHeight: action.height,
            marketTop: market.top,
            viewportHeight: innerHeight,
            shortNameCount: names.length,
            shortNamesFit,
            columns,
            bodyWidth: document.body.getBoundingClientRect().width,
            hasOpenBoard: document.documentElement.scrollWidth === innerWidth,
        };
    });
    expect(desktopLayout.townBesideBoard).toBe(true);
    expect(desktopLayout.actionAboveMarket).toBe(true);
    expect(desktopLayout.actionHeight).toBeLessThanOrEqual(180);
    expect(desktopLayout.marketTop).toBeLessThan(desktopLayout.viewportHeight / 2);
    expect(desktopLayout.shortNameCount).toBeGreaterThanOrEqual(3);
    expect(desktopLayout.shortNamesFit).toBe(true);
    expect(desktopLayout.columns).toBe(6);
    expect(desktopLayout.bodyWidth).toBe(1440);
    expect(desktopLayout.hasOpenBoard).toBe(true);
    const tabletopLayers = await page.evaluate(() => ['#buildMenu', '#buildMenu .build-section', '.game-action-panel', '#players .sunset-town'].map(selector => {
        const style = getComputedStyle(document.querySelector(selector));
        return { border: style.borderTopWidth, background: style.backgroundColor, shadow: style.boxShadow };
    }));
    expect(tabletopLayers.every(layer => layer.border === '0px' &&
        layer.background === 'rgba(0, 0, 0, 0)' && layer.shadow === 'none')).toBe(true);


    const screenshotPath = testInfo.outputPath('sunset-desktop-city-1440.png');
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-desktop-city-1440.png', { path: screenshotPath, contentType: 'image/png' });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        marketColumns: getComputedStyle(document.querySelector('#buildMenu .card-grid'))
            .gridTemplateColumns.split(' ').length,
    }));
    expect(mobileLayout).toEqual({ pageWidth: 390, viewport: 390, marketColumns: 2 });
    const mobileScreenshotPath = testInfo.outputPath('sunset-mobile-board-390.png');
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-mobile-board-390.png', { path: mobileScreenshotPath, contentType: 'image/png' });
});

test('大きなコイン収入は夕暮れテーマで強調しReduced Motionを守る', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        const view = UiPlayerDisplay.buildCoinAnimationView(12, true);
        const animation = document.createElement('div');
        animation.className = view.className;
        animation.innerHTML = view.html;
        animation.setAttribute('aria-label', `${view.amountText}コイン`);
        document.body.append(animation);
    });
    const animation = page.locator('body > .coin-float.coin-gain-large');
    await expect(animation).toHaveAttribute('aria-label', '+12コイン');
    const normalMotion = await animation.evaluate(element => ({
        haloAnimation: getComputedStyle(element, '::before').animationName,
        borderColor: getComputedStyle(element).borderTopColor,
    }));
    expect(normalMotion.haloAnimation).toBe('coinGainAura');
    expect(normalMotion.borderColor).toBe('rgb(255, 231, 169)');
    await page.waitForTimeout(120);
    const screenshotPath = testInfo.outputPath('sunset-large-income-390.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('sunset-large-income-390.png', { path: screenshotPath, contentType: 'image/png' });

    await page.locator('body').evaluate(element => element.classList.add('accessibility-reduced-motion'));
    expect(parseFloat(await animation.evaluate(element => getComputedStyle(element).animationDuration)))
        .toBeLessThanOrEqual(0.001);
});

test('夕暮れタイトルと全施設・ランドマークを390pxと1440pxで描画して記録する', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await prepareSunset(page);
    await expect(page.locator('.title-brand-mark')).toHaveAttribute('src', 'icons/dice-city-mark.svg');
    await expect(page.locator('.title-wordmark')).toHaveAttribute('src', 'icons/dice-city-wordmark.svg');
    await expect(page.locator('#titleHeading')).toHaveText('ダイスシティ');
    await expect(page.locator('.title-logo-sub')).toHaveText('DICE CITY');

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
            const content = document.querySelector('.title-content').getBoundingClientRect();
            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                titleWidth: title.width,
                brandRight: brand.right,
                heroLeft: hero.left,
                localToAboutGap: about.top - localPanel.bottom,
                contentLeft: content.left,
                contentRight: content.right,
            };
        });
        expect(titleLayout.viewportWidth).toBe(width);
        expect(titleLayout.documentWidth).toBeLessThanOrEqual(width + 1);
        // The mobile title intentionally sits inside the page's 16px gutters,
        // while the desktop hero has a larger editorial maximum width.
        expect(titleLayout.titleWidth).toBeGreaterThanOrEqual(Math.min(width * 0.8, 900));
        if (width >= 760) expect(titleLayout.brandRight).toBeLessThan(titleLayout.heroLeft);
        else expect(titleLayout.localToAboutGap).toBeLessThanOrEqual(32);
        if (width >= 1200) {
            expect(Math.abs((titleLayout.contentLeft + titleLayout.contentRight) / 2 - width / 2)).toBeLessThan(2);
            expect(titleLayout.contentRight - titleLayout.contentLeft).toBeGreaterThanOrEqual(1318);
        }
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
        const pageSize = width <= 480 ? 4 : 10;
        const pages = [
            ...Array.from({ length: Math.ceil(gallery.cards.length / pageSize) }, (_, index) => ({
                label: `market-${index + 1}`,
                cards: gallery.cards.slice(index * pageSize, (index + 1) * pageSize),
            })),
            ...Array.from({ length: Math.ceil(gallery.landmarks.length / pageSize) }, (_, index) => ({
                label: `landmarks-${index + 1}`,
                cards: gallery.landmarks.slice(index * pageSize, (index + 1) * pageSize).map(card => card.html),
            })),
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
                actionPanelBorderWidth: getComputedStyle(document.querySelector('.game-action-panel')).borderTopWidth,
                actionPanelBackground: getComputedStyle(document.querySelector('.game-action-panel')).backgroundColor,
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
            expect(mobileOrder.actionPanelBorderWidth).toBe('0px');
            expect(mobileOrder.actionPanelBackground).toBe('rgba(0, 0, 0, 0)');
            expect(mobileOrder.compactPlayers).toBeGreaterThan(0);
            expect(mobileOrder.actionBottom).toBeLessThanOrEqual(mobileOrder.viewportHeight);
        } else {
            const desktopBand = await page.evaluate(() => {
                const timeline = document.querySelector('#turnTimeline').getBoundingClientRect();
                const tutorial = document.querySelector('#tutorialBox').getBoundingClientRect();
                const actions = document.querySelector('.game-action-panel').getBoundingClientRect();
                const build = document.querySelector('#buildMenu').getBoundingClientRect();
                return {
                    timelineBottom: timeline.bottom,
                    tutorialTop: tutorial.top,
                    actionBottom: actions.bottom,
                    buildBottom: build.bottom,
                    timelineTop: timeline.top,
                };
            });
            expect(Math.max(desktopBand.actionBottom, desktopBand.buildBottom)).toBeLessThan(desktopBand.timelineTop);
            expect(desktopBand.timelineBottom).toBeLessThan(desktopBand.tutorialTop);
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
    await expect(page.locator('#confettiCanvas')).toHaveCSS('display', 'block');
    const celebrationLayers = await page.evaluate(() => ({
        confetti: Number(getComputedStyle(document.getElementById('confettiCanvas')).zIndex),
        winner: Number(getComputedStyle(document.getElementById('status')).zIndex),
        crash: Number(getComputedStyle(document.getElementById('crashScreen')).zIndex),
    }));
    expect(celebrationLayers.confetti).toBeGreaterThan(celebrationLayers.winner);
    expect(celebrationLayers.confetti).toBeLessThan(celebrationLayers.crash);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(900);
    expect(await page.locator('#confettiCanvas').evaluate(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] > 0) return true;
        }
        return false;
    })).toBe(true);
    const winMomentPath = testInfo.outputPath('sunset-win-moment-390.png');
    await page.screenshot({ path: winMomentPath, fullPage: false, animations: 'disabled' });
    await testInfo.attach('sunset-win-moment-390.png', {
        path: winMomentPath,
        contentType: 'image/png',
    });
    const winningTown = page.locator('.winner-screen .sunset-town .town-building').first();
    expect(await winningTown.evaluate(element => getComputedStyle(element).animationName))
        .toBe('winner-town-lights');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await winningTown.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        if (width === 1440) {
            const victoryLayout = await page.locator('.winner-screen').evaluate(element => {
                const town = element.querySelector('.sunset-town');
                const art = town.querySelector('.town-building:not(.town-landmark) .sunset-facility-art');
                return {
                    winnerWidth: element.getBoundingClientRect().width,
                    townWidth: town.getBoundingClientRect().width,
                    artHeight: art.getBoundingClientRect().height,
                };
            });
            expect(victoryLayout.winnerWidth).toBeGreaterThanOrEqual(1100);
            expect(victoryLayout.townWidth).toBeGreaterThanOrEqual(1000);
            expect(victoryLayout.artHeight).toBeGreaterThanOrEqual(95);
            const titleAction = page.locator('#winnerRestartButton');
            await expect(titleAction).toHaveCSS('border-top-width', '0px');
            await expect(titleAction).toHaveCSS('text-decoration-line', 'underline');
            await expect(page.locator('.winner-share-actions .winner-secondary-action').first())
                .toHaveCSS('border-top-width', '1px');
        }
        const resultPath = testInfo.outputPath(`sunset-result-${width}.png`);
        await page.screenshot({ path: resultPath, fullPage: true, animations: 'disabled' });
        await testInfo.attach(`sunset-result-${width}.png`, {
            path: resultPath,
            contentType: 'image/png',
        });
    }
});

for (const width of [320, 390, 1440]) {
    test(`引越し屋の絵柄選択は解決用施設indexと同期する (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await prepareSunset(page);
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.evaluate(() => {
            cancelCpuSchedule('mover-card-review');
            window.scheduleCPU = () => false;
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
            state.game.phase = GAME_PHASES.PENDING;
            state.game.pendingMover = 1;
            render();
        });
        const modal = page.locator('#pendingModal');
        const cards = modal.locator('[aria-labelledby="moverGiveHeading"] .bc-chip');
        await expect(cards).toHaveCount(2);
        await expect(cards.first().locator('.bc-chip-art svg')).toBeVisible();
        const secondIndex = await cards.nth(1).getAttribute('data-idx');
        await cards.nth(1).focus();
        await page.keyboard.press('Enter');
        await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
        await expect(cards.first()).toHaveAttribute('aria-pressed', 'false');
        await expect(modal.locator('#moverCardSelect')).toHaveValue(secondIndex);
        await expect(modal.locator('#moverCardSelect')).toBeHidden();
        await page.evaluate(() => render());
        await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
        await expect(modal.locator('#moverCardSelect')).toHaveValue(secondIndex);
        expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await expect(modal.locator('[data-action="resolveMover"]')).toHaveCount(1);
    });
}

test('320px市場は施設名と価格を分け、複数出目とカテゴリを分断しない', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await prepareSunset(page);
    await page.evaluate(() => {
        const gallery = document.createElement('main');
        gallery.id = 'narrow-market-review';
        gallery.style.cssText = 'position:absolute;inset:0;z-index:9999;padding:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;background:#132538;align-content:start';
        gallery.innerHTML = CARDS.map(card => renderBuildCardButton(card, 6, true)).join('');
        document.body.append(gallery);
    });
    const cards = page.locator('#narrow-market-review .card-btn');
    const layouts = await cards.evaluateAll(elements => elements.map(element => {
        const name = element.querySelector('.card-name');
        const price = element.querySelector('.card-cost');
        const body = element.querySelector('.card-btn-top');
        const dice = element.querySelector('.card-dice-num');
        const category = element.querySelector('.card-category-tag');
        return {
            name: name.textContent,
            nameWidth: name.getBoundingClientRect().width,
            bodyWidth: body.getBoundingClientRect().width,
            nameBottom: name.getBoundingClientRect().bottom,
            priceTop: price.getBoundingClientRect().top,
            diceBottom: dice.getBoundingClientRect().bottom,
            categoryTop: category.getBoundingClientRect().top,
            diceFits: dice.scrollWidth <= dice.clientWidth,
            categoryFits: category.scrollWidth <= category.clientWidth,
            nameHeight: name.getBoundingClientRect().height,
            nameLineHeight: parseFloat(getComputedStyle(name).lineHeight),
        };
    }));
    for (const layout of layouts) {
        expect(Math.abs(layout.nameWidth - layout.bodyWidth)).toBeLessThan(1);
        expect(layout.priceTop).toBeGreaterThanOrEqual(layout.nameBottom);
        expect(layout.categoryTop).toBeGreaterThanOrEqual(layout.diceBottom);
        expect(layout.diceFits).toBe(true);
        expect(layout.categoryFits).toBe(true);
        if (['ドリンク工場', 'ITベンチャー'].includes(layout.name)) {
            expect(layout.nameHeight).toBeLessThan(layout.nameLineHeight * 1.5);
        }
    }
});

for (const design of ['sunset', 'classic']) {
    for (const width of [320, 390, 1440]) {
        test(`待機室は座席を一元表示し長い名称・予約・操作を保つ (${design}, ${width}px)`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 844 });
            await prepareSunset(page);
            if (design === 'classic') await selectDesignTheme(page, design);
            await page.locator('#tabOnline').click();
            if (design === 'sunset' && width <= 390) {
                const tabs = await page.locator('.tab-bar > .tab-btn').evaluateAll(buttons => buttons.map(button => {
                    const range = document.createRange();
                    range.selectNodeContents(button);
                    const text = range.getBoundingClientRect();
                    const bounds = button.getBoundingClientRect();
                    return { label: button.textContent, textLeft: text.left, textRight: text.right,
                        buttonLeft: bounds.left, buttonRight: bounds.right, height: bounds.height };
                }));
                expect(tabs).toHaveLength(4);
                for (const tab of tabs) {
                    expect(tab.textLeft, tab.label).toBeGreaterThanOrEqual(tab.buttonLeft);
                    expect(tab.textRight, tab.label).toBeLessThanOrEqual(tab.buttonRight);
                    expect(tab.height, tab.label).toBeGreaterThanOrEqual(44);
                }
            }

            await page.evaluate(() => {
                const names = Array.from({ length: 10 }, (_, index) => index === 3 ? 'CPU（普通）'
                    : index === 9 ? '待機中...' : `参加者${index + 1}・夕暮れの街を育てる仲間`);
                const participants = names.flatMap((name, index) => index === 3 || index === 9 ? [] : [{
                    index, name, connected: index !== 2, ready: index !== 0,
                    ...(index === 2 ? { reservedUntil: 61000 } : {}),
                }]);
                document.getElementById('onlineWaitingPanel').innerHTML = OnlineRoomShare.buildWaitingHtml('ABC123', names, {
                    isHost: true, myPlayerIndex: 0, hostPlayerIndex: 2, now: 1000, participants,
                    setupSummary: {
                        playerSlots: names.map((_, index) => index === 3 ? 'CPU（普通）' : '人間'),
                        enabledCards: ['麦畑', '牧場'], enabledLandmarks: ['駅'], cpuSpeed: 1500,
                    },
                });
            });
            const room = page.locator('#onlineWaitingPanel .room-share-panel');
            await expect(room.locator('.room-seat')).toHaveCount(10);
            if (design === 'sunset') {
                await expect(page.locator('#playerNameInput')).toBeHidden();
                await expect(page.locator('#onlineCreate')).toBeHidden();
                await expect(page.locator('#onlineJoin')).toBeHidden();
                await expect(page.locator('#tabContentOnline > .online-tabs')).toBeHidden();
                const stateColors = await room.evaluate(element => ({
                    ready: getComputedStyle(element.querySelector('[data-seat-state="ready"] .room-seat-state')).color,
                    preparing: getComputedStyle(element.querySelector('[data-seat-state="preparing"] .room-seat-state')).color,
                }));
                expect(stateColors.ready).not.toBe(stateColors.preparing);
            }
            await expect(room.locator('.room-seat[data-seat-state="cpu"]')).toHaveCount(1);
            await expect(room.locator('.room-seat[data-seat-state="empty"]')).toHaveCount(1);
            await expect(room.locator('.room-seat[data-seat-state="reconnecting"]')).toHaveCount(1);
            await expect(room.locator('.room-seat-remove')).toHaveCount(7);
            await expect(room.locator('.room-seat-roles').first()).toHaveText('あなた');
            await expect(room.locator('[data-ui-action="setOnlineLobbyReady"]'))
                .toHaveAttribute('data-ready', 'true');
            expect(await room.locator('.room-setup-summary').evaluate(element => element.open)).toBe(false);
            await room.locator('.room-setup-summary > summary').click();
            await expect(room.locator('.room-setup-summary dl')).toBeVisible();
            await room.locator('.room-setup-summary > summary').click();
            const updated = await page.evaluate(() => {
                const runtime = OnlineDomEffects.createRuntime({ getDocument: () => document });
                const count = runtime.refreshWaitingReservationCountdowns(2000);
                return { count, name: document.querySelector('[data-reserved-until]').textContent,
                    roles: document.querySelector('[data-reserved-until]').parentElement.querySelector('.room-seat-roles').textContent };
            });
            expect(updated.count).toBe(1);
            expect(updated.name).toContain('残り59秒');
            expect(updated.roles).toBe('ホスト');
            const bounds = await room.evaluate(element => ({
                fit: element.scrollWidth <= element.clientWidth,
                readyHeight: element.querySelector('.room-ready-btn').getBoundingClientRect().height,
                removeHeights: [...element.querySelectorAll('.room-seat-remove')].map(button => button.getBoundingClientRect().height),
                slotWidths: [...element.querySelectorAll('.room-slot-controls button')].map(button => button.getBoundingClientRect().width),
            }));
            expect(bounds.fit).toBe(true);
            expect(bounds.readyHeight).toBeGreaterThanOrEqual(44);
            for (const height of bounds.removeHeights) expect(height).toBeGreaterThanOrEqual(44);
            for (const width of bounds.slotWidths) expect(width).toBe(44);
            const screenshotPath = testInfo.outputPath(`waiting-seats-${design}-${width}.png`);
            await room.screenshot({ path: screenshotPath, animations: 'disabled' });
            await testInfo.attach(`waiting-seats-${design}-${width}.png`, {
                path: screenshotPath, contentType: 'image/png',
            });
            await page.evaluate(() => { document.getElementById('onlineWaitingPanel').innerHTML = ''; });
            await expect(page.locator('#playerNameInput')).toBeVisible();
            await expect(page.locator('#tabContentOnline > .online-tabs')).toBeVisible();
        });
    }
}

test('街の発展背景は動き軽減でも段階を示し住宅・街区・街灯を動かさない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
        const review = document.createElement('section');
        review.id = 'town-motion-review';
        review.innerHTML = [2, 5, 8].map(count => UiBuildMenu.renderTownHtml({
            cards: Array.from({ length: count }, () => CARDS[0]),
            landmarks: {},
        })).join('');
        document.body.append(review);
    });
    const streets = page.locator('#town-motion-review .town-street');
    await expect(streets).toHaveCount(3);
    for (const [index, stage] of ['quiet', 'neighborhood', 'city'].entries()) {
        const street = streets.nth(index);
        await expect(street).toHaveAttribute('data-town-stage', stage);
        await expect(street.locator('.town-backdrop')).toBeVisible();
        const motion = await street.locator(
            '.town-backdrop-neighborhood, .town-backdrop-city, .town-backdrop-lamps'
        ).evaluateAll(elements => elements.map(element => {
            const style = getComputedStyle(element);
            return {
                durations: style.transitionDuration.split(',').map(value => parseFloat(value)),
                animation: style.animationName,
            };
        }));
        expect(motion).toHaveLength(3);
        for (const group of motion) {
            expect(group.durations.every(duration => duration === 0)).toBe(true);
            expect(group.animation).toBe('none');
        }
    }
    await expect(streets.nth(0).locator('.town-backdrop-neighborhood')).toHaveCSS('opacity', '0');
    await expect(streets.nth(1).locator('.town-backdrop-neighborhood')).toHaveCSS('opacity', '1');
    await expect(streets.nth(2).locator('.town-backdrop-city')).toHaveCSS('opacity', '1');
});

// These checks use the normal purchase and Undo handlers after fixing a legal
// human build phase, so scenery must follow game state rather than a demo DOM.
test('ランドマーク完成は街景を変え再描画・Undo・復元で祝福を誤再生しない', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const humanIndex = await page.evaluate(() => {
        cancelCpuSchedule('landmark-town-browser-review');
        window.scheduleCPU = () => false;
        const state = GameRuntimeState.runtime.snapshot();
        const humanIndex = state.cpuPlayers.findIndex(cpu => !cpu);
        state.game.currentPlayerIndex = humanIndex;
        state.game.phase = GAME_PHASES.BUILD;
        state.game.builtThisTurn = false;
        state.game.currentPlayer().coins = 30;
        render();
        return humanIndex;
    });
    const street = page.locator(`#playerBox${humanIndex} .town-street`);
    const station = page.locator('#buildMenu [data-action="buildLandmark"][data-landmark-name="駅"]');
    await expect(street.locator('[data-town-feature="railway"]')).toHaveCount(0);
    const lampsBefore = await street.locator('[data-town-lamp]').count();
    await expect(station).toBeEnabled();
    const completed = await station.evaluate(button => {
        button.click();
        const game = GameRuntimeState.runtime.snapshot().game;
        const street = document.querySelector(`#playerBox${game.currentPlayerIndex} .town-street`);
        const caption = street.querySelector('.town-event-caption');
        const result = {
            cue: street.classList.contains('town-landmark-completion'),
            caption: caption?.textContent,
            lamps: street.querySelectorAll('[data-town-lamp]').length,
        };
        render();
        result.sameCaptionAfterRender = document.querySelector(`#playerBox${game.currentPlayerIndex} .town-event-caption`) === caption;
        return result;
    });
    expect(completed.cue).toBe(true);
    expect(completed.caption).toBe('駅が完成・一歩リード');
    expect(completed.lamps).toBeGreaterThan(lampsBefore);
    expect(completed.sameCaptionAfterRender).toBe(true);
    await expect(street.locator('[data-town-feature="railway"]')).toHaveCount(1);
    const path = testInfo.outputPath('sunset-station-completion-390.png');
    await street.screenshot({ path, animations: 'disabled' });
    await testInfo.attach('sunset-station-completion-390.png', { path, contentType: 'image/png' });
    await expect(street.locator('.town-event-caption')).toHaveCount(0);
    await page.evaluate(() => render());
    await expect(street.locator('.town-event-caption')).toHaveCount(0);
    await page.locator('#buildMenu .undo-btn').click();
    await page.locator('#confirmOkBtn').click();
    await expect(street.locator('[data-town-feature="railway"]')).toHaveCount(0);
    await expect(street.locator('.town-event-caption')).toHaveCount(0);
    expect(await street.locator('[data-town-lamp]').count()).toBe(lampsBefore);
    await station.click();
    await expect(street.locator('[data-town-feature="railway"]')).toHaveCount(1);
    await page.evaluate(() => saveGameState());
    await page.reload();
    await expect(page.locator('#resumeSection')).toBeVisible();
    await page.locator('#btnResume').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(street.locator('[data-town-feature="railway"]')).toHaveCount(1);
    await expect(street.locator('.town-event-caption')).toHaveCount(0);
    await expect(street).not.toHaveClass(/town-landmark-completion/);
});

test('大収入だけ街を短く照らし動き軽減では光のアニメーションを止める', async ({ page }) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        cancelCpuSchedule('income-town-browser-review');
        window.scheduleCPU = () => false;
        showCoinAnimation(0, 4);
    });
    const street = page.locator('#playerBox0 .town-street');
    await expect(street).not.toHaveClass(/town-income-celebration/);
    await page.evaluate(() => showCoinAnimation(0, 5));
    await expect(street).toHaveClass(/town-income-celebration/);
    await expect(street).toHaveCSS('animation-name', 'townIncomeLight');
    await expect(street).toHaveCSS('animation-iteration-count', '1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(street).toHaveCSS('animation-name', 'none');
});

test('タイトルの補助案内は折りたたんでもキーボードで開け法的リンクを保つ', async ({ page }) => {
    await prepareSunset(page);
    await page.setViewportSize({ width: 320, height: 844 });
    for (const mode of ['sunset', 'classic', 'high-contrast']) {
        if (mode === 'classic') await selectDesignTheme(page, 'classic');
        if (mode === 'high-contrast') {
            await selectDesignTheme(page, 'sunset');
            await page.locator('body').evaluate(element => element.classList.add('accessibility-high-contrast'));
        }
        const guide = page.locator('.title-world-guide');
        const summary = guide.locator('summary');
        await expect(guide).toHaveJSProperty('open', false);
        await expect(guide.locator('a[href="cards.html"]')).toBeHidden();
        await summary.scrollIntoViewIfNeeded();
        await summary.focus();
        await expect(summary).toBeFocused();
        expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        await expect(guide).toHaveJSProperty('open', true);
        for (const href of ['how-to-play.html', 'cards.html', 'ai-cpu.html']) {
            const link = guide.locator(`a[href="${href}"]`);
            await expect(link).toBeVisible();
            await link.focus();
            await expect(link).toBeFocused();
        }
        await summary.focus();
        await page.keyboard.press('Enter');
        await expect(guide).toHaveJSProperty('open', false);
        for (const href of ['rules.html', 'privacy.html']) {
            const link = page.locator(`.legal-links a[href="${href}"]`);
            await expect(link).toBeVisible();
            await link.focus();
            await expect(link).toBeFocused();
        }
        for (const tab of ['#tabLocal', '#tabOnline', '#tabStats', '#tabTournament']) {
            expect((await page.locator(tab).boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
});

test('完成した街の比率と最低高さは320pxでも区画を横へ押し出さない', async ({ page }, testInfo) => {
    await prepareSunset(page);
    await page.evaluate(() => {
        const player = new Player('夕暮れの街を育てた長いプレイヤー名');
        player.cards = Object.values(CARDS);
        const landmarks = Object.values(LANDMARK_NAMES).filter(name => name !== LANDMARK_NAMES.YAKUSHO);
        for (const name of landmarks) player.landmarks[name] = true;
        const scene = document.createElement('main');
        scene.id = 'district-geometry-review';
        scene.style.cssText = 'position:fixed;inset:20px auto auto 20px;width:calc(100% - 40px);max-width:640px;z-index:2147483647';
        scene.innerHTML = UiBuildMenu.renderTownHtml(player, new Set(landmarks));
        document.body.append(scene);
    });
    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        const scene = page.locator('#district-geometry-review');
        await expect(scene.locator('[data-town-slot-facility]')).toHaveCount(8);
        await expect(scene.locator('[data-town-slot-landmark]')).toHaveCount(6);
        const layout = await scene.evaluate(element => {
            const town = element.querySelector('.sunset-town').getBoundingClientRect();
            const streetElement = element.querySelector('.town-street');
            const street = streetElement.getBoundingClientRect();
            const figures = [...streetElement.querySelectorAll('.town-building .sunset-facility-art')]
                .map(art => art.getBoundingClientRect());
            const overflow = element.querySelector('.town-overflow');
            return {
                townLeft: town.left, townRight: town.right,
                streetLeft: street.left, streetRight: street.right,
                figuresInside: figures.every(figure => figure.left >= street.left - 1 &&
                    figure.right <= street.right + 1 && figure.top >= street.top - 1 && figure.bottom <= street.bottom + 1),
                overflowOutside: overflow !== null && !streetElement.contains(overflow),
                documentWidth: document.documentElement.scrollWidth,
            };
        });
        expect(layout.streetLeft).toBeGreaterThanOrEqual(layout.townLeft);
        expect(layout.streetRight).toBeLessThanOrEqual(layout.townRight);
        expect(layout.figuresInside).toBe(true);
        expect(layout.overflowOutside).toBe(true);
        expect(layout.documentWidth).toBeLessThanOrEqual(width);
        const path = testInfo.outputPath(`sunset-town-districts-${width}.png`);
        await scene.screenshot({ path, animations: 'disabled' });
        await testInfo.attach(`sunset-town-districts-${width}.png`, { path, contentType: 'image/png' });
    }
});

test('オンライン復元の途中表示は祝福せず復元後の本当の建設だけを演出する', async ({ page }) => {
    await prepareSunset(page);
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    const humanIndex = await page.evaluate(() => {
        cancelCpuSchedule('restore-town-cue-review');
        window.scheduleCPU = () => false;
        const state = GameRuntimeState.runtime.snapshot();
        const index = state.cpuPlayers.findIndex(cpu => !cpu);
        state.game.currentPlayerIndex = index;
            state.game.phase = GAME_PHASES.BUILD;
            state.game.builtThisTurn = false;
            state.game.currentPlayer().coins = 30;
            OnlineRuntimeState.runtime.setReplaying(true);
            state.game.addLog(LOG_TYPES.SYSTEM, `👤 ${state.game.currentPlayer().name}のターン`);
            render();
        state.game.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
        render();
        OnlineRuntimeState.runtime.setReplaying(false);
        render();
        return index;
    });
    const street = page.locator(`#playerBox${humanIndex} .town-street`);
    await expect(street.locator('[data-town-feature="railway"]')).toHaveCount(1);
    await expect(street.locator('.town-event-caption')).toHaveCount(0);
    await expect(street).not.toHaveClass(/town-landmark-completion/);
    const mall = page.locator('#buildMenu [data-action="buildLandmark"][data-landmark-name="ショッピングモール"]');
    await expect(mall).toBeEnabled();
    const purchased = await mall.evaluate(button => {
        button.click();
        const game = GameRuntimeState.runtime.snapshot().game;
        const street = document.querySelector(`#playerBox${game.currentPlayerIndex} .town-street`);
        return { caption: street.querySelector('.town-event-caption')?.textContent,
            cue: street.classList.contains('town-landmark-completion') };
    });
    // The restored station already established a lead: this extends it.
    expect(purchased.caption).toBe('ショッピングモールが完成');
    expect(purchased.cue).toBe(true);
});

for (const width of [320, 390, 844, 1440]) {
    test(`広場テーマは共通アートと街の盤面を表示する ${width}px`, async ({ page }, testInfo) => {
        const height = width === 844 ? 390 : 844;
        await page.setViewportSize({ width, height });
        await stubAds(page);
        await page.goto('/');
        await selectDesignTheme(page, 'plaza');
        await expect(page.locator('.title-brand-mark')).toBeVisible();
        await page.locator('#customGameSetup > summary').click();
        await page.locator('[data-ui-action="changeCount"][data-delta="1"]').click();
        await page.locator('[data-ui-action="changeCount"][data-delta="1"]').click();
        // Use the supported fast CPU setting: this art fixture still plays
        // real CPU turns after save/resume, without waiting at the default pace.
        await page.locator('#cpuSpeed').evaluate(input => {
            input.value = input.min;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await expect(page.locator('#cpuSpeed')).toHaveValue('100');
        await page.locator('#btnStart').click();
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.locator('#btnRoll').click();
        await expect.poll(() => page.evaluate(() =>
            GameRuntimeState.runtime.snapshot().game.phase
        )).toBe('build');
        await page.evaluate(() => {
            cancelCpuSchedule('plaza-review');
            window.scheduleCPU = () => false;
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
            state.game.phase = GAME_PHASES.BUILD;
            state.game.currentPlayer().coins = 30;
            // Related-log timer coverage must not depend on a random roll's income.
            state.game.addLog(LOG_TYPES.BUILD, '🏗️ 麦畑を建設！', { review: false });
            render();
        });
        const town = page.locator('.player-box-self .town-street');
        await expect(town.locator('.town-building .sunset-facility-art').first()).toBeVisible();
        expect((await town.boundingBox()).height).toBeGreaterThan(60);
        await expect(page.locator('#plazaPlayerHud button')).toHaveCount(4);
        // The recent log action must focus a related town without throwing in WebKit.
        if (width === 844) await page.locator('[data-field-panel="events"]').click();
        await page.locator('.plaza-recent-history > summary').click();
        const logAction = page.locator('#plazaRecentEvents [data-ui-action="highlightLogEntry"]:visible').last();
        await logAction.click();
        await expect(page.locator('#crashScreen')).toBeHidden();
        await expect(page.locator('.log-related-highlight').first()).toBeAttached();
        const chipLayout = await page.locator('#plazaPlayerHud').evaluate(hud => {
            const buttons = [...hud.querySelectorAll('button')];
            const categories = buttons.map(button => {
                const chips = [...button.querySelectorAll('.plaza-player-facilities > span')];
                const visible = chips.filter(chip => chip.getClientRects().length > 0 &&
                    getComputedStyle(chip).visibility !== 'hidden');
                const buttonBounds = button.getBoundingClientRect();
                return { self: button.classList.contains('self'), total: chips.length,
                    visible: visible.length, fits: visible.every(chip => {
                        const bounds = chip.getBoundingClientRect();
                        return bounds.left >= buttonBounds.left && bounds.right <= buttonBounds.right &&
                            chip.scrollWidth <= chip.clientWidth;
                    }) };
            });
            return categories;
        });
        expect(chipLayout).toHaveLength(4);
        expect(chipLayout.filter(button => button.self)).toHaveLength(1);
        for (const button of chipLayout) {
            expect(button.total).toBe(4);
            expect(button.visible).toBe(button.self || width >= 844 ? 4 : 0);
            expect(button.fits).toBe(true);
        }
        const initialCamera = await page.locator('#plazaWorld').getAttribute('style');
        await page.locator('[data-field-target="market"]').click();
        expect(await page.locator('#plazaWorld').getAttribute('style')).not.toBe(initialCamera);
        const marketZoom = parseInt(await page.locator('#plazaZoomLabel').textContent(), 10);
        await page.locator('.plaza-camera-menu > summary').click();
        await page.locator('[data-field-zoom="in"]').click();
        expect(parseInt(await page.locator('#plazaZoomLabel').textContent(), 10)).toBeGreaterThan(marketZoom);
        await page.locator('.plaza-camera-menu > summary').click();
        await page.locator('[data-field-target="all"]').click();
        const dragPoint = await page.locator('#plazaViewport').evaluate(field => {
            const rect = field.getBoundingClientRect();
            for (const y of [0.3, 0.5, 0.7]) for (const x of [0.1, 0.5, 0.9]) {
                const point = { x: rect.left + rect.width * x, y: rect.top + rect.height * y };
                const hit = document.elementFromPoint(point.x, point.y);
                if (hit?.closest('#plazaViewport') && !hit.closest('#buildMenu')) return point;
            }
            return null;
        });
        expect(dragPoint).not.toBeNull();
        const beforePan = await page.locator('#plazaWorld').getAttribute('style');
        await page.mouse.move(dragPoint.x, dragPoint.y);
        await page.mouse.down();
        await page.mouse.move(dragPoint.x + 50, dragPoint.y - 20, { steps: 8 });
        await page.mouse.up();
        expect(await page.locator('#plazaWorld').getAttribute('style')).not.toBe(beforePan);
        const pinch = await page.locator('#plazaViewport').evaluate(viewport => {
            const before = parseInt(document.getElementById('plazaZoomLabel').textContent, 10);
            const original = viewport.setPointerCapture;
            // Synthetic touch pointers cannot acquire native capture. Exercise
            // the real two-pointer handler while leaving native drag tested above.
            viewport.setPointerCapture = () => {};
            const rect = viewport.getBoundingClientRect();
            const send = (type, id, x) => viewport.dispatchEvent(new PointerEvent(type, {
                pointerId: id, pointerType: 'touch', clientX: rect.left + x,
                clientY: rect.top + 100, button: 0, bubbles: true,
            }));
            try {
                send('pointerdown', 21, 100); send('pointerdown', 22, 200);
                send('pointermove', 22, 260);
                send('pointerup', 22, 260); send('pointerup', 21, 100);
                return { before, after: parseInt(document.getElementById('plazaZoomLabel').textContent, 10) };
            } finally { viewport.setPointerCapture = original; }
        });
        expect(pinch.after).toBeGreaterThan(pinch.before);
        await page.locator('[data-field-target="all"]').click();
        await page.screenshot({ path: testInfo.outputPath(`plaza-field-all-${width}.png`), fullPage: false });
        await page.locator('[data-field-target="self"]').click();
        const controls = await page.locator('.game-action-panel').boundingBox();
        expect(controls.y + controls.height).toBeLessThanOrEqual(height + 1);
        expect(controls.height).toBeLessThan(180);
        const updateDismiss = page.locator('#pwaUpdateBanner [data-ui-action="hidePwaUpdateBanner"]');
        if (await updateDismiss.isVisible()) await updateDismiss.click();
        await page.screenshot({ path: testInfo.outputPath(`plaza-table-${width}.png`), fullPage: true });
        expect(await town.locator('.town-backdrop').evaluate(element =>
            getComputedStyle(element).position)).toBe('absolute');
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        if (width === 390) {
            await page.reload();
            await expect(page.locator('html')).toHaveAttribute('data-design', 'plaza');
            await page.locator('#btnResume').click();
            await expect(page.locator('.player-box-self .town-building .sunset-facility-art').first()).toBeVisible();
            expect(await page.evaluate(() => GameRuntimeState.runtime.snapshot().game.currentPlayer().coins)).toBe(30);
            const before = await page.evaluate(() => {
                const game = GameRuntimeState.runtime.snapshot().game;
                return { count: game.currentPlayer().cards.length, turn: game.turnCount };
            });
            await page.locator('[data-field-target="market"]').click();
            await page.locator('#buildMenu [data-action="buildCard"][data-card-name="麦畑"]').click();
            await expect.poll(() => page.evaluate(() =>
                GameRuntimeState.runtime.snapshot().game.currentPlayer().cards.length
            )).toBe(before.count + 1);
            await page.locator('#btnSkip').click();
            await expect.poll(() => page.evaluate(() =>
                GameRuntimeState.runtime.snapshot().game.turnCount
            )).toBeGreaterThan(before.turn);
            if (await page.locator('#hotseatHandoffButton').isVisible()) {
                await page.locator('#hotseatHandoffButton').click();
            }
            await expect(page.locator('#btnRoll')).toBeEnabled();
            await page.screenshot({ path: testInfo.outputPath('plaza-after-purchase-390.png'), fullPage: true });
        }
    });
}

for (const size of [{ width: 320, height: 844 }, { width: 844, height: 390 }]) {
    test(`広場の終盤と補助操作は画面内で完了できる ${size.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize(size);
        await stubAds(page);
        await page.goto('/');
        await selectDesignTheme(page, 'plaza');
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.evaluate(() => {
            cancelCpuSchedule('plaza-terminal-review');
            window.scheduleCPU = () => false;
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
            state.game.phase = GAME_PHASES.ROLL;
            state.game.currentPlayer().landmarks[LANDMARK_NAMES.STATION] = true;
            state.game.currentPlayer().landmarks[LANDMARK_NAMES.RADIO_TOWER] = true;
            render();
            document.getElementById('pwaUpdateBanner').style.display = 'block';
            document.body.classList.add('pwa-banner-open');
        });
        await expect.poll(async () => {
            const roll = await page.locator('#btnRoll').boundingBox();
            const banner = await page.locator('#pwaUpdateBanner').boundingBox();
            return banner.y + banner.height <= roll.y;
        }).toBe(true);
        await page.locator('#btnRoll').click();
        await expect(page.locator('[data-action="selectDiceCount"]')).toHaveCount(2);
        await page.locator('[data-action="selectDiceCount"][data-use-two="true"]').click();
        await page.locator('[data-action="skipReroll"]').click();
        await page.locator('#pwaUpdateBanner [data-ui-action="hidePwaUpdateBanner"]').click();
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            game.phase = GAME_PHASES.HARBOR_CHOICE;
            game.lastDice1 = 5; game.lastDice2 = 5; game.lastDiceResult = 10;
            game.currentPlayer().landmarks[LANDMARK_NAMES.HARBOR] = true;
            render();
        });
        await page.locator('[data-action="resolveHarbor"][data-use-bonus="false"]').click();
        await page.locator('.game-support-settings > summary').click();
        const exportButton = page.locator('.game-support-settings [data-ui-action="exportMatchData"]');
        await expect(exportButton).toBeVisible();
        expect((await exportButton.boundingBox()).y).toBeGreaterThanOrEqual(0);
        expect((await exportButton.boundingBox()).y + (await exportButton.boundingBox()).height).toBeLessThanOrEqual(size.height);
        await page.locator('.game-support-settings > summary').click();
        await page.locator('.game-guide-settings > summary').click();
        if (!await page.locator('#tutorialBox').isVisible()) await page.locator('#btnTutorialToggle').click();
        await expect(page.locator('#tutorialBox')).toBeVisible();
        await page.locator('#btnTutorialToggle').click();
        await page.locator('.game-guide-settings > summary').click();
        await page.locator('[data-field-target="market"]').click();
        const market = await page.locator('#buildMenu').boundingBox();
        expect(market.x).toBeGreaterThanOrEqual(-1);
        expect(market.x + market.width).toBeLessThanOrEqual(size.width + 1);
        const field = await page.locator('#plazaViewport').boundingBox();
        if (size.width === 844) expect(field.height).toBeGreaterThan(220);
        expect(market.y).toBeGreaterThanOrEqual(field.y - 1);
        expect(market.y + market.height).toBeLessThanOrEqual(field.y + field.height + 1);
        await page.screenshot({ path: testInfo.outputPath(`plaza-market-${size.width}.png`) });
        await page.evaluate(() => {
            const game = GameRuntimeState.runtime.snapshot().game;
            for (const name of getEnabledLandmarkSelection()) {
                if (Player.isKnownLandmark(name)) game.currentPlayer().landmarks[name] = true;
            }
            render();
        });
        await expect(page.locator('.winner-screen')).toBeVisible();
        await expect(page.locator('#plazaViewport')).toBeHidden();
        await page.evaluate(() => {
            document.getElementById('pwaUpdateBanner').style.display = 'block';
            document.body.classList.add('pwa-banner-open');
        });
        await verifyWinnerNotices(page);
        await page.locator('#winnerRestartButton').scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`plaza-winner-${size.width}.png`) });
        await page.locator('#winnerRestartButton').click();
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#titleScreen')).toBeVisible();
        await expect(page.locator('#pwaResultNotices')).toHaveCount(0);
        expect(await page.locator('#pwaUpdateBanner').evaluate(banner => banner.parentElement === document.body)).toBe(true);
    });
}

test('広場をタイトルで選び直しても正の倍率で開始し他テーマへ寸法を持ち越さない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareSunset(page);
    const start = async () => {
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.evaluate(() => {
            cancelCpuSchedule('theme-transition-regression');
            window.scheduleCPU = () => false;
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
            state.game.phase = GAME_PHASES.BUILD;
            state.game.currentPlayer().coins = 30;
            render();
        });
    };
    const returnToTitle = async () => {
        await page.evaluate(() => restartGame());
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#titleScreen')).toBeVisible();
    };
    await start();
    await returnToTitle();
    await selectDesignTheme(page, 'plaza');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await start();
    await expect.poll(() => page.locator('#plazaWorld').evaluate(element =>
        new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThanOrEqual(0.12);
    await page.evaluate(() => PlazaField.focusTarget('market'));
    expect(await page.locator('#buildMenu').evaluate(element => element.style.height)).not.toBe('');
    for (const theme of ['sunset', 'classic']) {
        await returnToTitle();
        await selectDesignTheme(page, theme);
        await start();
        expect(await page.locator('#buildMenu').evaluate(element => element.style.height)).toBe('');
        await expect(page.locator('.player-asset-summary')).toHaveCount(0);
    }
});


test('広場は場外でマウスを離した後にパンを続けず、フォーカスしたカードを表示する', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 844 });
    await prepareSunset(page);
    await selectDesignTheme(page, 'plaza');
    await page.locator('.setup-quick-play').click();
    await expect(page.locator('#gameScreen')).toBeVisible();
    await page.evaluate(() => {
        cancelCpuSchedule('plaza-input-regression');
        window.scheduleCPU = () => false;
        const state = GameRuntimeState.runtime.snapshot();
        state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
        state.game.phase = GAME_PHASES.BUILD;
        state.game.currentPlayer().coins = 30;
        render();
        PlazaField.focusTarget('self');
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const field = await page.locator('#plazaViewport').boundingBox();
    const before = await page.locator('#plazaWorld').evaluate(element => element.style.transform);
    const x = field.x + field.width * 0.6;
    await page.mouse.move(x, field.y + 2);
    await page.mouse.down();
    await page.mouse.move(x, field.y - 2);
    await page.mouse.up();
    await page.mouse.move(x - 20, field.y + 82);
    expect(await page.locator('#plazaWorld').evaluate(element => element.style.transform)).toBe(before);
    const card = page.locator('#buildMenu .card-btn').first();
    await card.focus();
    const focusedCardFits = () => card.evaluate(element => {
        const cardRect = element.getBoundingClientRect();
        const fieldRect = document.getElementById('plazaViewport').getBoundingClientRect();
        return document.activeElement === element && cardRect.top >= fieldRect.top - 1 &&
            cardRect.bottom <= fieldRect.bottom + 1 && cardRect.left >= fieldRect.left - 1 &&
            cardRect.right <= fieldRect.right + 1;
    });
    await expect.poll(focusedCardFits).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(focusedCardFits).toBe(true);
});
