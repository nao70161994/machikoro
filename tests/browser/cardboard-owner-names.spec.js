const { test, expect, devices } = require('@playwright/test');
const fs = require('node:fs/promises');

test.use({ serviceWorkers: 'block', video: 'off', trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false, sources: true } });

// Controlled layouts and real rules resolution; this is not natural-play or
// physical-device evidence. Full names take priority over optional decoration.
for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 844, height: 390 }, { width: 1440, height: 936 }]) {
    test(`全所有者名は全文と所属を守り再描画と購入Undoで正本を維持する ${viewport.width}`, async ({ browser }, testInfo) => {
        test.setTimeout(180000);
        const evidence = { viewport, controlled: true, physicalDevice: false, scenes: [], measurements: [] };
        const evidenceFile = testInfo.outputPath(`owner-names-${viewport.width}.json`);
        const saveEvidence = () => fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
        // Replace any older artifact immediately, then persist each measurement
        // before assertions/context cleanup can fail or exhaust the test budget.
        await saveEvidence();
        async function run(scene) {
            const context = await browser.newContext({ ...devices['iPhone 13'], viewport,
                baseURL: testInfo.project.use.baseURL || 'http://127.0.0.1:3210', serviceWorkers: 'block' });
            try {
                const page = await context.newPage();
                await page.route('https://pagead2.googlesyndication.com/**', route => route.fulfill({ status: 200, body: '' }));
                await page.addInitScript(() => localStorage.setItem('machikoroDesignTheme', 'cardboard'));
                await page.goto('/');
                await page.evaluate(scene => {
                    startGameNow(4, Array.from({ length: 4 }, (_, index) => ({ type: 'human', name: `街${index + 1}` })));
                    GameRuntimeState.runtime.setCpuPlayers([null, null, null, null]);
                    cancelCpuSchedule('owner-names-fixture');
                    const game = GameRuntimeState.runtime.snapshot().game;
                    const names = ['あいうえおかきくけこさし', 'CPU（弱）', 'CPU（弱）', 'CPU（弱）・4'];
                    const base = ['コーン畑', 'パン屋', 'カフェ'];
                    const extra = CARDS.filter(card => !base.includes(card.name)).slice(0, 10).map(card => card.name);
                    game.players.forEach((player, index) => {
                        player.name = names[index];
                        player.coins = 30;
                        player.cards = [...base, ...(scene === 'late' ? extra : [])].map(createCardByName);
                        for (const card of player.cards) if (!['麦畑', 'パン屋'].includes(card.name)) SHOP_STOCK[card.name]--;
                        Object.keys(player.landmarks).forEach(name => { player.landmarks[name] = false; });
                        if (scene === 'late') {
                            player.landmarks[LANDMARK_NAMES.STATION] = true;
                            player.landmarks[LANDMARK_NAMES.SHOPPING_MALL] = true;
                            player.landmarks[LANDMARK_NAMES.HARBOR] = true;
                        }
                    });
                    game.currentPlayerIndex = 0;
                    game.log = [];
                    game.addLog(LOG_TYPES.SYSTEM, `👤 ${game.currentPlayer().name}のターン`);
                    setTutorialEnabled(false);
                    game.rollDice(3);
                    if (game.phase === GAME_PHASES.SELECT_DICE) game.selectDiceCount(false, 3);
                    if (game.lastDiceResult !== 3 || game.phase !== GAME_PHASES.BUILD) throw new Error('Expected actual rules resolution for dice 3');
                    render();
                    acceptHotseatHandoff();
                    window.ownerNamesGame = game;
                }, scene);
                const snapshot = () => page.evaluate(() => {
                    const game = GameRuntimeState.runtime.snapshot().game;
                    return { actor: game.currentPlayerIndex, phase: game.phase, turn: game.turnCount,
                        state: GameSnapshot.serializeUndoState(game, SHOP_STOCK, Number.MAX_SAFE_INTEGER) };
                });
                async function overview() {
                    const button = page.locator('[data-cardboard-camera="overview"]');
                    if (!await button.isVisible()) await page.locator('#cardboardMoreMenu > summary').click();
                    await button.click();
                    await page.evaluate(() => new Promise(resolve => {
                        let previous = '', stable = 0;
                        const inspect = () => {
                            const world = document.getElementById('cardboardSeats');
                            const view = document.getElementById('cardboardTableViewport');
                            const key = JSON.stringify([world.dataset.tableLayoutKey, view.dataset.tableScale,
                                [...document.querySelectorAll('.cardboard-owner-label')].map(label => label.outerHTML)]);
                            stable = key === previous ? stable + 1 : 0;
                            previous = key;
                            if (stable >= 4) resolve(); else requestAnimationFrame(inspect);
                        };
                        requestAnimationFrame(inspect);
                    }));
                }
                async function measure(stage) {
                    const result = await page.evaluate(() => {
                        const game = GameRuntimeState.runtime.snapshot().game;
                        const blockers = [...document.querySelectorAll('#cardboardSeats .cardboard-card, #cardboardSeats .cardboard-landmark, #cardboardCenter')];
                        const labels = [...document.querySelectorAll('.cardboard-owner-label')];
                        const viewport = document.getElementById('cardboardTableViewport');
                        const viewportRect = viewport.getBoundingClientRect();
                        const viewportBounds = { left: viewportRect.left + viewport.clientLeft,
                            top: viewportRect.top + viewport.clientTop,
                            right: viewportRect.left + viewport.clientLeft + viewport.clientWidth,
                            bottom: viewportRect.top + viewport.clientTop + viewport.clientHeight };
                        const rect = element => element.getBoundingClientRect().toJSON();
                        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                        const distance = (a, b) => Math.hypot(Math.max(b.left - a.right, a.left - b.right, 0),
                            Math.max(b.top - a.bottom, a.top - b.bottom, 0));
                        const cards = blockers.filter(element => element.matches('.cardboard-card'));
                        const roster = [...document.querySelectorAll('.cardboard-roster-seat')].map(seat => {
                            const css = getComputedStyle(seat);
                            return { owner: Number(seat.dataset.cardboardPlayerIndex), current: seat.getAttribute('aria-current') === 'true',
                                activated: seat.classList.contains('cardboard-roster-activated'), border: css.borderTopColor,
                                outline: css.outlineColor, outlineStyle: css.outlineStyle, outlineWidth: parseFloat(css.outlineWidth) };
                        });
                        return { sameGame: game === window.ownerNamesGame, roster, expected: game.players.map((player, index) => ({ index, name: player.name,
                            duplicate: game.players.some((other, otherIndex) => otherIndex !== index && other.name === player.name) })),
                            labels: labels.map(label => {
                                const name = label;
                                const bounds = label.getBoundingClientRect();
                                const range = document.createRange();
                                range.selectNodeContents(name);
                                const text = range.getBoundingClientRect();
                                const fits = box => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
                                return { owner: Number(label.dataset.playerIndex), name: name.textContent,
                                    text: label.textContent, aria: label.getAttribute('aria-label'), rect: rect(label),
                                    ink: text.toJSON(),
                                    complete: text.width > 0 && text.height > 0 && fits(text) && [...range.getClientRects()].every(fits),
                                    ownDistance: Math.min(...cards.filter(card => card.closest('.cardboard-player').dataset.playerIndex === label.dataset.playerIndex).map(card => distance(bounds, card.getBoundingClientRect()))),
                                    otherDistance: Math.min(...cards.filter(card => card.closest('.cardboard-player').dataset.playerIndex !== label.dataset.playerIndex).map(card => distance(bounds, card.getBoundingClientRect()))),
                                    insideViewport: bounds.left >= viewportBounds.left && bounds.right <= viewportBounds.right &&
                                        bounds.top >= viewportBounds.top && bounds.bottom <= viewportBounds.bottom,
                                    animationCount: label.getAnimations({ subtree: true }).length,
                                    overlaps: [...blockers, ...labels.filter(other => other !== label)]
                                        .filter(other => { const box = other.getBoundingClientRect(); return box.width > 0 && box.height > 0 && overlaps(bounds, box); })
                                        .map(other => other.className),
                                };
                            }),
                            links: [...document.querySelectorAll('.cardboard-owner-link')].map(svg => {
                                const shape = svg.querySelector('line');
                                if (!shape) return { owner: Number(svg.dataset.playerIndex), overlaps: [] };
                                const matrix = shape.getScreenCTM();
                                const start = new DOMPoint(Number(shape.getAttribute('x1')), Number(shape.getAttribute('y1'))).matrixTransform(matrix);
                                const end = new DOMPoint(Number(shape.getAttribute('x2')), Number(shape.getAttribute('y2'))).matrixTransform(matrix);
                                const segment = { left: Math.min(start.x, end.x) - 1, right: Math.max(start.x, end.x) + 1,
                                    top: Math.min(start.y, end.y) - 1, bottom: Math.max(start.y, end.y) + 1 };
                                return { owner: Number(svg.dataset.playerIndex), segment,
                                    overlaps: labels.filter(label => label.dataset.playerIndex !== svg.dataset.playerIndex &&
                                        overlaps(segment, label.getBoundingClientRect())).map(label => label.dataset.playerIndex) };
                            }),
                            cards: [...document.querySelectorAll('#cardboardSeats .cardboard-card')].map(card => ({
                                owner: card.closest('.cardboard-player').dataset.playerIndex, name: card.dataset.cardName, rect: rect(card) })),
                        };
                    });
                    evidence.measurements.push({ scene, stage, result });
                    await saveEvidence();
                    expect(result.sameGame).toBe(true);
                    expect(result.roster.filter(seat => seat.current).map(seat => seat.owner)).toEqual([0]);
                    expect(result.roster.every(seat => seat.activated)).toBe(true);
                    const current = result.roster.find(seat => seat.current);
                    expect(current.outlineStyle).toBe('solid');
                    expect(current.outlineWidth).toBeGreaterThanOrEqual(2);
                    expect(current.outline).toBe('rgb(189, 134, 20)');
                    for (const seat of result.roster.filter(seat => !seat.current)) {
                        expect(seat.border).toBe('rgb(73, 127, 145)');
                        expect(seat.border).not.toBe(current.outline);
                    }
                    expect(result.labels).toHaveLength(4);
                    for (const expected of result.expected) {
                        const label = result.labels.find(item => item.owner === expected.index);
                        expect(label.name).toBe(expected.duplicate ? `席${expected.index + 1} · ${expected.name}` : expected.name);
                        expect(label.aria).toContain(expected.name);
                        expect(label.complete, JSON.stringify(label)).toBe(true);
                        expect(label.ownDistance, JSON.stringify(label)).toBeLessThanOrEqual(label.otherDistance + 0.5);
                        expect(label.insideViewport, JSON.stringify(label)).toBe(true);
                        expect(label.overlaps, JSON.stringify(label)).toEqual([]);
                        expect(label.animationCount).toBe(0);
                    }
                    expect(new Set(result.labels.map(label => label.owner)).size).toBe(4);
                    expect(result.links.flatMap(link => link.overlaps), JSON.stringify(result.links)).toEqual([]);
                    return result;
                }
                await overview();
                const canonical = await snapshot();
                const initial = await measure('resolved');
                await page.screenshot({ path: testInfo.outputPath(`owner-names-${scene}-${viewport.width}.png`) });
                await page.evaluate(() => render());
                await overview();
                const redraw = await measure('redraw');
                expect(await snapshot()).toEqual(canonical);
                expect(redraw.expected).toEqual(initial.expected);
                let afterPurchase = null, afterUndo = null;
                // Real market purchase and Undo must restore the complete canonical state.
                {
                    await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
                    await expect(page.locator('.cardboard-activation-tag')).toHaveCount(0);
                    await page.locator('#cardboardMarket .compact-market-expand').click();
                    await page.locator('#cardboardMarketDialog [data-action="buildCard"][data-card-name="麦畑"]').click();
                    const purchased = await snapshot();
                    // Rule actions may hydrate a new GameManager. Identity is a
                    // presentation invariant only; rebase after purchase/Undo.
                    await page.evaluate(() => { window.ownerNamesGame = GameRuntimeState.runtime.snapshot().game; });
                    expect(purchased.state.playerCoins[0]).toBe(canonical.state.playerCoins[0] - 1);
                    await page.keyboard.press('Escape');
                    await overview();
                    expect(await snapshot()).toEqual(purchased);
                    expect(purchased.state.playerCardNames[0].filter(name => name === '麦畑').length)
                        .toBe(canonical.state.playerCardNames[0].filter(name => name === '麦畑').length + 1);
                    expect(purchased.state.shopStock['麦畑']).toBe(canonical.state.shopStock['麦畑'] - 1);
                    afterPurchase = await measure('purchase');
                    expect(afterPurchase.expected).toEqual(initial.expected);
                    await page.locator('#cardboardMarket [data-action="undoBuild"]').click();
                    await page.locator('#confirmOkBtn').click();
                    await page.evaluate(() => { window.ownerNamesGame = GameRuntimeState.runtime.snapshot().game; });
                    await overview();
                    afterUndo = await measure('undo');
                    await expect(page.locator('#cardboardBoard')).not.toHaveClass(/cardboard-new-roll/);
                    await expect(page.locator('.cardboard-activation-tag')).toHaveCount(0);
                    expect(await snapshot()).toEqual(canonical);
                }
                return { canonical, initial, redraw, afterPurchase, afterUndo };
            } finally { await context.close(); }
        }
        try {
            for (const scene of ['early', 'late']) {
                evidence.scenes.push({ scene, result: await run(scene) });
            }
        } finally {
            await saveEvidence();
        }
    });
}
