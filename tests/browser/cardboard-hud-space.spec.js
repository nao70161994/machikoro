const { test, expect, devices } = require('@playwright/test');
const fs = require('node:fs/promises');

test('多人数HUDと操作列の間隔を実画面で採取する', async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const evidence = [];
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
        { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
        for (const count of [2, 5, 10]) {
            const context = await browser.newContext({ ...devices['iPhone 13'], viewport,
                baseURL: testInfo.project.use.baseURL || 'http://127.0.0.1:3210', serviceWorkers: 'block' });
            try {
                const page = await context.newPage();
                await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
                await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
                await page.goto('/');
                await page.evaluate(count => {
                    startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
                    cancelCpuSchedule('hud-profile');
                    setTutorialEnabled(false);
                    acceptHotseatHandoff();
                }, count);
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const before = await page.evaluate(({ count, viewport }) => {
                    const selectors = ['#cardboardBoard', '#cardboardRoster', '.cardboard-roster',
                        '#cardboardCameraTools', '#cardboardCameraButtons', '#cardboardControls', '#cardboardViewHint', '#cardboardTableViewport'];
                    const entries = selectors.map(selector => {
                        const element = document.querySelector(selector), style = getComputedStyle(element);
                        const rules = [];
                        const walk = list => {
                            for (const rule of list) {
                                if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue;
                                if (rule.cssRules) { walk(rule.cssRules); continue; }
                                if (!rule.selectorText || !rule.style) continue;
                                try { if (!element.matches(rule.selectorText)) continue; } catch { continue; }
                                if (['grid-template-rows', 'height', 'min-height', 'margin', 'padding', 'align-self', 'align-items'].some(name => rule.style.getPropertyValue(name))) {
                                    rules.push({ selector: rule.selectorText, css: rule.style.cssText });
                                }
                            }
                        };
                        for (const sheet of document.styleSheets) {
                            try { walk(sheet.cssRules); } catch { /* external font sheets */ }
                        }
                        return { selector, classes: element.className, rect: element.getBoundingClientRect().toJSON(),
                            computed: Object.fromEntries(['height', 'minHeight', 'gridTemplateRows', 'gridArea', 'alignSelf',
                                'alignItems', 'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'display'].map(name => [name, style[name]])), rules };
                    });
                    return { count, viewport, entries };
                }, { count, viewport });
                if (count === 5 && viewport.width === 320) await page.screenshot({ path: testInfo.outputPath('hud-five-320-before.png') });
                await page.addStyleTag({ content: 'html[data-design="cardboard"] #cardboardBoard.cardboard-card-table .cardboard-roster { min-height: 44px; }' });
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const after = await page.evaluate(() => Object.fromEntries(['#cardboardRoster', '.cardboard-roster', '#cardboardCameraTools', '#cardboardTableViewport'].map(selector => {
                    const element = document.querySelector(selector);
                    return [selector, { rect: element.getBoundingClientRect().toJSON(), minHeight: getComputedStyle(element).minHeight }];
                })));
                evidence.push({ before, after });
                expect(after['.cardboard-roster'].minHeight).toBe('44px');
                const oldRoster = before.entries.find(entry => entry.selector === '.cardboard-roster');
                const oldTable = before.entries.find(entry => entry.selector === '#cardboardTableViewport');
                if (parseFloat(oldRoster.computed.minHeight) >= 96) {
                    expect(after['.cardboard-roster'].rect.height).toBeLessThan(oldRoster.rect.height);
                    expect(after['#cardboardTableViewport'].rect.height - oldTable.rect.height).toBeGreaterThanOrEqual(50);
                } else {
                    expect(after['.cardboard-roster'].rect.height).toBe(oldRoster.rect.height);
                    expect(after['#cardboardTableViewport'].rect.height).toBe(oldTable.rect.height);
                }
                if (count === 5 && viewport.width === 320) await page.screenshot({ path: testInfo.outputPath('hud-five-320-after.png') });
            } finally { await context.close(); }
        }
    }
    await fs.writeFile(testInfo.outputPath('hud-space.json'), JSON.stringify(evidence, null, 2));
});
