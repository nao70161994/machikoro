const { expect } = require('@playwright/test');

async function verifyWinnerNotices(page) {
    await page.evaluate(() => {
        document.getElementById('pwaUpdateBanner').style.display = 'block';
        document.getElementById('pwaInstallBanner').style.display = 'block';
    });
    const dock = page.locator('#pwaResultNotices');
    await expect(dock).toBeVisible();
    await expect(dock).not.toHaveAttribute('open', '');
    await expect(page.locator('#pwaUpdateBanner')).toBeHidden();
    await expect(page.locator('#pwaInstallBanner')).toBeHidden();
    await expect(page.locator('.winner-title')).toBeVisible();
    const town = page.locator('.winner-screen .sunset-town');
    // Classic keeps the town on tablet/desktop and omits it on narrow screens.
    const classicNarrow = await page.locator('html').getAttribute('data-design') === 'classic' &&
        page.viewportSize().width < 760;
    if (classicNarrow) {
        await expect(town).toBeHidden();
    } else {
        await expect(town).toBeVisible();
    }
    expect((await dock.locator('summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await dock.locator('summary').click();
    await expect(page.locator('#pwaUpdateBanner')).toBeVisible();
    await expect(page.locator('#pwaInstallBanner')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
        const winner = document.querySelector('.winner-screen').getBoundingClientRect();
        return ['pwaUpdateBanner', 'pwaInstallBanner'].every(id => {
            const banner = document.getElementById(id);
            return getComputedStyle(banner).position === 'static' &&
                banner.getBoundingClientRect().top >= winner.bottom;
        });
    })).toBe(true);
    await page.locator('#pwaUpdateBanner [data-ui-action="hidePwaUpdateBanner"]').click();
    await expect(page.locator('#pwaUpdateBanner')).toBeHidden();
    await expect(page.locator('#pwaInstallBanner')).toBeVisible();
    await expect(dock).toBeVisible();
    await page.locator('#pwaInstallBanner [data-ui-action="pwaInstallDismiss"]').click();
    await expect(page.locator('#pwaInstallBanner')).toBeHidden();
    await expect(dock).toBeHidden();
}

module.exports = { verifyWinnerNotices };
