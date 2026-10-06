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
]) {
    test(`勝利の通知は完成した結果の後から操作できる ${sample.theme} ${sample.width}px`, async ({ page }) => {
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
        await verifyWinnerNotices(page);
        await page.locator('#winnerRestartButton').click();
        await page.locator('#confirmOkBtn').click();
        await expect(page.locator('#titleScreen')).toBeVisible();
        await expect(page.locator('#pwaResultNotices')).toHaveCount(0);
        expect(await page.locator('#pwaUpdateBanner').evaluate(banner => banner.parentElement === document.body)).toBe(true);
    });
}
