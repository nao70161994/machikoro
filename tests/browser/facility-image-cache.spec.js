const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

test.use({ serviceWorkers: 'block' });

// Diagnostic proof of identical vector artwork, not a replacement for the
// existing visual baselines or the ordinary-motion performance guards.
test('施設のSVG画像は元の共有symbolと同じ画素を描く', async ({ page }, testInfo) => {
    test.setTimeout(180000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
    await page.goto('/');
    expect(await page.evaluate(() => UiBuildMenu.prepareLocalFacilityArt())).toBe(true);
    const assets = (await fs.readdir(path.resolve('icons/facility-art-images'))).filter(name => name.endsWith('.svg'));
    const decoded = await page.evaluate(async assets => Promise.all(assets.map(async name => {
        const image = new Image();
        image.src = `icons/facility-art-images/${name}`;
        await image.decode();
        return { name, width: image.naturalWidth, height: image.naturalHeight };
    })), assets);
    expect(decoded).toHaveLength(50);
    expect(decoded.every(image => image.width > 0 && image.height > 0)).toBe(true);
    const entries = await page.evaluate(() => [
        ...CARDS.map(card => ({ name: card.name, category: card.category, landmark: false })),
        ...Player._LANDMARK_DEFS.map(landmark => ({ name: landmark.name, category: '', landmark: true })),
    ]);
    await page.evaluate(() => {
        const fixture = document.createElement('div');
        fixture.id = 'facilityImageFixture';
        fixture.className = 'cardboard-art';
        fixture.style.cssText = 'position:fixed;left:20px;top:100px;width:160px;height:80px;background:#fff8e7;z-index:99999;overflow:hidden;';
        document.body.appendChild(fixture);
    });
    const fixture = page.locator('#facilityImageFixture');
    for (const [index, entry] of entries.entries()) {
        await page.evaluate(entry => {
            document.getElementById('facilityImageFixture').innerHTML = UiBuildMenu.renderFacilityArt(entry.name, entry.landmark, entry.category);
        }, entry);
        await expect.poll(() => fixture.locator('use').evaluate(use => {
            const box = use.getBBox();
            return box.width > 0 && box.height > 0;
        })).toBe(true);
        const reference = await fixture.screenshot();
        const name = `cache-reference-${index}.png`;
        const target = testInfo.snapshotPath(name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, reference);
        await page.evaluate(entry => {
            document.getElementById('facilityImageFixture').innerHTML = UiBuildMenu.renderTableFacilityArt(entry.name, entry.landmark, entry.category);
        }, entry);
        await expect(fixture.locator('image')).toHaveCount(1);
        expect.soft(await fixture.screenshot(), entry.name).toMatchSnapshot(name, { threshold: 0, maxDiffPixels: 0 });
        if (index < 2 || entry.name === 'マグロ漁船' || entry.name === '空港') {
            await testInfo.attach(`cache-${index}-reference.png`, { body: reference, contentType: 'image/png' });
            await testInfo.attach(`cache-${index}-candidate.png`, { body: await fixture.screenshot(), contentType: 'image/png' });
        }
    }
    // Compare the cloned image used by the purchase flight at actual table
    // orientations and zoom levels, including the special artwork framing.
    for (const entry of entries.filter(entry => ['麦畑', 'マグロ漁船', '空港'].includes(entry.name))) {
        for (const angle of [0, 90, 180, -90]) {
            for (const zoom of [0.6, 1.2]) {
                const name = `clone-${entries.indexOf(entry)}-${angle}-${zoom}.png`;
                await page.evaluate(({ entry, angle, zoom }) => {
                    const fixture = document.getElementById('facilityImageFixture');
                    fixture.style.transform = `rotate(${angle}deg) scale(${zoom})`;
                    fixture.innerHTML = UiBuildMenu.renderFacilityArt(entry.name, entry.landmark, entry.category);
                }, { entry, angle, zoom });
                await expect.poll(() => fixture.locator('use').evaluate(use => use.getBBox().width)).toBeGreaterThan(0);
                const reference = await fixture.screenshot();
                const target = testInfo.snapshotPath(name);
                await fs.mkdir(path.dirname(target), { recursive: true });
                await fs.writeFile(target, reference);
                await page.evaluate(entry => {
                    const fixture = document.getElementById('facilityImageFixture');
                    const template = document.createElement('div');
                    template.innerHTML = UiBuildMenu.renderTableFacilityArt(entry.name, entry.landmark, entry.category);
                    fixture.replaceChildren(template.firstElementChild.cloneNode(true));
                }, entry);
                await expect(fixture.locator('image')).toHaveCount(1);
                expect.soft(await fixture.screenshot(), `${entry.name} ${angle}° ${zoom}`).toMatchSnapshot(name, { threshold: 0, maxDiffPixels: 0 });
            }
        }
    }
    await fixture.evaluate(element => { element.style.transform = ''; });
    await page.route('**/icons/facility-art-images/unavailable.svg', route => route.fulfill({ status: 404, body: '' }));
    await page.evaluate(() => {
        const fixture = document.getElementById('facilityImageFixture');
        fixture.innerHTML = UiBuildMenu.renderTableFacilityArt('麦畑', false, '農園');
        fixture.querySelector('image').setAttribute('href', 'icons/facility-art-images/unavailable.svg');
    });
    await expect(fixture.locator('image')).toHaveCount(0);
    await expect(fixture.locator('use')).toHaveCount(1);
    const fallback = await fixture.locator('use').evaluate(use => {
        const box = use.getBBox();
        return { href: use.getAttribute('href'), width: box.width, height: box.height };
    });
    expect(fallback.width).toBeGreaterThan(0);
    expect(fallback.height).toBeGreaterThan(0);
    await page.evaluate(() => {
        document.getElementById('facilityImageFixture').innerHTML = UiBuildMenu.renderTableFacilityArt('麦畑', false, '農園');
    });
    await expect(fixture.locator('image')).toHaveCount(0);
    await expect(fixture.locator('use')).toHaveCount(1);
    await fs.writeFile(testInfo.outputPath('facility-image-decoded.json'), JSON.stringify({ decoded, entries, fallback }, null, 2));
});
