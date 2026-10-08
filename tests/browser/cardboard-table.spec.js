const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

for (const width of [844, 1440]) {
    for (const count of [2, 3, 4]) {
        test(`卓上盤面で全員の所有カードと中央市場を同時に比較できる ${width}px ${count}人`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: width === 844 ? 390 : 936 });
            await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
            await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto('/');
            expect(errors).toEqual([]);
            await page.evaluate(count => {
                startGameNow(count, Array.from({ length: count }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
                cancelCpuSchedule('cardboard-table');
                GameRuntimeState.runtime.setCpuPlayers(Array(count).fill(null));
                const game = GameRuntimeState.runtime.snapshot().game;
                game.currentPlayerIndex = 0;
                game.phase = GAME_PHASES.BUILD;
                game.players.forEach(player => {
                    player.coins = 30;
                    player.cards = ['麦畑', 'パン屋', 'カフェ'].map(createCardByName);
                });
                setTutorialEnabled(false);
                render();
                acceptHotseatHandoff();
            }, count);
            await expect(page.locator('#cardboardSeats > .cardboard-player')).toHaveCount(count);
            await expect(page.locator('#cardboardMarket .compact-market-buy').first()).toBeVisible();
            await expect(page.locator('#cardboardMarket #buildMenu')).toHaveCount(0);
            if (width === 844) {
                expect(await page.locator('#cardboardSeats .cardboard-card .cardboard-dice').evaluateAll(dice =>
                    dice.every(element => {
                        const label = element.getAttribute('data-category-label');
                        const style = getComputedStyle(element, '::after');
                        return label && style.content.includes(label) && parseFloat(style.fontSize) >= 11;
                    })
                )).toBe(true);
            }
            await expect.poll(() => page.evaluate(() => {
                const violations = [];
                if (document.documentElement.scrollHeight > innerHeight + 1) {
                    violations.push(`page height ${document.documentElement.scrollHeight}/${innerHeight}`);
                    for (const id of ['status', 'cardboardBoard', 'gameScreen']) {
                        const element = document.getElementById(id), css = getComputedStyle(element);
                        violations.push(`${id}: ${JSON.stringify(element.getBoundingClientRect().toJSON())} margin=${css.margin} padding=${css.padding} gap=${css.gap}`);
                    }
                    for (const element of document.querySelectorAll('body > *, #gameScreen > *')) {
                        const r = element.getBoundingClientRect();
                        if (r.width && r.height && r.bottom > innerHeight + 1) violations.push(`overflow ${element.id || element.className}: bottom ${r.bottom}`);
                    }
                }
                const inspect = (element, label) => {
                    if (!element) { violations.push(`${label}: missing`); return; }
                    const r = element.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 &&
                        r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1)) {
                        violations.push(`${label}: ${JSON.stringify(r.toJSON())}`);
                    }
                    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                        const style = getComputedStyle(parent), p = parent.getBoundingClientRect();
                        if (style.display === 'contents') continue;
                        if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (r.top < p.top - 1 || r.bottom > p.bottom + 1)) {
                            violations.push(`${label}: vertically clipped by ${parent.id || parent.className}`);
                        }
                        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (r.left < p.left - 1 || r.right > p.right + 1)) {
                            violations.push(`${label}: horizontally clipped by ${parent.id || parent.className}`);
                        }
                    }
                };
                [...document.querySelectorAll('#cardboardSeats > .cardboard-player')].forEach(panel => {
                    inspect(panel.querySelector('.cardboard-header'), `seat ${panel.dataset.playerIndex} HUD`);
                    [...panel.querySelectorAll('.cardboard-card')].slice(0, 3).forEach((card, index) => inspect(card, `seat ${panel.dataset.playerIndex} card ${index + 1}`));
                });
                inspect(document.querySelector('#cardboardMarket .compact-market-buy'), 'market card');
                inspect(document.querySelector('#cardboardActionSlot'), 'action slot');
                return violations;
            })).toEqual([]);
            const path = testInfo.outputPath(`table-${width}-${count}p.png`);
            await page.screenshot({ path });
            await testInfo.attach('卓の実画面', { path, contentType: 'image/png' });
            await expect(page.locator('#crashScreen')).toBeHidden();
        });
    }
}
