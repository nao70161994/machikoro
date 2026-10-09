const { test, expect } = require('@playwright/test');
const { verifyWinnerNotices } = require('./helpers/winner-notices');

async function stubAds(page) {
    await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: '',
    }));
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

for (const sample of [
    { theme: 'sunset', width: 390, height: 844 },
    { theme: 'classic', width: 390, height: 844 },
    { theme: 'classic', width: 1440, height: 900 },
    { theme: 'plaza', width: 844, height: 390 },
]) {
    test(`勝利の通知は完成した結果の後から操作できる ${sample.theme} ${sample.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: sample.width, height: sample.height });
        await stubAds(page);
        await page.goto('/');
        await selectDesignTheme(page, sample.theme);
        await page.locator('.setup-quick-play').click();
        await expect(page.locator('#gameScreen')).toBeVisible();
        await page.evaluate(() => {
            const state = GameRuntimeState.runtime.snapshot();
            state.game.currentPlayerIndex = state.cpuPlayers.findIndex(cpu => !cpu);
            cancelCpuSchedule('winner-notices-review');
            for (const name of getEnabledLandmarkSelection()) {
                if (Player.isKnownLandmark(name)) state.game.currentPlayer().landmarks[name] = true;
            }
            render();
            document.getElementById('pwaUpdateBanner').style.display = 'block';
            document.body.classList.add('pwa-banner-open');
        });
        await expect(page.locator('.winner-screen')).toBeVisible();
        if (sample.theme === 'plaza' && sample.width === 844) {
            await expect(page.locator('#confettiCanvas')).toHaveCSS('display', 'block');
            const confettiReview = await page.evaluate(() => ({
                count: confettiPieces.length,
                maximumOpacity: Math.max(...confettiPieces.map(piece => piece.opacity)),
                allEnterFromTop: confettiPieces.every(piece => piece.launchY <= 0 && piece.launchY >= -96),
            }));
            expect(confettiReview.count).toBe(48);
            expect(confettiReview.maximumOpacity).toBeLessThanOrEqual(0.7);
            expect(confettiReview.allEnterFromTop).toBe(true);
            await page.waitForTimeout(500);
            const celebrationPath = testInfo.outputPath('plaza-winner-celebration-844x390.png');
            await page.screenshot({ path: celebrationPath, fullPage: false, animations: 'disabled' });
            await testInfo.attach('plaza-winner-celebration-844x390.png', {
                path: celebrationPath,
                contentType: 'image/png',
            });
            const resultLayout = await page.evaluate(() => {
                const bounds = selector => {
                    const rect = document.querySelector(selector).getBoundingClientRect();
                    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
                };
                return {
                    viewport: { width: innerWidth, height: innerHeight },
                    title: bounds('.winner-title'),
                    town: bounds('.winner-screen .sunset-town'),
                    stats: bounds('.winner-stats'),
                    rematch: bounds('#winnerRematchButton'),
                    share: bounds('.winner-share-actions'),
                    restart: bounds('#winnerRestartButton'),
                };
            });
            for (const [name, rect] of Object.entries(resultLayout).filter(([name]) => name !== 'viewport')) {
                expect(rect.left, `${name} stays inside the left edge`).toBeGreaterThanOrEqual(0);
                expect(rect.right, `${name} stays inside the right edge`).toBeLessThanOrEqual(resultLayout.viewport.width);
                expect(rect.top, `${name} stays inside the top edge`).toBeGreaterThanOrEqual(0);
                expect(rect.bottom, `${name} stays inside the first landscape viewport`).toBeLessThanOrEqual(resultLayout.viewport.height);
            }
            expect(resultLayout.town.left, 'the town sits beside the winner details').toBeGreaterThan(resultLayout.title.left);
        }
        await verifyWinnerNotices(page);
        await page.locator('#winnerRestartButton').click();
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#titleScreen')).toBeVisible();
        await expect(page.locator('#pwaResultNotices')).toHaveCount(0);
        expect(await page.locator('#pwaUpdateBanner').evaluate(banner => banner.parentElement === document.body)).toBe(true);
    });
}
