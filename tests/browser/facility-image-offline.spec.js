const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

test('生成した施設画像はSW保存後にオフライン再起動でも全件描ける', async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
    try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
        await page.goto('/');
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
        const assets = (await fs.readdir(path.resolve('icons/facility-art-images'))).filter(name => name.endsWith('.svg')).sort();
        const cached = await page.evaluate(async assets => {
            const keys = await caches.keys();
            const cache = await caches.open('machikoro-v367-art-candidate');
            const entries = await Promise.all(assets.map(async name => {
                const response = await cache.match(`/icons/facility-art-images/${name}`);
                return { name, status: response?.status, svg: (await response?.text())?.includes('<svg') };
            }));
            return { keys, entries };
        }, assets);
        expect(cached.entries).toHaveLength(50);
        expect(cached.entries.every(entry => entry.status === 200 && entry.svg)).toBe(true);
        await context.setOffline(true);
        await page.reload();
        const decoded = await page.evaluate(async assets => Promise.all(assets.map(async name => {
            const image = new Image();
            image.src = `/icons/facility-art-images/${name}`;
            await image.decode();
            return { name, width: image.naturalWidth, height: image.naturalHeight };
        })), assets);
        expect(decoded).toHaveLength(50);
        expect(decoded.every(image => image.width > 0 && image.height > 0)).toBe(true);
        expect(errors).toEqual([]);
        await fs.writeFile(testInfo.outputPath('facility-images-offline.json'), JSON.stringify({ cached, decoded, errors }, null, 2));
    } finally {
        await context.close();
    }
});
