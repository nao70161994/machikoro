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

test('mobile WebKitの2クライアントがonline開始後に再読込復帰できる', async ({ browser }) => {
    const hostContext = await browser.newContext(MOBILE_CONTEXT);
    const guestContext = await browser.newContext(MOBILE_CONTEXT);
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
